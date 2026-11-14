#!/bin/bash
# Nightly consistent snapshot of the database (safe while the server is running). Keeps 7.
set -euo pipefail
APP=/opt/research-tree
mkdir -p "$APP/backups"
sqlite3 "$APP/data/tree.db" ".backup '$APP/backups/tree-$(date +%Y%m%d).db'"
ls -1t "$APP"/backups/tree-*.db | tail -n +8 | xargs -r rm -f
echo "$(date -Is) backup ok"
