import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from core.demo_auth import issue_mobile_access_token
from core.models import Device, EnrolledUser, Locker, LockerEnrollment, Site, Tenant


TEST_SIGNING_KEY = "test-signing-key-that-is-long-enough-000"


def make_mobile_client(identity, device):
    user = get_user_model().objects.create_user(username=f"mobile-{identity.pk}")
    token, _expires_at = issue_mobile_access_token(user, identity)
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {token}",
        HTTP_X_DEVICE_ID=str(device.id),
    )
    return client


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY=TEST_SIGNING_KEY)
def test_eligible_second_parties_are_active_tenant_and_locker_scoped():
    tenant = Tenant.objects.create(name="Tenant A", slug="tenant-a")
    site = Site.objects.create(tenant=tenant, name="Site A")
    locker = Locker.objects.create(tenant=tenant, site=site, name="Locker A", hardware_id="LOCK-A")
    admin = get_user_model().objects.create_user(username="locker-admin")

    requester = EnrolledUser.objects.create(
        tenant=tenant, display_name="Requester", employee_id="A-01", status="active"
    )
    requester_device = Device.objects.create(
        tenant=tenant, user=requester, platform="android",
        public_key_fingerprint="requester-key", status="active",
    )
    LockerEnrollment.objects.create(locker=locker, user=requester, enrolled_by=admin)

    eligible = EnrolledUser.objects.create(
        tenant=tenant, display_name="Eligible Person", employee_id="B-01", status="active"
    )
    eligible_device = Device.objects.create(
        tenant=tenant, user=eligible, platform="android",
        public_key_fingerprint="eligible-key", status="active",
    )
    LockerEnrollment.objects.create(locker=locker, user=eligible, enrolled_by=admin)

    pending_device_user = EnrolledUser.objects.create(
        tenant=tenant, display_name="Pending Device", employee_id="C-01", status="active"
    )
    Device.objects.create(
        tenant=tenant, user=pending_device_user, platform="android",
        public_key_fingerprint="pending-key", status="pending",
    )
    LockerEnrollment.objects.create(locker=locker, user=pending_device_user, enrolled_by=admin)

    inactive_user = EnrolledUser.objects.create(
        tenant=tenant, display_name="Inactive Person", employee_id="D-01", status="revoked"
    )
    Device.objects.create(
        tenant=tenant, user=inactive_user, platform="android",
        public_key_fingerprint="inactive-key", status="active",
    )
    LockerEnrollment.objects.create(locker=locker, user=inactive_user, enrolled_by=admin)

    client = make_mobile_client(requester, requester_device)
    response = client.get(f"/api/v1/mobile/eligible-second-parties?locker_id={locker.id}")

    assert response.status_code == 200
    assert response.json() == [{
        "id": str(eligible.id),
        "display_name": "Eligible Person",
        "employee_id": "B-01",
    }]

    other_tenant = Tenant.objects.create(name="Tenant B", slug="tenant-b")
    other_site = Site.objects.create(tenant=other_tenant, name="Site B")
    other_locker = Locker.objects.create(
        tenant=other_tenant, site=other_site, name="Locker B", hardware_id="LOCK-B"
    )
    cross_tenant = client.get(
        f"/api/v1/mobile/eligible-second-parties?locker_id={other_locker.id}"
    )
    assert cross_tenant.status_code == 404


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY=TEST_SIGNING_KEY)
def test_eligible_second_parties_requires_requester_locker_enrollment():
    tenant = Tenant.objects.create(name="Tenant C", slug="tenant-c")
    site = Site.objects.create(tenant=tenant, name="Site C")
    locker = Locker.objects.create(tenant=tenant, site=site, name="Locker C", hardware_id="LOCK-C")
    requester = EnrolledUser.objects.create(
        tenant=tenant, display_name="Requester", employee_id="A-02", status="active"
    )
    device = Device.objects.create(
        tenant=tenant, user=requester, platform="android",
        public_key_fingerprint="requester-key-2", status="active",
    )

    response = make_mobile_client(requester, device).get(
        f"/api/v1/mobile/eligible-second-parties?locker_id={locker.id}"
    )

    assert response.status_code == 403
