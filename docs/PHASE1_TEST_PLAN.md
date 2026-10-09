# Phase 1 Test Plan

Status: **superseded for current MVP scope**.

The current MVP has moved to BLE-only local interaction and does not require RFID/NFC hardware.
The previous WS1850S RFID code and tests were removed from the active MVP code path. Reintroduce
them only if that hardware path is explicitly reopened.

## Current Phase 1 Scope

This phase validates the ESP32-S3 base firmware and LED GPIO output before BLE or lock-state
logic exists.

## Firmware Build Smoke Test

Run:

```powershell
pio run -e esp32-s3-devkitc-1
```

## Hardware Smoke Test

Upload and monitor:

```powershell
pio run -e esp32-s3-devkitc-1 -t upload --upload-port COMx
pio device monitor -p COMx -b 115200
```

Replace `COMx` with the board port.

Expected boot behavior:

- Startup banner logs chip model, flash size, PSRAM/free heap where available.
- GPIO4 blinks three times.
- GPIO5 blinks three times.
- GPIO4 and GPIO5 blink together three times.
- Firmware must not require an RFID reader to boot or continue running.

## Deferred RFID/NFC Tests

There are no RFID/NFC tests in the current MVP test suite. If RFID/NFC returns to scope, restore
hardware-driver tests as a separate phase instead of mixing them into the BLE MVP acceptance
criteria.
