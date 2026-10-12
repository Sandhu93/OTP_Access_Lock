import json
import logging
import ssl
import time
import urllib.parse
from datetime import timedelta

import paho.mqtt.client as mqtt
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import AuditLogEntry, Locker, LockTelemetry, Tenant

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Consume lock telemetry/events over MQTT TLS using broker credentials or client certificates."

    def handle(self, *args, **options):
        # Django's default root logger is WARNING; opt this dedicated worker
        # into INFO so subscription and heartbeat diagnostics reach Cloud Run.
        logger.setLevel(logging.INFO)
        has_client_cert = bool(settings.MQTT_CLIENT_CERT_PATH and settings.MQTT_CLIENT_KEY_PATH)
        has_password = bool(settings.MQTT_USERNAME and settings.MQTT_PASSWORD)
        if not settings.MQTT_BROKER_URL or not (has_client_cert or has_password):
            raise CommandError("MQTT_BROKER_URL and either MQTT username/password or a client certificate/key are required")
        if bool(settings.MQTT_CLIENT_CERT_PATH) != bool(settings.MQTT_CLIENT_KEY_PATH):
            raise CommandError("MQTT client certificate and key must be configured together")
        parsed = urllib.parse.urlparse(settings.MQTT_BROKER_URL)
        if parsed.scheme != "mqtts" or not parsed.hostname:
            raise CommandError("MQTT_BROKER_URL must use mqtts://")

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=settings.MQTT_CLIENT_ID, protocol=mqtt.MQTTv5)
        client.tls_set(
            ca_certs=settings.MQTT_CA_CERT_PATH or None,
            certfile=settings.MQTT_CLIENT_CERT_PATH or None,
            keyfile=settings.MQTT_CLIENT_KEY_PATH or None,
            tls_version=ssl.PROTOCOL_TLS_CLIENT,
        )
        if has_password:
            client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)
        client.on_connect = self._on_connect
        client.on_subscribe = self._on_subscribe
        client.on_disconnect = self._on_disconnect
        client.on_message = self._on_message
        client.connect(parsed.hostname, parsed.port or 8883, keepalive=30)
        client.loop_start()
        self.stdout.write("MQTT device gateway listening")
        try:
            while True:
                stale_before = timezone.now() - timedelta(seconds=90)
                Locker.objects.filter(status="online", last_seen_at__lt=stale_before).update(status="offline")
                time.sleep(30)
        except KeyboardInterrupt:
            pass
        finally:
            client.loop_stop()
            client.disconnect()

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code != 0:
            logger.error("MQTT broker connection rejected: reason=%s", reason_code)
            return
        telemetry_result, telemetry_mid = client.subscribe("locks/+/+/telemetry", qos=1)
        events_result, events_mid = client.subscribe("locks/+/+/events", qos=1)
        logger.info(
            "MQTT broker connected; requested telemetry/events subscriptions (result=%s/%s mids=%s/%s)",
            telemetry_result,
            events_result,
            telemetry_mid,
            events_mid,
        )

    def _on_subscribe(self, client, userdata, mid, reason_code_list, properties=None):
        failures = [str(code) for code in reason_code_list if getattr(code, "is_failure", False)]
        if failures:
            logger.error("MQTT subscription rejected: mid=%s reasons=%s", mid, failures)
            return
        logger.info("MQTT subscription acknowledged: mid=%s", mid)

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties=None):
        if reason_code != 0:
            logger.warning("MQTT broker connection ended unexpectedly: reason=%s", reason_code)
        else:
            logger.info("MQTT broker connection closed")

    def _on_message(self, client, userdata, message):
        parts = message.topic.split("/")
        if len(parts) != 4 or parts[0] != "locks":
            return
        _, tenant_id, locker_id, channel = parts
        try:
            payload = json.loads(message.payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return
        tenant = Tenant.objects.filter(id=tenant_id).first()
        locker = Locker.objects.filter(id=locker_id, tenant=tenant).first() if tenant else None
        if not locker:
            logger.warning("Dropping MQTT message for unknown tenant/locker topic=%s", message.topic)
            return
        event_type = str(payload.get("event_type", "telemetry"))[:64]
        observed_at = timezone.now()
        LockTelemetry.objects.create(locker=locker, observed_at=observed_at, event_type=event_type, payload=payload)
        locker.last_seen_at = observed_at
        if channel == "telemetry":
            locker.status = "online"
            locker.save(update_fields=["last_seen_at", "status"])
            logger.info("Persisted lock telemetry heartbeat locker_id=%s observed_at=%s", locker.id, observed_at.isoformat())
        else:
            locker.save(update_fields=["last_seen_at"])
        if channel == "events":
            AuditLogEntry.objects.create(
                tenant=tenant,
                actor_type="device",
                actor_id=locker.hardware_id,
                event_type=f"lock.{event_type}",
                details={"locker_id": str(locker.id), "channel": channel},
            )
