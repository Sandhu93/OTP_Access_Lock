#!/usr/bin/env python3
"""Check MQTT TLS connectivity and a publish/subscribe round trip.

Reads MQTT_BROKER_URL, MQTT_USERNAME, MQTT_PASSWORD, and optional
MQTT_CA_CERT_PATH from the process environment, falling back to a project .env.
It never prints credentials. The test uses a unique diagnostics topic and does
not publish to the lock command topics.

Run from the repository root:
    python scripts/mqtt_roundtrip.py

The paho-mqtt dependency is already listed in backend/requirements.txt.
"""

from __future__ import annotations

import argparse
import os
import ssl
import sys
import threading
import urllib.parse
import uuid
from pathlib import Path
from typing import Any

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("Missing dependency: paho-mqtt. Install it with: python -m pip install paho-mqtt", file=sys.stderr)
    raise SystemExit(2)


def read_env_file(path: Path) -> dict[str, str]:
    """Read the small KEY=VALUE subset used by this project without logging it."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, separator, value = line.partition("=")
        if not separator:
            continue
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key:
            values[key] = value
    return values


def config_value(name: str, dotenv: dict[str, str], default: str = "") -> str:
    return os.environ.get(name) or dotenv.get(name, default)


class RoundTrip:
    def __init__(self) -> None:
        self.connected = threading.Event()
        self.subscribed = threading.Event()
        self.received = threading.Event()
        self.connect_reason: Any = None
        self.subscribe_reason: Any = None
        self.message: bytes | None = None
        self.callback_error: str | None = None

    def on_connect(self, client: mqtt.Client, userdata: Any, flags: Any, reason_code: Any, properties: Any) -> None:
        self.connect_reason = reason_code
        self.connected.set()

    def on_subscribe(self, client: mqtt.Client, userdata: Any, mid: int, reason_code_list: list[Any], properties: Any) -> None:
        self.subscribe_reason = reason_code_list[0] if reason_code_list else None
        if self.subscribe_reason is not None and not getattr(self.subscribe_reason, "is_failure", False):
            self.subscribed.set()

    def on_message(self, client: mqtt.Client, userdata: Any, message: mqtt.MQTTMessage) -> None:
        self.message = bytes(message.payload)
        self.received.set()

    def on_disconnect(self, client: mqtt.Client, userdata: Any, disconnect_flags: Any, reason_code: Any, properties: Any) -> None:
        if getattr(reason_code, "is_failure", False):
            self.callback_error = f"Broker disconnected the client (reason {reason_code})."


def reason_text(reason: Any) -> str:
    if reason is None:
        return "no reason code returned"
    return f"{reason} (code {getattr(reason, 'value', reason)})"


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Test MQTT TLS connection and publish/subscribe round trip.")
    parser.add_argument("--env-file", type=Path, default=project_root / ".env", help="dotenv file (default: project .env)")
    parser.add_argument("--broker-url", help="override MQTT_BROKER_URL (for example, mqtts://host:8883)")
    parser.add_argument("--client-id", help="override the generated client ID (for comparing a deployed client's settings)")
    parser.add_argument("--timeout", type=float, default=15.0, help="seconds to wait for each MQTT operation")
    args = parser.parse_args()

    dotenv = read_env_file(args.env_file.resolve())
    broker_url = args.broker_url or config_value("MQTT_BROKER_URL", dotenv)
    username = config_value("MQTT_USERNAME", dotenv)
    password = config_value("MQTT_PASSWORD", dotenv)
    ca_path = config_value("MQTT_CA_CERT_PATH", dotenv)
    client_id = args.client_id or f"mqtt-roundtrip-{uuid.uuid4().hex[:12]}"

    if not broker_url:
        print("FAIL: MQTT_BROKER_URL is not set (checked environment and selected .env file).", file=sys.stderr)
        return 2
    parsed = urllib.parse.urlparse(broker_url)
    if parsed.scheme != "mqtts" or not parsed.hostname:
        print("FAIL: MQTT_BROKER_URL must be an mqtts:// URL with a hostname.", file=sys.stderr)
        return 2
    if not username or not password:
        print("FAIL: MQTT_USERNAME and MQTT_PASSWORD must both be set.", file=sys.stderr)
        return 2
    if args.timeout <= 0:
        print("FAIL: --timeout must be greater than zero.", file=sys.stderr)
        return 2

    topic = f"diagnostics/mqtt-roundtrip/{uuid.uuid4()}"
    expected = f"mqtt-roundtrip-ok:{uuid.uuid4()}".encode("utf-8")
    state = RoundTrip()
    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=client_id,
        protocol=mqtt.MQTTv5,
    )
    client.username_pw_set(username, password)
    try:
        client.tls_set(
            ca_certs=ca_path or None,
            tls_version=ssl.PROTOCOL_TLS_CLIENT,
        )
        client.on_connect = state.on_connect
        client.on_subscribe = state.on_subscribe
        client.on_message = state.on_message
        client.on_disconnect = state.on_disconnect

        print(f"Connecting to {parsed.hostname}:{parsed.port or 8883} using TLS…")
        client.connect(parsed.hostname, parsed.port or 8883, keepalive=30)
        client.loop_start()

        if not state.connected.wait(args.timeout):
            print("FAIL: timed out waiting for MQTT CONNACK.", file=sys.stderr)
            return 1
        if getattr(state.connect_reason, "is_failure", False):
            print(f"FAIL: broker rejected CONNECT: {reason_text(state.connect_reason)}", file=sys.stderr)
            return 1
        print("PASS: TLS connection and MQTT authentication accepted.")

        result, subscribe_mid = client.subscribe(topic, qos=1)
        if result != mqtt.MQTT_ERR_SUCCESS:
            print(f"FAIL: subscribe request could not be queued (client result {result}).", file=sys.stderr)
            return 1
        if not state.subscribed.wait(args.timeout):
            print("FAIL: timed out waiting for SUBACK.", file=sys.stderr)
            return 1
        if getattr(state.subscribe_reason, "is_failure", False):
            print(f"FAIL: broker rejected SUBSCRIBE: {reason_text(state.subscribe_reason)}", file=sys.stderr)
            return 1
        print(f"PASS: subscription acknowledged (message id {subscribe_mid}).")

        publish_info = client.publish(topic, expected, qos=1, retain=False)
        if publish_info.rc != mqtt.MQTT_ERR_SUCCESS:
            print(f"FAIL: publish request could not be queued (client result {publish_info.rc}).", file=sys.stderr)
            return 1
        publish_info.wait_for_publish(timeout=args.timeout)
        if not publish_info.is_published():
            print("FAIL: timed out waiting for QoS 1 publish acknowledgement.", file=sys.stderr)
            return 1
        if not state.received.wait(args.timeout):
            print("FAIL: publish was acknowledged, but the subscribed client received no message.", file=sys.stderr)
            return 1
        if state.message != expected:
            print("FAIL: received a message, but its payload did not match the test payload.", file=sys.stderr)
            return 1
        print("PASS: published test message was received with the exact payload.")
        print("MQTT round trip succeeded. The test topic was unique and no lock command topic was used.")
        return 0
    except Exception as exc:
        # Exception strings from MQTT libraries do not include the password.
        print(f"FAIL: MQTT round trip stopped: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    finally:
        try:
            if client.is_connected():
                client.disconnect()
            client.loop_stop()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
