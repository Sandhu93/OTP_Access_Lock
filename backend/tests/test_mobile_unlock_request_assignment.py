import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from core.demo_auth import issue_mobile_access_token
from core.models import Device, EnrolledUser, Locker, LockerEnrollment, Site, Tenant, UnlockRequest


TEST_SIGNING_KEY = "test-signing-key-that-is-long-enough-000"


def make_requester():
    tenant = Tenant.objects.create(name="Tenant", slug="tenant")
    site = Site.objects.create(tenant=tenant, name="Site")
    locker = Locker.objects.create(tenant=tenant, site=site, name="Locker", hardware_id="LOCK-ASSIGN")
    admin = get_user_model().objects.create_user(username="assignment-admin")
    requester = EnrolledUser.objects.create(tenant=tenant, display_name="Person A", employee_id="A", status="active")
    requester_device = Device.objects.create(
        tenant=tenant, user=requester, platform="android", public_key_fingerprint="requester-device-key", status="active"
    )
    LockerEnrollment.objects.create(locker=locker, user=requester, enrolled_by=admin)
    user = get_user_model().objects.create_user(username="assignment-mobile")
    token, _expires_at = issue_mobile_access_token(user, requester)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}", HTTP_X_DEVICE_ID=str(requester_device.id))
    return tenant, locker, admin, requester, client


def add_second_party(tenant, locker, admin, employee_id):
    person = EnrolledUser.objects.create(tenant=tenant, display_name=f"Person {employee_id}", employee_id=employee_id, status="active")
    Device.objects.create(
        tenant=tenant, user=person, platform="android", public_key_fingerprint=f"device-key-{employee_id}", status="active"
    )
    LockerEnrollment.objects.create(locker=locker, user=person, enrolled_by=admin)
    return person


def post_request(client, locker, **extra):
    return client.post("/api/v1/mobile/unlock-requests", {
        "locker_id": str(locker.id),
        "reason": "Secure document retrieval",
        "ble_session_id": "0011223344556677",
        **extra,
    }, format="json")


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY=TEST_SIGNING_KEY, DEV_MODE=False)
def test_request_auto_assigns_when_exactly_one_second_party_is_eligible():
    tenant, locker, admin, _requester, client = make_requester()
    second_party = add_second_party(tenant, locker, admin, "B-01")

    response = post_request(client, locker)

    assert response.status_code == 201
    assert response.json()["second_party"] == str(second_party.id)
    assert UnlockRequest.objects.get(id=response.json()["id"]).second_party_id == second_party.id


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY=TEST_SIGNING_KEY, DEV_MODE=False)
def test_request_requires_selection_when_multiple_second_parties_are_eligible():
    tenant, locker, admin, _requester, client = make_requester()
    add_second_party(tenant, locker, admin, "B-01")
    add_second_party(tenant, locker, admin, "C-01")

    response = post_request(client, locker)

    assert response.status_code == 409
    assert response.json()["error_code"] == "second_party_selection_required"
    assert not UnlockRequest.objects.exists()


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY=TEST_SIGNING_KEY, DEV_MODE=False)
def test_request_uses_selected_eligible_second_party():
    tenant, locker, admin, _requester, client = make_requester()
    add_second_party(tenant, locker, admin, "B-01")
    selected = add_second_party(tenant, locker, admin, "C-01")

    response = post_request(client, locker, second_party_id=str(selected.id))

    assert response.status_code == 201
    assert response.json()["second_party"] == str(selected.id)


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY=TEST_SIGNING_KEY, DEV_MODE=False)
def test_request_explains_when_no_second_party_is_eligible():
    _tenant, locker, _admin, _requester, client = make_requester()

    response = post_request(client, locker)

    assert response.status_code == 409
    assert response.json()["error_code"] == "eligible_second_party_required"
