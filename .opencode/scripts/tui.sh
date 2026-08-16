#!/bin/bash
# TUI attached to the shared OpenCode Web server (live phone streaming).
# The phone's web UI only gets real-time events for sessions running through
# THIS server; a standalone TUI is a separate process and needs page refreshes.
# Usage: tui.sh            (new session, attached)
#        tui.sh -c         (continue last session, attached)
#        tui.sh -s <id>    (resume a specific session, attached)
cd "$(dirname "$0")/../.." || exit 1
set -a
[ -f .env ] && source .env
set +a
exec opencode attach http://localhost:4096 --dir "$(pwd)" "$@"
