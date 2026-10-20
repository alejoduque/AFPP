#!/bin/bash
# deploy.sh — put the AFPP server on its host, from the Mac, over ssh.
#
#   server/afpp/deploy/deploy.sh check     what is on the server now (read-only)
#   server/afpp/deploy/deploy.sh install   first time: push the code, then run setup-on-server.sh there
#   server/afpp/deploy/deploy.sh push -n   rehearsal: list what push would upload
#   server/afpp/deploy/deploy.sh push      upload server, restart
#   server/afpp/deploy/deploy.sh realtime ../Klap/KlimatActionProtocol
#                                          the chat's room relay, built from KLAP's realtime/
#
# Served under the existing site: https://altred.xyz/AlpineFeministPunkParade/afpp/ (no
# DNS, no new certificate). Same access as iScream's deploy: root@altred.xyz on
# port 8888 (override with HOST= / PORT=).
# Secrets never travel from here: /etc/afpp/afpp.env is generated on the server.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
HOST="${HOST:-root@altred.xyz}"
PORT="${PORT:-8888}"

SOCK="${TMPDIR:-/tmp}/afpp-deploy-$$"
SSH=(ssh -p "$PORT" -o ControlMaster=auto -o ControlPath="$SOCK" -o ControlPersist=60)
cleanup() { ssh -p "$PORT" -o ControlPath="$SOCK" -O exit "$HOST" 2>/dev/null || true; }
trap cleanup EXIT
remote() { "${SSH[@]}" "$HOST" "export LC_ALL=C.UTF-8 LANG=C.UTF-8; $*"; }
up() { rsync -az -e "${SSH[*]}" "$@"; }

cmd="${1:-}"
DRY=0
[ "${2:-}" = "-n" ] && DRY=1

case "$cmd" in
check)
  remote "
    echo '== include'; grep -rl 'include snippets/afpp.conf' /etc/nginx/ 2>/dev/null || echo 'not included in any site'
    echo '== service'; systemctl is-active afpp 2>&1 || true
    echo '== port';    ss -ltnp | grep ':8790 ' || echo 'nothing on 8790'
    echo '== node';    node -v 2>&1
    echo '== data';    du -sh /var/lib/afpp 2>/dev/null || echo 'no /var/lib/afpp yet'
  "
  ;;
install)
  remote "mkdir -p /opt/afpp"
  rsync -az --exclude test/ --exclude data/ -e "${SSH[*]}" "$HERE/" "$HOST:/opt/afpp/"
  "${SSH[@]}" -t "$HOST" "bash /opt/afpp/deploy/setup-on-server.sh"
  ;;
push)
  FLAGS=(-az --delete --exclude test/ --exclude data/)
  [ $DRY = 1 ] && FLAGS+=(-n -v)
  rsync "${FLAGS[@]}" -e "${SSH[*]}" "$HERE/" "$HOST:/opt/afpp/"
  [ $DRY = 1 ] && exit 0
  # rsync as root keeps the Mac's uid: hand the code back to the GitHub deploy user, if there is one
  remote "id deploy >/dev/null 2>&1 && chown -R deploy:deploy /opt/afpp; systemctl restart afpp && sleep 1 && systemctl is-active afpp && curl -fsS http://127.0.0.1:8790/api/health"
  ;;
realtime)
  # KLAP owns the relay's source; this copies it and builds it there as afpp-realtime.
  KLAP="${2:?usage: deploy.sh realtime <path to the KLAP checkout>}"
  test -f "$KLAP/realtime/main.go" || { echo "!! no $KLAP/realtime/main.go"; exit 1; }
  remote "mkdir -p /opt/afpp-realtime/src /opt/afpp/deploy"
  up --delete "$KLAP/realtime/" "$HOST:/opt/afpp-realtime/src/"
  up "$HERE/deploy/realtime-on-server.sh" "$HOST:/opt/afpp/deploy/"
  "${SSH[@]}" -t "$HOST" "bash /opt/afpp/deploy/realtime-on-server.sh"
  ;;
*)
  sed -n '2,13p' "$0"
  exit 1
  ;;
esac
