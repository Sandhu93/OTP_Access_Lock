import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from core.demo_auth import mobile_login_username
from core.models import AuditLogEntry, Device, EnrolledUser, Tenant, TenantMembership


@pytest.fixture
def enrollment_identity(db):
    tenant = Tenant.objects.create(name="Enrollment tenant", slug="enrollment-tenant")
    identity = EnrolledUser.objects.create(tenant=tenant, display_name="Demo Person", employee_id="ENR-01", status="active")
    get_user_model().objects.create_user(username=mobile_login_username(identity.pk), password="enrollment-test-password")
    return tenant, identity


def mobile_client_for(identity, tenant):
    client = APIClient()
    response = client.post("/api/v1/auth/mobile-login", {
        "tenant_slug": tenant.slug,
        "employee_id": identity.employee_id,
        "password": "enrollment-test-password",
    }, format="json")
    assert response.status_code == 200
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['access_token']}")
    return client


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY="test-signing-key-that-is-long-enough-000", DEV_MODE=False)
def test_first_phone_is_saved_pending_and_admin_can_approve(enrollment_identity):
    tenant, identity = enrollment_identity
    mobile = mobile_client_for(identity, tenant)
    registration = mobile.post("/api/v1/mobile/devices/register", {
        "platform": "android",
        "public_key_fingerprint": "a" * 64,
    }, format="json")

    assert registration.status_code == 202
    device = Device.objects.get(id=registration.json()["device_id"])
    assert device.status == "pending"
    assert mobile.get(f"/api/v1/mobile/devices/{device.id}/enrollment-status").json()["status"] == "pending"

    admin = get_user_model().objects.create_user(username="enrollment-admin", password="not-used-here")
    TenantMembership.objects.create(tenant=tenant, admin_user=admin, role="admin", oidc_subject="enrollment-admin")
    dashboard = APIClient()
    dashboard.force_authenticate(admin)
    approved = dashboard.post(f"/api/v1/admin/devices/{device.id}/approve/", {"reason": "Employee and phone verified in person."}, format="json", HTTP_X_TENANT_ID=str(tenant.id))

    assert approved.status_code == 200
    device.refresh_from_db()
    assert device.status == "active"
    assert device.reviewed_by_id == admin.id
    assert device.reviewed_at is not None
    assert AuditLogEntry.objects.filter(tenant=tenant, event_type="mobile_device.approved").exists()
    assert mobile.get(f"/api/v1/mobile/devices/{device.id}/enrollment-status").json()["status"] == "active"


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY="test-signing-key-that-is-long-enough-000", DEV_MODE=False)
def test_device_approval_is_tenant_scoped_and_reenrollment_fails_closed(enrollment_identity):
    tenant, identity = enrollment_identity
    mobile = mobile_client_for(identity, tenant)
    first = Device.objects.create(tenant=tenant, user=identity, platform="android", public_key_fingerprint="b" * 64, status="active")
    response = mobile.post("/api/v1/mobile/devices/register", {"platform": "android", "public_key_fingerprint": "c" * 64}, format="json")
    assert response.status_code == 409
    assert response.json()["error_code"] == "device_reenrollment_requires_second_party"
    assert Device.objects.filter(user=identity).count() == 1

    other_tenant = Tenant.objects.create(name="Other tenant", slug="other-enrollment-tenant")
    admin = get_user_model().objects.create_user(username="other-admin")
    TenantMembership.objects.create(tenant=other_tenant, admin_user=admin, role="admin", oidc_subject="other-admin")
    dashboard = APIClient()
    dashboard.force_authenticate(admin)
    denied = dashboard.post(f"/api/v1/admin/devices/{first.id}/approve/", {"reason": "Wrong tenant test."}, format="json", HTTP_X_TENANT_ID=str(other_tenant.id))
    assert denied.status_code == 404


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY="test-signing-key-that-is-long-enough-000", DEV_MODE=False)
def test_device_rejection_is_terminal_for_that_fingerprint(enrollment_identity):
    tenant, identity = enrollment_identity
    mobile = mobile_client_for(identity, tenant)
    registration = mobile.post("/api/v1/mobile/devices/register", {"platform": "android", "public_key_fingerprint": "d" * 64}, format="json")
    device = Device.objects.get(id=registration.json()["device_id"])
    admin = get_user_model().objects.create_user(username="reject-admin")
    TenantMembership.objects.create(tenant=tenant, admin_user=admin, role="owner", oidc_subject="reject-admin")
    dashboard = APIClient()
    dashboard.force_authenticate(admin)
    rejected = dashboard.post(f"/api/v1/admin/devices/{device.id}/reject/", {"reason": "Phone ownership could not be verified."}, format="json", HTTP_X_TENANT_ID=str(tenant.id))
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    status_response = mobile.get(f"/api/v1/mobile/devices/{device.id}/enrollment-status")
    assert status_response.json()["status"] == "rejected"
