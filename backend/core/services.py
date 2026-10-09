import hashlib
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .grants import build_signed_envelope, canonical_claims
from .models import AuditLogEntry, EnrolledUser, OtpChallenge, PresenceSession, SecurityAlert, SignedUnlockGrant, TenantMembership, UnlockRequest
from .otp import OTP_MAX_ATTEMPTS, encrypt_otp, expiry_from_now, generate_otp, hash_otp, verify_otp
from .providers import MobileDeliveryProvider, get_device_gateway, get_signer
from .workflow import APPROVED_WAITING, EXPIRED, OTP_LOCKED_OUT, PENDING_REVIEW, PRESENCE_VERIFYING, REJECTED, TOKEN_ISSUED, validate_transition


class WorkflowError(ValueError):
    pass


EXPIRABLE_REQUEST_STATUSES = {
    PENDING_REVIEW,
    APPROVED_WAITING,
    PRESENCE_VERIFYING,
    TOKEN_ISSUED,
}


def _audit(tenant, actor, event_type, request_id, details):
    previous = AuditLogEntry.objects.filter(tenant=tenant).order_by("-created_at").first()
    previous_hash = previous.entry_hash if previous else ""
    material = f"{previous_hash}|{event_type}|{request_id}|{details}".encode()
    return AuditLogEntry.objects.create(
        tenant=tenant,
        actor_type="admin" if actor else "system",
        actor_id=str(actor.pk) if actor else "system",
        event_type=event_type,
        request_id=request_id,
        details=details,
        previous_hash=previous_hash,
        entry_hash=hashlib.sha256(material).hexdigest(),
    )


@transaction.atomic
def expire_unlock_request_if_needed(request_id):
    """Move an active request past its request window into the terminal state.

    Reads must not leave an expired request looking actionable to another client.
    The row lock keeps this normalization and its audit event atomic with any
    concurrent approval or presence attempt.
    """
    unlock_request = UnlockRequest.objects.select_for_update().get(id=request_id)
    if (
        unlock_request.status in EXPIRABLE_REQUEST_STATUSES
        and unlock_request.expires_at
        and timezone.now() >= unlock_request.expires_at
    ):
        validate_transition(unlock_request.status, EXPIRED)
        unlock_request.status = EXPIRED
        unlock_request.save(update_fields=["status"])
        _audit(unlock_request.tenant, None, "unlock_request.expired", unlock_request.id, {})
    return unlock_request


@transaction.atomic
def expire_otp_challenge_if_needed(challenge_id):
    """Expire an approved request when its one-minute OTP window has elapsed."""
    challenge = OtpChallenge.objects.select_for_update().select_related("request").get(id=challenge_id)
    unlock_request = UnlockRequest.objects.select_for_update().get(id=challenge.request_id)
    if timezone.now() >= challenge.expires_at and unlock_request.status == APPROVED_WAITING:
        validate_transition(unlock_request.status, EXPIRED)
        unlock_request.status = EXPIRED
        unlock_request.save(update_fields=["status"])
        _audit(unlock_request.tenant, None, "otp.expired", unlock_request.id, {})
        return True
    return False


@transaction.atomic
def approve_unlock_request(request_id, admin_user, reason: str, delivery_provider: MobileDeliveryProvider, second_party_id=None):
    # Lock only the request row.  ``second_party`` is nullable while a request is
    # being created, so joining it into a SELECT ... FOR UPDATE query makes
    # PostgreSQL reject the statement (the nullable side of an outer join cannot
    # be locked).  Related objects are fetched normally after the request row is
    # locked, which preserves the transaction boundary without locking a nullable
    # join.
    unlock_request = UnlockRequest.objects.select_for_update().get(id=request_id)
    if not TenantMembership.objects.filter(
        tenant=unlock_request.tenant, admin_user=admin_user, active=True, role__in=["owner", "admin"]
    ).exists():
        raise WorkflowError("admin is not allowed to review this tenant")
    if unlock_request.status != PENDING_REVIEW:
        raise WorkflowError("request is not awaiting review")
    if unlock_request.expires_at and timezone.now() >= unlock_request.expires_at:
        validate_transition(unlock_request.status, EXPIRED)
        unlock_request.status = EXPIRED
        unlock_request.save(update_fields=["status"])
        raise WorkflowError("request has expired")
    if second_party_id and not unlock_request.second_party_id:
        unlock_request.second_party = EnrolledUser.objects.filter(id=second_party_id, tenant=unlock_request.tenant, status="active").first()
    if not unlock_request.second_party or unlock_request.second_party.status != "active":
        raise WorkflowError("request has no eligible active second party")
    validate_transition(unlock_request.status, APPROVED_WAITING)
    now = timezone.now()
    unlock_request.status = APPROVED_WAITING
    unlock_request.reviewed_by = admin_user
    unlock_request.reviewed_at = now
    unlock_request.admin_review_reason = reason
    unlock_request.save(update_fields=["status", "second_party", "reviewed_by", "reviewed_at", "admin_review_reason"])
    _audit(unlock_request.tenant, admin_user, "unlock_request.approved", unlock_request.id, {"reason_recorded": True})
    otp = generate_otp()
    salt = secrets.token_bytes(16)
    challenge = OtpChallenge.objects.create(
        request=unlock_request,
        recipient=unlock_request.second_party,
        otp_hash=hash_otp(otp, salt),
        otp_salt=salt.hex(),
        otp_ciphertext=encrypt_otp(otp),
        expires_at=expiry_from_now(),
        max_attempts=OTP_MAX_ATTEMPTS,
    )
    # The OTP remains inside the authenticated delivery boundary and is never returned to the dashboard.
    delivery_provider.deliver_otp_challenge(str(challenge.recipient_id), str(challenge.id), otp, challenge.expires_at)
    challenge.delivery_status = "delivered"
    challenge.save(update_fields=["delivery_status"])
    return unlock_request


@transaction.atomic
def reject_unlock_request(request_id, admin_user, reason: str):
    unlock_request = UnlockRequest.objects.select_for_update().get(id=request_id)
    if not TenantMembership.objects.filter(
        tenant=unlock_request.tenant, admin_user=admin_user, active=True, role__in=["owner", "admin"]
    ).exists():
        raise WorkflowError("admin is not allowed to review this tenant")
    if unlock_request.status != PENDING_REVIEW:
        raise WorkflowError("request is not awaiting review")
    validate_transition(unlock_request.status, REJECTED)
    unlock_request.status = REJECTED
    unlock_request.reviewed_by = admin_user
    unlock_request.reviewed_at = timezone.now()
    unlock_request.admin_review_reason = reason
    unlock_request.save(update_fields=["status", "reviewed_by", "reviewed_at", "admin_review_reason"])
    _audit(unlock_request.tenant, admin_user, "unlock_request.rejected", unlock_request.id, {"reason_recorded": True})
    return unlock_request


@transaction.atomic
def verify_otp_challenge(challenge_id, otp: str) -> bool:
    """Verify a delivered OTP without ever returning or logging the secret.

    The mobile identity/presence authorization layer must call this service only after
    authenticating the enrolled device. It is deliberately kept separate from the admin
    review endpoint so an administrator can never read or submit the OTP.
    """
    challenge = OtpChallenge.objects.select_for_update().get(id=challenge_id)
    unlock_request = UnlockRequest.objects.select_for_update().get(id=challenge.request_id)
    now = timezone.now()

    if challenge.verified_at:
        return True
    if unlock_request.status != APPROVED_WAITING:
        return False
    if challenge.locked_at or challenge.attempts >= challenge.max_attempts:
        _lock_out_otp(challenge, unlock_request, now)
        return False
    if now >= challenge.expires_at:
        validate_transition(unlock_request.status, EXPIRED)
        unlock_request.status = EXPIRED
        unlock_request.save(update_fields=["status"])
        _audit(unlock_request.tenant, None, "otp.expired", unlock_request.id, {})
        return False

    if not verify_otp(otp, challenge.otp_hash, bytes.fromhex(challenge.otp_salt)):
        challenge.attempts += 1
        challenge.save(update_fields=["attempts"])
        if challenge.attempts >= challenge.max_attempts:
            _lock_out_otp(challenge, unlock_request, now)
        else:
            _audit(unlock_request.tenant, None, "otp.failed", unlock_request.id, {"attempts": challenge.attempts})
        return False

    challenge.verified_at = now
    challenge.save(update_fields=["verified_at"])
    validate_transition(unlock_request.status, PRESENCE_VERIFYING)
    unlock_request.status = PRESENCE_VERIFYING
    unlock_request.save(update_fields=["status"])
    _audit(unlock_request.tenant, None, "otp.verified", unlock_request.id, {})
    maybe_issue_unlock_grant(unlock_request.id)
    return True


@transaction.atomic
def maybe_issue_unlock_grant(request_id):
    """Issue and publish a grant only when both fresh presence sessions are active.

    Returning ``None`` is intentional while the second party has not established presence yet.
    Once both sessions are present, any signing or MQTT failure raises and leaves the request
    locked in its prior state.
    """
    # Keep this lock query limited to the request row.  In particular,
    # ``second_party`` is nullable and PostgreSQL cannot apply FOR UPDATE to the
    # nullable side of the join produced by select_related().
    unlock_request = UnlockRequest.objects.select_for_update().get(id=request_id)
    if unlock_request.status != PRESENCE_VERIFYING or not unlock_request.second_party:
        return None

    now = timezone.now()
    cutoff = now - timedelta(seconds=30)
    sessions = list(
        PresenceSession.objects.select_for_update()
        .filter(request=unlock_request, ended_at__isnull=True, last_heartbeat_at__gte=cutoff)
        .order_by("user_id", "id")
    )
    by_user = {str(session.user_id): session for session in sessions}
    participant_ids = [str(unlock_request.requester_id), str(unlock_request.second_party_id)]
    if any(participant_id not in by_user for participant_id in participant_ids):
        return None

    existing = SignedUnlockGrant.objects.filter(request=unlock_request).first()
    if existing:
        return existing

    issued_at = now
    expires_at = now + timedelta(seconds=settings.GRANT_TTL_SECONDS)
    nonce = secrets.token_urlsafe(24)
    claims = {
        "grant_id": str(uuid.uuid4()),
        "request_id": str(unlock_request.id),
        "tenant_id": str(unlock_request.tenant_id),
        "locker_id": str(unlock_request.locker_id),
        # The lock can validate these against the active BLE session IDs it owns. The backend
        # remains authoritative for identity and policy; the lock only checks the signed list.
        "required_presence_ids": [by_user[participant_id].ble_session_id for participant_id in participant_ids],
        "issued_at": int(issued_at.timestamp()),
        "expires_at": int(expires_at.timestamp()),
        "key_id": settings.DEV_SIGNING_KEY_ID,
        "nonce": nonce,
    }
    signed = get_signer().sign_unlock_grant(canonical_claims(claims))
    payload = build_signed_envelope(claims, signed.signature)
    get_device_gateway().publish_signed_grant(
        str(unlock_request.tenant_id), str(unlock_request.locker_id), claims["grant_id"], payload
    )
    grant = SignedUnlockGrant.objects.create(
        id=claims["grant_id"],
        request=unlock_request,
        locker=unlock_request.locker,
        key_id=signed.key_id,
        nonce=nonce,
        issued_at=issued_at,
        expires_at=expires_at,
        published_at=timezone.now(),
    )
    validate_transition(unlock_request.status, TOKEN_ISSUED)
    unlock_request.status = TOKEN_ISSUED
    unlock_request.save(update_fields=["status"])
    _audit(unlock_request.tenant, None, "unlock_grant.published", unlock_request.id, {"key_id": signed.key_id})
    return grant


def _lock_out_otp(challenge, unlock_request, now):
    if not challenge.locked_at:
        challenge.locked_at = now
        challenge.save(update_fields=["locked_at"])
    if unlock_request.status != OTP_LOCKED_OUT:
        validate_transition(unlock_request.status, OTP_LOCKED_OUT)
        unlock_request.status = OTP_LOCKED_OUT
        unlock_request.save(update_fields=["status"])
    SecurityAlert.objects.get_or_create(
        tenant=unlock_request.tenant,
        category="otp_lockout",
        message=f"OTP challenge locked for request {unlock_request.id}",
        defaults={"severity": "critical"},
    )
    _audit(unlock_request.tenant, None, "otp.locked_out", unlock_request.id, {"max_attempts": challenge.max_attempts})
