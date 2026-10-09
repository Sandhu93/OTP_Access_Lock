# Local debug log console

Start the collector from the repository root:

```powershell
.\scripts\debug-log-console.ps1
```

It detects the first two authorized ADB devices, listens to ESP32 `COM9`, follows the relevant
Docker services, and creates a timestamped directory under `logs\debug\` containing:

```text
phone-a.log
phone-b.log
docker.log
esp32-com9.log
```

Phone panes show application and crash-relevant lines by default. To capture the complete Android
system log instead:

```powershell
.\scripts\debug-log-console.ps1 -AllPhoneLogs
```

Specify devices explicitly when their ADB order is ambiguous:

```powershell
.\scripts\debug-log-console.ps1 -PhoneA R9ZT607CKEH -PhoneB ZA222N2W35 -Esp32Port COM9
```

If Windows Terminal does not create working panes, use four independent PowerShell windows:

```powershell
.\scripts\debug-log-console.ps1 -SeparateWindows
```

Close the four panes to stop collection. The log directory is ignored by Git because Android and
service logs may contain sensitive local-demo data. The ESP32 collector reads COM9 directly at
115200 baud, so it does not depend on PlatformIO's interactive monitor.
