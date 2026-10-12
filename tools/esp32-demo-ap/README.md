# Standalone ESP32 local demo AP with DHCP reservations

This separate PlatformIO project targets the classic ESP32 DevKit on COM4. It
does not replace the ESP32-S3 lock firmware. It creates `AccessLock-Demo` at
`192.168.4.1/24`, serves a local admin page, and assigns dynamic or reserved
DHCP leases. It has no WAN internet or NAT and is demo-only.

## DHCP layout

- AP/gateway: `192.168.4.1`
- MAC-bound reservations: `192.168.4.2` through `.19` (8 saved entries)
- Dynamic DHCP pool: `192.168.4.20` through `.30`
- Up to four connected Wi-Fi clients: PC, two phones, and lock

Reservation mappings persist in ESP32 Preferences (NVS). The Wi-Fi AP
passphrase and web-admin password are entered over serial at startup and held
in RAM only; both must be re-entered after a reset. The web page uses HTTP
Basic authentication over the WPA2-protected demo network. This is not a
production router or an Internet-facing admin interface.

## Build and upload

From this folder in PowerShell:

```powershell
pio run -e esp32dev
pio run -e esp32dev -t upload --upload-port COM4
pio device monitor --port COM4 --baud 115200
```

Hold the board's **BOOT** button during upload if it does not enter download
mode automatically. Release it when esptool prints `Connecting...`. Upload
replaces the firmware on COM4; do not select COM9/the ESP32-S3 lock.

At startup, enter two different demo-only secrets when prompted: the Wi-Fi
passphrase, then the web-admin password. The monitor prints the AP address
`192.168.4.1`; it does not print either secret.

## Reserve devices

1. Join the PC to `AccessLock-Demo` using the Wi-Fi passphrase.
2. Leave the PC adapter on automatic/DHCP initially. Open `http://192.168.4.1/`.
3. Sign in as `admin` using the separate web-admin password.
4. Copy the PC's currently connected MAC address from the connected-devices
   list, choose a name and reserved last octet (for example `10`), then save.
5. Disconnect/reconnect the PC to renew its lease. It should receive
   `192.168.4.10`; verify with `ipconfig`.
6. Repeat for each phone and the locker. Use the MAC shown while connected to
   this SSID; if a phone changes its randomized MAC, update its reservation.

Do not assign the same reserved IP to two MAC addresses. Keep `.20–.30` for
unreserved DHCP clients. The current firmware intentionally has no DNS or
Internet uplink; use local IP addresses.

## End-to-end integration limitation

This AP only provides the local wireless network. Docker port publishing,
TLS certificate names, dashboard/API URLs, mobile app configuration, and the
lock's Wi-Fi credentials must also match this network for the demo to work.
Keep TLS validation enabled and do not expose Docker ports to public networks.
