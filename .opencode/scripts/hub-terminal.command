#!/bin/bash
# Opens a real Terminal window running the worker preview hub
# (http://localhost:3210/hub.html — one tab per feature worktree + main).
# Re-open this file whenever you want the hub back.
cd "$(dirname "$0")" || exit 1
./preview-workers.sh
echo ""
echo "Hub is running: http://localhost:3210/hub.html"
echo "Stop it with:   .opencode/scripts/preview-workers.sh --stop"
exec bash -i
