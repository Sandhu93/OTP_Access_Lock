# AccessControlLock Admin Dashboard

Generic enterprise dashboard frontend for the AccessControlLock control plane. It is built with
Next.js App Router and TypeScript and uses a local fixture adapter until the Django API and OIDC
provider are configured.

## Run locally

```powershell
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_BASE_URL` to the Django API when integration is enabled. The dashboard also
requires an authenticated OIDC session and an explicit `X-Tenant-ID` context before live data or
review actions are enabled. Until those integrations are configured, the UI is clearly labelled
demo data and does not issue authorization.

## Run frontend and backend with Docker

From the repository root:

```powershell
docker compose up --build
```

Open the dashboard at `http://localhost:3000` and the API health endpoint at
`http://localhost:8000/api/v1/healthz`. This local compose file includes PostgreSQL and Redis,
uses local development placeholders only, and does not enable MQTT, OIDC, KMS, or OTP delivery.
Those integrations remain required before any shared or production deployment.

Stop the stack with:

```powershell
docker compose down
```
