from pathlib import Path
import os
from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent
DEV_MODE = os.environ.get("DJANGO_DEV_MODE", "0").lower() in {"1", "true", "yes"}
configured_secret = os.environ.get("DJANGO_SECRET_KEY")
if not configured_secret and not DEV_MODE:
    raise RuntimeError("DJANGO_SECRET_KEY must be configured outside explicit development mode")
# SECURITY-PLACEHOLDER: this fallback is for local development only and must never be used in a deployed environment.
SECRET_KEY = configured_secret or "local-development-placeholder-only"
DEBUG = os.environ.get("DJANGO_DEBUG", "false").lower() == "true"
ALLOWED_HOSTS = [host for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if host]
INSTALLED_APPS = ["django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles", "corsheaders", "rest_framework", "core"]
MIDDLEWARE = ["django.middleware.security.SecurityMiddleware", "django.contrib.sessions.middleware.SessionMiddleware", "django.middleware.common.CommonMiddleware", "django.middleware.csrf.CsrfViewMiddleware", "django.contrib.auth.middleware.AuthenticationMiddleware", "django.contrib.messages.middleware.MessageMiddleware", "django.middleware.clickjacking.XFrameOptionsMiddleware"]
MIDDLEWARE.insert(2, "corsheaders.middleware.CorsMiddleware")
ROOT_URLCONF = "access_lock.urls"
TEMPLATES = [{"BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [], "APP_DIRS": True, "OPTIONS": {"context_processors": ["django.template.context_processors.request", "django.contrib.auth.context_processors.auth", "django.contrib.messages.context_processors.messages"]}}]
WSGI_APPLICATION = "access_lock.wsgi.application"
ASGI_APPLICATION = "access_lock.asgi.application"

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_HOST", "")
if DATABASE_URL.startswith("postgres"):
    import dj_database_url
    DATABASES = {"default": dj_database_url.parse(DATABASE_URL, conn_max_age=60)}
else:
    if not DEV_MODE:
        raise RuntimeError("DATABASE_URL (or POSTGRES_HOST) must point to PostgreSQL outside explicit development mode")
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
AUTH_MODE = os.environ.get("AUTH_MODE", "oidc").strip().lower()
if AUTH_MODE not in {"oidc", "password_demo"}:
    raise RuntimeError("AUTH_MODE must be either 'oidc' or 'password_demo'")
DEMO_AUTH_SIGNING_KEY = os.environ.get("DEMO_AUTH_SIGNING_KEY", "")
DEMO_AUTH_TOKEN_TTL_SECONDS = int(os.environ.get("DEMO_AUTH_TOKEN_TTL_SECONDS", "900"))
if AUTH_MODE == "password_demo" and len(DEMO_AUTH_SIGNING_KEY.encode("utf-8")) < 32:
    raise RuntimeError("DEMO_AUTH_SIGNING_KEY must be a random secret of at least 32 bytes in password_demo mode")
if not 60 <= DEMO_AUTH_TOKEN_TTL_SECONDS <= 3600:
    raise RuntimeError("DEMO_AUTH_TOKEN_TTL_SECONDS must be between 60 and 3600")
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication", "core.authentication.MobileBearerAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["core.permissions.TenantPermission"],
    "DEFAULT_THROTTLE_RATES": {"password_login": "5/minute"},
}
# Password-demo mode is explicitly opt-in and is not production authentication. OIDC remains
# available by switching AUTH_MODE back to "oidc".
OIDC_ISSUER_URL = os.environ.get("OIDC_ISSUER_URL", "")
OIDC_DISCOVERY_URL = os.environ.get("OIDC_DISCOVERY_URL", "")
OIDC_PUBLIC_AUTHORIZATION_ENDPOINT = os.environ.get("OIDC_PUBLIC_AUTHORIZATION_ENDPOINT", "")
OIDC_TOKEN_ENDPOINT = os.environ.get("OIDC_TOKEN_ENDPOINT", "")
OIDC_CLIENT_ID = os.environ.get("OIDC_CLIENT_ID", "")
OIDC_REDIRECT_URI = os.environ.get("OIDC_REDIRECT_URI", "http://localhost:8000/api/v1/auth/callback")
OIDC_REQUIRE_MFA = os.environ.get("OIDC_REQUIRE_MFA", "true").lower() in {"1", "true", "yes"}
OIDC_TENANT_CLAIM = os.environ.get("OIDC_TENANT_CLAIM", "tenant_slug")
OIDC_DEFAULT_TENANT_SLUG = os.environ.get("OIDC_DEFAULT_TENANT_SLUG", "")
OIDC_AUDIENCE = os.environ.get("OIDC_AUDIENCE", "")
OIDC_JWKS_URL = os.environ.get("OIDC_JWKS_URL", "")
OIDC_ALLOWED_AUDIENCES = [value for value in os.environ.get("OIDC_ALLOWED_AUDIENCES", OIDC_AUDIENCE).split(",") if value]
KMS_KEY_ID = os.environ.get("KMS_KEY_ID", "")
MQTT_BROKER_URL = os.environ.get("MQTT_BROKER_URL", "")
MQTT_CLIENT_CERT_PATH = os.environ.get("MQTT_CLIENT_CERT_PATH", "")
MQTT_CLIENT_KEY_PATH = os.environ.get("MQTT_CLIENT_KEY_PATH", "")
MQTT_CA_CERT_PATH = os.environ.get("MQTT_CA_CERT_PATH", "")
MQTT_CLIENT_ID = os.environ.get("MQTT_CLIENT_ID", "backend")
OTP_DELIVERY_PROVIDER = os.environ.get("OTP_DELIVERY_PROVIDER", "")
OTP_ENCRYPTION_KEY = os.environ.get("OTP_ENCRYPTION_KEY", "")
FCM_PROJECT_ID = os.environ.get("FCM_PROJECT_ID", "")
FCM_SERVICE_ACCOUNT_FILE = os.environ.get("FCM_SERVICE_ACCOUNT_FILE", "")
DEV_SIGNING_SECRET = os.environ.get("DEV_SIGNING_SECRET", "")
SIGNING_PROVIDER = os.environ.get("SIGNING_PROVIDER", "kms")
DEV_SIGNING_PRIVATE_KEY_PATH = os.environ.get("DEV_SIGNING_PRIVATE_KEY_PATH", "")
DEV_SIGNING_KEY_ID = os.environ.get("DEV_SIGNING_KEY_ID", "local-demo")
GRANT_TTL_SECONDS = int(os.environ.get("GRANT_TTL_SECONDS", "45"))
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "http://localhost:3000")
ALLOW_DEV_TENANT_HEADER = DEV_MODE and os.environ.get("ALLOW_DEV_TENANT_HEADER", "false").lower() == "true"
CORS_ALLOWED_ORIGINS = [origin for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:3000").split(",") if origin]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = (*default_headers, "x-tenant-id")
CSRF_TRUSTED_ORIGINS = [origin for origin in os.environ.get("CSRF_TRUSTED_ORIGINS", "http://localhost:3000").split(",") if origin]
SESSION_COOKIE_SECURE = not DEV_MODE
CSRF_COOKIE_SECURE = not DEV_MODE
SESSION_COOKIE_SAMESITE = "Lax" if DEV_MODE else "None"
CSRF_COOKIE_SAMESITE = "Lax" if DEV_MODE else "None"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_DOMAIN = os.environ.get("DJANGO_SESSION_COOKIE_DOMAIN") or None
CSRF_COOKIE_DOMAIN = os.environ.get("DJANGO_CSRF_COOKIE_DOMAIN") or None
