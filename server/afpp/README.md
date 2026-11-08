# AFPP server — shared derives for the SoundWalk global map

Plain Node (≥20), no dependencies, no database. Phones publish a derive they
chose to share; browsers read the activity, the derives in view, the audio, and
a live event stream.

```
DATA_DIR/derives/<deriveId>.json        one file per derive (trace + recording metadata + owner)
DATA_DIR/audio/<deriveId>/<recId>.<ext> the sounds
```

## Run it locally

```sh
cd server/afpp
SERVER_SECRET=$(openssl rand -hex 32) ADMIN_TOKEN=dev DATA_DIR=./data \
  ALLOWED_ORIGINS='http://localhost:5173' node server.js     # → http://127.0.0.1:8790
node tools/seed.mjs                                          # 3 demo derives with synthetic sounds
cd ../.. && VITE_AFPP_API=http://127.0.0.1:8790 npm run dev  # the globe at http://localhost:5173
npm test                                                     # (in server/afpp) node:test suite
```

`tools/seed.mjs` writes fake derives. Never run it against the public server.

## Environment

| var | default | |
|---|---|---|
| `SERVER_SECRET` | — (required, 16+ chars) | HMAC key for device keys. Changing it invalidates every phone's key (they re-register automatically). |
| `ADMIN_TOKEN` | — | `Authorization: Bearer …` may delete any derive (moderation). |
| `ALLOWED_ORIGINS` | localhost dev + Capacitor | Comma list of browser origins: the site (`https://altred.xyz`), `https://localhost` and `capacitor://localhost` (the APK WebView). `*` allows any. |
| `DATA_DIR` | `./data` | |
| `MAX_AUDIO_BYTES` | 25 MB | per recording |
| `HOST` / `PORT` | `127.0.0.1` / `8790` | |
| `IRC_HOST` / `IRC_PORT` / `IRC_CHANNEL` | — / 6667 / `#AFPP` | The bitácora bot on the local Ergo. It asks for `message-tags`, so lines typed on the web keep their typing (TBT, `lib/tbt.js`). |
| `TURN_HOST` / `TURN_SECRET` | — | ICE for the chat's voice and video (`/api/ice`): STUN on `TURN_HOST`, and TURN with coturn's REST credentials when `TURN_SECRET` (coturn's `static-auth-secret`) is set. Neither: calls connect only inside one network. |

## API

All under `/api/`. In production nginx strips the `/AlpineFeministPunkParade/afpp` prefix.

| | | |
|---|---|---|
| `POST /devices` `{deviceId}` | → `{key}` | `key = HMAC(SERVER_SECRET, deviceId)`. No secret ships in the APK. |
| `PUT /derives/:id` | device headers | Publish/replace a derive: `{alias, title, startTime, endTime, breadcrumbs[], recordings[]}`. Sanitised: coordinates rounded to 5 decimals, length limits. First publisher owns it. |
| `PUT /derives/:id/recordings/:rid` | device headers | Raw audio body, `Content-Type` audio/mp4 · m4a · aac · webm · ogg · mpeg · wav. |
| `DELETE /derives/:id` | owner or admin | Unshare: removes the JSON and the audio. |
| `GET /activity` | | One dot per derive: `{id, alias, title, lat, lng, lastAt, n}`. |
| `GET /derives?bbox=w,s,e,n` | | Derives touching the box (≤200), with `recordings[].audio` paths. Never the owner. |
| `GET /derives/:id` | | One derive. |
| `GET /audio/:id/:rid.:ext` | | The sound, with `Range` support (seeking, iOS). |
| `GET /events` | | SSE: `derive` (published / new audio) and `remove`. |
| `GET /ice` | | `{iceServers, ttl}` for the chat's WebRTC: STUN, plus TURN credentials valid 12 h. |
| `GET /bitacora.json` | | `?solo=chat\|deriva&ultimos=N`. A chat line typed on the web has `tbt`: its typing, `[[delay_ms, pos, del, ins], …]`. |
| `GET /health` | | |

Device headers: `X-Device-Id`, `X-Device-Key`. Writes are rate-limited per IP.

## Deploy

It is served under the existing altred.xyz site, so there is **no DNS and no new
certificate**:

```
https://altred.xyz/AlpineFeministPunkParade/afpp/api/...  →  nginx (snippets/afpp.conf, ^~ prefix)  →  node 127.0.0.1:8790
```

The code lives in `/opt/afpp`, the data in `/var/lib/afpp`, and the secrets in
`/etc/afpp/afpp.env`. None of them are in the webroot, so nginx can never serve
`server.js` or the uploads as files.

- `deploy/setup-on-server.sh`: the whole server-side setup, run as root on the
  box. It installs Node if needed, creates the `afpp` user, generates the
  secrets, writes the systemd unit and the nginx snippet, and includes the
  snippet in the altred.xyz HTTPS block. The site config is backed up first and
  restored if `nginx -t` fails.
- `deploy/deploy.sh`, from the Mac (`root@altred.xyz:8888`; override `HOST=` / `PORT=`):

```sh
server/afpp/deploy/deploy.sh check      # read-only look at the box
server/afpp/deploy/deploy.sh install    # once: rsync the code, run setup-on-server.sh there
server/afpp/deploy/deploy.sh push -n    # rehearsal
server/afpp/deploy/deploy.sh push       # upload + restart + health check
```

The site itself goes up with every push to `main` (GitHub Actions, `docs/DEPLOY.md`);
APK builds point at `https://altred.xyz/AlpineFeministPunkParade/afpp` by default.

Moderation: on the server, `node /opt/afpp/tools/admin.mjs` lists every shared derive and its sounds and deletes what you pick (whole derives, or single sounds); `list` and `delete <id>... --yes` for scripts. Or by hand: `curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" https://altred.xyz/AlpineFeministPunkParade/afpp/api/derives/<id>`.
Backups: `DATA_DIR` is the whole state, so rsync `/var/lib/afpp`.

## The chat's assembly: room relay and TURN

Live typing, voices, ascii video and live walks go through a room relay:
KLAP's `realtime/` (the chatb.org relay, Go, keeps nothing), installed from a
KLAP checkout as its own service, `afpp-realtime` on 127.0.0.1:8002, at
`…/AlpineFeministPunkParade/afpp/_rooms`:

```sh
server/afpp/deploy/deploy.sh realtime ../Klap/KlimatActionProtocol
```

Then build the web front and the APK with
`VITE_AFPP_ROOMS=wss://altred.xyz/AlpineFeministPunkParade/afpp/_rooms`.

Voice and video between people on different networks also need TURN. With
coturn on the same box:

```
# /etc/turnserver.conf
listening-port=3478
realm=altred.xyz
use-auth-secret
static-auth-secret=<openssl rand -hex 32>
no-cli
no-tlsv1
no-tlsv1_1
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
```

Open 3478/udp+tcp and the relay port range (49152–65535/udp by default), then
add `TURN_HOST=altred.xyz:3478` and `TURN_SECRET=<the same secret>` to
`/etc/afpp/afpp.env` and `systemctl restart afpp`.
