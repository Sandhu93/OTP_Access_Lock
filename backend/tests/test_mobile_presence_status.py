from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone

from rest_framework.test import APIClient

from core.demo_auth import issue_mobile_access_token
from core.models import Device, EnrolledUser, Locker, PresenceSession, Site, Tenant, UnlockRequest


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
