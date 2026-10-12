import json
import logging
from types import SimpleNamespace

import pytest
from django.test import override_settings

from core.management.commands import mqtt_consumer
from core.models import Locker, Site, Tenant


@pytest.mark.django_db
def test_telemetry_heartbeat_marks_matching_locker_online():
    tenant = Tenant.objects.create(name="Telemetry tenant", slug="telemetry-tenant")
    site = Site.objects.create(tenant=tenant, name="Demo site")
    locker = Locker.objects.create(tenant=tenant, site=site, name="Demo lock", hardware_id="LOCK-TELEMETRY")
    message = SimpleNamespace(
        topic=f"locks/{tenant.id}/{locker.id}/telemetry",
        payload=json.dumps({"event_type": "heartbeat", "uptime_ms": 30000, "state": "locked"}).encode(),
    )

    mqtt_consumer.Command()._on_message(None, None, message)

    locker.refresh_from_db()
    assert locker.status == "online"
    assert locker.last_seen_at is not None
    assert locker.telemetry.get().event_type == "heartbeat"


def test_connect_subscribes_to_telemetry_and_reports_broker_ack(caplog):
    caplog.set_level(logging.INFO)
    class FakeClient:
        subscriptions = []

        def subscribe(self, topic, qos):
            self.subscriptions.append((topic, qos))
            return 0, len(self.subscriptions)

    client = FakeClient()
    command = mqtt_consumer.Command()
    command._on_connect(client, None, None, 0)
    command._on_subscribe(client, None, 1, [SimpleNamespace(is_failure=False)])

    assert client.subscriptions == [
        ("locks/+/+/telemetry", 1),
        ("locks/+/+/events", 1),
    ]
    assert "requested telemetry/events subscriptions" in caplog.text
    assert "MQTT subscription acknowledged" in caplog.text


@override_settings(
    MQTT_BROKER_URL="mqtts://broker.example.test:8883",
    MQTT_USERNAME="test-emqx-user",
    MQTT_PASSWORD="test-emqx-password",
    MQTT_CA_CERT_PATH="",
    MQTT_CLIENT_CERT_PATH="",
    MQTT_CLIENT_KEY_PATH="",
    MQTT_CLIENT_ID="test-consumer",
)
@pytest.mark.django_db
def test_consumer_uses_tls_username_password_for_emqx(monkeypatch):
    class FakeClient:
        def __init__(self):
            self.tls = None
            self.credentials = None

        def tls_set(self, **kwargs):
            self.tls = kwargs

        def username_pw_set(self, username, password):
            self.credentials = (username, password)

        def connect(self, host, port, keepalive):
            self.connection = (host, port, keepalive)

        def loop_start(self):
            pass

        def loop_stop(self):
            pass

        def disconnect(self):
            pass

    fake = FakeClient()
    monkeypatch.setattr(mqtt_consumer.mqtt, "Client", lambda *args, **kwargs: fake)
    monkeypatch.setattr(mqtt_consumer.time, "sleep", lambda _seconds: (_ for _ in ()).throw(KeyboardInterrupt()))

    mqtt_consumer.Command().handle()

    assert fake.tls["ca_certs"] is None
    assert fake.credentials == ("test-emqx-user", "test-emqx-password")
    assert fake.connection == ("broker.example.test", 8883, 30)
