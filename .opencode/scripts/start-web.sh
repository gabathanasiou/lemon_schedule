#!/bin/bash
# OpenCode Web server — manual start or launchd auto-start (RunAtLoad + KeepAlive).
# Phone access on LAN: http://opencode.local:4096  (or http://<mac-ip>:4096)
# Login: user "opencode", password from .env (OPENCODE_SERVER_PASSWORD).
cd "$(dirname "$0")/../.." || exit 1
set -a
[ -f .env ] && source .env
set +a
OPENCODE_BIN="$(command -v opencode || echo /opt/homebrew/bin/opencode)"
exec "$OPENCODE_BIN" web --port 4096 --mdns --log-level INFO
