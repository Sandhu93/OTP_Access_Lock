# Hosted-demo MQTT telemetry worker (EMQX + Neon)

The Django API Cloud Run service only serves HTTP. Run the MQTT subscriber as a **Cloud Run worker
pool** so it stays alive independently and can update locker `last_seen_at` from EMQX telemetry.
Cloud Run worker pools are intended for continuous background work and do not expose an HTTP URL.

## Prerequisites

1. Apply the current Django migrations to Neon before deploying the API and worker:
   `python manage.py migrate --noinput` from `backend/` with the production database secret loaded.
2. In Secret Manager, make sure the worker service identity has `Secret Manager Secret Accessor` on
   the secrets that it uses. Reuse the same Neon connection secret and Django secret as the API.
3. Store the EMQX username and password as separate Secret Manager secrets. Never put either value
   in Git, a Docker build argument, or a command-line literal.

## Deploy from the repository root

The worker pool builds from `backend/` (which contains the existing backend Dockerfile), then
overrides its HTTP `CMD` with Django's long-running MQTT consumer. Replace only the secret resource
names below with the Secret Manager names already used by your project:

```powershell
gcloud run worker-pools deploy access-lock-mqtt-consumer `
  --source backend `
  --region asia-south1 `
  --instances 1 `
  --command python `
  --args manage.py,mqtt_consumer `
  --set-env-vars DJANGO_DEV_MODE=0,DJANGO_SETTINGS_MODULE=access_lock.settings,MQTT_BROKER_URL=mqtts://d9665f16.ala.asia-southeast1.emqxsl.com:8883,MQTT_CLIENT_ID=access-lock-telemetry-consumer `
  --set-secrets DJANGO_SECRET_KEY=django-secret:latest,POSTGRES_HOST=neon-database-url:latest,MQTT_USERNAME=emqx-username:latest,MQTT_PASSWORD=emqx-password:latest
```

If Neon is currently mapped to `DATABASE_URL` instead of `POSTGRES_HOST`, map that secret to
`DATABASE_URL`; Django supports either variable. The worker needs outbound TLS access to EMQX on
8883 and outbound PostgreSQL TLS access to Neon. Keep the API service's own environment configured
separately; deploying this worker does not change the API URL.

## Verify

```powershell
gcloud run worker-pools describe access-lock-mqtt-consumer --region asia-south1
gcloud logging read 'resource.type="cloud_run_worker_pool" AND resource.labels.worker_pool_name="access-lock-mqtt-consumer"' --limit 50
```

Expected startup log: `MQTT device gateway listening`. Send an ESP32 heartbeat and confirm that
`GET /api/v1/admin/lockers/` changes the locker to `online` and advances `last_seen_at`. The worker
marks a locker offline after 90 seconds without telemetry. Do not deploy multiple worker instances
for this single consumer unless the event handler is made idempotent and consumer coordination is
added.

This hosted demo uses EMQX TLS with username/password. It is not the production per-lock mTLS and
ACL model described in `DEVICE_MQTT_PROTOCOL.md`. The MQTT consumer persists telemetry in Neon;
Cloud Run worker pools are continuous paid compute, so review current project billing before
leaving one running.
