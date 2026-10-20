#!/usr/bin/env bash
# The assembly scripts in public/chat/assembly/ are byte-identical copies of
# KLAP's (web/static/js/assembly/). Fixes go into both repos; this says when
# the copies drift apart.
#
#   tools/check_assembly_sync.sh ../Klap/KlimatActionProtocol
set -u
KLAP="${1:?usage: $0 <path to the KLAP checkout>}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
status=0
for f in tbt.js room.js ascii.js presence.js; do
  if cmp -s "$KLAP/web/static/js/assembly/$f" "$HERE/public/chat/assembly/$f"; then
    echo "  same     $f"
  else
    echo "  DIFFERS  $f   (diff $KLAP/web/static/js/assembly/$f public/chat/assembly/$f)"
    status=1
  fi
done
exit $status
