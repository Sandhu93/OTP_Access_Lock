from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone

from rest_framework.test import APIClient

from core.demo_auth import issue_mobile_access_token
from core.models import Device, EnrolledUser, Locker, LockerEnrollment, OtpChallenge, PresenceSession, Site, Tenant, UnlockRequest
from core.otp import encrypt_otp


TEST_SIGNING_KEY = "test-signing-key-that-is-long-enough-000"


def mobile_client(identity, device):
    user, _created = get_user_model().objects.get_or_create(username=f"mobile-{identity.pk}")
    token, _expires_at = issue_mobile_access_token(user, identity)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}", HTTP_X_DEVICE_ID=str(device.id))
    return client


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY=TEST_SIGNING_KEY)
def test_unlock_request_presence_reports_fresh_and_ignores_stale_or_ended_sessions():
    tenant = Tenant.objects.create(name="Presence tenant", slug="presence-tenant")
    site = Site.objects.create(tenant=tenant, name="Presence site")
    locker = Locker.objects.create(tenant=tenant, site=site, name="Presence locker", hardware_id="LOCK-PRESENCE")
    requester = EnrolledUser.objects.create(tenant=tenant, display_name="Person A", employee_id="P-A", status="active")
    second_party = EnrolledUser.objects.create(tenant=tenant, display_name="Person B", employee_id="P-B", status="active")
    requester_device = Device.objects.create(tenant=tenant, user=requester, platform="android", public_key_fingerprint="presence-a", status="active")
    second_device = Device.objects.create(tenant=tenant, user=second_party, platform="android", public_key_fingerprint="presence-b", status="active")
    unlock_request = UnlockRequest.objects.create(
        tenant=tenant,
        locker=locker,
        requester=requester,
        second_party=second_party,
        status="approved_waiting_second_party",
        reason="Presence status test",
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    now = timezone.now()
    PresenceSession.objects.create(request=unlock_request, user=requester, locker=locker, ble_session_id="a1", authenticated_at=now, last_heartbeat_at=now)
    PresenceSession.objects.create(request=unlock_request, user=second_party, locker=locker, ble_session_id="b1", authenticated_at=now, last_heartbeat_at=now)

    detail_url = f"/api/v1/mobile/unlock-requests/{unlock_request.id}"
    response_a = mobile_client(requester, requester_device).get(detail_url)
    assert response_a.status_code == 200
    assert response_a.json()["presence"] == {"requester_connected": True, "second_party_connected": True}

    stale = PresenceSession.objects.get(request=unlock_request, user=second_party)
    stale.last_heartbeat_at = now - timedelta(seconds=31)
    stale.save(update_fields=["last_heartbeat_at"])
    response_b = mobile_client(second_party, second_device).get(detail_url)
    assert response_b.status_code == 200
    assert response_b.json()["presence"] == {"requester_connected": True, "second_party_connected": False}

    stale.last_heartbeat_at = now
    stale.ended_at = now
    stale.save(update_fields=["last_heartbeat_at", "ended_at"])
    ended_response = mobile_client(requester, requester_device).get(detail_url)
    assert ended_response.json()["presence"]["second_party_connected"] is False


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY=TEST_SIGNING_KEY)
def test_second_party_locker_heartbeat_is_visible_before_joining_request():
    tenant = Tenant.objects.create(name="Pre-request tenant", slug="pre-request-tenant")
    site = Site.objects.create(tenant=tenant, name="Pre-request site")
    locker = Locker.objects.create(tenant=tenant, site=site, name="Pre-request locker", hardware_id="LOCK-PRE-REQUEST")
    admin = get_user_model().objects.create_user(username="pre-request-admin")
    requester = EnrolledUser.objects.create(tenant=tenant, display_name="Person A", employee_id="PRE-A", status="active")
    second_party = EnrolledUser.objects.create(tenant=tenant, display_name="Person B", employee_id="PRE-B", status="active")
    requester_device = Device.objects.create(tenant=tenant, user=requester, platform="android", public_key_fingerprint="pre-request-a", status="active")
    second_device = Device.objects.create(tenant=tenant, user=second_party, platform="android", public_key_fingerprint="pre-request-b", status="active")
    for person in (requester, second_party):
        LockerEnrollment.objects.create(locker=locker, user=person, enrolled_by=admin)
    now = timezone.now()
    unlock_request = UnlockRequest.objects.create(
        tenant=tenant,
        locker=locker,
        requester=requester,
        second_party=second_party,
        status="approved_waiting_second_party",
        reason="Presence status test",
        expires_at=now + timedelta(minutes=5),
    )
    PresenceSession.objects.create(
        request=unlock_request,
        user=requester,
        locker=locker,
        ble_session_id="aabbccddeeff0011",
        authenticated_at=now,
        last_heartbeat_at=now,
    )

    create_response = mobile_client(second_party, second_device).post(
        "/api/v1/mobile/locker-presence-sessions",
        {"locker_id": str(locker.id), "ble_session_id": "1122334455667788"},
        format="json",
    )
    assert create_response.status_code == 201
    generic_presence = PresenceSession.objects.get(id=create_response.json()["session_id"])
    assert generic_presence.request_id is None
    heartbeat_response = mobile_client(second_party, second_device).patch(
        f"/api/v1/mobile/presence-sessions/{generic_presence.id}/heartbeat",
        {"ble_session_id": "1122334455667788"},
        format="json",
    )
    assert heartbeat_response.status_code == 200

    detail_url = f"/api/v1/mobile/unlock-requests/{unlock_request.id}"
    response = mobile_client(requester, requester_device).get(detail_url)
    assert response.status_code == 200
    assert response.json()["presence"] == {"requester_connected": True, "second_party_connected": True}

    generic_presence.last_heartbeat_at = now - timedelta(seconds=31)
    generic_presence.save(update_fields=["last_heartbeat_at"])
    stale_response = mobile_client(requester, requester_device).get(detail_url)
    assert stale_response.json()["presence"]["second_party_connected"] is False


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY=TEST_SIGNING_KEY)
def test_second_party_request_list_returns_only_live_assigned_requests_and_expires_stale_otp():
    tenant = Tenant.objects.create(name="Request list tenant", slug="request-list-tenant")
    site = Site.objects.create(tenant=tenant, name="Request list site")
    locker = Locker.objects.create(tenant=tenant, site=site, name="Request list locker", hardware_id="LOCK-REQUEST-LIST")
    requester = EnrolledUser.objects.create(tenant=tenant, display_name="Person A", employee_id="LIST-A", status="active")
    second_party = EnrolledUser.objects.create(tenant=tenant, display_name="Person B", employee_id="LIST-B", status="active")
    other_user = EnrolledUser.objects.create(tenant=tenant, display_name="Other Person", employee_id="LIST-C", status="active")
    second_device = Device.objects.create(tenant=tenant, user=second_party, platform="android", public_key_fingerprint="list-b", status="active")
    now = timezone.now()
    live = UnlockRequest.objects.create(tenant=tenant, locker=locker, requester=requester, second_party=second_party, status="approved_waiting_second_party", reason="Live", expires_at=now + timedelta(minutes=5))
    OtpChallenge.objects.create(request=live, recipient=second_party, otp_hash="hash", otp_salt="salt", expires_at=now + timedelta(minutes=3))
    stale = UnlockRequest.objects.create(tenant=tenant, locker=locker, requester=requester, second_party=second_party, status="approved_waiting_second_party", reason="Expired code", expires_at=now + timedelta(minutes=5))
    OtpChallenge.objects.create(request=stale, recipient=second_party, otp_hash="hash", otp_salt="salt", expires_at=now - timedelta(seconds=1))
    not_assigned = UnlockRequest.objects.create(tenant=tenant, locker=locker, requester=requester, second_party=other_user, status="approved_waiting_second_party", reason="Assigned elsewhere", expires_at=now + timedelta(minutes=5))
    OtpChallenge.objects.create(request=not_assigned, recipient=other_user, otp_hash="hash", otp_salt="salt", expires_at=now + timedelta(minutes=3))

    response = mobile_client(second_party, second_device).get("/api/v1/mobile/unlock-requests")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [str(live.id)]
    stale.refresh_from_db()
    assert stale.status == "expired"


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY=TEST_SIGNING_KEY)
def test_second_party_cannot_fetch_otp_until_both_people_have_fresh_presence():
    tenant = Tenant.objects.create(name="OTP presence tenant", slug="otp-presence-tenant")
    site = Site.objects.create(tenant=tenant, name="OTP presence site")
    locker = Locker.objects.create(tenant=tenant, site=site, name="OTP presence locker", hardware_id="LOCK-OTP-PRESENCE")
    requester = EnrolledUser.objects.create(tenant=tenant, display_name="Person A", employee_id="OTP-A", status="active")
    second_party = EnrolledUser.objects.create(tenant=tenant, display_name="Person B", employee_id="OTP-B", status="active")
    requester_device = Device.objects.create(tenant=tenant, user=requester, platform="android", public_key_fingerprint="otp-a", status="active")
    second_device = Device.objects.create(tenant=tenant, user=second_party, platform="android", public_key_fingerprint="otp-b", status="active")
    now = timezone.now()
    unlock_request = UnlockRequest.objects.create(tenant=tenant, locker=locker, requester=requester, second_party=second_party, status="approved_waiting_second_party", reason="OTP presence", expires_at=now + timedelta(minutes=5))
    challenge = OtpChallenge.objects.create(request=unlock_request, recipient=second_party, otp_hash="hash", otp_salt="salt", otp_ciphertext=encrypt_otp("123456"), delivery_status="delivered", expires_at=now + timedelta(minutes=3))
    PresenceSession.objects.create(request=unlock_request, user=requester, locker=locker, ble_session_id="otp-a-session", authenticated_at=now, last_heartbeat_at=now)
    challenge_url = f"/api/v1/mobile/otp-challenges/{challenge.id}"

    response_without_second_party = mobile_client(second_party, second_device).get(challenge_url)
    assert response_without_second_party.status_code == 409
    assert response_without_second_party.json()["error_code"] == "presence_required"

    PresenceSession.objects.create(request=None, user=second_party, locker=locker, ble_session_id="otp-b-session", authenticated_at=now, last_heartbeat_at=now)
    response_with_both_people = mobile_client(second_party, second_device).get(challenge_url)
    assert response_with_both_people.status_code == 200
    assert response_with_both_people.json()["otp"] == "123456"
