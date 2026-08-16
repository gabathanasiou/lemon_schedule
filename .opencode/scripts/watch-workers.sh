#!/bin/bash
# Watches feature-worker progress: notifies (macOS + iOS via ntfy) + logs when
# a worker pushes its branch (ready for review) or when all workers exit.
# iOS: install the "ntfy" app, subscribe to ntfy.sh/<NTFY_TOPIC> (from .env).
# Run: nohup "$HOME/Documents/Software Apps/lemon_schedule/.opencode/scripts/watch-workers.sh" > /dev/null 2>&1 &
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="$ROOT/.opencode/logs/watch.log"
STATE="$ROOT/.opencode/logs/watch.state"
mkdir -p "$(dirname "$LOG")"
touch "$STATE"

set -a
[ -f "$ROOT/.env" ] && source "$ROOT/.env"
set +a

notify() {
  osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1
  if [ -n "$NTFY_TOPIC" ]; then
    curl -s -m 10 -H "Title: $1" -d "$2" "https://ntfy.sh/$NTFY_TOPIC" > /dev/null 2>&1
  fi
  echo "$(date '+%H:%M:%S') $1: $2" >> "$LOG"
}

notify "Watcher online" "iOS push channel live — worker events will ping here"

while true; do
  cd "$ROOT" || exit 1
  # New worker branches pushed -> done, ready for review
  git ls-remote origin 'refs/heads/feat/*' 2>/dev/null | sed 's|refs/heads/||' | awk '{print $2}' | grep -E '^feat/[0-9]' | sort -u > /tmp/ocw-branches.$$
  while read -r b; do
    if ! grep -qx "$b" "$STATE"; then
      echo "$b" >> "$STATE"
      notify "Worker done" "Branch $b pushed — ready for review"
    fi
  done < /tmp/ocw-branches.$$
  rm -f /tmp/ocw-branches.$$
  # All workers exited
  if ! pgrep -f 'opencode run --attach' > /dev/null 2>&1; then
    if [ ! -f "$ROOT/.opencode/logs/watch.nodone" ]; then
      touch "$ROOT/.opencode/logs/watch.nodone"
      notify "Workers finished" "No feature workers running — all done or stopped"
    fi
  else
    rm -f "$ROOT/.opencode/logs/watch.nodone"
  fi
  sleep 60
done
