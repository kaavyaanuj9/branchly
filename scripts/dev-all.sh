#!/bin/bash
# Start Branchly together with its field map backend (Research Tree); Ctrl-C stops both.
#   RT_FIELD   which field map to serve (default: cell_death, port 8766)
#   RT_PYTHON  a Python with research-tree/requirements.txt installed
#              (default: research-tree/.venv, created and installed on first run)
cd "$(dirname "$0")/.."

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Branchly needs Node.js 22 or newer (you have $(node --version 2>/dev/null || echo none))."
  echo "On a Mac with Homebrew: brew install node, then run with PATH=/opt/homebrew/bin:\$PATH npm run dev:all"
  exit 1
fi

FIELD="${RT_FIELD:-cell_death}"
PY="${RT_PYTHON:-}"
if [ -z "$PY" ]; then
  if [ ! -x research-tree/.venv/bin/python ]; then
    echo "Setting up the field map's Python environment (first run only)..."
    python3 -m venv research-tree/.venv && research-tree/.venv/bin/pip install -q -r research-tree/requirements.txt \
      || { echo "Couldn't set up Python for the field map (needs Python 3.11+)."; exit 1; }
  fi
  PY="$PWD/research-tree/.venv/bin/python"
fi
( cd research-tree && RT_FIELD="$FIELD" exec "$PY" -u server.py ) &
RT_PID=$!
trap 'kill $RT_PID 2>/dev/null' EXIT INT TERM
echo "Field map ($FIELD) starting in the background (pid $RT_PID); it takes 1-2 minutes to load"
echo "(the very first start also downloads two small search models, ~250 MB)."
npx next dev "$@"
