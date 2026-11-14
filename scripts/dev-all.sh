#!/bin/bash
# Start HypoTree together with its field map backend (Research Tree), stop both on Ctrl-C.
#   RT_FIELD   which field map to serve (default: cell_death, port 8766)
#   RT_PYTHON  Python with research-tree/requirements.txt installed
#              (default: research-tree/.venv/bin/python if present, else python3)
cd "$(dirname "$0")/.."
FIELD="${RT_FIELD:-cell_death}"
PY="${RT_PYTHON:-}"
if [ -z "$PY" ]; then
  if [ -x research-tree/.venv/bin/python ]; then PY="$PWD/research-tree/.venv/bin/python"; else PY=python3; fi
fi
( cd research-tree && RT_FIELD="$FIELD" exec "$PY" -u server.py ) &
RT_PID=$!
trap 'kill $RT_PID 2>/dev/null' EXIT INT TERM
echo "Field map backend ($FIELD) starting in the background (pid $RT_PID); it takes ~1-2 minutes to load."
npx next dev "$@"
