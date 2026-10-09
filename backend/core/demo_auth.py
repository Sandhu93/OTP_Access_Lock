"""Explicitly temporary password-demo authentication helpers.

SECURITY-PLACEHOLDER: password-only demo mode omits the production OIDC/MFA assurance and
must be disabled before production use. See docs/TODO_SECURITY_DEBT.md.
"""

from datetime import datetime, timedelta, timezone

import jwt
from django.conf import settings


DEMO_ISSUER = "access-lock-password-demo"
MOBILE_AUDIENCE = "access-lock-mobile"


def mobile_login_username(identity_id):
    return f"mobile-{identity_id}"


def issue_mobile_access_token(user, identity):
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=settings.DEMO_AUTH_TOKEN_TTL_SECONDS)
    claims = {
        "iss": DEMO_ISSUER,
        "aud": MOBILE_AUDIENCE,
        "sub": identity.oidc_subject or f"demo-mobile:{identity.pk}",
        "uid": user.pk,
        "mobile_identity_id": str(identity.pk),
        "tenant_id": str(identity.tenant_id),
        "tenant_slug": identity.tenant.slug,
        "token_use": "demo_mobile",
        "iat": now,
        "exp": expires_at,
    }
    token = jwt.encode(claims, settings.DEMO_AUTH_SIGNING_KEY, algorithm="HS256")
    return token, expires_at
