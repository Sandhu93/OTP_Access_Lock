import json
import ssl
import time
import urllib.parse

import paho.mqtt.client as mqtt
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import AuditLogEntry, Locker, LockTelemetry, Tenant


class Command(BaseCommand):
    help = "Consume local-demo lock telemetry/events over MQTT mTLS."

    def handle(self, *args, **options):
        if not all((settings.MQTT_BROKER_URL, settings.MQTT_CA_CERT_PATH, settings.MQTT_CLIENT_CERT_PATH, settings.MQTT_CLIENT_KEY_PATH)):
            raise CommandError("MQTT broker and mTLS certificate paths are required")
        parsed = urllib.parse.urlparse(settings.MQTT_BROKER_URL)
        if parsed.scheme != "mqtts" or not parsed.hostname:
            raise CommandError("MQTT_BROKER_URL must use mqtts://")

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=settings.MQTT_CLIENT_ID, protocol=mqtt.MQTTv5)
        client.tls_set(ca_certs=settings.MQTT_CA_CERT_PATH, certfile=settings.MQTT_CLIENT_CERT_PATH, keyfile=settings.MQTT_CLIENT_KEY_PATH, tls_version=ssl.PROTOCOL_TLS_CLIENT)
        client.on_connect = self._on_connect
        client.on_message = self._on_message
        client.connect(parsed.hostname, parsed.port or 8883, keepalive=30)
        client.loop_start()
        self.stdout.write("MQTT device gateway listening")
        try:
            while True:
                time.sleep(30)
        except KeyboardInterrupt:
            pass
        finally:
            client.loop_stop()
            client.disconnect()

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code != 0:
            self.stderr.write(f"MQTT connection failed: {reason_code}")
            return
        client.subscribe("locks/+/+/telemetry", qos=1)
        client.subscribe("locks/+/+/events", qos=1)

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
            return
        event_type = str(payload.get("event_type", "telemetry"))[:64]
        observed_at = timezone.now()
        LockTelemetry.objects.create(locker=locker, observed_at=observed_at, event_type=event_type, payload=payload)
        locker.last_seen_at = observed_at
        if channel == "telemetry":
            locker.status = "online"
            locker.save(update_fields=["last_seen_at", "status"])
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
