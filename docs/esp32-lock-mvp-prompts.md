# ESP32-S3 Smart Lock MVP - BLE-Only Build Prompts

Status: **updated 2026-07-17 for BLE-only MVP scope**.

Hardware: ESP32-S3-WROOM-1 N16R8 (16MB Flash, 8MB PSRAM), PlatformIO + ESP-IDF framework.
Peripherals for current MVP: 2x LED (GPIO4, GPIO5), BLE via NimBLE. RFID/NFC is deferred and is
not required for MVP bring-up, tests, or unlock flow.

Paste these prompts into Codex/Claude Code one at a time, in order. Do not move to the next phase
until the current one is tested on real hardware and working.

Security rule that applies to every phase: BLE is the local transport/presence signal, not the
actuation trust anchor. Production actuation requires a backend-issued signed unlock token. Any
temporary local actuation must be marked as `SECURITY-PLACEHOLDER` and tracked in
`TODO_SECURITY_DEBT.md`.

---

## Phase 0 - Project Scaffolding

```
Set up a PlatformIO project for an ESP32-S3-WROOM-1 N16R8 board (16MB flash, 8MB PSRAM), using
the ESP-IDF framework (not Arduino framework).

Requirements:
- platformio.ini configured for board esp32-s3-devkitc-1, framework = espidf
- Enable PSRAM in sdkconfig (octal PSRAM, 8MB)
- Set flash size to 16MB in sdkconfig
- Create a clean src/ and include/ folder structure for:
    - led_control.c / .h        (GPIO4/5 LED control)
    - ble_service.c / .h        (BLE GATT peripheral)
    - lock_logic.c / .h         (state machine, built later)
    - net_client.c / .h         (placeholder only, backend integration later)
    - crypto_verify.c / .h      (placeholder only, signed-token verification later)
- Do not add RFID/NFC as an MVP dependency.
- Add a basic main.c that initializes logging and prints a startup banner with chip model, flash
  size, PSRAM/free heap where available.
- Set log level to VERBOSE for project tags, INFO for system tags.

After generating this, tell me the exact `pio run -t upload` and `pio device monitor` commands to
test it.
```

Acceptance test: firmware builds, flashes cleanly, and serial monitor shows chip info/free heap
on boot.

---

## Phase 1 - Hardware Interfacing Validation (LEDs Only)

```
Implement and validate LED output using ESP-IDF native GPIO APIs.

Requirements:
- Implement led_control.c/.h with:
    - led_init()
    - led_set(gpio_num_t pin, bool on)
    - led_blink(gpio_num_t pin, int times, int delay_ms)
- In main.c, add a boot test routine:
    - Blink GPIO4 three times
    - Blink GPIO5 three times
    - Blink both together three times
- Do not initialize or require RFID/NFC hardware.
- Add ESP_LOGI/ESP_LOGE messages for LED init and test progress.

After this, tell me exactly what I should see in the serial monitor and on the LEDs.
```

Acceptance test: LEDs blink correctly on boot and firmware keeps running without any RFID/NFC
device connected.

---

## Phase 2 - BLE Discoverability Test

```
Implement a standalone BLE GATT peripheral test using ESP-IDF's NimBLE stack (not Bluedroid).

Requirements:
- Implement ble_service.c/.h that:
    - Initializes NimBLE and starts advertising as "LOCK-TEST-01"
    - Advertises one custom GATT service with one read/write/notify characteristic
    - Uses placeholder UUIDs clearly marked as SECURITY-PLACEHOLDER
    - Logs central connect, disconnect, read, write, and notification subscription events
    - Echoes written bytes back via notification for plumbing validation
- Wire this into main.c after the LED boot test.
- On any BLE write, blink GPIO5 once as a visual confirmation.
- Do not implement unlock logic yet.
- Do not implement real pairing/bonding/encryption yet; clearly mark the gap as security debt.

After this, tell me how to test with nRF Connect or another BLE scanner.
```

Acceptance test: device appears as `LOCK-TEST-01`, a phone can connect, write a value, receive an
echo notification, and GPIO5 blinks on write.

---

## Phase 3 - BLE + Event Integration

```
Integrate the validated LED and BLE modules into one coherent firmware without adding business
unlock logic yet.

Requirements:
- Define an internal event system (FreeRTOS queue or event group) for BLE connection,
  disconnection, write, subscribe, and timeout events.
- Keep ble_service transport-only: it publishes events and sends notifications, but does not know
  lock state, OTPs, or tokens.
- Keep led_control GPIO-only.
- Log free heap every 30 seconds.
- Confirm BLE remains connectable and responsive for a 10-minute soak test.
- Still no unlock state machine and no token/OTP handling.
```

Acceptance test: BLE remains connectable and responsive for 10 minutes, repeated writes still echo,
and free heap remains stable.

---

## Phase 4 - Core Logic Phase 1: Single-Session State Machine

```
Implement lock_logic.c/.h as a single-phone state machine using BLE events and GPIO5 as the
temporary actuator indicator.

States:
  IDLE -> BLE_CONNECTED -> REQUESTED -> ACTUATED -> COOLDOWN -> IDLE

Behavior:
- IDLE: advertising, no central connected. LED4=off, LED5=off.
- On BLE central connect -> BLE_CONNECTED.
- Central writes REQUEST_UNLOCK (`0x01`) -> REQUESTED.
- SECURITY-PLACEHOLDER: for this phase only, REQUESTED may actuate locally without a real signed
  backend token. Mark this in code and ensure TODO_SECURITY_DEBT.md has the corresponding entry.
- From REQUESTED -> ACTUATED: turn LED5 solid ON for 10 seconds and send `UNLOCK_OK`.
- After 10 seconds -> COOLDOWN (LED5 off, 2 second lockout where new requests are rejected and
  logged) -> IDLE.
- If BLE disconnects before ACTUATED, return to IDLE and log the abort reason.
- Add a 15-second timeout for REQUESTED.

After this, give me a manual test script for happy path, timeout, duplicate request, and
disconnect-abort.
```

Acceptance test: every state transition and failure path can be walked manually over BLE.

---

## Phase 5 - Core Logic Phase 2: Dual-Presence BLE Flow

```
Extend lock_logic.c/.h to require TWO simultaneously connected BLE centrals before temporary MVP
actuation, and add a simulated OTP entry step.

Requirements:
- Support up to 3 concurrent BLE connections.
- Track requester, approver, and optional spare connections explicitly.
- New flow:
    1. IDLE - 0 centrals connected, advertising.
    2. Central A connects and writes REQUEST_UNLOCK -> WAITING_FOR_SECOND_PARTY.
    3. Central B connects and writes a 6-digit OTP via GATT. Use hardcoded test OTP `123456` for
       now; mark it as SECURITY-PLACEHOLDER.
    4. Confirm A is still connected before temporary MVP actuation.
    5. ACTUATED: GPIO5 solid ON 10 seconds, both centrals get `UNLOCK_OK`.
    6. COOLDOWN -> IDLE.
- Wrong OTP entered by B: increment retry counter. On the 2nd wrong attempt, abort to IDLE and
  log `ALERT: OTP retry limit exceeded`.
- If either A or B disconnects before ACTUATED, abort to IDLE and log which party dropped.
- Add 15-second timeout per waiting state.
- Keep TODO/security-debt markers for hardcoded OTP, no backend token verification, and temporary
  UUIDs.

After this, give me a full manual test script covering happy path, wrong-OTP-once-then-correct,
wrong-OTP-twice, A disconnect, B disconnect, timeout, and 3-connection handling.
```

Acceptance test: full two-party BLE flow works end to end with simulated OTP and all failure paths.

---

## Phase 6 - MVP Hardening Before Backend Integration

```
Harden the BLE-only MVP before real WiFi/backend/crypto work.

Requirements:
- Add watchdog coverage for the main loop and long-running tasks.
- Add explicit handling for malformed BLE writes, duplicate commands, unexpected OTP writes,
  notification subscription changes, rapid connect/disconnect cycles, and max-connection
  exhaustion.
- Add boot-time self-test: LED pattern + BLE advertising start PASS/FAIL.
- Log and safely ignore unexpected inputs rather than entering undefined FSM states.
- Summarize every TODO/SECURITY-PLACEHOLDER in a markdown checklist.
- Do not implement real backend connectivity, token verification, or OTA yet.
```

Acceptance test: device survives malformed BLE input and repeated connect/disconnect cycles without
crashing; all remaining placeholders are documented.

---

## Next Phase After Hardware MVP

Integrate WiFi backend connectivity, real signed-token verification, and backend-issued OTPs. The
goal is to replace temporary local actuation with the actual architecture: backend-issued signed
tokens are the actuation trust anchor, not raw BLE connection state.
