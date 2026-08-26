#!/bin/bash
# Worker hub manager — opens in a real Terminal window (no typing needed).
# Double-click this file, or run: open .opencode/scripts/hub-terminal.command
cd "$(dirname "$0")" || exit 1
node hub-server.mjs
