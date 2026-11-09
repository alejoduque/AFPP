#!/bin/bash
# afpp-admin.sh: list every shared derive and its sounds, pick what to delete.
# Run it on the server, as root (a single sound's file is removed from disk):
#
#   bash /opt/afpp/tools/afpp-admin.sh                    interactive
#   bash /opt/afpp/tools/afpp-admin.sh list               the table, then exit
#   bash /opt/afpp/tools/afpp-admin.sh delete <id>... [--yes]
#
# Needs only curl and python3 (as a JSON filter; Ubuntu ships it). It talks to the
# running API on 127.0.0.1 with ADMIN_TOKEN from /etc/afpp/afpp.env (AFPP_ENV=… for
# another file), so the server's index, the open pages and the disk stay in step:
# no restart. A whole derive goes with DELETE; a single sound by re-publishing the
# derive without it, then removing its audio file from DATA_DIR (/var/lib/afpp).
# The bitácora's "shared a derive" lines are left as they are.
set -uo pipefail

ENV_FILE="${AFPP_ENV:-/etc/afpp/afpp.env}"
envget() { [ -r "$ENV_FILE" ] && sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" | tail -1 | sed "s/^[\"']\(.*\)[\"']\$/\1/;s/[[:space:]]*\$//"; }
TOKEN="${ADMIN_TOKEN:-$(envget ADMIN_TOKEN)}"
PORT_="${PORT:-$(envget PORT)}"
API="${AFPP_API:-http://127.0.0.1:${PORT_:-8790}}"
API="${API%/}/api"
DATA_DIR="${DATA_DIR:-/var/lib/afpp}"
ID_RE='^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$' # as lib/store.js

command -v curl >/dev/null || { echo "curl is needed"; exit 1; }
command -v python3 >/dev/null || { echo "python3 is needed (apt install python3)"; exit 1; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# ------------------------------------------------------------ JSON (python3 ≥ 3.6)
PY=$(cat <<'PYEOF'
import json, os, sys, time
cmd, args = sys.argv[1], sys.argv[2:]

def load(f):
    with open(f) as fh:
        return json.load(fh)
def cut(s, n):
    s = str(s if s is not None else '')
    return s[:n - 1] + '…' if len(s) > n else s.ljust(n)
def day(t):
    return time.strftime('%Y-%m-%d %H:%M', time.gmtime(t / 1000)) if t else '?'
def dur(s):
    s = s or 0
    return '%d:%02d' % (s // 60, round(s % 60))
def audible(d):
    return sum(1 for r in d['recordings'] if r.get('audio'))

if cmd == 'ids':            # activity JSON on stdin -> one id per line
    for a in json.load(sys.stdin):
        print(a.get('id', ''))
elif cmd == 'error':        # an error body on stdin -> its message
    try:
        print(json.load(sys.stdin).get('error', ''))
    except Exception:
        print('')
elif cmd == 'table':        # dir filter orderfile -> numbered table; shown ids to orderfile
    folder, filt, order = args[0], args[1].lower(), args[2]
    ds = [load(os.path.join(folder, f)) for f in os.listdir(folder) if f.endswith('.json')]
    ds.sort(key=lambda d: d.get('endTime') or d.get('updatedAt') or 0, reverse=True)
    if filt:
        ds = [d for d in ds if any(filt in str(d.get(k) or '').lower() for k in ('alias', 'title', 'id'))]
    with open(order, 'w') as fh:
        fh.write(''.join(d['id'] + '\n' for d in ds))
    if not ds:
        print('  (no derives)')
    else:
        print('  ' + cut('#', 4) + cut('date (UTC)', 17) + cut('alias', 14) + cut('title', 24) + cut('sounds', 7) + cut('pts', 6) + cut('place', 18) + 'id')
    for i, d in enumerate(ds):
        pts = d['breadcrumbs'] + d['recordings']
        place = '%.3f,%.3f' % (sum(p['lat'] for p in pts) / len(pts), sum(p['lng'] for p in pts) / len(pts)) if pts else ''
        print('  ' + cut(i + 1, 4) + cut(day(d.get('endTime') or d.get('updatedAt')), 17) + cut(d.get('alias'), 14) + cut(d.get('title') or '-', 24)
              + cut('%d/%d' % (audible(d), len(d['recordings'])), 7) + cut(len(d['breadcrumbs']), 6) + cut(place, 18) + d['id'])
elif cmd == 'summary':      # file -> one line about the derive
    d = load(args[0])
    print('%s · %s · %d sounds · %s' % (d.get('alias'), d.get('title') or '(untitled)', audible(d), d['id']))
elif cmd == 'sounds':       # file -> numbered sounds table
    d = load(args[0])
    print('\n  %s · %s · %s' % (d.get('alias'), d.get('title') or '(untitled)', d['id']))
    if not d['recordings']:
        print('  (no sounds)')
    else:
        print('  ' + cut('#', 4) + cut('name', 24) + cut('tags', 20) + cut('length', 7) + cut('time (UTC)', 17) + cut('file', 6) + 'rec id')
    for i, r in enumerate(d['recordings']):
        print('  ' + cut(i + 1, 4) + cut(r.get('name') or '-', 24) + cut(', '.join(r.get('tags') or []) or '-', 20) + cut(dur(r.get('duration')), 7)
              + cut(day(r.get('timestamp')), 17) + cut(r.get('ext') or 'none', 6) + r['id'])
elif cmd == 'counts':       # file -> "<sounds> <trace points>"
    d = load(args[0])
    print(len(d['recordings']), len(d['breadcrumbs']))
elif cmd == 'picked':       # file n... -> "rec_id ext name" for those sound numbers
    d = load(args[0])
    for n in args[1:]:
        r = d['recordings'][int(n) - 1]
        print(r['id'], r.get('ext') or '-', r.get('name') or '-')
elif cmd == 'without':      # file rec_id... -> the derive to PUT, without those sounds
    d = load(args[0])
    drop = set(args[1:])
    print(json.dumps({'alias': d.get('alias'), 'title': d.get('title'), 'startTime': d.get('startTime'), 'endTime': d.get('endTime'),
                      'breadcrumbs': d['breadcrumbs'], 'recordings': [r for r in d['recordings'] if r['id'] not in drop]}))
PYEOF
)
py() { python3 -c "$PY" "$@"; }

# ------------------------------------------------------------ API
# call METHOD path [body-file] -> sets STATUS, the body is in $TMP/resp
call() {
  local method=$1 path=$2 body=${3:-} try
  for try in 1 2 3 4 5 6; do
    local opts=(-s -o "$TMP/resp" -w '%{http_code}' -X "$method")
    [ "$method" != GET ] && opts+=(-H "Authorization: Bearer $TOKEN")
    [ -n "$body" ] && opts+=(-H 'Content-Type: application/json' --data-binary "@$body")
    STATUS=$(curl "${opts[@]}" "$API/$path") || STATUS=000
    [ "$STATUS" = 429 ] && [ "$try" -lt 6 ] && { sleep 2; continue; }
    break
  done
  [ "${STATUS:0:1}" = 2 ]
}
why() {
  local msg=''; [ -s "$TMP/resp" ] && msg=$(py error < "$TMP/resp" 2>/dev/null)
  case "$STATUS" in
    000) echo "no answer from $API" ;;
    401|403) echo "$STATUS ${msg:-refused} (is ADMIN_TOKEN in $ENV_FILE the server's?)" ;;
    *) echo "$STATUS ${msg}" ;;
  esac
}

load_all() {
  rm -rf "$TMP/d" && mkdir -p "$TMP/d"
  rm -f "$TMP/resp"
  call GET activity || { echo "could not list derives: $(why)"; return 1; }
  local id
  for id in $(py ids < "$TMP/resp"); do
    [[ $id =~ $ID_RE ]] || continue
    call GET "derives/$id" && cp "$TMP/resp" "$TMP/d/$id.json"
  done
  COUNT=$(ls "$TMP/d" | wc -l)
}
show() { py table "$TMP/d" "$FILTER" "$TMP/order"; }

delete_derive() {
  if call DELETE "derives/$1"; then echo "  deleted $1"; else echo "  FAILED $1: $(why)"; return 1; fi
}

# "1,3,5-7" within 1..n -> PICKS=(1 3 5 6 7); false if malformed
parse_picks() {
  local text=${1//,/ } n=$2 part a b i
  PICKS=()
  for part in $text; do
    if [[ $part =~ ^([0-9]+)(-([0-9]+))?$ ]]; then
      a=${BASH_REMATCH[1]}; b=${BASH_REMATCH[3]:-$a}
      ((a >= 1 && b <= n && a <= b)) || return 1
      for ((i = a; i <= b; i++)); do [[ " ${PICKS[*]} " == *" $i "* ]] || PICKS+=("$i"); done
    else
      return 1
    fi
  done
  ((${#PICKS[@]} > 0))
}

# the next line typed (or piped); end of input answers q
ask() {
  local line
  printf '%s' "$1"
  if IFS= read -r line; then
    [ -t 0 ] || printf '%s\n' "$line"
    REPLY=$(printf '%s' "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  else
    printf '\n'; REPLY=q
  fi
}
yes_no() { ask "$1 [y/N] "; [[ $REPLY =~ ^[yY]([eE][sS])?$ ]]; }

HELP='
  d 1,3,5-7   delete those whole derives (trace + all sounds)
  s 4         open derive 4'"'"'s sounds, to delete single sounds
  f text      show only derives whose alias, title or id contains text (f alone: all)
  r           reload        ?  this help        q  quit
'
SOUND_HELP='
  d 2,3       delete those sounds from this derive
  b           back to the derives
'

sounds_menu() {
  local id=$1 file="$TMP/d/$1.json" nrec npts recs ids line rid ext name
  py sounds "$file"
  printf '%s\n' "$SOUND_HELP"
  while :; do
    ask "sounds $id> "
    case "$REPLY" in
      '') continue ;;
      b|q) return ;;
      d\ *) ;;
      *) printf '%s\n' "$SOUND_HELP"; continue ;;
    esac
    read -r nrec npts <<< "$(py counts "$file")"
    if ! parse_picks "${REPLY#d }" "$nrec"; then echo "  pick numbers from 1 to $nrec, e.g. d 2,3"; continue; fi
    recs=$(py picked "$file" "${PICKS[@]}")
    ids=()
    while read -r rid ext name; do echo "  - $name · $rid"; ids+=("$rid"); done <<< "$recs"
    if [ "$npts" = 0 ] && [ "${#PICKS[@]}" = "$nrec" ]; then
      echo "  that is every sound and the derive has no trace: the server keeps no empty derive."
      if yes_no "delete the whole derive $id instead?"; then delete_derive "$id"; return; fi
      echo "  nothing deleted"; continue
    fi
    yes_no "delete ${#PICKS[@]} sound(s)?" || { echo "  nothing deleted"; continue; }
    py without "$file" "${ids[@]}" > "$TMP/body.json"
    if ! call PUT "derives/$id" "$TMP/body.json"; then echo "  FAILED: $(why)"; continue; fi
    local removed=0
    while read -r rid ext name; do
      [[ $rid =~ $ID_RE && $ext =~ ^[a-z0-9]{2,4}$ ]] || continue
      rm -f "$DATA_DIR/audio/$id/$rid.$ext" && [ ! -e "$DATA_DIR/audio/$id/$rid.$ext" ] && removed=$((removed + 1))
    done <<< "$recs"
    echo "  deleted ${#PICKS[@]} sound(s), $removed file(s) removed from $DATA_DIR/audio/$id"
    call GET "derives/$id" && cp "$TMP/resp" "$file"
    py sounds "$file"
  done
}

interactive() {
  FILTER=''
  load_all || exit 1
  echo; echo "$COUNT shared derives on $API"
  show
  printf '%s\n' "$HELP"
  local cmd arg n id
  while :; do
    ask 'admin> '
    cmd=${REPLY%% *}; arg=''; [ "$REPLY" != "$cmd" ] && arg=${REPLY#* }
    case "$cmd" in
      '') ;;
      q|quit|exit) break ;;
      '?'|h|help) printf '%s\n' "$HELP" ;;
      r|l) load_all && { echo; echo "$COUNT shared derives${FILTER:+ (filter: $FILTER)}"; show; } ;;
      f) FILTER=$(printf '%s' "$arg" | tr '[:upper:]' '[:lower:]'); show ;;
      d)
        n=$(wc -l < "$TMP/order")
        if ! parse_picks "$arg" "$n"; then echo "  pick numbers from 1 to $n, e.g. d 1,3,5-7"; continue; fi
        for i in "${PICKS[@]}"; do echo "  - $(py summary "$TMP/d/$(sed -n "${i}p" "$TMP/order").json")"; done
        if ! yes_no "delete ${#PICKS[@]} derive(s) and all their sounds?"; then echo "  nothing deleted"; continue; fi
        for i in "${PICKS[@]}"; do delete_derive "$(sed -n "${i}p" "$TMP/order")"; done
        load_all && show ;;
      s)
        n=$(wc -l < "$TMP/order")
        if ! parse_picks "$arg" "$n" || [ "${#PICKS[@]}" != 1 ]; then echo "  one number from 1 to $n, e.g. s 4"; continue; fi
        id=$(sed -n "${PICKS[0]}p" "$TMP/order")
        sounds_menu "$id"
        load_all && show ;;
      *) printf '%s\n' "$HELP" ;;
    esac
  done
  echo "(bitácora lines about shared derives stay in $DATA_DIR/bitacora)"
}

# ------------------------------------------------------------ main
call GET health || { echo "the AFPP API does not answer at $API${STATUS#000}. Is the afpp service running? (systemctl status afpp)"; exit 1; }
case "${1:-}" in
  list) FILTER=''; load_all && show; exit ;;
  ''|interactive) ;;
  delete) ;;
  *) echo "usage: $0 [list | delete <id>... [--yes]]"; exit 1 ;;
esac
[ -n "$TOKEN" ] || { echo "no ADMIN_TOKEN in $ENV_FILE. Run this on the server as root."; exit 1; }
if [ "${1:-}" = delete ]; then
  shift
  IDS=(); SURE=''
  for a in "$@"; do if [ "$a" = --yes ]; then SURE=1; elif [[ $a =~ $ID_RE ]]; then IDS+=("$a"); else echo "not a derive id: $a"; exit 1; fi; done
  ((${#IDS[@]})) || { echo "usage: $0 delete <id>... [--yes]"; exit 1; }
  [ -n "$SURE" ] || yes_no "delete ${#IDS[@]} derive(s): ${IDS[*]}?" || { echo "nothing deleted"; exit 0; }
  FAILED=0
  for id in "${IDS[@]}"; do delete_derive "$id" || FAILED=1; done
  exit $FAILED
fi
interactive
