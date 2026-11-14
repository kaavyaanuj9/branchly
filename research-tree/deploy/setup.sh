#!/bin/bash
# One-time (idempotent) server setup. Run as root on a fresh Ubuntu 24.04 VPS, after
# deploy/push.sh has copied the project to /opt/research-tree:
#
#   bash /opt/research-tree/deploy/setup.sh [site]
#
# site: a domain pointing at this server, or omitted to use <ip>.sslip.io (free, real HTTPS).
# Asks once for the username/password that protects the site.
set -euo pipefail

APP=/opt/research-tree
SVC=researchtree
SITE="${1:-}"

echo "== packages"
apt-get update -qq
apt-get install -y -qq curl sqlite3 rsync ufw debian-keyring debian-archive-keyring apt-transport-https gnupg >/dev/null
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
if ! command -v uv >/dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh
fi

echo "== app user and python"
id "$SVC" >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin "$SVC"
mkdir -p "$APP/data" "$APP/backups"
cd "$APP"
# same Python and library versions as the machine that built data/model.pkl
[ -x .venv/bin/python ] || uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python -q -r requirements.txt
touch .env
grep -q '^ADMIN_TOKEN=' .env || echo "ADMIN_TOKEN=$(openssl rand -hex 24)" >> .env
chmod 600 .env
chown -R "$SVC:$SVC" "$APP"

echo "== service"
cp deploy/research-tree.service /etc/systemd/system/research-tree.service
systemctl daemon-reload
systemctl enable --now research-tree
systemctl restart research-tree

echo "== https + password"
if [ -z "$SITE" ]; then
  IP=$(curl -s https://api.ipify.org)
  SITE="${IP//./-}.sslip.io"
fi
if [ ! -f /etc/caddy/.rt_configured ] || [ -n "${1:-}" ]; then
  read -rp "Site username: " RT_USER
  read -rsp "Site password: " RT_PASS; echo
  HASH=$(caddy hash-password --plaintext "$RT_PASS")
  sed -e "s|__SITE__|$SITE|" -e "s|__USER__|$RT_USER|" -e "s|__HASH__|$HASH|" deploy/Caddyfile.tmpl > /etc/caddy/Caddyfile
  touch /etc/caddy/.rt_configured
fi
systemctl reload caddy || systemctl restart caddy

echo "== firewall"
ufw allow OpenSSH >/dev/null && ufw allow 80,443/tcp >/dev/null && ufw --force enable >/dev/null

echo "== nightly backup (03:30, keeps 7)"
cat > /etc/cron.d/research-tree-backup <<EOF
30 3 * * * $SVC bash $APP/deploy/backup.sh >> $APP/data/backup.log 2>&1
EOF

echo
echo "Done. Site: https://$SITE"
echo "Health (no password, for an uptime monitor): https://$SITE/api/health"
echo "Admin token for POST /api/poll is in $APP/.env"
