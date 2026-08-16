#!/bin/bash
# Single source of truth for worker port allocation.
# Ports derive from the worker's position in `git worktree list`
# (WORKER_IDX): PLAYWRIGHT_PORT = 3001 + idx*10, HUB_PORT = 3101 + idx*10.
# Used by spawn-feature (env for worker test runs) and hub-server (dev tabs).
# Usage: source worker-ports.sh <item>   → sets WORKER_IDX, PLAYWRIGHT_PORT, HUB_PORT
item="$1"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[ -z "$item" ] && { echo "usage: source worker-ports.sh <item>" >&2; return 1 2>/dev/null || exit 1; }
idx=0
found=-1
while IFS= read -r line; do
  name=$(printf '%s' "$line" | sed 's|.*lemon_schedule-wt/||' | awk '{print $1}')
  if [ "$name" = "$item" ]; then found=$idx; break; fi
  idx=$((idx + 1))
done < <(git -C "$ROOT" worktree list 2>/dev/null | grep "lemon_schedule-wt/")
if [ "$found" -lt 0 ]; then
  echo "no worktree for item '$item' (spawn it first)" >&2
  return 1 2>/dev/null || exit 1
fi
WORKER_IDX=$found
PLAYWRIGHT_PORT=$((3001 + found * 10))
HUB_PORT=$((3101 + found * 10))
export WORKER_IDX PLAYWRIGHT_PORT HUB_PORT
echo "worker $item: idx=$WORKER_IDX PLAYWRIGHT_PORT=$PLAYWRIGHT_PORT HUB_PORT=$HUB_PORT" >&2
