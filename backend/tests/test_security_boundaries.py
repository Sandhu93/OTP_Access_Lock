from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from core.models import EnrolledUser, Locker, LockerPolicy, OtpChallenge, Site, Tenant, TenantMembership, UnlockRequest
from core.otp import OTP_MAX_ATTEMPTS, expiry_from_now, generate_otp, hash_otp, verify_otp
from core.providers import MobileDeliveryProvider, ProviderNotConfigured
from core.services import approve_unlock_request


User = get_user_model()


def test_otp_is_six_digits_and_hash_verifies():
    otp = generate_otp()
    salt = b"0123456789abcdef"
    assert len(otp) == 6 and otp.isdecimal()
    assert verify_otp(otp, hash_otp(otp, salt), salt)
    assert not verify_otp("000000" if otp != "000000" else "111111", hash_otp(otp, salt), salt)
    assert OTP_MAX_ATTEMPTS == 2
    assert expiry_from_now() > timezone.now()


@pytest.mark.django_db
def test_approval_rolls_back_when_mobile_delivery_is_not_configured():
    tenant = Tenant.objects.create(name="Test Tenant", slug="test-tenant")
    admin = User.objects.create_user(username="admin@example.test")
    TenantMembership.objects.create(tenant=tenant, admin_user=admin, role="admin", oidc_subject="test-subject")
    site = Site.objects.create(tenant=tenant, name="Test Site")
    locker = Locker.objects.create(tenant=tenant, site=site, name="Test Locker", hardware_id="LOCK-TEST")
    LockerPolicy.objects.create(locker=locker)
    requester = EnrolledUser.objects.create(tenant=tenant, display_name="Requester", employee_id="REQ-1", status="active")
    second_party = EnrolledUser.objects.create(tenant=tenant, display_name="Approver", employee_id="APP-1", status="active")
    request = UnlockRequest.objects.create(
        tenant=tenant,
        locker=locker,
        requester=requester,
        second_party=second_party,
        reason="Test review",
        expires_at=timezone.now() + timedelta(minutes=10),
    )

    with pytest.raises(ProviderNotConfigured):
        approve_unlock_request(request.id, admin, "Reviewed", MobileDeliveryProvider())

    request.refresh_from_db()
    assert request.status == "pending_review"
    assert not OtpChallenge.objects.filter(request=request).exists()
