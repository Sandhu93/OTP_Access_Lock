from datetime import timedelta
from unittest.mock import Mock

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from core.demo_auth import mobile_login_username
from core.models import Device, EnrolledUser, Locker, LockerEnrollment, PresenceSession, Site, Tenant, TenantMembership
from core.services import approve_unlock_request


TEST_SIGNING_KEY = "test-signing-key-that-is-long-enough-000"


@pytest.fixture
def dual_presence_setup(db):
    cache.clear()
    tenant = Tenant.objects.create(name="Dual presence tenant", slug="dual-presence")
    site = Site.objects.create(tenant=tenant, name="Test site")
    locker = Locker.objects.create(tenant=tenant, site=site, name="Test locker", hardware_id="LOCK-DUAL")
    admin = get_user_model().objects.create_user(username="dual-admin")
    TenantMembership.objects.create(tenant=tenant, admin_user=admin, role="admin", oidc_subject="dual-admin")
    people = []
    clients = []
    for employee_id, name in (("A-01", "Person A"), ("B-01", "Person B")):
        person = EnrolledUser.objects.create(tenant=tenant, display_name=name, employee_id=employee_id, status="active")
        Device.objects.create(
            tenant=tenant,
            user=person,
            platform="android",
            public_key_fingerprint=f"fingerprint-{employee_id}",
            status="active",
        )
        LockerEnrollment.objects.create(locker=locker, user=person, enrolled_by=admin)
        password = f"{employee_id}-test-password"
        get_user_model().objects.create_user(username=mobile_login_username(person.pk), password=password)
        client = APIClient()
        login = client.post("/api/v1/auth/mobile-login", {
            "tenant_slug": tenant.slug,
            "employee_id": person.employee_id,
            "password": password,
        }, format="json")
        assert login.status_code == 200
        device = Device.objects.get(user=person)
        client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {login.json()['access_token']}",
            HTTP_X_DEVICE_ID=str(device.id),
        )
        people.append(person)
        clients.append(client)
    return tenant, locker, admin, people, clients


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY=TEST_SIGNING_KEY, DEV_MODE=False)
def test_request_assigns_only_eligible_second_party_without_their_presence(dual_presence_setup):
    _tenant, locker, _admin, people, clients = dual_presence_setup
    candidates = clients[0].get(f"/api/v1/mobile/eligible-second-parties?locker_id={locker.id}")
    assert candidates.status_code == 200
    assert [item["id"] for item in candidates.json()] == [str(people[1].id)]

    response = clients[0].post("/api/v1/mobile/unlock-requests", {
        "locker_id": str(locker.id),
        "reason": "Secure document retrieval",
        "ble_session_id": "aabbccddeeff0011",
    }, format="json")

    assert response.status_code == 201, response.data
    assert response.json()["second_party"] == str(people[1].id)
    assert not PresenceSession.objects.filter(request_id=response.json()["id"], user=people[1]).exists()


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY=TEST_SIGNING_KEY, DEV_MODE=False)
def test_otp_retrieval_requires_b_presence_and_verification_requires_both(dual_presence_setup):
    _tenant, locker, admin, people, clients = dual_presence_setup
    created = clients[0].post("/api/v1/mobile/unlock-requests", {
        "locker_id": str(locker.id),
        "reason": "Secure document retrieval",
        "ble_session_id": "aabbccddeeff0011",
    }, format="json")
    assert created.status_code == 201, created.data
    delivery = Mock()
    approve_unlock_request(created.json()["id"], admin, "approved for test", delivery)
    challenge_id = created.json()["id"]
    from core.models import OtpChallenge
    challenge = OtpChallenge.objects.get(request_id=challenge_id)

    withheld = clients[1].get(f"/api/v1/mobile/otp-challenges/{challenge.id}")
    assert withheld.status_code == 409
    assert withheld.json()["error_code"] == "second_party_presence_required"

    joined = clients[1].post("/api/v1/mobile/presence-sessions", {
        "request_id": challenge_id,
        "locker_id": str(locker.id),
        "ble_session_id": "1122334455667788",
    }, format="json")
    assert joined.status_code == 201, joined.data
    assert clients[1].get(f"/api/v1/mobile/otp-challenges/{challenge.id}").status_code == 200

    requester_presence = PresenceSession.objects.get(request_id=challenge_id, user=people[0])
    requester_presence.last_heartbeat_at = timezone.now() - timedelta(seconds=31)
    requester_presence.save(update_fields=["last_heartbeat_at"])
    without_requester = clients[1].post(
        f"/api/v1/mobile/otp-challenges/{challenge.id}/verify", {"otp": "123456"}, format="json"
    )
    assert without_requester.status_code == 409
    assert without_requester.json()["error_code"] == "both_party_presence_required"

    refreshed = clients[0].patch(
        f"/api/v1/mobile/presence-sessions/{requester_presence.id}/heartbeat",
        {"ble_session_id": "aabbccddeeff0011"}, format="json",
    )
    assert refreshed.status_code == 200
    invalid_otp = clients[1].post(
        f"/api/v1/mobile/otp-challenges/{challenge.id}/verify", {"otp": "123456"}, format="json"
    )
    assert invalid_otp.status_code == 400
    assert invalid_otp.json()["error_code"] == "otp_invalid"


@pytest.mark.django_db
@override_settings(AUTH_MODE="password_demo", DEMO_AUTH_SIGNING_KEY=TEST_SIGNING_KEY, DEV_MODE=False)
def test_request_requires_selection_if_multiple_second_parties_are_eligible(dual_presence_setup):
    tenant, locker, admin, people, clients = dual_presence_setup
    alternate = EnrolledUser.objects.create(tenant=tenant, display_name="Person C", employee_id="C-01", status="active")
    Device.objects.create(
        tenant=tenant, user=alternate, platform="android", public_key_fingerprint="fingerprint-C-01", status="active"
    )
    LockerEnrollment.objects.create(locker=locker, user=alternate, enrolled_by=admin)

    response = clients[0].post("/api/v1/mobile/unlock-requests", {
        "locker_id": str(locker.id),
        "reason": "Secure document retrieval",
        "ble_session_id": "aabbccddeeff0011",
    }, format="json")

    assert response.status_code == 400
    assert response.json()["error_code"] == "second_party_selection_required"
