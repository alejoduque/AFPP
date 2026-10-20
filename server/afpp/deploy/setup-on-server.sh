#!/bin/bash
# AFPP: server-side setup for the SoundWalk global map API, served under the
# existing altred.xyz site, so there is no new DNS record and no new certificate:
#
#   https://altred.xyz/AlpineFeministPunkParade/        the site (static files, deploy_afpp_web.sh)
#   https://altred.xyz/AlpineFeministPunkParade/afpp/   the API →  node on 127.0.0.1:8790
#   /permasoftware/…  the old address: pages redirect here; its API path still
#                     answers, for apps installed before the move
#
# Run as root on the altred.xyz server (Debian/Ubuntu, nginx). Read it first,
# then run it whole or section by section. Safe to re-run: each step checks
# before it changes anything, and the nginx edit is backed up and rolled back
# if `nginx -t` fails.
#
# Before you start, copy the code from your Mac (BioMapp repo, branch AFPP):
#   rsync -az -e 'ssh -p 8888' --exclude test/ --exclude data/ server/afpp/ root@altred.xyz:/opt/afpp/
# (server/afpp/deploy/deploy.sh install does that and then runs this file.)
#
# Why the code is not inside the webroot's AlpineFeministPunkParade/ folder:
# nginx would serve server.js, the secrets and the uploaded data as plain
# files. The URL lives there; the code stays in /opt/afpp and the data in
# /var/lib/afpp, out of reach.
#
# No secrets are in this file. They are generated here, on the server.
set -euo pipefail

SITE="altred.xyz"                                # existing HTTPS site
BASE="/AlpineFeministPunkParade"                  # the site's path
OLD_BASE="/permasoftware"                          # its former path: redirected, API kept
PREFIX="${BASE}/afpp"                             # URL path for the API
WEBROOT_DIR="/var/www/${SITE}"
VERCEL_ORIGIN="${VERCEL_ORIGIN:-https://YOUR-PROJECT.vercel.app}"  # ← your Vercel site (or pass VERCEL_ORIGIN=… in the environment)
PORT=8790

# ── 1. Node 22, private to AFPP ────────────────────────────────────────────
# The system node stays untouched (iScream runs on it). Ubuntu 18.04's glibc
# (2.27) is too old for the official Node 22 binaries, so this uses the
# nodejs.org "unofficial-builds" glibc-217 build, checksum-verified, in
# /opt/afpp-node. On newer systems the same build works too.
NODE_VERSION="v22.23.3"
NODE_DIR="/opt/afpp-node"
# Undo a NodeSource 22 repo left by an earlier run of this script, so
# `apt upgrade` never tries to replace the system node with one it cannot run.
if [ -f /etc/apt/sources.list.d/nodesource.sources ] && grep -q node_22.x /etc/apt/sources.list.d/nodesource.sources \
   && ! dpkg --compare-versions "$(ldd --version | awk 'NR==1{print $NF}')" ge 2.28; then
  rm -f /etc/apt/sources.list.d/nodesource.sources
  apt-get update -qq || true
  echo "removed the NodeSource 22 apt repo (needs glibc ≥ 2.28)"
fi
if [ "$("$NODE_DIR/bin/node" -v 2>/dev/null)" != "$NODE_VERSION" ]; then
  NAME="node-${NODE_VERSION}-linux-x64-glibc-217"
  BASE="https://unofficial-builds.nodejs.org/download/release/${NODE_VERSION}"
  TMP=$(mktemp -d)
  curl -fsSL -o "$TMP/$NAME.tar.xz" "$BASE/$NAME.tar.xz"
  curl -fsSL -o "$TMP/SHASUMS256.txt" "$BASE/SHASUMS256.txt"
  (cd "$TMP" && grep " $NAME.tar.xz\$" SHASUMS256.txt | sha256sum -c -)
  rm -rf "$NODE_DIR" && mkdir -p "$NODE_DIR"
  tar -xJf "$TMP/$NAME.tar.xz" -C "$NODE_DIR" --strip-components=1
  rm -rf "$TMP"
fi
NODE_BIN="$NODE_DIR/bin/node"
echo "afpp node $("$NODE_BIN" -v) at $NODE_BIN (system node untouched: $(node -v 2>/dev/null || echo none))"

# ── 2. System user, code, state, secrets ─────────────────────────────────────
id afpp >/dev/null 2>&1 || useradd --system --home /opt/afpp --shell /usr/sbin/nologin afpp
mkdir -p /opt/afpp /etc/afpp
test -f /opt/afpp/server.js || { echo "!! /opt/afpp/server.js missing: rsync the code first (see top)"; exit 1; }

if [ ! -f /etc/afpp/afpp.env ]; then
  umask 077
  cat > /etc/afpp/afpp.env <<EOF
SERVER_SECRET=$(openssl rand -hex 32)
ADMIN_TOKEN=$(openssl rand -hex 24)
ALLOWED_ORIGINS=${VERCEL_ORIGIN},https://${SITE},https://localhost,capacitor://localhost
MAX_AUDIO_BYTES=26214400
EOF
  umask 022
  echo "wrote /etc/afpp/afpp.env (moderation token: grep ADMIN_TOKEN /etc/afpp/afpp.env)"
fi
chmod 600 /etc/afpp/afpp.env

# ── 3. systemd service ───────────────────────────────────────────────────────
cat > /etc/systemd/system/afpp.service <<EOF
[Unit]
Description=AFPP: shared derives for the SoundWalk global map
After=network.target

[Service]
Type=simple
User=afpp
Group=afpp
WorkingDirectory=/opt/afpp
StateDirectory=afpp
StateDirectoryMode=0755
Environment=DATA_DIR=/var/lib/afpp
Environment=HOST=127.0.0.1
Environment=PORT=${PORT}
# The bitácora bot: sits in #AFPP on the local Ergo (loopback, plain IRC) and logs it.
Environment=IRC_HOST=127.0.0.1
Environment=IRC_PORT=6667
Environment="IRC_CHANNEL=#AFPP"
EnvironmentFile=/etc/afpp/afpp.env
ExecStart=${NODE_BIN} /opt/afpp/server.js
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable afpp
systemctl restart afpp
sleep 1
curl -fsS "http://127.0.0.1:${PORT}/api/health" && echo "  ← afpp is up"

# ── 4. The site's folder: renamed from the old path, once ────────────────────
# Moving the folder (rather than copying) keeps the site up through the change:
# until the next deploy_afpp_web.sh, the old build is served from the new path
# (its old asset links redirect there too).
if [ -d "${WEBROOT_DIR}${OLD_BASE}" ] && [ ! -e "${WEBROOT_DIR}${BASE}" ]; then
  mv "${WEBROOT_DIR}${OLD_BASE}" "${WEBROOT_DIR}${BASE}"
  echo "renamed ${WEBROOT_DIR}${OLD_BASE} → ${WEBROOT_DIR}${BASE}"
fi

# ── 5a. nginx snippet ────────────────────────────────────────────────────────
# `^~` so the site's regex locations (e.g. caching rules for *.mp3/*.png) never
# catch the API's audio URLs. The trailing slash on proxy_pass strips the
# prefix: …/afpp/api/x → /api/x on node. The API answers under both paths: an
# upload cannot follow a redirect, and installed apps call the old one.
api_block() {
cat <<NGINX
location = $1/api/events {            # server-sent events: no buffering, long reads
    proxy_pass http://127.0.0.1:${PORT}/api/events;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_read_timeout 1h;
    access_log off;
}
location ^~ $1/ {
    proxy_pass http://127.0.0.1:${PORT}/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_request_buffering off;
    client_max_body_size 26m;                 # audio uploads up to 25 MB
    access_log off;                           # walkers' IPs are not kept
}
NGINX
}
{
  echo "# AFPP: Alpine Feminist Punk Parade (Deriva Sonora). Included from the ${SITE} HTTPS server block."
  api_block "${PREFIX}"
  api_block "${OLD_BASE}/afpp"
  # The chat's assembly relay, once realtime-on-server.sh has installed it (exact
  # match, so it wins over the API's ^~ prefix).
  if [ -f /etc/systemd/system/afpp-realtime.service ]; then
  cat <<NGINX
# The chat's assembly relay (websocket): typing, presence, WebRTC signalling, live walks.
location = ${PREFIX}/_rooms {
    proxy_pass http://127.0.0.1:${ROOMS_PORT:-8002}/_rooms;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400s;
    access_log off;
}
NGINX
  fi
  cat <<NGINX
# The app download: Android's browser offers to install only with this type.
location = ${BASE}/deriva-sonora.apk {
    types { }
    default_type application/vnd.android.package-archive;
    add_header Content-Disposition 'attachment; filename="deriva-sonora.apk"';
    add_header Cache-Control 'no-cache';
}
# The old address: every page moves, permanently, path and query kept.
location ^~ ${OLD_BASE}/ {
    rewrite ^${OLD_BASE}/(.*)\$ ${BASE}/\$1 permanent;
}
location = ${OLD_BASE} { return 301 ${BASE}/; }
location = ${BASE} { return 301 ${BASE}/; }
NGINX
} > /etc/nginx/snippets/afpp.conf

# ── 5b. Include it in the ${SITE} HTTPS server block (backed up, verified) ─────
# -R, not -r: sites-enabled entries are usually symlinks. Dots matched as [.].
SITE_RE=$(printf '%s' "$SITE" | sed 's/[.]/[.]/g')
CONF=$(grep -RlE "server_name[^;]*[[:space:]]${SITE_RE}([[:space:];]|$)" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | head -1 || true)
[ -n "$CONF" ] || { echo "!! no nginx config with 'server_name ${SITE}' found. Add 'include snippets/afpp.conf;' to its HTTPS server block by hand"; exit 1; }
CONF=$(readlink -f "$CONF")
echo "site config: $CONF"

if grep -q "include snippets/afpp.conf;" "$CONF"; then
  echo "already included"
else
  cp -a "$CONF" "$CONF.bak-afpp-$(date +%Y%m%d%H%M%S)"
  # Insert after the server_name line of every server block that listens on 443
  # and names ${SITE} exactly (not a subdomain).
  python3 - "$CONF" "$SITE" <<'PY'
import re, sys
path, site = sys.argv[1], sys.argv[2]
src = open(path, encoding='utf-8').read()  # explicit: python 3.6 under ssh defaults to ASCII
n, inserted = len(src), 0
# Walk server blocks by brace counting.
pos = 0
res = ''
for m in re.finditer(r'(?m)^[ \t]*server\s*\{', src):
    if m.start() < pos:
        continue
    depth, j = 0, m.end() - 1
    while j < n:
        if src[j] == '{': depth += 1
        elif src[j] == '}':
            depth -= 1
            if depth == 0: break
        j += 1
    block = src[m.start():j + 1]
    names = re.search(r'(?m)^[ \t]*server_name\s+([^;]*);', block)
    is_site = names and site in names.group(1).split()
    is_ssl = re.search(r'(?m)^[ \t]*listen\s+[^;]*443', block)
    if is_site and is_ssl:
        line_end = block.index('\n', names.end())
        indent = re.match(r'[ \t]*', names.group(0)).group(0)
        block = block[:line_end + 1] + f'{indent}include snippets/afpp.conf;\n' + block[line_end + 1:]
        inserted += 1
    res += src[pos:m.start()] + block
    pos = j + 1
res += src[pos:]
if not inserted:
    sys.exit('no HTTPS server block with server_name ' + site)
open(path, 'w', encoding='utf-8').write(res)
print(f'inserted include in {inserted} server block(s)')
PY
fi

if nginx -t; then
  systemctl reload nginx
  sleep 2   # let the new workers take over before checking from outside
else
  LATEST=$(ls -t "$CONF".bak-afpp-* 2>/dev/null | head -1 || true)
  [ -n "$LATEST" ] && cp -a "$LATEST" "$CONF" && echo "!! nginx -t failed: restored $LATEST"
  exit 1
fi

# ── 6. Check from outside ─────────────────────────────────────────────────────
API="https://${SITE}${PREFIX}"
curl -fsS "https://${SITE}${OLD_BASE}/afpp/api/health" >/dev/null && echo "  ← the old API path still answers (installed apps)"
curl -sI "https://${SITE}${OLD_BASE}/howto/" | grep -i "^location" || echo "!! the old address does not redirect"
curl -fsS "${API}/api/health" && echo "  ← public API OK at ${API}"
curl -sI -H "Origin: ${VERCEL_ORIGIN}" "${API}/api/activity" | grep -i access-control-allow-origin \
  || echo "!! no CORS header for ${VERCEL_ORIGIN}: check ALLOWED_ORIGINS in /etc/afpp/afpp.env"

cat <<EOF

Done. The API is at ${API}

  • Vercel → Settings → Environment Variables:  VITE_AFPP_API=${API}   (then redeploy)
  • APK builds (on the Mac):   VITE_AFPP_API=${API} ./build_paid.sh --apk
  • More web origins:          edit ALLOWED_ORIGINS in /etc/afpp/afpp.env && systemctl restart afpp
  • Update the code later:     rsync again (see top), then: systemctl restart afpp
  • Delete a shared derive:
      curl -X DELETE -H "Authorization: Bearer \$(grep ADMIN_TOKEN /etc/afpp/afpp.env | cut -d= -f2)" ${API}/api/derives/<id>
  • Logs:    journalctl -u afpp -f
  • Backup:  rsync -a /var/lib/afpp/ <somewhere>/   (that directory is the whole state)
  • Undo:    remove 'include snippets/afpp.conf;' from ${CONF}, nginx -t && systemctl reload nginx,
             systemctl disable --now afpp
EOF
