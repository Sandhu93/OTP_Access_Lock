# Access Lock Mobile

Canonical React Native mobile client for the ESP32-S3 AccessControlLock MVP firmware.

The production source of truth is this `mobile` directory. The separate
`../mockup/access-lock-app` project remains a visual reference only.

The app now mirrors the approved mockup flow: Locker home, Person A request states, Person B OTP
confirmation, dual-presence verification, success/failure states, Activity, Help, and shared
design-system components. BLE discovery, connection, session opening, session heartbeats, and
bench command responses use the real `useLockBle` integration. The authenticated backend client
boundary now supports device registration, presence sessions, unlock-request polling, OTP retrieval,
and OTP verification. Requests after registration carry the active `X-Device-ID`. The visible app
screens still use bench transitions until Android OIDC Authorization Code + PKCE, secure Android
token storage, and BLE-to-API state wiring are connected. Backend approval and local OTP envelope
delivery are active; signed-token issuance, FCM credentials, and production identity binding remain
incomplete.

The simulated token and local approval/verification transitions are bench-only and are tracked in
`../docs/TODO_SECURITY_DEBT.md`.

## Live mobile API boundary

The authenticated client calls:

- `POST /api/v1/mobile/devices/register`
- `GET|POST /api/v1/mobile/unlock-requests`
- `GET /api/v1/mobile/unlock-requests/{request_id}`
- `POST /api/v1/mobile/presence-sessions`
- `PATCH /api/v1/mobile/presence-sessions/{session_id}/heartbeat`
- `GET /api/v1/mobile/otp-challenges/{challenge_id}`
- `POST /api/v1/mobile/otp-challenges/{challenge_id}/verify`

The OTP response is restricted to the authenticated second-party device and is marked `no-store`.
It is never sent to the dashboard or placed in FCM wake-up metadata. Production still requires
hardware-backed device binding and real FCM delivery.

## Protocol

- Device name: `LOCK-TEST-01`
- Service UUID: `7d2ea28a-f7bd-45ca-8f2c-2e9b7a5f0001`
- Characteristic UUID: `7d2ea28a-f7bd-45ca-8f2c-2e9b7a5f0002`

Commands:

- Request unlock: `01 01`
- Submit simulated token: `01 02 31 32 33 34 35 36`
- Cancel: `01 03`
- Open bench requester session: `01 10 01 <8-byte-session-id>`
- Open bench approver session: `01 10 02 <8-byte-session-id>`
- Session heartbeat: `01 11`
- Close session: `01 12`

The lock accepts independent BLE connections from multiple phones. Role is never inferred from
connection order. The current session-open frames are bench placeholders: they carry an explicit
role and opaque session ID but are not signed backend grants and do not prove the enrolled user's
identity. Production integration must replace them with a backend-issued, transaction-bound grant.

The app does not connect to another app over BLE. Each phone connects to the lock separately and
uses the backend for transaction state, OTP validation, presence re-checks, and final authorization.

Responses are `[version][status_code][ASCII text]`.

## Local Validation

```powershell
cd mobile
npm test
```

## Android Bring-Up

Install dependencies once network access is available:

```powershell
cd mobile
npm install
```

For standalone phone testing, build the release-style test APK. It embeds the JavaScript bundle,
so Metro is not required on the phone. This repo uses a project-local Gradle cache to avoid
permission issues with machine-level Gradle directories:

```powershell
cd mobile
$env:GRADLE_USER_HOME="$PWD\.gradle"
cd android
.\gradlew.bat assembleRelease
```

The bundled APK is generated at:

```text
mobile/android/app/build/outputs/apk/release/app-release.apk
```

Install it on a connected Android phone with:

```powershell
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

The `assembleDebug` APK is intended for development with Metro. If it is installed directly
without Metro running or without `adb reverse tcp:8081 tcp:8081`, it will show React Native's
“Unable to load script” screen.

Android BLE notes:

- Android 12+ requires nearby-device Bluetooth permissions.
- Older Android versions require location permission for BLE scanning.
- If pairing behaves strangely after firmware security changes, remove the existing bond for
  `LOCK-TEST-01` in Android Bluetooth settings and reconnect.
- React Native New Architecture is disabled for this MVP Android build because the locally
  installed NDK is `25.1.8937393`; RN 0.79 New Architecture C++ code expects a newer complete
  NDK. Re-enable only after installing a complete NDK 27+.
