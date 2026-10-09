import logging

from django.contrib.auth import authenticate
from django.conf import settings
from django.contrib.auth import get_user_model, login, logout
from django.middleware.csrf import get_token
from django.http import HttpResponseRedirect
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import serializers
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .demo_auth import issue_mobile_access_token, mobile_login_username
from .models import EnrolledUser, Tenant, TenantMembership
from .providers import OidcProvider, ProviderNotConfigured


User = get_user_model()
logger = logging.getLogger(__name__)


def _dashboard_redirect(query=""):
    return HttpResponseRedirect(f"{settings.DASHBOARD_URL.rstrip('/')}/login{query}")


class PasswordLoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, trim_whitespace=True)
    password = serializers.CharField(max_length=256, trim_whitespace=False, write_only=True)


class MobilePasswordLoginSerializer(serializers.Serializer):
    tenant_slug = serializers.CharField(max_length=80, trim_whitespace=True)
    employee_id = serializers.CharField(max_length=80, trim_whitespace=True)
    password = serializers.CharField(max_length=256, trim_whitespace=False, write_only=True)


class OidcLoginView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if settings.AUTH_MODE == "password_demo":
            return _dashboard_redirect("?error=oidc_disabled_in_demo_mode")
        try:
            return HttpResponseRedirect(OidcProvider().begin_login(request))
        except ProviderNotConfigured:
            return _dashboard_redirect("?error=oidc_not_configured")


class OidcCallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if settings.AUTH_MODE == "password_demo":
            return _dashboard_redirect("?error=oidc_disabled_in_demo_mode")
        code = request.query_params.get("code")
        state = request.query_params.get("state")
        if not code or not state:
            return _dashboard_redirect("?error=oidc_callback_invalid")
        try:
            claims = OidcProvider().authenticate_callback(request, code, state)
            subject = str(claims["sub"])
            username = f"oidc:{subject}"
            user, _ = User.objects.get_or_create(username=username, defaults={"email": claims.get("email", "")})
            changed = []
            if claims.get("email") and user.email != claims["email"]:
                user.email = claims["email"]
                changed.append("email")
            if claims.get("name") and user.get_full_name() != claims["name"]:
                user.first_name = claims["name"]
                changed.extend(["first_name"])
            if changed:
                user.save(update_fields=changed)

            tenant_slug = claims.get(settings.OIDC_TENANT_CLAIM) or (
                settings.OIDC_DEFAULT_TENANT_SLUG if settings.DEV_MODE else ""
            )
            tenant = Tenant.objects.filter(slug=tenant_slug, status="active").first()
            if not tenant:
                raise ProviderNotConfigured("OIDC identity is not mapped to an active tenant")
            role = claims.get("role", "admin")
            if role not in {"owner", "admin", "operator", "viewer"}:
                role = "viewer"
            TenantMembership.objects.update_or_create(
                tenant=tenant,
                admin_user=user,
                defaults={"oidc_subject": subject, "role": role, "active": True},
            )
            login(request, user)
            return HttpResponseRedirect(settings.DASHBOARD_URL.rstrip("/") + "/")
        except (KeyError, ProviderNotConfigured) as exc:
            # Keep tokens and provider response bodies out of logs, but leave a useful
            # failure class for local diagnosis and operational monitoring.
            logger.warning("OIDC callback failed: %s", type(exc).__name__)
            return _dashboard_redirect("?error=oidc_login_failed")


class AuthMeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({"authenticated": False})
        memberships = TenantMembership.objects.filter(admin_user=request.user, active=True, tenant__status="active").select_related("tenant")
        return Response({
            "authenticated": True,
            "user": {"id": request.user.id, "email": request.user.email, "name": request.user.get_full_name() or request.user.username},
            "memberships": [{"tenant_id": str(item.tenant_id), "tenant_name": item.tenant.name, "role": item.role} for item in memberships],
        })


class AuthModeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"mode": settings.AUTH_MODE})


@method_decorator(csrf_protect, name="dispatch")
class PasswordLoginView(APIView):
    """Dashboard password sign-in, available only in explicitly selected demo mode."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_login"

    def post(self, request):
        if settings.AUTH_MODE != "password_demo":
            return Response({"detail": "Password demo sign-in is disabled."}, status=404)
        serializer = PasswordLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]

        user = authenticate(request, username=username.strip(), password=password)
        has_active_tenant = bool(user and user.is_active and TenantMembership.objects.filter(
            admin_user=user, active=True, tenant__status="active"
        ).exists())
        if not has_active_tenant:
            return Response({"detail": "Invalid username or password."}, status=401)

        login(request, user)
        request.session.set_expiry(8 * 60 * 60)
        response = Response({"authenticated": True})
        response["Cache-Control"] = "no-store"
        response["Pragma"] = "no-cache"
        return response


class MobilePasswordLoginView(APIView):
    """Issue a short-lived bearer token to an active demo-enrolled mobile identity."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_login"

    def post(self, request):
        if settings.AUTH_MODE != "password_demo":
            return Response({"detail": "Password demo sign-in is disabled."}, status=404)
        serializer = MobilePasswordLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tenant_slug = serializer.validated_data["tenant_slug"]
        employee_id = serializer.validated_data["employee_id"]
        password = serializer.validated_data["password"]

        identity = EnrolledUser.objects.select_related("tenant").filter(
            tenant__slug=tenant_slug.strip(), tenant__status="active",
            employee_id=employee_id.strip(), status="active",
        ).first()
        account = User.objects.filter(username=mobile_login_username(identity.pk)).first() if identity else None
        if not identity or not account or not account.is_active or not account.check_password(password):
            return Response({"detail": "Invalid sign-in or inactive enrolled account."}, status=401)

        token, expires_at = issue_mobile_access_token(account, identity)
        response = Response({
            "access_token": token,
            "token_type": "Bearer",
            "expires_in": settings.DEMO_AUTH_TOKEN_TTL_SECONDS,
            "expires_at": expires_at,
            "user": {"id": str(identity.pk), "name": identity.display_name, "employee_id": identity.employee_id},
        })
        response["Cache-Control"] = "no-store"
        response["Pragma"] = "no-cache"
        return response


class CsrfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        return Response({"authenticated": False})
