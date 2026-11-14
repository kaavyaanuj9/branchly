#!/bin/bash
# Copy the project to the server and restart it. Run from your Mac.
#
#   deploy/push.sh root@SERVER_IP --first-time   # code + data + .env, then run setup.sh
#   deploy/push.sh root@SERVER_IP                # code only, restart (data on the server is kept)
#
# Data is only sent with --first-time: after that the server's database is newer than yours
# (it keeps polling), so overwriting it would lose papers and signals.
set -euo pipefail

HOST="${1:?usage: deploy/push.sh user@host [--first-time]}"
MODE="${2:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/research-tree
SSH="ssh -o StrictHostKeyChecking=accept-new"

cd "$ROOT"
echo "== code"
rsync -az --delete -e "$SSH" \
  --exclude .git --exclude .venv --exclude data --exclude backups --exclude __pycache__ \
  --exclude .env --exclude .claude ./ "$HOST:$APP/"

if [ "$MODE" = "--first-time" ]; then
  if $SSH "$HOST" "test -f $APP/data/tree.db"; then
    echo "Server already has data/tree.db; refusing to overwrite it." >&2
    exit 1
  fi
  echo "== data (consistent snapshot of the database, models and search vectors)"
  SNAP="$(mktemp -d)"
  sqlite3 data/tree.db ".backup '$SNAP/tree.db'"
  # tree model, paper + sentence search vectors (re-computing them on a small server takes hours)
  rsync -az --progress -e "$SSH" "$SNAP/tree.db" data/model.pkl data/emb_bge_small*.npy data/emb_bge_small*.json "$HOST:$APP/data/"
  rsync -az -e "$SSH" data/models "$HOST:$APP/data/"     # embedding model + reranker
  rm -rf "$SNAP"
  [ -f .env ] && rsync -az -e "$SSH" .env "$HOST:$APP/.env"
  echo "== server setup"
  $SSH -t "$HOST" "bash $APP/deploy/setup.sh"
else
  $SSH "$HOST" "cd $APP && uv pip install --python .venv/bin/python -q -r requirements.txt && chown -R researchtree:researchtree $APP && systemctl restart research-tree && sleep 3 && systemctl is-active research-tree"
fi
