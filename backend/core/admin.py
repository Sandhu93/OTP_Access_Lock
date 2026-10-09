from django.contrib import admin

from .models import AuditLogEntry, Device, EmergencyOverrideEvent, EnrolledUser, Locker, LockerEnrollment, LockerPolicy, LockTelemetry, OtpChallenge, PresenceSession, SecurityAlert, Site, Tenant, TenantMembership, UnlockRequest

for model in [Tenant, TenantMembership, Site, Locker, LockerPolicy, EnrolledUser, Device, LockerEnrollment, UnlockRequest, OtpChallenge, PresenceSession, AuditLogEntry, EmergencyOverrideEvent, SecurityAlert, LockTelemetry]:
    admin.site.register(model)
