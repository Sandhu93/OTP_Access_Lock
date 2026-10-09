import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from core.demo_auth import mobile_login_username
from core.models import Device, EnrolledUser, Tenant, TenantMembership


@pytest.mark.django_db
@override_settings(
    AUTH_MODE="oidc",
    OIDC_ISSUER_URL="",
    OIDC_CLIENT_ID="",
    DASHBOARD_URL="https://otp-access-lock.pages.dev",
)
def test_unconfigured_oidc_login_returns_to_deployed_dashboard():
    response = APIClient().get("/api/v1/auth/login")

    assert response.status_code == 302
    assert response["Location"] == "https://otp-access-lock.pages.dev/login?error=oidc_not_configured"


@pytest.fixture
def demo_identity(db):
    tenant = Tenant.objects.create(name="Demo tenant", slug="demo-tenant")
    identity = EnrolledUser.objects.create(
        tenant=tenant,
        display_name="Demo Person",
        employee_id="DEMO-01",
        status="active",
    )
    user = get_user_model().objects.create_user(
        username=mobile_login_username(identity.pk), password="demo-password-for-tests"
    )
    return tenant, identity, user


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY="test-signing-key-that-is-long-enough-000")
def test_password_admin_login_creates_only_scoped_authenticated_session():
    tenant = Tenant.objects.create(name="Demo tenant", slug="demo-tenant")
    user = get_user_model().objects.create_user(username="demo-admin", password="demo-password")
    TenantMembership.objects.create(
        tenant=tenant, admin_user=user, role="admin", oidc_subject="demo-password:test", active=True
    )
    client = APIClient()

    response = client.post("/api/v1/auth/password-login", {"username": "demo-admin", "password": "demo-password"}, format="json")

    assert response.status_code == 200
    assert response.json()["authenticated"] is True
    assert client.get("/api/v1/auth/me").json()["memberships"][0]["tenant_id"] == str(tenant.id)


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY="test-signing-key-that-is-long-enough-000")
def test_admin_login_rejects_user_without_active_tenant_membership():
    get_user_model().objects.create_user(username="orphan", password="demo-password")
    response = APIClient().post(
        "/api/v1/auth/password-login", {"username": "orphan", "password": "demo-password"}, format="json"
    )
    assert response.status_code == 401


@pytest.mark.django_db
@override_settings(
    AUTH_MODE="password_demo",
    DEMO_AUTH_SIGNING_KEY="test-signing-key-that-is-long-enough-000",
    CSRF_TRUSTED_ORIGINS=["https://testserver"],
)
def test_dashboard_password_login_requires_csrf():
    cache.clear()
    tenant = Tenant.objects.create(name="Demo tenant", slug="demo-tenant")
    user = get_user_model().objects.create_user(username="demo-admin", password="demo-password")
    TenantMembership.objects.create(
        tenant=tenant, admin_user=user, role="admin", oidc_subject="demo-password:csrf", active=True
    )
    client = APIClient(enforce_csrf_checks=True)
    denied = client.post(
        "/api/v1/auth/password-login",
        {"username": "demo-admin", "password": "demo-password"},
        format="json",
        secure=True,
    )
    assert denied.status_code == 403

    csrf_response = client.get("/api/v1/auth/csrf", secure=True)
    token = csrf_response.json()["csrfToken"]
    allowed = client.post(
        "/api/v1/auth/password-login",
        {"username": "demo-admin", "password": "demo-password"},
        format="json",
        secure=True,
        HTTP_ORIGIN="https://testserver",
        HTTP_X_CSRFTOKEN=token,
    )
    assert allowed.status_code == 200


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY="test-signing-key-that-is-long-enough-000")
def test_mobile_password_token_is_tenant_bound_and_revocation_takes_effect(demo_identity):
    tenant, identity, _ = demo_identity
    client = APIClient()
    login_response = client.post(
        "/api/v1/auth/mobile-login",
        {"tenant_slug": tenant.slug, "employee_id": identity.employee_id, "password": "demo-password-for-tests"},
        format="json",
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    device = Device.objects.create(
        tenant=tenant, user=identity, platform="android", public_key_fingerprint="test-fingerprint", status="active"
    )
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}", HTTP_X_DEVICE_ID=str(device.id))
    assert client.get("/api/v1/mobile/unlock-requests").status_code == 200

    identity.status = "revoked"
    identity.save(update_fields=["status"])
    assert client.get("/api/v1/mobile/unlock-requests").status_code == 401


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY="test-signing-key-that-is-long-enough-000")
def test_mobile_password_login_rejects_wrong_tenant_or_password(demo_identity):
    tenant, identity, _ = demo_identity
    response = APIClient().post(
        "/api/v1/auth/mobile-login",
        {"tenant_slug": "another-tenant", "employee_id": identity.employee_id, "password": "demo-password-for-tests"},
        format="json",
    )
    assert response.status_code == 401


@pytest.mark.django_db
@override_settings(AUTH_MODE="oidc", DEMO_AUTH_SIGNING_KEY="test-signing-key-that-is-long-enough-000")
def test_password_routes_are_closed_when_oidc_mode_is_selected():
    cache.clear()
    client = APIClient()
    assert client.get("/api/v1/auth/config").json() == {"mode": "oidc"}
    assert client.post("/api/v1/auth/password-login", {}, format="json").status_code == 404
    assert client.post("/api/v1/auth/mobile-login", {}, format="json").status_code == 404
