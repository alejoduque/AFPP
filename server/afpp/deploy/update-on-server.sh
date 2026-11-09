#!/bin/bash
# AFPP: update everything on altred.xyz from GitHub, in one command, as root:
#
#   curl -fsSL https://raw.githubusercontent.com/alejoduque/AFPP/main/server/afpp/deploy/update-on-server.sh | bash
#
# 1. the code: https://github.com/alejoduque/AFPP (main) into /opt/afpp-src
# 2. the site: built here with AFPP's own Node 22 (/opt/afpp-node, from
#    setup-on-server.sh), then copied into the webroot (bundles first; the APK and
#    the API path are never touched)
# 3. the API: server/afpp → /opt/afpp, and the admin tool
#    (bash /opt/afpp/tools/afpp-admin.sh)
# 4. ffmpeg, for the shared rings (apt, if missing)
# 5. the shared rings' stream: Icecast's port and source password are read from
#    its icecast.xml into /etc/afpp/afpp.env (once; never printed)
# 6. restart the API and check it answers
#
# Safe to re-run. Nothing here deletes data (/var/lib/afpp) or secrets.
# DRY=1 prints what would change on the system (systemctl, apt, chown) instead.
# Paths can be overridden for a test run: SRC, NODE_DIR, WEBROOT, API_DIR,
# ENV_FILE, ICECAST_XML, REPO_URL, BRANCH.

main() {
  set -euo pipefail
  local REPO_URL="${REPO_URL:-https://github.com/alejoduque/AFPP.git}"
  local BRANCH="${BRANCH:-main}"
  local SRC="${SRC:-/opt/afpp-src}"
  local NODE_DIR="${NODE_DIR:-/opt/afpp-node}"
  local WEBROOT="${WEBROOT:-/var/www/altred.xyz/AlpineFeministPunkParade}"
  local API_DIR="${API_DIR:-/opt/afpp}"
  local ENV_FILE="${ENV_FILE:-/etc/afpp/afpp.env}"
  local BASE_PATH="/AlpineFeministPunkParade/"
  local API_URL="${API_URL:-https://altred.xyz/AlpineFeministPunkParade/afpp}"
  local PORT="${AFPP_PORT:-8790}"
  local DRY="${DRY:-}"
  run() { if [ -n "$DRY" ]; then echo "  DRY: $*"; else "$@"; fi; }
  step() { printf '\n== %s\n' "$*"; }

  if [ -z "$DRY" ] && [ "$(id -u)" != 0 ]; then echo "run this as root"; exit 1; fi
  command -v git >/dev/null || { echo "git is needed: apt-get install -y git"; exit 1; }
  command -v rsync >/dev/null || { echo "rsync is needed: apt-get install -y rsync"; exit 1; }

  # ── 1. the code ─────────────────────────────────────────────────────────────
  step "code: $REPO_URL ($BRANCH) → $SRC"
  if [ -d "$SRC/.git" ]; then
    git -C "$SRC" fetch -q --depth 1 origin "$BRANCH"
    git -C "$SRC" reset -q --hard FETCH_HEAD # this checkout is the script's own: no local edits live here
  else
    mkdir -p "$(dirname "$SRC")"
    git clone -q --depth 1 --branch "$BRANCH" "$REPO_URL" "$SRC"
  fi
  echo "  at $(git -C "$SRC" log -1 --format='%h %s')"

  # ── 2. the site ─────────────────────────────────────────────────────────────
  step "site: build with $NODE_DIR"
  local NODE="$NODE_DIR/bin/node"
  local major
  major=$("$NODE" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if [ "$major" -lt 22 ]; then
    echo "  AFPP's Node 22 is not at $NODE_DIR. Run server/afpp/deploy/setup-on-server.sh once first."
    exit 1
  fi
  (
    cd "$SRC"
    export PATH="$NODE_DIR/bin:$PATH"
    # npm ci only when the lockfile changed: it reinstalls everything
    local sum
    sum=$(sha256sum package-lock.json | cut -c1-16)
    if [ "$(cat node_modules/.afpp-lock 2>/dev/null)" != "$sum" ]; then
      npm ci --no-audit --no-fund --loglevel=error
      echo "$sum" > node_modules/.afpp-lock
    fi
    local rooms="${AFPP_ROOMS:-}"
    if [ -z "$rooms" ] && [ -f /etc/systemd/system/afpp-realtime.service ]; then
      rooms="wss://altred.xyz/AlpineFeministPunkParade/afpp/_rooms"
    fi
    VITE_AFPP_API="$API_URL" VITE_AFPP_ROOMS="$rooms" npx vite build --logLevel error --base="$BASE_PATH" --outDir dist-afpp --emptyOutDir
    echo "  built (rooms: ${rooms:-off})"
  )
  step "site: → $WEBROOT"
  mkdir -p "$WEBROOT/assets"
  # bundles first and never deleted here, so the new page never names a missing one
  rsync -rlt "$SRC/dist-afpp/assets/" "$WEBROOT/assets/"
  rsync -rlt --delete --exclude /afpp/ --exclude /deriva-sonora.apk --exclude /assets/ "$SRC/dist-afpp/" "$WEBROOT/"
  find "$WEBROOT/assets" -type f -mtime +14 -delete
  local owner=root
  id deploy >/dev/null 2>&1 && owner=deploy # the GitHub deploy user, when there is one (docs/DEPLOY.md)
  run chown -R "$owner:$owner" "$WEBROOT"
  find "$WEBROOT" -type d -exec chmod 755 {} +
  find "$WEBROOT" -type f -exec chmod 644 {} +
  echo "  done ($(find "$WEBROOT" -type f | wc -l) files)"

  # ── 3. the API ──────────────────────────────────────────────────────────────
  step "API: → $API_DIR"
  mkdir -p "$API_DIR"
  rsync -rlt --delete --exclude test/ --exclude data/ --exclude node_modules/ "$SRC/server/afpp/" "$API_DIR/"
  chmod 755 "$API_DIR/tools/afpp-admin.sh" "$API_DIR/deploy/"*.sh 2>/dev/null || true
  run chown -R "$owner:$owner" "$API_DIR"
  echo "  done; admin tool: bash $API_DIR/tools/afpp-admin.sh"

  # ── 4. ffmpeg (the shared rings mix and encode with it) ─────────────────────
  step "ffmpeg"
  if command -v ffmpeg >/dev/null; then
    echo "  $(ffmpeg -version | head -1 | cut -d' ' -f1-3)"
  else
    run apt-get install -y -q ffmpeg
  fi

  # ── 5. Icecast, for the shared rings ────────────────────────────────────────
  step "Icecast"
  local xml="${ICECAST_XML:-}"
  if grep -q '^ICECAST_URL=' "$ENV_FILE" 2>/dev/null; then
    echo "  already set in $ENV_FILE ($(grep '^ICECAST_URL=' "$ENV_FILE" | cut -d= -f2), mount $(grep '^ICECAST_MOUNT=' "$ENV_FILE" | cut -d= -f2 || true))"
  else
    if [ -z "$xml" ]; then
      # the running Icecast's own config (-c <file>), else the usual places
      xml=$(ps -eo args= 2>/dev/null | sed -n 's/^[^ ]*icecast[^ ]* .*-c \([^ ]*\).*/\1/p' | head -1)
      for f in "$xml" /etc/icecast2/icecast.xml /etc/icecast.xml /usr/local/etc/icecast.xml; do
        [ -n "$f" ] && [ -r "$f" ] && { xml="$f"; break; }
      done
    fi
    if [ -z "$xml" ] || [ ! -r "$xml" ]; then
      echo "  no icecast.xml found: the shared rings will move for everyone, but nothing is streamed."
      echo "  To stream, add to $ENV_FILE: ICECAST_URL=http://127.0.0.1:<port> and ICECAST_SOURCE_PASSWORD=<source-password>"
    else
      local conf
      conf=$(python3 - "$xml" <<'PY'
import sys, xml.etree.ElementTree as ET
r = ET.parse(sys.argv[1]).getroot()
port = next((s.findtext('port') for s in r.iter('listen-socket') if s.findtext('port')), '8000').strip()
pw = (r.findtext('authentication/source-password') or '').strip()
srcs = (r.findtext('limits/sources') or '').strip()
print(port); print(pw); print(srcs)
PY
)
      local ice_port ice_pw ice_srcs
      ice_port=$(sed -n 1p <<< "$conf"); ice_pw=$(sed -n 2p <<< "$conf"); ice_srcs=$(sed -n 3p <<< "$conf")
      if [ -z "$ice_pw" ]; then
        echo "  $xml has no <source-password>: not configured."
      else
        {
          echo ""
          echo "# The shared rings' stream (added by update-on-server.sh from $xml)"
          echo "ICECAST_URL=http://127.0.0.1:$ice_port"
          echo "ICECAST_SOURCE_PASSWORD=$ice_pw"
          echo "ICECAST_MOUNT=/afpp-rings.mp3"
        } >> "$ENV_FILE"
        echo "  from $xml: port $ice_port, mount /afpp-rings.mp3 (password copied, not shown)"
        [ -n "$ice_srcs" ] && echo "  Icecast allows $ice_srcs sources at once: the rings use one while they sound."
      fi
    fi
  fi
  local ice_url
  ice_url=$(grep '^ICECAST_URL=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true)
  if [ -n "$ice_url" ]; then
    local stats
    if stats=$(curl -fsS --max-time 5 "$ice_url/status-json.xsl" 2>/dev/null) || curl -fsS -o /dev/null --max-time 5 "$ice_url/" 2>/dev/null; then
      echo "  Icecast answers at $ice_url"
      # Icecast refuses a source past <limits><sources>: say so before the rings find out
      local inuse limit
      inuse=$(python3 -c 'import json,sys
try:
    s = json.loads(sys.stdin.read() or "{}").get("icestats", {}).get("source")
    print(0 if not s else len(s) if isinstance(s, list) else 1)
except Exception:
    print("?")' <<< "${stats:-}")
      limit=$(grep -o '<sources>[0-9]*</sources>' "${xml:-/dev/null}" 2>/dev/null | grep -o '[0-9]*' || true)
      echo "  mounts streaming now: $inuse${limit:+ (limit $limit)}"
      if [ -n "$limit" ] && [ "$inuse" != "?" ] && [ "$inuse" -ge "$limit" ]; then
        echo "  ! Icecast is full: the shared rings will not get on air. Raise <limits><sources> in ${xml} (e.g. to $((limit + 2))), then restart Icecast."
      fi
    else
      echo "  Icecast does not answer at $ice_url (is it running?)"
    fi
  fi

  # ── 6. restart and check ────────────────────────────────────────────────────
  step "restart"
  run systemctl restart afpp
  if [ -z "$DRY" ]; then
    local ok=""
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      sleep 1
      if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then ok=1; break; fi
    done
    if [ -z "$ok" ]; then
      echo "  the API does not answer. Its log: journalctl -u afpp -n 50 --no-pager"
      journalctl -u afpp -n 20 --no-pager || true
      exit 1
    fi
    echo "  $(curl -fsS "http://127.0.0.1:$PORT/api/health")"
    echo "  shared rings: $(curl -fsS "http://127.0.0.1:$PORT/api/ring" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(("streamed through Icecast" if d.get("stream") else "shared, not streamed"), "·", len(d["sources"]), "sounds in")')"
    if grep -q '^TELEGRAM_TOKEN=.' "$ENV_FILE" 2>/dev/null; then
      echo "  Telegram files: on (the bot must be able to read the group: admin, or privacy mode off)"
    else
      echo "  Telegram files: off (no TELEGRAM_TOKEN in $ENV_FILE)"
    fi
  fi

  printf '\nlive: https://altred.xyz/AlpineFeministPunkParade/  (reload with Cmd+Shift+R)\n'
}

# Everything above is read before anything runs, and nothing below reads the
# script's own stdin: safe to pipe from curl.
main "$@" < /dev/null
