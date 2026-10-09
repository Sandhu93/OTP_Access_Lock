# Local HTTPS mobile setup

The physical-phone demo uses a small local HTTPS edge proxy with a development CA. The API and
Keycloak containers remain private on the Docker network; phones connect only to:

```text
https://<current-pc-lan-ip>
```

The mobile app rejects cleartext traffic. The local-demo Android APK trusts the user-installed
development CA as an explicit, tracked placeholder; it does not disable certificate verification.
Do not reuse this trust configuration for production builds.

## Start the edge

From the repository root:

```powershell
docker compose up -d --build
.\scripts\prepare-local-https.ps1
```

Copy `infra/edge/certs/local-ca.crt` to each phone and install it from Android Settings as a CA
certificate. The exact Settings path differs by Android version, but is usually under Security or
Encryption & credentials. Verify the browser shows the HTTPS dashboard without a certificate
warning before installing the mobile APK.

The local CA is generated for this workstation and is ignored by Git. Never reuse it for production. Production
must use a CA-managed certificate and an OIDC issuer with mandatory MFA.

## Keep the endpoint stable

Reserve the PC's current Wi-Fi address in the router's DHCP settings using the Wi-Fi adapter's
MAC address. This prevents a restart from changing the origin used by the dashboard, Keycloak,
mobile APK, HTTPS certificate, and OIDC callbacks.

If the address changes before the reservation is applied, run:

```powershell
.\scripts\refresh-local-demo-network.ps1 -ServerAddress <current-pc-lan-ip>
.\scripts\prepare-local-https.ps1 -Force -ServerAddress <current-pc-lan-ip>
```

Then regenerate the HTTPS server certificate and MQTT broker leaf certificate for the new address,
rebuild the dashboard and mobile APK, regenerate the ESP32 demo config, and reflash the lock. The
local HTTPS CA itself is reused, so phones that already trust it do not need it installed again.

## Mobile OIDC

The app uses the Keycloak public client `access-lock-mobile` with Authorization Code + PKCE and
the redirect URI `accesslock://oauth/callback`. Access and refresh tokens are encrypted by an
Android Keystore AES-GCM key through the native `AccessLockSecureStore` module.
Each mobile sign-in starts a fresh Keycloak browser transaction so a stale login-action URL cannot
be reused after an interrupted attempt.

The local demo still uses development-only device auto-enrollment. The fingerprint is stored in
the Android Keystore-backed store but is not a signed hardware-attestation key; this remains
tracked as security debt and must not be presented as production enrollment.
