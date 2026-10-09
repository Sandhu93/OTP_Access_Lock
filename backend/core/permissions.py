from rest_framework.permissions import BasePermission

from .models import TenantMembership


class TenantPermission(BasePermission):
    message = "An explicit tenant context is required for multi-tenant access."

    def has_permission(self, request, view):
        return tenant_for_request(request) is not None


class CanReviewUnlockRequest(BasePermission):
    message = "Only tenant owners and administrators can review unlock requests."

    def has_permission(self, request, view):
        tenant = tenant_for_request(request)
        return bool(
            tenant
            and TenantMembership.objects.filter(
                admin_user=request.user, tenant=tenant, active=True, role__in=["owner", "admin"]
            ).exists()
        )


class CanManageInventory(BasePermission):
    message = "Only tenant owners, administrators, and operators can change inventory."

    def has_permission(self, request, view):
        tenant = tenant_for_request(request)
        return bool(
            tenant
            and TenantMembership.objects.filter(
                admin_user=request.user,
                tenant=tenant,
                active=True,
                role__in=["owner", "admin", "operator"],
            ).exists()
        )


def tenant_for_request(request):
    if not request.user or not request.user.is_authenticated:
        return None
    memberships = TenantMembership.objects.filter(admin_user=request.user, active=True, tenant__status="active").select_related("tenant")
    requested = request.headers.get("X-Tenant-Id") or request.headers.get("X-Tenant-ID")
    if requested:
        membership = memberships.filter(tenant_id=requested).first()
        return membership.tenant if membership else None
    # Never silently select a tenant for an administrator who belongs to more than one.
    # The dashboard must send X-Tenant-ID on every tenant-scoped request.
    if memberships.count() == 1:
        return memberships.first().tenant
    return None
