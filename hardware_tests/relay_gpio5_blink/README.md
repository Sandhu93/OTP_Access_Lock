# GPIO5 relay bench test

This is a temporary, bench-only ESP32-S3 image. It bypasses signed-grant authorization to pulse
GPIO5 five times, for 500 ms each, and then leaves GPIO5 HIGH. Do not connect a solenoid, lock, or
other load to the relay contacts during this test.

The test assumes the relay input wired to GPIO5 is active-low. The photographed module uses
SRD-05VDC-SL-C 5 V relay coils. Power the relay board using its marked supply pins and make sure
the ESP32 control signal shares the required reference ground unless the board is intentionally
wired for opto-isolation. ESP32 GPIO is 3.3 V only; never feed 5 V into GPIO5.

If the relay does not click, check that the channel input wire really reaches GPIO5 and that the
board's logic supply and input polarity match these assumptions. The ESP32 serial log is at
115200 baud.

Build and upload from the repository root:

```powershell
pio run -d hardware_tests/relay_gpio5_blink -e esp32-s3-devkitc-1 -t upload --upload-port COM9
pio device monitor --port COM9 --baud 115200
```

This image replaces the lock firmware while it is flashed. Restore the normal firmware after the
bench check with:

```powershell
pio run -e esp32-s3-devkitc-1 -t upload --upload-port COM9
```
