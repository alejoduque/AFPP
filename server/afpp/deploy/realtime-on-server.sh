#!/bin/bash
# AFPP: the room relay for the chat's assembly (live typing, voice, ascii,
# live walks). It is KLAP's klap-realtime (the chatb.org relay, Go), built from
# the KLAP source that deploy.sh realtime copied to /opt/afpp-realtime/src,
# and run as its own service so it never shares rooms with a KLAP instance.
#
#   https://altred.xyz/AlpineFeministPunkParade/afpp/_rooms  →  127.0.0.1:8002/_rooms
#
# Run as root (deploy.sh realtime does). Safe to re-run: rebuilds the binary,
# rewrites the unit, adds the nginx location once (backed up, nginx -t checked).
set -euo pipefail

PORT="${ROOMS_PORT:-8002}"
SRC=/opt/afpp-realtime/src
GO_VERSION="1.22.12"
GO_ROOT=/opt/afpp-go
BIN=/usr/local/bin/afpp-realtime
SNIPPET=/etc/nginx/snippets/afpp.conf
PREFIX="/AlpineFeministPunkParade/afpp"

[ "$EUID" -eq 0 ] || { echo "!! run as root"; exit 1; }
test -f "$SRC/main.go" || { echo "!! $SRC/main.go missing: run deploy.sh realtime <klap checkout> from the Mac"; exit 1; }

# ── 1. Go, only to build (/opt/afpp-go; any other Go is left alone) ──────────
# KLAP's relay on the same box already brought this Go: build with it.
if /opt/klap-go/go/bin/go version 2>/dev/null | grep -q "go$GO_VERSION"; then GO_ROOT=/opt/klap-go; fi
if ! "$GO_ROOT/go/bin/go" version 2>/dev/null | grep -q "go$GO_VERSION"; then
  case "$(uname -m)" in x86_64) arch=amd64 ;; aarch64) arch=arm64 ;; *) echo "!! no Go for $(uname -m)"; exit 1 ;; esac
  TMP=$(mktemp -d)
  curl -fsSL "https://go.dev/dl/go$GO_VERSION.linux-$arch.tar.gz" -o "$TMP/go.tgz"
  rm -rf "$GO_ROOT" && mkdir -p "$GO_ROOT" && tar -C "$GO_ROOT" -xzf "$TMP/go.tgz"
  rm -rf "$TMP"
fi

# ── 2. Build (vendored modules, no network) ──────────────────────────────────
BUILD=$(mktemp -d)
(cd "$SRC" && GOTOOLCHAIN=local GOFLAGS=-mod=vendor GOPROXY=off GOPATH="$BUILD/gopath" GOCACHE="$BUILD/cache" CGO_ENABLED=0 \
  "$GO_ROOT/go/bin/go" build -buildvcs=false -trimpath -ldflags="-s -w" -o "$BUILD/afpp-realtime" .)
install -m 755 "$BUILD/afpp-realtime" "$BIN"
rm -rf "$BUILD"

# ── 3. Service, loopback only, keeps nothing ─────────────────────────────────
cat > /etc/systemd/system/afpp-realtime.service <<UNIT
[Unit]
Description=AFPP chat assembly relay (chatb rooms, from KLAP)
After=network.target

[Service]
ExecStart=$BIN -http 127.0.0.1:$PORT
DynamicUser=yes
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable afpp-realtime >/dev/null 2>&1
systemctl restart afpp-realtime
sleep 1
curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null || { echo "!! no answer: journalctl -u afpp-realtime -n 50"; exit 1; }
echo "afpp-realtime up on 127.0.0.1:$PORT"

# ── 4. nginx: an exact location, so it wins over the API's ^~ prefix ─────────
test -f "$SNIPPET" || { echo "!! $SNIPPET missing: run setup-on-server.sh first"; exit 1; }
if grep -q "_rooms" "$SNIPPET"; then
  echo "nginx already routes ${PREFIX}/_rooms"
else
  cp -a "$SNIPPET" "$SNIPPET.bak-rooms-$(date +%Y%m%d%H%M%S)"
  cat >> "$SNIPPET" <<NGINX
# The chat's assembly relay (websocket): typing, presence, WebRTC signalling, live walks.
location = ${PREFIX}/_rooms {
    proxy_pass http://127.0.0.1:${PORT}/_rooms;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400s;
    access_log off;
}
NGINX
  if nginx -t; then
    systemctl reload nginx
  else
    cp -a "$(ls -t "$SNIPPET".bak-rooms-* | head -1)" "$SNIPPET"
    echo "!! nginx -t failed: snippet restored"
    exit 1
  fi
fi

cat <<NOTE

Done. The relay answers at wss://altred.xyz${PREFIX}/_rooms
Voice and video across networks also need TURN: see server/afpp/README.md (coturn),
then TURN_HOST / TURN_SECRET in /etc/afpp/afpp.env and systemctl restart afpp.
Logs: journalctl -u afpp-realtime -f
NOTE
