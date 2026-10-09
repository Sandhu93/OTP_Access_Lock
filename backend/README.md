# Access Lock Backend

Django/DRF foundation for the Access Lock control plane. This is intentionally a modular
monolith: PostgreSQL is the system of record, Redis is ephemeral coordination, and provider
adapters isolate OIDC, mobile delivery, MQTT, and KMS/HSM integrations. The default Docker
development profile wires local Keycloak OIDC, Mosquitto mTLS, FCM HTTP v1 configuration, and an
explicit development-only signing adapter.

## Current status

Implemented as a foundation:

- Domain models for tenants, sites, lockers, policies, users, devices, requests, OTP challenges,
  presence, grants, telemetry, audit events, alerts, and outbox messages.
- Tenant-scoped DRF read APIs and request approval/rejection service boundaries.
- Secure OTP generation and hashing utility with one-minute TTL and two-attempt policy.
- Provider interfaces that fail closed when OIDC, delivery, MQTT, and KMS/HSM configuration is
  absent.

Not production-ready yet:

- Production OIDC/MFA claim mapping and mandatory MFA enforcement.
- PostgreSQL migrations/RLS deployment policy.
- Mobile push/authenticated event delivery.
- MQTT certificate provisioning and broker ACLs.
- KMS/HSM signing and ESP32 grant verification.

Never use the development tenant header or provider placeholders outside local development.

## Docker local integration profile

From the repository root, generate the ignored local MQTT certificates and start the stack:

```powershell
powershell -ExecutionPolicy Bypass -File .\infra\mosquitto\generate-certs.ps1
docker compose up -d --build
```

Open `http://localhost:3000/login` and choose organization SSO. The local Keycloak user is
`local.admin` with the deliberately fake password `local-only-change-me`. Local MFA is disabled
only so the development realm can be exercised without an external authenticator; production must
set `OIDC_REQUIRE_MFA=true` and enforce MFA in the provider.

### Temporary password-only test mode

OIDC remains the default. For an isolated functionality test only, explicitly set
`AUTH_MODE=password_demo` and provide a randomly generated `DEMO_AUTH_SIGNING_KEY` (at least 32
bytes) via a secret store. The dashboard then uses a Django session cookie; the mobile app receives
a short-lived bearer token stored in Android Keystore. The dashboard and mobile app discover the
mode from `/api/v1/auth/config`, so they can return to OIDC when the server is switched back.

Provision each account from the backend environment with the interactive command below. The
command prompts for a password without echoing it; use at least 12 characters. For mobile accounts,
the employee must already be active and enrolled in the named tenant.

```powershell
python manage.py set_demo_password --kind admin --tenant <tenant-slug> --username <admin-username> --role admin
python manage.py set_demo_password --kind mobile --tenant <tenant-slug> --employee-id <employee-id>
```

This mode intentionally omits MFA. Use only synthetic test accounts/data, never real users or
production lock access, and restore `AUTH_MODE=oidc` before any pilot or production deployment.

Keycloak is available at `http://localhost:8081`, the API at `http://localhost:8000`, and the
Mosquitto mTLS listener at `mqtts://localhost:8883`. To enable FCM delivery, provide a Firebase
service-account JSON outside the repository and set `FCM_PROJECT_ID` and
`FCM_SERVICE_ACCOUNT_FILE`; the adapter sends only a challenge ID and expiry event, never the OTP.

## Local setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
$env:DJANGO_DEV_MODE = "1"
$env:DJANGO_DEBUG = "true"
python manage.py check
python manage.py makemigrations core
python manage.py migrate
python manage.py runserver
```

The project uses SQLite only in explicit development mode. Set `DATABASE_URL` to PostgreSQL and
provide `DJANGO_SECRET_KEY` in any shared or deployed environment. No production secret belongs
in this repository.
