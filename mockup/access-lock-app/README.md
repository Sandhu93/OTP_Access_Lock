# Access Lock — React Native / Expo app

Generated from the approved "Access Lock" design canvas — a banking-grade,
split-trust locker app (2-of-3 policy: requester + second enrolled
person + administrator). This is real, runnable screen code, not a
Figma export — Figma isn't available as a connector in the session
this was built from, so the canvas was translated directly into
TypeScript/React Native instead.

## Stack

- Expo SDK 51, React Native 0.74, TypeScript
- React Navigation (native-stack) for screen-to-screen flow
- react-native-svg for the icon set (hand-authored, no icon-font dependency)
- IBM Plex Sans / IBM Plex Mono via `@expo-google-fonts/*`
- No UI kit — all components are hand-built against `src/theme/tokens.ts`,
  so there's nothing extra to strip out later

## Getting started

```bash
npm install
npm run start        # then press i / a / w, or scan the QR code in Expo Go
```

## Project structure

```
App.tsx                        Font loading + navigation root
src/theme/tokens.ts             Single source of truth for color, type, spacing, radii
src/navigation/                 Stack param list + navigator
src/components/                 Shared building blocks (Button, Card, StatusChip,
                                 TopBar, BottomNav, ScanRings, OtpInput, Timeline,
                                 ErrorBanner, Icon, LockedPill, ScreenContainer)
src/hooks/useCountdown.ts       Countdown / stopwatch hooks used by timers across the app
src/screens/
  UnlockGateScreen.tsx           Local biometric/PIN gate (no sign-in/out)
  LockerHomeScreen.tsx           "My Lockers" — bottom nav lives here + Activity
  person-a/                      Requester journey (Scan → Found → Connected →
                                  Access request → Waiting for review → Approved,
                                  waiting for Person B)
  person-b/                      Approver journey (Scan → OTP confirmation)
  shared/                        DualPresenceVerification, AuthorizationSuccess,
                                  and the single param-driven FailureScreen covering
                                  9 fail-closed states
  ActivityScreen.tsx              Read-only audit history
  dev/BenchTestScreen.tsx         Developer-only — see below
  dev/StyleGuideScreen.tsx        Live component gallery (dev-only)
```

## What's wired for real vs. what needs backend integration

Every screen is fully interactive UI: the PIN pad, OTP auto-advance
input, live countdown timers, the request-reason picker, and all
navigation between screens work as shipped. What's stubbed, each
marked with a `TODO(integration)` comment at its source:

- **`UnlockGateScreen`** — biometric call is wired to
  `expo-local-authentication`; wire the PIN check to your device
  keychain/secure-enclave storage instead of the in-memory `pin` state.
- **`PersonAScanScreen` / `PersonBScanScreen`** — Bluetooth/permission
  checks and "device found" are stubbed; replace with your BLE library
  (e.g. `react-native-ble-plx`) discovery callbacks. RSSI, UUIDs and
  raw frames are intentionally never rendered in production UI — see
  Bench Test.
- **`PersonAWaitingReviewScreen` / `PersonAApprovedWaitingBScreen` /
  `DualPresenceVerificationScreen`** — admin approval and Person B
  connecting happen outside the app (the dashboard, another device).
  Each screen has a `__DEV__`-only "simulate" button standing in for a
  push notification / socket event that should drive real navigation.
- **`PersonBOtpScreen`** — `verifyOtp()` is a stub that always
  succeeds; wire it to your backend's OTP verification endpoint. The
  2-attempt limit and expiry UI are fully implemented and will work
  once that call returns real pass/fail.
- **`AuthorizationSuccessScreen`** — the "Unlocking… → Opened" status
  is on a timer; replace with the locker's real completion report.
- **`FailureScreen`** — navigate to it with
  `navigation.navigate('FailureState', { type: 'connectionFailed' })`
  (see `src/navigation/types.ts` for the full `FailureType` union)
  whenever a real backend/BLE call fails.
- **`ActivityScreen`** — `ENTRIES` is a static array; replace with a
  paginated fetch from the backend.

## Bench Test screen

`dev/BenchTestScreen.tsx` intentionally uses a separate dark/mono
palette so it can never be mistaken for production UI. It is **not**
registered in any production navigation path — it's only reachable by
`navigation.navigate('BenchTest')`, which nothing in the app calls.
Gate it behind a debug menu or shake gesture in development builds,
and strip the route entirely from release builds once you're past the
ESP32-S3 bench-test hardware stage.

## Accessibility

Every control is a real `Pressable`/`TextInput` with `accessibilityRole`
and `accessibilityLabel` — nothing is a styled `View` masquerading as a
button. Touch targets are ≥44px. Status is always icon + label, never
color alone. No fake OS status bar or keyboard is drawn anywhere.
