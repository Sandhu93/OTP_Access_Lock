from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import OidcBearerAuthentication
from .models import Device, EnrolledUser, Locker, LockerEnrollment, OtpChallenge, PresenceSession, UnlockRequest
from .otp import decrypt_otp
from .serializers import MobileDeviceRegistrationSerializer, MobileHeartbeatSerializer, MobileOtpVerifySerializer, MobilePresenceSerializer, MobileUnlockRequestSerializer, UnlockRequestSerializer
from .providers import ProviderNotConfigured
from .services import (
    expire_otp_challenge_if_needed,
    expire_unlock_request_if_needed,
    maybe_issue_unlock_grant,
    verify_otp_challenge,
)
from .workflow import APPROVED_WAITING


class MobileIdentityMixin:
    authentication_classes = [OidcBearerAuthentication]
    permission_classes = [IsAuthenticated]

    def identity(self, require_device=True):
        subject = str(getattr(self.request, "oidc_claims", {}).get("sub", ""))
        if not subject:
            return None
        identity = EnrolledUser.objects.filter(oidc_subject=subject, status="active").select_related("tenant").first()
        if not identity or not require_device:
            return identity
        device_id = self.request.headers.get("X-Device-ID", "")
        try:
            device = Device.objects.filter(id=device_id, tenant=identity.tenant, user=identity, status="active").first()
        except (ValidationError, ValueError):
            device = None
        if not device:
            return None
        self.request.mobile_device = device
        return identity

    def denied(self):
        return Response({"detail": "active enrolled mobile identity and device are required"}, status=status.HTTP_403_FORBIDDEN)


class MobileDeviceRegistrationView(MobileIdentityMixin, APIView):
    def post(self, request):
        identity = self.identity(require_device=False)
        if not identity:
            return self.denied()
        serializer = MobileDeviceRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        device = Device.objects.filter(user=identity, public_key_fingerprint=values["public_key_fingerprint"], status="active").first()
        if not device:
            if not settings.DEV_MODE:
                return Response({"detail": "device enrollment requires administrator approval"}, status=status.HTTP_403_FORBIDDEN)
            # SECURITY-PLACEHOLDER: local demo auto-enrollment skips hardware-backed attestation; replace with the approved enrollment ceremony before production. See TODO_SECURITY_DEBT.md
            device = Device.objects.create(tenant=identity.tenant, user=identity, platform=values["platform"], public_key_fingerprint=values["public_key_fingerprint"], status="active")
        device.platform = values["platform"]
        device.push_token = values.get("push_token", "")
        device.last_seen_at = timezone.now()
        device.status = "active"
        device.save(update_fields=["platform", "push_token", "last_seen_at", "status"])
        return Response({"device_id": str(device.id), "status": device.status})


def _enrollment(identity, locker):
    return LockerEnrollment.objects.filter(locker=locker, user=identity, revoked_at__isnull=True).exists()


class MobileUnlockRequestView(MobileIdentityMixin, APIView):
    def get(self, request):
        identity = self.identity()
        if not identity:
            return self.denied()
        requests = list((UnlockRequest.objects.filter(tenant=identity.tenant, requester=identity) | UnlockRequest.objects.filter(tenant=identity.tenant, second_party=identity)).select_related("locker", "locker__site", "requester", "second_party").order_by("-requested_at")[:20])
        requests = [expire_unlock_request_if_needed(item.id) for item in requests]
        return Response(UnlockRequestSerializer(requests, many=True).data)

    def post(self, request):
        identity = self.identity()
        if not identity:
            return self.denied()
        serializer = MobileUnlockRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        locker = Locker.objects.filter(id=values["locker_id"], tenant=identity.tenant).first()
        if not locker or not _enrollment(identity, locker):
            return Response({"detail": "locker enrollment is required"}, status=status.HTTP_403_FORBIDDEN)
        second_party = None
        if values.get("second_party_id"):
            second_party = EnrolledUser.objects.filter(id=values["second_party_id"], tenant=identity.tenant, status="active").first()
            if not second_party or not _enrollment(second_party, locker) or second_party.id == identity.id:
                return Response({"detail": "second party is not enrolled for this locker"}, status=status.HTTP_400_BAD_REQUEST)
        elif settings.DEV_MODE:
            # SECURITY-PLACEHOLDER: local demo selects the first other enrolled person; production must use the reviewed policy/selection flow.
            second_party = EnrolledUser.objects.filter(tenant=identity.tenant, status="active", locker_enrollments__locker=locker, locker_enrollments__revoked_at__isnull=True).exclude(id=identity.id).order_by("id").first()
        if not second_party:
            return Response({"detail": "an eligible second party is required"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            unlock_request = UnlockRequest.objects.create(
                tenant=identity.tenant,
                locker=locker,
                requester=identity,
                second_party=second_party,
                reason=values["reason"],
                expires_at=timezone.now() + timedelta(minutes=10),
            )
            presence = PresenceSession.objects.create(
                request=unlock_request,
                user=identity,
                locker=locker,
                ble_session_id=values["ble_session_id"],
                authenticated_at=timezone.now(),
                last_heartbeat_at=timezone.now(),
            )
        response = UnlockRequestSerializer(unlock_request).data
        # The requester must keep this backend presence session fresh while the
        # administrator and second party complete the flow.  BLE heartbeats alone
        # are local to the lock and cannot satisfy the backend freshness check.
        response["presence_session_id"] = str(presence.id)
        return Response(response, status=status.HTTP_201_CREATED)


class MobileUnlockRequestDetailView(MobileIdentityMixin, APIView):
    def get(self, request, request_id):
        identity = self.identity()
        if not identity:
            return self.denied()
        unlock_request = UnlockRequest.objects.filter(id=request_id, tenant=identity.tenant, requester=identity).first()
        if not unlock_request:
            unlock_request = UnlockRequest.objects.filter(id=request_id, tenant=identity.tenant, second_party=identity).first()
        if not unlock_request:
            return Response({"detail": "request not found"}, status=status.HTTP_404_NOT_FOUND)
        unlock_request = expire_unlock_request_if_needed(unlock_request.id)
        return Response(UnlockRequestSerializer(unlock_request).data)


class MobilePresenceSessionView(MobileIdentityMixin, APIView):
    def post(self, request):
        identity = self.identity()
        if not identity:
            return self.denied()
        serializer = MobilePresenceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        locker = Locker.objects.filter(id=values["locker_id"], tenant=identity.tenant).first()
        unlock_request = UnlockRequest.objects.filter(id=values["request_id"], tenant=identity.tenant).first()
        if unlock_request:
            unlock_request = expire_unlock_request_if_needed(unlock_request.id)
        if not locker or not unlock_request or unlock_request.locker_id != locker.id or not _enrollment(identity, locker):
            return Response({"detail": "presence session is not valid for this tenant/locker/request"}, status=status.HTTP_403_FORBIDDEN)
        if unlock_request.status != APPROVED_WAITING:
            return Response({"detail": "administrator approval is required before presence can be joined", "error_code": "request_not_approved"}, status=status.HTTP_409_CONFLICT)
        participant_ids = {unlock_request.requester_id, unlock_request.second_party_id}
        if identity.id not in participant_ids:
            return Response({"detail": "identity is not a participant in this request"}, status=status.HTTP_403_FORBIDDEN)
        now = timezone.now()
        presence = PresenceSession.objects.create(request=unlock_request, user=identity, locker=locker, ble_session_id=values["ble_session_id"], authenticated_at=now, last_heartbeat_at=now)
        try:
            maybe_issue_unlock_grant(unlock_request.id)
        except ProviderNotConfigured as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"session_id": str(presence.id), "last_heartbeat_at": now}, status=status.HTTP_201_CREATED)


class MobilePresenceHeartbeatView(MobileIdentityMixin, APIView):
    def patch(self, request, session_id):
        identity = self.identity()
        if not identity:
            return self.denied()
        serializer = MobileHeartbeatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        presence = PresenceSession.objects.filter(id=session_id, user=identity, ended_at__isnull=True).first()
        if not presence:
            return Response({"detail": "presence session not found"}, status=status.HTTP_404_NOT_FOUND)
        presence.last_heartbeat_at = timezone.now()
        if serializer.validated_data.get("ble_session_id"):
            presence.ble_session_id = serializer.validated_data["ble_session_id"]
            presence.save(update_fields=["last_heartbeat_at", "ble_session_id"])
        else:
            presence.save(update_fields=["last_heartbeat_at"])
        try:
            maybe_issue_unlock_grant(presence.request_id)
        except ProviderNotConfigured as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"session_id": str(presence.id), "last_heartbeat_at": presence.last_heartbeat_at})


class MobilePresenceSessionDetailView(MobileIdentityMixin, APIView):
    def delete(self, request, session_id):
        identity = self.identity()
        if not identity:
            return self.denied()
        presence = PresenceSession.objects.filter(id=session_id, user=identity, ended_at__isnull=True).first()
        if not presence:
            return Response({"detail": "presence session not found"}, status=status.HTTP_404_NOT_FOUND)
        presence.ended_at = timezone.now()
        presence.save(update_fields=["ended_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class MobileOtpChallengeView(MobileIdentityMixin, APIView):
    def get(self, request, challenge_id):
        identity = self.identity()
        if not identity:
            return self.denied()
        challenge = OtpChallenge.objects.filter(id=challenge_id, recipient=identity).select_related("request").first()
        if not challenge:
            return Response({"detail": "challenge not found"}, status=status.HTTP_404_NOT_FOUND)
        request_state = expire_unlock_request_if_needed(challenge.request_id)
        if request_state.status != APPROVED_WAITING:
            return Response({"detail": "administrator approval is required before this challenge can be used", "error_code": "request_not_approved"}, status=status.HTTP_409_CONFLICT)
        if expire_otp_challenge_if_needed(challenge.id):
            return Response({"detail": "OTP challenge has expired", "error_code": "challenge_expired"}, status=status.HTTP_410_GONE)
        if challenge.delivery_status != "delivered":
            return Response({"detail": "challenge is not ready for retrieval"}, status=status.HTTP_409_CONFLICT)
        try:
            otp = decrypt_otp(challenge.otp_ciphertext)
        except ValueError:
            return Response({"detail": "challenge envelope is unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        response = Response({
            "challenge_id": str(challenge.id),
            "request_id": str(challenge.request_id),
            "otp": otp,
            "expires_at": challenge.expires_at,
            "attempts_remaining": max(challenge.max_attempts - challenge.attempts, 0),
        })
        response["Cache-Control"] = "no-store"
        return response


class MobileOtpChallengeVerifyView(MobileIdentityMixin, APIView):
    def post(self, request, challenge_id):
        identity = self.identity()
        if not identity:
            return self.denied()
        challenge = OtpChallenge.objects.filter(id=challenge_id, recipient=identity).select_related("request").first()
        if not challenge:
            return Response({"detail": "challenge not found"}, status=status.HTTP_404_NOT_FOUND)
        request_state = expire_unlock_request_if_needed(challenge.request_id)
        if request_state.status != APPROVED_WAITING:
            return Response({"detail": "administrator approval is required before this challenge can be used", "error_code": "request_not_approved"}, status=status.HTTP_409_CONFLICT)
        serializer = MobileOtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        verified = verify_otp_challenge(challenge.id, serializer.validated_data["otp"])
        challenge.refresh_from_db()
        unlock_request = UnlockRequest.objects.get(id=challenge.request_id)
        body = {
            "verified": verified,
            "request": UnlockRequestSerializer(unlock_request).data,
            "attempts_remaining": max(challenge.max_attempts - challenge.attempts, 0),
        }
        if not verified:
            if unlock_request.status == "expired":
                body["error_code"] = "challenge_expired"
            elif unlock_request.status == "otp_locked_out":
                body["error_code"] = "otp_locked_out"
            else:
                body["error_code"] = "otp_invalid"
        return Response(body, status=status.HTTP_200_OK if verified else status.HTTP_400_BAD_REQUEST)
