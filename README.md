# AFPP · Deriva Sonora

The Alpine Feminist Punk Parade's walking and listening instrument, in its own
repository (it began as the `permasoftware` branch of
[BioMapp / SoundWalk](https://github.com/alejoduque/BioMapp); that history is kept here).

- **One app** (`src/afpp/AfppApp.jsx`), the same in a browser
  (https://altred.xyz/AlpineFeministPunkParade/) and on Android
  (`xyz.altred.permasoftware`):
  - **the stage:** zoomed out, the 1-bit **planet** (`GlobeView.jsx`) with its
    **tracklog**; zoom in, click a dot or ⌖ and it becomes the line-art
    **street map** (`WalkMap.jsx`), where you listen and where you walk. Zoom
    the map out and the planet comes back (`stage.mjs` keeps the scale).
  - **the bar:** ⌖ here / ◯ planet · ● record · ▶ derive (◍ live) · ≡ your
    derives (`src/perma/`: GPS, recorder, sheets, live walks).
  - **the #AFPP chat** and its assembly, and the **rings**.
  A browser asks for the location only when you walk (⌖, ●, ▶); the APK finds
  you at launch.
- **The server** (`server/afpp/`): shared derives, the bitácora, the #AFPP ↔
  Telegram bridge, ICE for WebRTC. Plain Node, no dependencies.

1-bit permasoftware: three tones (black ground, purple ink, white for what is
active or sounding), monospace, whole-step animation, no gradients.

## The chat: IRC and the assembly

#AFPP is IRC (Ergo, `wss://reporta.altred.xyz/irc`), bridged to Telegram and
logged in the public bitácora. IRC keeps **what is said**. Beside it, the
assembly carries **how it is said and who is here**, with the same scripts as
KLAP, the Klimat Action Protocol (`public/chat/assembly/`, byte-identical
copies, checked by `tools/check_assembly_sync.sh`):

| | carried by | needs |
|---|---|---|
| **TBT**, Time Based Text (after dyne's TBT): each line carries its typing as the IRCv3 client tag `+altred.xyz/tbt` and is typed out again on arrival, in the chat and in the bitácora | IRC | Ergo's `message-tags` (plain IRC clients and Telegram see plain text) |
| others' lines **while they are being typed** (`> ana writes :: …`) | the room relay | `VITE_AFPP_ROOMS` |
| **voice**, **video**, **ascii video** (hasciicam: only text leaves the browser) | WebRTC mesh, signalled through the relay | the relay, and TURN across networks |
| a **live walk's sound** | WebRTC, the walker's mic | the relay |

The relay is KLAP's `realtime/` (the chatb.org room relay, Go), run as its own
service: `server/afpp/deploy/deploy.sh realtime <klap checkout>`. The glue is
`public/chat/afpp-assembly.js`; `afpp-chat.js` stays an IRC client with hooks.

## The tracklog

When someone shares a derive, or walks one ◍ live, the planet turns into a
tracklog: it flies down to the walk, the continents dissolve in the dither and
a local grid takes their place, and the walk plays in time (any length → 12–30 s),
the walked path in ink, its last steps lit, each sound a ring that lights up
when it is reached (♪ plays it). A live walk is followed as it happens; if it
is shared at the end, the stored derive takes its place. ▶ tracklog replays
the latest. Logic in `src/afpp/tracklog.mjs`, drawing in `GlobeView.jsx`, live
walks in `src/afpp/walks.mjs` (watch) and `src/perma/liveWalk.js` (walk).

## Run it

```bash
npm install
# the API, with demo derives
(cd server/afpp && SERVER_SECRET=$(openssl rand -hex 32) ALLOWED_ORIGINS=http://localhost:5173 node server.js &)
node server/afpp/tools/seed.mjs
# the room relay (from a KLAP checkout): go run . in realtime/, or docker build + run on :8001
VITE_AFPP_API=http://127.0.0.1:8790 VITE_AFPP_ROOMS=/afpp/_rooms npm run dev
# http://localhost:5173 (the app; recording needs location: Chrome DevTools → Sensors fakes one)
# VITE_AFPP_IRC=ws://127.0.0.1:8097 points the chat at a local Ergo with a websocket listener
```

Tests: `node --test src/afpp/test/*.test.mjs` and `cd server/afpp && npm test`.

| env | |
|---|---|
| `VITE_AFPP_API` | the server. Unset: no globe, no sharing, fully offline |
| `VITE_AFPP_ROOMS` | the room relay (`wss://…/_rooms`, or a path on this site). Unset: IRC + TBT only |
| `VITE_AFPP_TILES` | optional tile server for the local map |
| `VITE_AFPP_IRC` | development only: another Ergo websocket |

## Build and deploy

A push to `main` on GitHub tests, builds and deploys the site and the API
(`.github/workflows/deploy.yml`); the one-time setup, the relay, TURN and the
APK are in [docs/DEPLOY.md](docs/DEPLOY.md). By hand, from the Mac:

```bash
./deploy_afpp_web.sh              # the web listener → altred.xyz/AlpineFeministPunkParade/
./build_deriva.sh                 # the APK (--aab for the Play Store)
server/afpp/deploy/deploy.sh push # the server; see server/afpp/README.md
python3 tools/make_1bit_assets.py # icons + splash; make_glyphs.py, make_howto.py, make_ticker.py
```

Set `VITE_AFPP_ROOMS=wss://altred.xyz/AlpineFeministPunkParade/afpp/_rooms` for
the web and APK builds once the relay is installed.

The SoundWalk app's own builds (`build_paid.sh`, `build_free.sh`), its legacy
components in `src/components/` and `_archive/` came along with the history; the
active code is `src/perma/`, `src/afpp/` and `server/afpp/`.

## Licensing

**BioMapp Project developed for Reserva MANAKAI**

Copyright (c) 2026 Alejandro Duque Jaramillo. All rights reserved.

This work is licensed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0) License**.

You are free to:
*   **Share** — copy and redistribute the material in any medium or format.
*   **Adapt** — remix, transform, and build upon the material.

Under the following terms:
*   **Attribution** — You must give appropriate credit, provide a link to the license, and indicate if changes were made. You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.
*   **NonCommercial** — You may not use the material for commercial purposes. This includes, but is not limited to, any use of the code (including for training artificial intelligence models) that is primarily intended for or directed towards commercial advantage or monetary compensation.
*   **ShareAlike** — If you remix, transform, and build upon the material, you must distribute your contributions under the same license as the original.

For the full license text, please visit: [https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode)

This license applies to all forms of use, including by automated systems or artificial intelligence models, to prevent unauthorized commercial exploitation and ensure proper attribution.
