#!/bin/bash
# Worker preview hub: starts a Vite dev server per feature worktree and
# serves a tabbed page (one tab per worker + the main app) so you can eyeball
# every in-progress version side by side.
#   Ports:     workers on 3101, 3111, 3121, … (per worktree index)
#   Hub page:  http://localhost:3210/hub.html
# Usage: preview-workers.sh [--stop] [--port HUBPORT]
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HUB_PORT="${HUB_PORT:-3210}"
PIDFILE="$ROOT/.opencode/logs/hub.pids"
LOGDIR="$ROOT/.opencode/logs"
mkdir -p "$LOGDIR"

stop() {
  [ -f "$PIDFILE" ] && while read -r p; do kill "$p" 2>/dev/null; done < "$PIDFILE"
  rm -f "$PIDFILE"
  pkill -f "http.server $HUB_PORT" 2>/dev/null
  echo "hub stopped"
  exit 0
}
[ "$1" = "--stop" ] && stop
[ "$1" = "--port" ] && { HUB_PORT="$2"; shift 2; }

ITEMS=$(git -C "$ROOT" worktree list 2>/dev/null | grep "lemon_schedule-wt/" | sed 's|.*lemon_schedule-wt/||' | awk '{print $1}')
if [ -z "$ITEMS" ]; then echo "no worker worktrees found"; exit 1; fi

: > "$PIDFILE"
i=0
TABS=""
PANELS=""
for it in $ITEMS; do
  WT="$ROOT/../lemon_schedule-wt/$it"
  PORT=$((3101 + i * 10))
  i=$((i + 1))
  if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
    echo "port $PORT busy — skipping $it"
    continue
  fi
  (cd "$WT" && nohup npm run dev -- --port="$PORT" --strictPort > "$LOGDIR/hub-$it.log" 2>&1 & echo $! >> "$PIDFILE")
  TABS+="<button class=\"tab\" data-panel=\"p$i\">$it<span class=port>$PORT</span></button>"
  PANELS+="<div class=\"panel\" id=\"p$i\"><div class=bar>$it — http://localhost:$PORT <button class=reload>Reload</button></div><iframe src=\"http://localhost:$PORT\"></iframe></div>"
done

cat > "$LOGDIR/hub.html" << 'HTML'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><title>Worker preview hub</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #0c0c0e; color: #e4e4e7; }
  .tabs { display: flex; gap: 6px; padding: 10px 12px; background: #16161a; border-bottom: 1px solid #27272a; overflow-x: auto; }
  .tab { font: inherit; font-size: 13px; color: #a1a1aa; background: #1f1f23; border: 1px solid #2e2e33; border-radius: 8px; padding: 7px 12px; cursor: pointer; white-space: nowrap; }
  .tab:hover { background: #26262b; color: #fff; }
  .tab.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
  .tab .port { opacity: .55; margin-left: 6px; font-size: 11px; }
  .panel { display: none; height: calc(100vh - 48px); }
  .panel.active { display: flex; flex-direction: column; }
  .bar { display: flex; align-items: center; gap: 10px; padding: 6px 12px; font-size: 12px; color: #71717a; background: #101013; border-bottom: 1px solid #1f1f23; }
  .bar button { font: inherit; font-size: 11px; background: #1f1f23; border: 1px solid #2e2e33; color: #a1a1aa; border-radius: 6px; padding: 3px 10px; cursor: pointer; }
  iframe { flex: 1; width: 100%; border: 0; background: #fff; }
</style>
</head>
<body>
<div class="tabs">
  <button class="tab active" data-panel="pmain">main<span class=port>3000</span></button>
  __TABS__
</div>
<div class="panel active" id="pmain"><div class=bar>main — http://localhost:3000 <button class=reload>Reload</button></div><iframe src="http://localhost:3000"></iframe></div>
__PANELS__
<script>
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === t.dataset.panel));
  }));
  document.querySelectorAll('.reload').forEach(b => b.addEventListener('click', () => {
    const p = b.closest('.panel'); const f = p.querySelector('iframe');
    f.src = f.src.replace(/[?&]t=.*/, ''); f.src = f.src + (f.src.includes('?') ? '&t=' : '?t=') + Date.now();
  }));
</script>
</body>
</html>
HTML

python3 - << PYEOF > /dev/null
import re
p = "$LOGDIR/hub.html"
s = open(p).read()
s = s.replace("__TABS__", """$TABS""").replace("__PANELS__", """$PANELS""")
open(p, "w").write(s)
PYEOF

nohup python3 -m http.server "$HUB_PORT" --directory "$LOGDIR" > "$LOGDIR/hub-http.log" 2>&1 &
echo $! >> "$PIDFILE"
sleep 5
echo "hub live: http://localhost:$HUB_PORT/hub.html"
for p in $(pgrep -f "vite.*--port=31" 2>/dev/null); do :; done
cat "$PIDFILE"
