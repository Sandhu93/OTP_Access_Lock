import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed


User = get_user_model()


class OidcBearerAuthentication(BaseAuthentication):
    """Validate OIDC access tokens for mobile and API clients.

    The mobile client uses a public PKCE client. No client secret is accepted here. The token's
    issuer, signature, audience, expiry, and subject are mandatory. Device enrollment and tenant
    membership are enforced by the mobile views after authentication.
    """

    def authenticate(self, request):
        header = get_authorization_header(request).decode("utf-8")
        if not header:
            return None
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise AuthenticationFailed("Bearer authentication is required")
        try:
            signing_key = jwt.PyJWKClient(settings.OIDC_JWKS_URL).get_signing_key_from_jwt(token).key
            claims = jwt.decode(
                token,
                signing_key,
                algorithms=["RS256", "ES256"],
                audience=settings.OIDC_ALLOWED_AUDIENCES,
                issuer=settings.OIDC_ISSUER_URL,
                options={"require": ["sub", "iss", "exp"]},
            )
        except Exception as exc:
            raise AuthenticationFailed("OIDC bearer token validation failed") from exc

        user, _ = User.objects.get_or_create(
            username=f"oidc:{claims['sub']}",
            defaults={"email": claims.get("email", "")},
        )
        request.oidc_claims = claims
        return user, claims

    def authenticate_header(self, request):
        return "Bearer"


class DemoMobileBearerAuthentication(BaseAuthentication):
    """Validate short-lived, demo-only mobile tokens and re-check enrollment on every call."""

    def authenticate(self, request):
        header = get_authorization_header(request).decode("utf-8")
        if not header:
            return None
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise AuthenticationFailed("Bearer authentication is required")
        try:
            from .demo_auth import DEMO_ISSUER, MOBILE_AUDIENCE

            claims = jwt.decode(
                token,
                settings.DEMO_AUTH_SIGNING_KEY,
                algorithms=["HS256"],
                audience=MOBILE_AUDIENCE,
                issuer=DEMO_ISSUER,
                options={"require": ["sub", "uid", "iat", "exp", "mobile_identity_id", "tenant_id", "token_use"]},
            )
            if claims.get("token_use") != "demo_mobile":
                raise AuthenticationFailed("Invalid mobile token")
            user = User.objects.get(pk=claims["uid"], is_active=True)
            from .models import EnrolledUser

            enrolled = EnrolledUser.objects.filter(
                pk=claims["mobile_identity_id"],
                tenant_id=claims["tenant_id"],
                tenant__status="active",
                status="active",
            ).exists()
            if not enrolled:
                raise AuthenticationFailed("Mobile enrollment is inactive")
        except AuthenticationFailed:
            raise
        except Exception as exc:
            raise AuthenticationFailed("Demo mobile token is invalid or expired") from exc

        request.oidc_claims = claims
        return user, claims

    def authenticate_header(self, request):
        return "Bearer"


class MobileBearerAuthentication(BaseAuthentication):
    """Keep the existing OIDC path and select demo tokens only in opt-in demo mode."""

    def authenticate(self, request):
        backend = DemoMobileBearerAuthentication() if settings.AUTH_MODE == "password_demo" else OidcBearerAuthentication()
        return backend.authenticate(request)

    def authenticate_header(self, request):
        return "Bearer"
