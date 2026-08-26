#!/bin/bash
# Watches feature-worker progress: immediate events (branch pushed, worker
# crashed, decision needed) + a periodic sprint digest (default every 15 min)
# — all pushed to macOS notifications AND iOS via ntfy.
# Run: nohup "$HOME/Documents/Software Apps/lemon_schedule/.opencode/scripts/watch-workers.sh" > /dev/null 2>&1 &
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="$ROOT/.opencode/logs/watch.log"
STATE="$ROOT/.opencode/logs/watch.state"
DEC_DIR="$ROOT/.opencode/decisions"
mkdir -p "$(dirname "$LOG")" "$DEC_DIR"
touch "$STATE"
INTERVAL="${WATCH_INTERVAL:-60}"
DIGEST_EVERY="${WATCH_DIGEST_MIN:-15}"

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

# Discover worker items from worktrees
items() { git -C "$ROOT" worktree list 2>/dev/null | grep "lemon_schedule-wt/" | sed 's|.*lemon_schedule-wt/||' | awk '{print $1}'; }

worker_alive() { pgrep -f "opencode run --attach.*lemon_schedule-wt/$1 " > /dev/null 2>&1; }

worker_line() { # one-line status from the worker log
  [ -f "$ROOT/.opencode/logs/worker-$1.log" ] || { echo "no log yet"; return; }
  tail -c 300 "$ROOT/.opencode/logs/worker-$1.log" | tr '\0' ' ' | sed 's/\x1b\[[0-9;]*m//g' | tr -s ' \n' ' ' | cut -c1-90
}

last_digest=0
declare -A died

notify "Watcher online" "iOS push channel live — worker events and digest will ping here"

while true; do
  cd "$ROOT" || exit 1

  # 1) New worker branches pushed -> done, ready for review
  git ls-remote origin 'refs/heads/feat/*' 2>/dev/null | sed 's|refs/heads/||' | awk '{print $2}' | grep -E '^feat/[0-9]' | sort -u > /tmp/ocw-branches.$$
  while read -r b; do
    if ! grep -qx "$b" "$STATE"; then
      echo "$b" >> "$STATE"
      notify "Worker done" "Branch $b pushed — ready for review"
    fi
  done < /tmp/ocw-branches.$$
  rm -f /tmp/ocw-branches.$$

  # 2) Decisions files -> a worker needs you
  for d in "$DEC_DIR"/*.md; do
    [ -f "$d" ] || continue
    base=$(basename "$d")
    if ! grep -qx "dec:$base" "$STATE"; then
      echo "dec:$base" >> "$STATE"
      notify "Decision needed" "Worker ${base%.md} is blocked — see .opencode/decisions/$base"
    fi
  done

  # 3) Worker death detection (per item)
  for it in $(items); do
    if ! worker_alive "$it" && [ -z "${died[$it]}" ]; then
      died[$it]=1
      notify "Worker crashed" "No process for worker $it — check .opencode/logs/worker-$it.log"
    fi
    if worker_alive "$it"; then
      unset died[$it]
    fi
  done

  # 4) Periodic digest (while any worker runs)
  now=$(date +%s)
  if [ $((now - last_digest)) -ge $((DIGEST_EVERY * 60)) ] && pgrep -f 'opencode run --attach' > /dev/null 2>&1; then
    last_digest=$now
    lines=""
    for it in $(items); do
      st=$(worker_alive "$it" && echo "running" || echo "STOPPED")
      lines+="• $it ($st): $(worker_line "$it")\n"
    done
    pushed=$(git ls-remote origin 'refs/heads/feat/*' 2>/dev/null | grep -c 'feat/[0-9]')
    ndec=$(ls "$DEC_DIR" 2>/dev/null | grep -c '\.md$' || echo 0)
    digest="${lines}branches pushed: $pushed · decisions: $ndec"
    notify "Sprint digest" "$(printf "$digest" | head -c 400)"
  fi

  sleep "$INTERVAL"
done
