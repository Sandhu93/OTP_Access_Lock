$ErrorActionPreference = "Stop"

pio test -e native
pio run -e esp32-s3-devkitc-1
