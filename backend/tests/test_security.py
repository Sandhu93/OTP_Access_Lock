from datetime import timedelta
from unittest.mock import Mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import EnrolledUser, Locker, LockerPolicy, Site, Tenant, TenantMembership, UnlockRequest
from core.services import approve_unlock_request, expire_otp_challenge_if_needed, expire_unlock_request_if_needed, verify_otp_challenge


class TenantIsolationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = get_user_model().objects.create_user(username="admin")
        self.tenant_a = Tenant.objects.create(name="Bank A", slug="bank-a")
        self.tenant_b = Tenant.objects.create(name="Bank B", slug="bank-b")
        TenantMembership.objects.create(tenant=self.tenant_a, admin_user=self.admin, role="admin", oidc_subject="sub-a")
        TenantMembership.objects.create(tenant=self.tenant_b, admin_user=self.admin, role="viewer", oidc_subject="sub-b")
        self.client.force_authenticate(self.admin)

    def test_multi_tenant_admin_must_select_tenant(self):
        response = self.client.get("/api/v1/admin/overview")
        assert response.status_code == 403, response.data

        response = self.client.get("/api/v1/admin/overview", HTTP_X_TENANT_ID=str(self.tenant_a.id))
        assert response.status_code == 200
        assert response.json()["tenant"]["id"] == str(self.tenant_a.id)

    def test_viewer_cannot_create_site(self):
        response = self.client.post(
            "/api/v1/admin/sites/",
            {"name": "Restricted", "region": "East", "status": "active"},
            format="json",
            HTTP_X_TENANT_ID=str(self.tenant_b.id),
        )
        assert response.status_code == 403, response.data


class OtpLifecycleTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_user(username="reviewer")
        self.tenant = Tenant.objects.create(name="Bank", slug="bank")
        TenantMembership.objects.create(tenant=self.tenant, admin_user=self.admin, role="admin", oidc_subject="reviewer")
        self.site = Site.objects.create(tenant=self.tenant, name="HQ")
        self.locker = Locker.objects.create(tenant=self.tenant, site=self.site, name="Vault 1", hardware_id="lock-1")
        LockerPolicy.objects.create(locker=self.locker)
        self.requester = EnrolledUser.objects.create(tenant=self.tenant, display_name="Person A", employee_id="A1", status="active")
        self.second_party = EnrolledUser.objects.create(tenant=self.tenant, display_name="Person B", employee_id="B1", status="active")

    def _request(self):
        return UnlockRequest.objects.create(
            tenant=self.tenant,
            locker=self.locker,
            requester=self.requester,
            second_party=self.second_party,
            reason="dual control test",
            expires_at=timezone.now() + timedelta(minutes=5),
        )

    def test_wrong_otp_locks_after_two_attempts(self):
        request = self._request()
        delivery = Mock()
        approve_unlock_request(request.id, self.admin, "approved", delivery)
        challenge = request.otp_challenge

        assert verify_otp_challenge(challenge.id, "000000") is False
        assert verify_otp_challenge(challenge.id, "111111") is False
        request.refresh_from_db()
        challenge.refresh_from_db()
        assert request.status == "otp_locked_out"
        assert challenge.attempts == 2
        assert challenge.locked_at is not None

    def test_otp_success_moves_request_to_presence_verification(self):
        request = self._request()
        delivery = Mock()
        delivery.deliver_otp_challenge.side_effect = lambda recipient, challenge, otp, expires: setattr(delivery, "otp", otp)
        approve_unlock_request(request.id, self.admin, "approved", delivery)
        challenge = request.otp_challenge

        assert verify_otp_challenge(challenge.id, delivery.otp) is True
        request.refresh_from_db()
        assert request.status == "presence_verifying"

    def test_expired_request_is_normalized_before_it_can_be_used(self):
        request = self._request()
        request.expires_at = timezone.now() - timedelta(seconds=1)
        request.save(update_fields=["expires_at"])

        refreshed = expire_unlock_request_if_needed(request.id)

        assert refreshed.status == "expired"
        request.refresh_from_db()
        assert request.status == "expired"

    def test_expired_otp_closes_an_approved_request(self):
        request = self._request()
        delivery = Mock()
        approve_unlock_request(request.id, self.admin, "approved", delivery)
        challenge = request.otp_challenge
        challenge.expires_at = timezone.now() - timedelta(seconds=1)
        challenge.save(update_fields=["expires_at"])

        assert expire_otp_challenge_if_needed(challenge.id) is True
        request.refresh_from_db()
        assert request.status == "expired"
