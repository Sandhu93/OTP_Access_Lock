from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from django.utils import timezone

from .models import AuditLogEntry, Device, EnrolledUser, Locker, LockerPolicy, SecurityAlert, Site, UnlockRequest
from .permissions import CanManageInventory, CanReviewUnlockRequest, TenantPermission, tenant_for_request
from .providers import ProviderNotConfigured, get_mobile_delivery_provider
from .serializers import AuditLogEntrySerializer, DeviceSerializer, EnrolledUserSerializer, LockerPolicySerializer, LockerSerializer, ReviewSerializer, SecurityAlertSerializer, SiteSerializer, UnlockRequestSerializer
from .services import EXPIRABLE_REQUEST_STATUSES, WorkflowError, approve_unlock_request, expire_unlock_request_if_needed, reject_unlock_request


class TenantScopedMixin:
    permission_classes = [TenantPermission]

    def tenant(self):
        return tenant_for_request(self.request)

    def scoped_queryset(self, queryset):
        tenant = self.tenant()
        return queryset.filter(tenant=tenant) if tenant else queryset.none()


class SiteViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    serializer_class = SiteSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        return [CanManageInventory()] if self.action in ["create", "partial_update", "update"] else super().get_permissions()

    def get_queryset(self):
        return self.scoped_queryset(Site.objects.all().order_by("name"))

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant())

class LockerViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    serializer_class = LockerSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        return [CanManageInventory()] if self.action in ["create", "partial_update", "update"] else super().get_permissions()

    def get_queryset(self):
        return self.scoped_queryset(Locker.objects.select_related("site", "policy").order_by("name"))

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant())


class UserViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    serializer_class = EnrolledUserSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        return [CanManageInventory()] if self.action in ["create", "partial_update", "update", "revoke"] else super().get_permissions()

    def get_queryset(self):
        return self.scoped_queryset(EnrolledUser.objects.all().order_by("display_name"))

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant())

    @action(detail=True, methods=["post"], url_path="revoke")
    def revoke(self, request, *args, **kwargs):
        person = self.get_object()
        person.status = "revoked"
        person.save(update_fields=["status"])
        return Response(self.get_serializer(person).data)


class DeviceViewSet(TenantScopedMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = DeviceSerializer

    def get_queryset(self):
        return self.scoped_queryset(Device.objects.select_related("user").order_by("user__display_name"))

    def get_permissions(self):
        return [CanManageInventory()] if self.action == "revoke" else super().get_permissions()

    @action(detail=True, methods=["post"], url_path="revoke")
    def revoke(self, request, *args, **kwargs):
        device = self.get_object()
        device.status = "revoked"
        device.revoked_at = timezone.now()
        device.save(update_fields=["status", "revoked_at"])
        return Response(self.get_serializer(device).data)


class PolicyViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    serializer_class = LockerPolicySerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        return [CanManageInventory()] if self.action in ["partial_update", "update"] else super().get_permissions()

    def get_queryset(self):
        return LockerPolicy.objects.filter(locker__tenant=self.tenant()).select_related("locker")


class UnlockRequestViewSet(TenantScopedMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = UnlockRequestSerializer

    def get_permissions(self):
        return [CanReviewUnlockRequest()] if self.action in ["approve", "reject"] else super().get_permissions()

    def get_queryset(self):
        queryset = self.scoped_queryset(UnlockRequest.objects.select_related("locker", "requester", "second_party").order_by("-requested_at"))
        expired_ids = list(queryset.filter(status__in=EXPIRABLE_REQUEST_STATUSES, expires_at__isnull=False, expires_at__lte=timezone.now()).values_list("id", flat=True))
        for request_id in expired_ids:
            expire_unlock_request_if_needed(request_id)
        if self.request.query_params.get("status"):
            queryset = queryset.filter(status=self.request.query_params["status"])
        return queryset

    def _review(self, request, approve):
        serializer = ReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            if approve:
                result = approve_unlock_request(self.get_object().id, request.user, serializer.validated_data["reason"], get_mobile_delivery_provider(), serializer.validated_data.get("second_party_id"))
            else:
                result = reject_unlock_request(self.get_object().id, request.user, serializer.validated_data["reason"])
        except ProviderNotConfigured as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except WorkflowError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(self.get_serializer(result).data)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, *args, **kwargs):
        return self._review(request, approve=True)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, *args, **kwargs):
        return self._review(request, approve=False)


class OverviewView(TenantScopedMixin, APIView):
    def get(self, request):
        tenant = self.tenant()
        if not tenant:
            return Response({"detail": "tenant context is required"}, status=status.HTTP_403_FORBIDDEN)
        lockers = Locker.objects.filter(tenant=tenant)
        requests = UnlockRequest.objects.filter(tenant=tenant)
        return Response({"tenant": {"id": str(tenant.id), "name": tenant.name}, "lockers": {"total": lockers.count(), "online": lockers.filter(status="online").count(), "attention": lockers.filter(status__in=["offline", "degraded"]).count()}, "requests": {"pending_review": requests.filter(status="pending_review").count(), "active": requests.filter(status__in=["approved_waiting_second_party", "presence_verifying"]).count()}})


class AuditLogViewSet(TenantScopedMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogEntrySerializer

    def get_queryset(self):
        return self.scoped_queryset(AuditLogEntry.objects.all().order_by("-created_at"))


class SecurityAlertViewSet(TenantScopedMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = SecurityAlertSerializer

    def get_queryset(self):
        return self.scoped_queryset(SecurityAlert.objects.all().order_by("-created_at"))


class HealthView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok", "service": "access-lock-api"})
