#!/usr/bin/env bash
# Starts the local stack as systemd user services, so it outlives the terminal or agent session that started it and
# restarts on a crash: Convex, Vite, the GPU worker (sweeping) and the README progress updater. Logs go to logs/.
#
#   ./up.sh            # start (or restart) everything
#   ./up.sh stop       # stop everything
#   systemctl --user status 'neurodex-*'
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$PWD
UNITS=(neurodex-convex neurodex-vite neurodex-worker neurodex-readme)

for u in "${UNITS[@]}"; do
  systemctl --user stop "$u" 2>/dev/null || true
  systemctl --user reset-failed "$u" 2>/dev/null || true
done
[[ "${1:-}" == stop ]] && exit 0

mkdir -p logs
run() {  # unit, working dir, command...
  local unit=$1 dir=$2
  shift 2
  systemd-run --user --quiet --unit="$unit" --working-directory="$dir" \
    --property=Restart=on-failure --property=RestartSec=10 \
    --property=StandardOutput="append:$ROOT/logs/${unit#neurodex-}.log" \
    --property=StandardError="append:$ROOT/logs/${unit#neurodex-}.log" \
    --setenv=PATH="$PATH" --setenv=HOME="$HOME" "$@"
}

run neurodex-convex "$ROOT" env CONVEX_AGENT_MODE=anonymous CONVEX_TMPDIR="$ROOT/.tmp" bunx convex dev --tail-logs always
run neurodex-vite "$ROOT" bunx vite --port 5173 --host 127.0.0.1
run neurodex-worker "$ROOT/worker" bash -c 'set -a; . ./.env.local; set +a; exec uv run python main.py --sweep'
run neurodex-readme "$ROOT" python3 worker/readme_progress.py
systemctl --user --no-pager list-units 'neurodex-*'
