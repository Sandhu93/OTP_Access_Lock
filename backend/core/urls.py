from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AuditLogViewSet, DeviceViewSet, HealthView, LockerViewSet, OverviewView, PolicyViewSet, SecurityAlertViewSet, SiteViewSet, UnlockRequestViewSet, UserViewSet
from .auth_views import AuthMeView, AuthModeView, CsrfView, LogoutView, MobilePasswordLoginView, OidcCallbackView, OidcLoginView, PasswordLoginView
from .mobile_views import MobileDeviceRegistrationView, MobileOtpChallengeView, MobileOtpChallengeVerifyView, MobilePresenceHeartbeatView, MobilePresenceSessionDetailView, MobilePresenceSessionView, MobileUnlockRequestDetailView, MobileUnlockRequestView


router = DefaultRouter()
router.register("admin/sites", SiteViewSet, basename="admin-site")
router.register("admin/lockers", LockerViewSet, basename="admin-locker")
router.register("admin/users", UserViewSet, basename="admin-user")
router.register("admin/devices", DeviceViewSet, basename="admin-device")
router.register("admin/policies", PolicyViewSet, basename="admin-policy")
router.register("admin/unlock-requests", UnlockRequestViewSet, basename="admin-unlock-request")
router.register("admin/audit-events", AuditLogViewSet, basename="admin-audit-event")
router.register("admin/alerts", SecurityAlertViewSet, basename="admin-alert")

urlpatterns = [
    path("healthz", HealthView.as_view(), name="healthz"),
    path("auth/login", OidcLoginView.as_view(), name="oidc-login"),
    path("auth/callback", OidcCallbackView.as_view(), name="oidc-callback"),
    path("auth/config", AuthModeView.as_view(), name="auth-config"),
    path("auth/me", AuthMeView.as_view(), name="auth-me"),
    path("auth/csrf", CsrfView.as_view(), name="auth-csrf"),
    path("auth/password-login", PasswordLoginView.as_view(), name="password-login"),
    path("auth/mobile-login", MobilePasswordLoginView.as_view(), name="mobile-password-login"),
    path("auth/logout", LogoutView.as_view(), name="auth-logout"),
    path("mobile/devices/register", MobileDeviceRegistrationView.as_view(), name="mobile-device-register"),
    path("mobile/presence-sessions", MobilePresenceSessionView.as_view(), name="mobile-presence-create"),
    path("mobile/presence-sessions/<uuid:session_id>", MobilePresenceSessionDetailView.as_view(), name="mobile-presence-delete"),
    path("mobile/presence-sessions/<uuid:session_id>/heartbeat", MobilePresenceHeartbeatView.as_view(), name="mobile-presence-heartbeat"),
    path("mobile/unlock-requests", MobileUnlockRequestView.as_view(), name="mobile-unlock-request-create"),
    path("mobile/unlock-requests/<uuid:request_id>", MobileUnlockRequestDetailView.as_view(), name="mobile-unlock-request-detail"),
    path("mobile/otp-challenges/<int:challenge_id>", MobileOtpChallengeView.as_view(), name="mobile-otp-challenge"),
    path("mobile/otp-challenges/<int:challenge_id>/verify", MobileOtpChallengeVerifyView.as_view(), name="mobile-otp-challenge-verify"),
    path("admin/overview", OverviewView.as_view(), name="admin-overview"),
    *router.urls,
]
