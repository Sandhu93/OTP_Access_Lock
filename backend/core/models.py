import uuid

from django.conf import settings
from django.db import models


class Tenant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=80, unique=True)
    status = models.CharField(max_length=24, default="active")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class TenantMembership(models.Model):
    ROLE_CHOICES = [("owner", "Owner"), ("admin", "Admin"), ("operator", "Operator"), ("viewer", "Viewer")]
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="memberships")
    admin_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tenant_memberships")
    role = models.CharField(max_length=16, choices=ROLE_CHOICES)
    oidc_subject = models.CharField(max_length=255)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["tenant", "admin_user"], name="unique_admin_tenant")]


class Site(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="sites")
    name = models.CharField(max_length=160)
    region = models.CharField(max_length=160, blank=True)
    status = models.CharField(max_length=24, default="active")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["tenant", "name"], name="unique_site_name")]


class Locker(models.Model):
    STATUS_CHOICES = [("online", "Online"), ("offline", "Offline"), ("degraded", "Degraded"), ("revoked", "Revoked")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name="lockers")
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="lockers")
    name = models.CharField(max_length=160)
    hardware_id = models.CharField(max_length=128, unique=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="offline")
    last_seen_at = models.DateTimeField(null=True, blank=True)
    firmware_version = models.CharField(max_length=64, blank=True)
    certificate_serial = models.CharField(max_length=128, blank=True)


class LockerPolicy(models.Model):
    locker = models.OneToOneField(Locker, on_delete=models.CASCADE, related_name="policy")
    required_count = models.PositiveSmallIntegerField(default=2)
    enrolled_count = models.PositiveSmallIntegerField(default=3)
    updated_at = models.DateTimeField(auto_now=True)


class EnrolledUser(models.Model):
    STATUS_CHOICES = [("active", "Active"), ("pending", "Pending"), ("revoked", "Revoked")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="enrolled_users")
    oidc_subject = models.CharField(max_length=255, blank=True)
    display_name = models.CharField(max_length=160)
    employee_id = models.CharField(max_length=80)
    title = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["tenant", "employee_id"], name="unique_employee_per_tenant")]


class Device(models.Model):
    STATUS_CHOICES = [("pending", "Pending"), ("active", "Active"), ("revoked", "Revoked")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="devices")
    user = models.ForeignKey(EnrolledUser, on_delete=models.PROTECT, related_name="devices")
    platform = models.CharField(max_length=24)
    public_key_fingerprint = models.CharField(max_length=128, blank=True)
    attestation_reference = models.CharField(max_length=255, blank=True)
    push_token = models.CharField(max_length=4096, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="pending")
    last_seen_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)


class LockerEnrollment(models.Model):
    locker = models.ForeignKey(Locker, on_delete=models.CASCADE, related_name="enrollments")
    user = models.ForeignKey(EnrolledUser, on_delete=models.CASCADE, related_name="locker_enrollments")
    enrolled_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    enrolled_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["locker", "user"], name="unique_locker_user")]


class UnlockRequest(models.Model):
    STATUS_CHOICES = [("pending_review", "Pending review"), ("approved_waiting_second_party", "Approved / waiting"), ("presence_verifying", "Verifying"), ("token_issued", "Token issued"), ("actuated", "Actuated"), ("rejected", "Rejected"), ("otp_locked_out", "OTP locked out"), ("expired", "Expired"), ("aborted", "Aborted")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name="unlock_requests")
    locker = models.ForeignKey(Locker, on_delete=models.PROTECT, related_name="unlock_requests")
    requester = models.ForeignKey(EnrolledUser, on_delete=models.PROTECT, related_name="requested_unlocks")
    second_party = models.ForeignKey(EnrolledUser, on_delete=models.PROTECT, related_name="approved_unlocks", null=True, blank=True)
    status = models.CharField(max_length=40, choices=STATUS_CHOICES, default="pending_review")
    reason = models.TextField()
    admin_review_reason = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="reviewed_unlock_requests")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["tenant", "status", "requested_at"])]


class OtpChallenge(models.Model):
    request = models.OneToOneField(UnlockRequest, on_delete=models.CASCADE, related_name="otp_challenge")
    recipient = models.ForeignKey(EnrolledUser, on_delete=models.PROTECT)
    otp_hash = models.CharField(max_length=128)
    otp_salt = models.CharField(max_length=128)
    otp_ciphertext = models.TextField(blank=True)
    delivery_status = models.CharField(max_length=24, default="pending")
    issued_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=2)
    locked_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)


class PresenceSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.ForeignKey(UnlockRequest, on_delete=models.CASCADE, related_name="presence_sessions")
    user = models.ForeignKey(EnrolledUser, on_delete=models.PROTECT)
    locker = models.ForeignKey(Locker, on_delete=models.PROTECT)
    ble_session_id = models.CharField(max_length=128)
    authenticated_at = models.DateTimeField()
    last_heartbeat_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)


class SignedUnlockGrant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.OneToOneField(UnlockRequest, on_delete=models.PROTECT, related_name="signed_grant")
    locker = models.ForeignKey(Locker, on_delete=models.PROTECT)
    key_id = models.CharField(max_length=128)
    nonce = models.CharField(max_length=128, unique=True)
    issued_at = models.DateTimeField()
    expires_at = models.DateTimeField()
    published_at = models.DateTimeField(null=True, blank=True)
    actuated_at = models.DateTimeField(null=True, blank=True)


class LockTelemetry(models.Model):
    locker = models.ForeignKey(Locker, on_delete=models.CASCADE, related_name="telemetry")
    observed_at = models.DateTimeField()
    event_type = models.CharField(max_length=64)
    payload = models.JSONField(default=dict)


class AuditLogEntry(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name="audit_events")
    actor_type = models.CharField(max_length=24)
    actor_id = models.CharField(max_length=128)
    event_type = models.CharField(max_length=80)
    request_id = models.UUIDField(null=True, blank=True)
    details = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    previous_hash = models.CharField(max_length=128, blank=True)
    entry_hash = models.CharField(max_length=128, blank=True)


class EmergencyOverrideEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT)
    locker = models.ForeignKey(Locker, on_delete=models.PROTECT)
    observed_at = models.DateTimeField()
    reported_via = models.CharField(max_length=32)
    details = models.JSONField(default=dict)
    alert_created = models.BooleanField(default=False)


class SecurityAlert(models.Model):
    SEVERITY_CHOICES = [("info", "Info"), ("warning", "Warning"), ("critical", "Critical")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name="security_alerts")
    locker = models.ForeignKey(Locker, on_delete=models.PROTECT, null=True, blank=True)
    severity = models.CharField(max_length=16, choices=SEVERITY_CHOICES)
    category = models.CharField(max_length=64)
    message = models.TextField()
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class OutboxMessage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT)
    topic = models.CharField(max_length=255)
    payload = models.JSONField(default=dict)
    available_at = models.DateTimeField()
    sent_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveIntegerField(default=0)
