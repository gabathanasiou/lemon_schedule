#!/bin/bash
# Watches feature-worker progress: notifies (macOS) + logs when a worker
# pushes its branch (ready for review) or when all workers exit.
# Run: nohup "$HOME/Documents/Software Apps/lemon_schedule/.opencode/scripts/watch-workers.sh" > /dev/null 2>&1 &
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="$ROOT/.opencode/logs/watch.log"
STATE="$ROOT/.opencode/logs/watch.state"
mkdir -p "$(dirname "$LOG")"
touch "$STATE"

notify() { osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1; echo "$(date '+%H:%M:%S') $1: $2" >> "$LOG"; }

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
