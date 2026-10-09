import logging

from django.conf import settings
from django.contrib.auth import get_user_model, login, logout
from django.http import HttpResponseRedirect
from django.middleware.csrf import get_token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Tenant, TenantMembership
from .providers import OidcProvider, ProviderNotConfigured


User = get_user_model()
logger = logging.getLogger(__name__)


def _dashboard_redirect(query=""):
    return HttpResponseRedirect(f"{settings.DASHBOARD_URL.rstrip('/')}/login{query}")


class OidcLoginView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            return HttpResponseRedirect(OidcProvider().begin_login(request))
        except ProviderNotConfigured:
            return _dashboard_redirect("?error=oidc_not_configured")


class OidcCallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
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
        memberships = TenantMembership.objects.filter(admin_user=request.user, active=True).select_related("tenant")
        return Response({
            "authenticated": True,
            "user": {"id": request.user.id, "email": request.user.email, "name": request.user.get_full_name() or request.user.username},
            "memberships": [{"tenant_id": str(item.tenant_id), "tenant_name": item.tenant.name, "role": item.role} for item in memberships],
        })


class CsrfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        return Response({"authenticated": False})
