# Deploying AFPP through GitHub

Once set up, a push to `main` on GitHub tests, builds and deploys the site and
the API to altred.xyz (`.github/workflows/deploy.yml`). The APK and the room
relay go up by hand, rarely.

| what | where on altred.xyz | how it gets there |
|---|---|---|
| the site (globe, chat, bitácora, how-to, kit) | `/var/www/altred.xyz/AlpineFeministPunkParade/` | GitHub Actions, every push |
| the API (`server/afpp/`) | `/opt/afpp/`, service `afpp`, data `/var/lib/afpp` | GitHub Actions, every push |
| the APK | `…/AlpineFeministPunkParade/deriva-sonora.apk` | by hand from the Mac (step 6) |
| the room relay (KLAP's `realtime/`) | service `afpp-realtime`, 127.0.0.1:8002 | once, from the Mac (step 4) |
| TURN (coturn) | 3478 udp/tcp | once (step 5) |
| IRC (Ergo, `reporta.altred.xyz`) | already there | one config line (step 1) |

All commands are single lines. `server$` means a root shell on the box:
`ssh -p 8888 root@altred.xyz`. `mac$` means this repository on the Mac.

## 1. Let the site talk to Ergo (needed now: the live chat is refused)

Ergo only accepts websockets from `https://reporta.altred.xyz`: the AFPP site,
on `https://altred.xyz`, gets `403`. Check, then fix:

```
mac$ curl -s -o /dev/null -w "%{http_code}\n" --http1.1 -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Origin: https://altred.xyz" https://reporta.altred.xyz/irc
server$ ps -o args= -C ergo
```

The second command shows Ergo's config file (`--conf …/ircd.yaml`). In it, under
`server:` → `websockets:` → `allowed-origins:`, add the site next to reporta's:

```yaml
        allowed-origins:
            - "https://reporta.altred.xyz"
            - "https://altred.xyz"
```

```
server$ kill -HUP $(pidof ergo)
```

(SIGHUP makes Ergo reload its config.) The first command now prints `101`.
Ergo already offers `message-tags`, so TBT works as soon as the site is
deployed.

## 2. The repository on GitHub, as a fresh start

Do **not** push this repository's history. It comes from BioMapp's
`permasoftware` branch, and old commits contain `android/app/release.keystore`
(the same file that signs today's release builds) and keystore passwords. BioMapp is
private, so that is contained; a public AFPP repo must start clean. The current
files are clean (`.gitignore` keeps keystores, `.env` and `local.properties` out).

Before the first public commit, decide what of BioMapp's leftovers should be
public: `_archive/` holds `Manakai_recordings_2026-02-22.zip` (field recordings,
8 MB) and old SoundWalk presentations. To leave it out:
`git rm -r -q --cached _archive && echo "_archive/" >> .gitignore` (after the
`checkout --orphan` below, before `git add -A`).

```
mac$ git checkout --orphan public
mac$ git add -A
mac$ git commit -m "AFPP: Deriva Sonora, the global map, the #AFPP assembly and the tracklog (history in the private BioMapp repo)"
mac$ gh repo create alejoduque/AFPP --public --source . --remote origin --description "Alpine Feminist Punk Parade · Deriva Sonora: soundwalks, the global map, the #AFPP assembly"
mac$ git push -u origin public:main
```

The full history stays on the local branch `main` and in BioMapp. Work from
now on happens on `public` (push it to `origin main`). You can rename it later
with `git branch -m public main` once the old `main` is deleted locally.

## 3. A deploy user on the server (once)

GitHub logs in as `deploy`, not root. It can write the site and the API code,
and restart the API, nothing else.

```
server$ id deploy || useradd --create-home --shell /bin/bash deploy
server$ chown -R deploy:deploy /var/www/altred.xyz/AlpineFeministPunkParade /opt/afpp
server$ echo "deploy ALL=(root) NOPASSWD: $(command -v systemctl) restart afpp" > /etc/sudoers.d/afpp-deploy && chmod 440 /etc/sudoers.d/afpp-deploy && visudo -cf /etc/sudoers.d/afpp-deploy
```

A key just for GitHub (on the Mac, no passphrase, never used for anything else):

```
mac$ ssh-keygen -t ed25519 -N "" -C "github-actions afpp deploy" -f ~/.ssh/afpp_deploy
mac$ ssh -p 8888 root@altred.xyz "install -d -m 700 -o deploy -g deploy ~deploy/.ssh && cat >> ~deploy/.ssh/authorized_keys && chown deploy:deploy ~deploy/.ssh/authorized_keys && chmod 600 ~deploy/.ssh/authorized_keys" < ~/.ssh/afpp_deploy.pub
mac$ ssh -i ~/.ssh/afpp_deploy -p 8888 deploy@altred.xyz "sudo systemctl restart afpp && echo ok"
```

The server keeps working with root as before: `deploy.sh push` and
`deploy_afpp_web.sh` from the Mac hand ownership back to `deploy` when they
finish. Root-run setup scripts (`setup-on-server.sh`) should still be sent fresh
from the Mac (`deploy.sh install`), not run from what `deploy` can write.

## 4. The room relay (once; live typing, voices, live walks)

Built from a KLAP checkout on the Mac, installed as `afpp-realtime` and routed
at `…/AlpineFeministPunkParade/afpp/_rooms`:

```
mac$ server/afpp/deploy/deploy.sh realtime ../Klap/KlimatActionProtocol
```

## 5. TURN (once; voices across networks)

Without it, voice and video connect only between people on the same network
(live typing, TBT and live walks don't need it).

```
server$ apt-get install -y coturn
server$ openssl rand -hex 32
```

Write `/etc/turnserver.conf` as in `server/afpp/README.md` with that secret,
then:

```
server$ sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn && systemctl enable --now coturn
server$ printf 'TURN_HOST=altred.xyz:3478\nTURN_SECRET=%s\n' "<the same secret>" >> /etc/afpp/afpp.env && systemctl restart afpp
server$ curl -s http://127.0.0.1:8790/api/ice
```

Open 3478 udp+tcp and 49152–65535 udp in the firewall (`ufw allow 3478`,
`ufw allow 49152:65535/udp`, if ufw is in use).

## 6. GitHub settings (once), then every push deploys

On github.com/alejoduque/AFPP → Settings → Secrets and variables → Actions:

| kind | name | value |
|---|---|---|
| secret | `DEPLOY_SSH_KEY` | the private key: `cat ~/.ssh/afpp_deploy` |
| secret | `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan -p 8888 altred.xyz` |
| variable | `AFPP_ROOMS` | `wss://altred.xyz/AlpineFeministPunkParade/afpp/_rooms` (after step 4; empty = IRC + TBT only) |

Or from the Mac:

```
mac$ gh secret set DEPLOY_SSH_KEY --repo alejoduque/AFPP < ~/.ssh/afpp_deploy
mac$ ssh-keyscan -p 8888 altred.xyz 2>/dev/null | gh secret set DEPLOY_KNOWN_HOSTS --repo alejoduque/AFPP
mac$ gh variable set AFPP_ROOMS --repo alejoduque/AFPP --body "wss://altred.xyz/AlpineFeministPunkParade/afpp/_rooms"
mac$ gh workflow run deploy --repo alejoduque/AFPP
mac$ gh run watch --repo alejoduque/AFPP
```

Optional, on a paid plan (private repositories): Settings → Environments →
`production` → Required reviewers, plus `environment: production` on the deploy
job, so a push waits for your click before it goes live.

After that, a push to `main` deploys. To undo a deploy: `git revert <commit>`
and push, or re-run an older run of the workflow.

## 7. The APK, by hand

```
mac$ VITE_AFPP_ROOMS=wss://altred.xyz/AlpineFeministPunkParade/afpp/_rooms ./build_deriva.sh
mac$ rsync -e "ssh -p 8888" "$(ls -t deriva-sonora-*.apk | head -1)" deploy@altred.xyz:/var/www/altred.xyz/AlpineFeministPunkParade/deriva-sonora.apk
```

The workflow never deletes it (`--exclude /deriva-sonora.apk`).

## Checks after a deploy

```
mac$ curl -fsS https://altred.xyz/AlpineFeministPunkParade/afpp/api/health
mac$ curl -fsS https://altred.xyz/AlpineFeministPunkParade/afpp/api/ice
mac$ curl -s -o /dev/null -w "%{http_code}\n" --http1.1 -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" https://altred.xyz/AlpineFeministPunkParade/afpp/_rooms
```

The last one prints `101` once the relay is in.
