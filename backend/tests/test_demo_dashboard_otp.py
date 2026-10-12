from unittest.mock import Mock

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import AuditLogEntry, EnrolledUser, Locker, OtpChallenge, PresenceSession, Site, Tenant, TenantMembership, UnlockRequest
from core.otp import decrypt_otp
from core.services import approve_unlock_request


@pytest.fixture
def dashboard_otp_setup(db):
    tenant = Tenant.objects.create(name="OTP demo tenant", slug="otp-demo")
    site = Site.objects.create(tenant=tenant, name="Test site")
    locker = Locker.objects.create(tenant=tenant, site=site, name="Test locker", hardware_id="LOCK-OTP")
    admin = get_user_model().objects.create_user(username="otp-admin")
    TenantMembership.objects.create(tenant=tenant, admin_user=admin, role="admin", oidc_subject="otp-admin")
    requester = EnrolledUser.objects.create(tenant=tenant, display_name="Person A", employee_id="A-01", status="active")
    second_party = EnrolledUser.objects.create(tenant=tenant, display_name="Person B", employee_id="B-01", status="active")
    unlock_request = UnlockRequest.objects.create(
        tenant=tenant, locker=locker, requester=requester, second_party=second_party, reason="Demo test"
    )
    approve_unlock_request(unlock_request.id, admin, "Demo approval", Mock())
    unlock_request.refresh_from_db()
    challenge = OtpChallenge.objects.get(request=unlock_request)
    return tenant, locker, admin, requester, second_party, unlock_request, challenge


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_DASHBOARD_OTP_ENABLED=True)
def test_demo_dashboard_otp_requires_both_fresh_presence_and_is_audited(dashboard_otp_setup):
    tenant, locker, admin, requester, second_party, unlock_request, challenge = dashboard_otp_setup
    request_id = str(unlock_request.id)
    dashboard = APIClient()
    dashboard.force_authenticate(admin)
    endpoint = f"/api/v1/admin/unlock-requests/{request_id}/demo-otp/"
    headers = {"HTTP_X_TENANT_ID": str(tenant.id)}
    assert dashboard.get(endpoint, **headers).status_code == 409

    for person, session_id in ((requester, "aabbccddeeff0011"), (second_party, "1122334455667788")):
        PresenceSession.objects.create(
            request=unlock_request,
            user=person,
            locker=locker,
            ble_session_id=session_id,
            authenticated_at=timezone.now(),
            last_heartbeat_at=timezone.now(),
        )

    response = dashboard.get(endpoint, **headers)
    assert response.status_code == 200, response.data
    assert response.json()["otp"] == decrypt_otp(challenge.otp_ciphertext)
    assert response["Cache-Control"].startswith("no-store")
    event = AuditLogEntry.objects.get(tenant=tenant, event_type="demo.otp_revealed", request_id=request_id)
    assert "otp" not in event.details


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_DASHBOARD_OTP_ENABLED=False)
def test_demo_dashboard_otp_endpoint_is_hidden_when_disabled(dashboard_otp_setup):
    tenant, _locker, admin, _requester, _second_party, unlock_request, _challenge = dashboard_otp_setup
    dashboard = APIClient()
    dashboard.force_authenticate(admin)
    response = dashboard.get(
        f"/api/v1/admin/unlock-requests/{unlock_request.id}/demo-otp/",
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 404

