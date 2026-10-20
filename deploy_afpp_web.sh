#!/bin/bash
# deploy_afpp_web.sh: build the web listener (globe · map · rings · chat · how-to + APK) for
# https://altred.xyz/AlpineFeministPunkParade/ and put it in the altred.xyz webroot.
#
#   ./deploy_afpp_web.sh -n    build + rehearsal (list what would change)
#   ./deploy_afpp_web.sh       build + upload
#
# Same origin as the API (altred.xyz/AlpineFeministPunkParade/afpp), so no CORS setup is
# needed for the site. Served by the site's default `location /` as a plain
# folder, like /TiempoGranular/ and /gpslogs/. The API proxy (snippets/afpp.conf,
# ^~ /AlpineFeministPunkParade/afpp/) is untouched by --delete because it is not a file.
set -euo pipefail
cd "$(dirname "$0")"

HOST="${HOST:-root@altred.xyz}"
PORT="${PORT:-8888}"
WEBROOT="${WEBROOT:-/var/www/altred.xyz/AlpineFeministPunkParade}"
API="${VITE_AFPP_API:-https://altred.xyz/AlpineFeministPunkParade/afpp}"
OUT=dist-afpp

VITE_AFPP_API="$API" npx vite build --base=/AlpineFeministPunkParade/ --outDir "$OUT" --emptyOutDir
# The download link (header + how-to): the newest ./build_deriva.sh APK.
APK=$(ls -t deriva-sonora-*.apk 2>/dev/null | head -1 || true)
# only the top-level API path, never glyphs/afpp/; assets/ goes up first and is never deleted
# here: earlier bundles stay two weeks, so a page still open keeps working
FLAGS=(-rltz --delete --exclude /afpp/ --exclude /assets/)  # no --chmod: macOS openrsync lacks it
if [ -n "$APK" ]; then
  cp "$APK" "$OUT/deriva-sonora.apk"
  echo "apk: $APK → deriva-sonora.apk"
else
  FLAGS+=(--exclude /deriva-sonora.apk)  # none built here: keep the one on the server
  echo "apk: none here (./build_deriva.sh makes one); the server's deriva-sonora.apk stays"
fi
[ "${1:-}" = "-n" ] && FLAGS+=(-n -v)
ssh -p "$PORT" "$HOST" "mkdir -p '$WEBROOT/assets'"
rsync -rltz $([ "${1:-}" = "-n" ] && echo "-n -v") -e "ssh -p $PORT" "$OUT/assets/" "$HOST:$WEBROOT/assets/"
rsync "${FLAGS[@]}" -e "ssh -p $PORT" "$OUT/" "$HOST:$WEBROOT/"
[ "${1:-}" = "-n" ] && exit 0
# owned by the GitHub deploy user when there is one (docs/DEPLOY.md), so the next push can write
ssh -p "$PORT" "$HOST" "o=root; id deploy >/dev/null 2>&1 && o=deploy; chown -R \$o:\$o '$WEBROOT' && find '$WEBROOT' -type d -exec chmod 755 {} + && find '$WEBROOT' -type f -exec chmod 644 {} +"
ssh -p "$PORT" "$HOST" "find '$WEBROOT/assets' -type f -mtime +14 -delete"
echo "live: https://altred.xyz/AlpineFeministPunkParade/"
