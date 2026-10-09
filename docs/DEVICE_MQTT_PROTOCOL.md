# Device MQTT Protocol

Status: **local demonstration path implemented / production provisioning remains open**.

MQTT is transport only. A lock must verify the backend-issued signed grant locally before it
actuates. MQTT connection state, topic delivery, RSSI, or a dashboard action is never sufficient.

## Identity and topics

Each lock receives a unique device certificate and private key during secure provisioning. The
broker ACL limits the device to its own namespace. The tracked ACL is only a startup fallback;
`scripts/prepare-esp32-demo.ps1` generates an ignored exact tenant/locker ACL before a physical
local demonstration:

```text
locks/{tenant_id}/{locker_id}/telemetry
locks/{tenant_id}/{locker_id}/presence
locks/{tenant_id}/{locker_id}/commands
locks/{tenant_id}/{locker_id}/events
```

The backend publishes commands; the lock publishes telemetry/events. Certificates must be rotated
and revocable. Recreate Mosquitto after preparing the demo lock so it loads the generated ACL.

## Delivery rules

- TLS with certificate verification is mandatory.
- Device identity is mutual TLS identity, not a topic string supplied by the device.
- QoS 1 is suitable for state-changing messages; command IDs make retries idempotent.
- Commands carry an expiry and transaction/request ID.
- Retained messages must never contain an unlock grant.
- Offline/last-will state is telemetry only and cannot authorize access.
- Raw OTPs and private keys are never published.

## Signed unlock grant payload

The local demonstration uses an ES256 envelope. The backend signs the compact JSON serialization
of the `grant` object and publishes the following MQTT payload:

```json
{
  "grant": {
    "grant_id": "...",
    "request_id": "...",
    "tenant_id": "...",
    "locker_id": "...",
    "required_presence_ids": ["0011223344556677", "8899aabbccddeeff"],
    "issued_at": 1710000000,
    "expires_at": 1710000045,
    "key_id": "local-demo",
    "nonce": "..."
  },
  "signature": "base64url-raw-ECDSA-R||S-signature",
  "algorithm": "ES256"
}
```

`required_presence_ids` are the active BLE session identifiers, encoded as sixteen hexadecimal
characters. The ESP32 checks that each identifier is currently held by an active BLE session.
The signed claims bind at least:

```text
grant_id, request_id, tenant_id, locker_id, nonce,
issued_at, expires_at, required_presence_ids, key_id
```

The lock verifies the signature, key ID, tenant/locker binding, nonce freshness, expiry, request
ID presence, and every required BLE session identifier before actuation. A successful nonce is
remembered until reboot in the local demo; production needs a durable replay-protection strategy.
The LED actuator is invoked only from this verified MQTT path. BLE bench token writes are logged
and ignored for actuation.

For the local demo, `scripts/generate-dev-signing-key.ps1` creates an ignored P-256 keypair. The
private key is mounted only into Django; `scripts/prepare-esp32-demo.ps1` embeds the public point,
CA certificate, and per-lock certificate/key into an ignored firmware header. This is explicitly
development-only and is not cloud KMS/HSM signing.
