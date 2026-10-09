# Hardware Reference

Living document - update this whenever wiring, part numbers, or hardware revisions change. Code
should match this file; if they disagree, treat that as a bug in one of them.

## Current MVP hardware (Rev 0 - bench prototype)

**MCU:** ESP32-S3-WROOM-1 N16R8
- Dual-core Xtensa LX7, up to 240 MHz
- 16MB Flash, 8MB PSRAM (octal)
- WiFi 802.11 b/g/n, Bluetooth 5 LE (NimBLE stack)
- Operating voltage: 3.0V-3.6V (3.3V typical)

**BLE:** ESP32-S3 built-in Bluetooth LE
- Stack: NimBLE
- MVP role: GATT peripheral discovered by enrolled mobile apps
- Security note: BLE is the MVP local transport/presence signal. It is not, by itself, the
  actuation trust anchor and is not relay-attack-resistant without an additional reviewed
  proximity mechanism.

**RFID/NFC reader:** deferred / not fitted for current MVP
- Earlier prototype work used a M5Stack RFID 2 Unit with WS1850S over I2C at address `0x28`
  (SDA GPIO8, SCL GPIO9). That hardware path is no longer part of the MVP.
- Do not require, wire, or test RFID/NFC for the BLE-only MVP unless the hardware scope is
  explicitly reopened.

**Bench actuator (prototype only; not production hardware):**
- LED 1 = GPIO4 - general status/heartbeat indicator
- GPIO5 = active-low input to the relay module; HIGH de-energizes it and LOW energizes it. Based
  on the observed lock behavior, energized = locked and de-energized = unlocked. Firmware starts
  energized and de-energizes only for the 10-second verified-grant unlock window.
- The attached board is a two-channel module with 5 V Songle SRD-05VDC-SL-C relay coils. The
  solenoid/load is not connected; the relay is being tested without a lock mechanism. Confirm the
  GPIO5-to-input wiring and relay channel on the physical board before energizing any load.
- This is not a production lock actuator. A production revision still needs a reviewed driver,
  rated power supply, flyback/transient protection, mechanical fail-secure behavior, and safety
  validation. Do not infer that this relay setup is suitable for a solenoid.

## Planned/roadmap hardware additions

- **Proximity/distance-bounding upgrade:** current MVP has no RFID/NFC tap factor and no
  relay-resistant ranging. BLE connection and RSSI are weak local signals only; see
  `SECURITY_RULES.md`. If stronger relay-resistant proximity becomes a requirement (likely for
  banking customers), evaluate BLE Channel Sounding on suitable hardware, a companion UWB module
  (e.g. Qorvo DW3000 series) over SPI, or reintroducing a tap factor as a future hardware
  revision.
- **Network connectivity:** ESP32-S3's built-in WiFi is the current plan for lock-to-backend
  connectivity (locks are mains-powered, fixed-location, so WiFi/Ethernet is viable - no reliance
  on phones relaying backend traffic).
- **OTA updates:** explicitly not implemented in the MVP. See `SECURITY_RULES.md` - any future OTA
  mechanism requires signed updates with rollback protection before it can be added.

## Revision history

| Rev | Date | Change | Notes |
|---|---|---|---|
| 0 | 2026-07-17 | BLE-only MVP scope; RFID/NFC deferred | LEDs stand in for actuator; BLE is local transport/presence signal |
| 0 | 2026-10-08 | Bench relay attached to GPIO5; active-low, boot-safe idle | Solenoid/load disconnected; startup relay test removed |

Update this table with every hardware change - pin reassignment, new peripheral, chip
substitution, enclosure/PCB revision.
