# Changelog

All notable changes to SoundWalk / DerivaSonora (formerly BioMapp) are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [AFPP] — 2026-10-20 — the splash, and pages that always start

### Added
- **The logo splash** on every load, web and APK: plain HTML in index.html, so
  it shows before any script; it lifts after 1.4 s, or at a tap or a key.

### Fixed
- **The site could stay empty** after a deploy: index.html had no
  Cache-Control, so a browser kept an old copy asking for bundles the deploy
  had deleted. The page now always revalidates (nginx, snippets/afpp.conf),
  the content-hashed bundles are cached a year, and deploys keep earlier
  bundles two weeks. A page that still cannot start says so on the splash,
  with a reload link, instead of showing nothing.
- setup-on-server.sh: the Node download reused BASE, the site's path; on a
  fresh server the nginx snippet would have been written with the wrong path.

---

## [AFPP] — 2026-10-20 — one app

### Changed
- **The listener and the recorder are one app**, in the browser and the APK:
  the planet ⇄ street map stage (zoom in to dive, zoom out to come back,
  `stage.mjs`), one map for listening and walking (`WalkMap.jsx`, replacing
  `LocalMap.jsx` and `FieldMap.jsx`), the record/derive/live bar always there,
  the chat and the rings as panels. `?recorder` links open the same app.
- The browser asks for the location only when you walk (⌖, ●, ▶), and for
  the alias the first time you record or derive.
- A share or a live walk turns the planet into the tracklog only on the
  planet; on the street map a line offers to go and watch.
- The globe's idle drift is per second, not per frame, and it holds still
  over the place you come back from.
- The APK has the #AFPP chat (Ergo allows the app's origin, `https://localhost`).

### Fixed
- The recorder's map showed only place names when it had no location: it
  opened at continental zoom, where the line-art filter keeps only labels.
  The street map now never goes below zoom 8; the planet takes over.

---

## [AFPP] — 2026-10-19 — own repository

### Added
- **Own repository**, from BioMapp's `permasoftware` branch (history kept).
- **The assembly beside IRC in #AFPP**, with KLAP's assembly scripts
  (`public/chat/assembly/`, byte-identical; `tools/check_assembly_sync.sh`):
  - **TBT** (Time Based Text): a line carries its typing as the IRCv3 client tag
    `+altred.xyz/tbt` and is typed out again on arrival; plain IRC and Telegram
    see plain text. The bitácora keeps it (checked: it must replay to the line)
    and its page plays it back (▶).
  - With the room relay (`VITE_AFPP_ROOMS`, KLAP's chatb relay): the others'
    lines while they type, and a strip of people with voice, video and ascii video.
  - `GET /api/ice`: STUN, and TURN with coturn REST credentials (`TURN_HOST`, `TURN_SECRET`).
  - `deploy.sh realtime <klap checkout>` installs the relay as `afpp-realtime`.
- **◍ live** in the field app: the derive streamed while walked (trace, sounds'
  names, optionally the microphone), opt-in each time.
- **The tracklog**: the globe turns into an animated tracklog when a derive is
  shared or walked live; ▶ tracklog replays the latest.

### Fixed
- The web chat showed nobody else's live lines: it compared the channel name
  case-sensitively (`#AFPP`).
- The nickname form stayed on screen after joining.

---

## [Deriva Sonora 1.0.0] — 2026-10-11 — branch `permasoftware`

### Added
- **Deriva Sonora**, a separate app (`xyz.altred.permasoftware`) with a new 1-bit
  field interface in `src/perma/`: record, derive, your derives, globe. One edition.
- 1-bit dithered launcher icons and splash screens (rings motif, Lugar Común).
- `build_deriva.sh`.

### Fixed
- Android 15 edge-to-edge: the app's bottom controls sat under the system
  navigation bar. The WebView is now padded by the system-bar, cutout and
  keyboard insets, and the bars are black with light icons.
- A derive left running when the app is closed resumes with its trace intact
  (`walkSessionService.resumeTracking`).

### Removed (this branch only)
- SoundWalk's screens, landing page, free/paid flavors, and the map layers
  that cannot be reduced to 1-bit (satellite, topo, colour styles).

## [Unreleased — AFPP branch]

### Added
- **Global map (AFPP)**: a 1-bit line-art globe with blinking dots for shared
  derives, a ~10 km local map with clickable traces and sounds, and the
  **Rings** mixer ported from Radiolibre's Mestizaje. Black / purple / white.
- **Opt-in derive sharing** from the APK: "Share to global map" in the history
  panel and after each derive, with a one-time consent note. Unshare removes the
  track and audio from the server.
- **`server/afpp/`**: dependency-free Node server. Device keys are HMAC-derived
  (no secret in the APK), uploads support Range, an SSE live feed is included,
  and it ships with systemd, nginx and a deploy script.

### Changed
- No landing page: the web opens on the globe, and the APK opens on the recorder.
- Recorder UI is lazy-loaded, so the web listener downloads only the globe.
- PRIVACY.md describes what sharing a derive makes public.

## [2.3.0] — 2026-07-17 — Play Store release

First Google Play release, published as **SoundWalk** (English) / **DerivaSonora**
(Spanish) in free and full editions.

### Added
- **Bilingual UI (ES/EN)** — lightweight in-app translation layer (`src/i18n`);
  device-language auto-detection with a manual toggle on the landing page and in
  the user guide. Stored recording metadata uses language-independent tokens so
  recordings render correctly in either language.
- **Free / paid editions** — `VITE_APP_TIER` build flag + Android product
  flavors. Free edition maps up to 5 recorded sounds with ZIP export/import
  locked behind an upgrade prompt; full edition is unrestricted. `build_free.sh`
  / `build_paid.sh` produce signed AABs with a tier-marker assertion.
- **Field-friendly recorder** — species entry is now large tap-chips (always
  visible); all selects use ≥44px touch targets and 16px text (no focus-zoom);
  filenames auto-generate (`rec_YYYYMMDD_HHMMSS`) so nothing needs typing in the
  field; prominent one-tap Save.
- **PRIVACY.md** and **STORE_LISTING.md** — bilingual privacy policy and Play
  Console listing copy + pre-answered data-safety questionnaire.

### Fixed
- **Idempotent ZIP re-import** — re-importing the same soundwalk no longer
  duplicates the library or the session; identities are derived from the
  package. Self-imports (a drift recorded on this device) restore only missing
  recordings instead of duplicating.
- **Import error surfacing** — recordings that fail to import are reported in the
  modal instead of being silently dropped; duration is normalized so valid takes
  aren't rejected.
- **Import quota vector** — imported GPS tracklogs are Douglas-Peucker-compressed
  (as live capture already was); foreign `audioPath`/inline breadcrumbs are
  stripped to prevent unplayable orphans.
- **Export hardening** — audio entry names sanitized/deduped and matched to
  metadata; `.mp4` extension/mime fallback; native save generates base64
  directly (lower peak memory).
- **Recorder lifecycle** — object-URL and timer leaks fixed; cancelling or
  re-recording while recording now stops capture cleanly.
- **Auth** — an empty (unconfigured) collector password no longer validates; the
  collector option is hidden when no password is set.
- **DetailView** — restored mangled 🔊/📍 glyphs; added null guards.

### Changed
- **Identity** — Play `applicationId` pinned to `com.soundwalk.recorder`
  (`.free` for the free edition); Capacitor appId aligned; version normalized to
  `2.3.0` (`versionCode 20300`); launcher label localized (SoundWalk /
  DerivaSonora). Storage keys and the first-run flag are frozen to avoid data
  loss on update.
- **Permissions** — legacy `WRITE/READ_EXTERNAL_STORAGE` scoped with
  `maxSdkVersion`.

---

## [2.2.0] — 2026-03-31 (pre-release)

### Added
- **DeriveController service** — all automatic walk session lifecycle logic (auto-start, auto-stop, drift guard) consolidated in `src/services/deriveController.js`; `UnifiedMap` is now a thin consumer that calls `feedPosition()` on each GPS tick
- **GPS drift protection for auto-start** — derive no longer starts on a single drifting GPS fix; requires 2 consecutive ticks that each exceed the movement threshold (`max(5m, accuracy × 1.5)`) before a session opens; any non-moving tick resets the counter
- **Derive pill hint** — "toca para finalizar" label below the floating stats pill makes it obvious the pill is tappable; existing Pause/Resume + Guardar Deriva flow is unchanged
- **Soundwalk trail export in audio ZIP** — `exportAllRecordings()` now embeds GPS breadcrumb trails in `sessions/<id>.json` inside the ZIP; each session file contains title, author alias, timestamps, compressed breadcrumb array, and path summary; `export_summary.json` includes `sessionCount` and `totalBreadcrumbs` fields
- **Soundwalk trail import from audio ZIP** — `importAudioExportZip` reads `sessions/*.json` (new format) or reconstructs trails from breadcrumbs embedded in `metadata/*.json` (old format); creates walk sessions in `soundwalk_sessions` with correct IDs so recordings are immediately visible and GPS polylines render on the map
- **Old-format ZIP breadcrumb reconstruction** — ZIPs exported before session-trail support now correctly reconstruct session paths from per-recording embedded breadcrumbs; multiple recordings sharing the same `walkSessionId` have their trails merged into one chronological path; fixes a visibility bug where recordings imported from old ZIPs were filtered off the map because their `walkSessionId` referenced non-existent sessions
- **Validation UI shows trail count** — import modal validation panel now shows breadcrumb count and derive count for both new format (sessions/*.json) and old format (embedded in metadata); e.g. "303 migas de pan (6 derivas)" for the Manakai 2026-02-22 archive

### Fixed
- **ZIP import: recordings deleted on next app launch** — imported recordings were silently removed by `cleanupOrphanedRecordings()` because the metadata still contained the original device's `audioPath` (e.g. `BioMapp/recording-xxx.mp4`); `Filesystem.stat()` on that path fails on any other device, marking the recording as orphaned; fix: `importAudioFiles` now strips `audioPath` from imported metadata before calling `saveRecording`, so the blob is saved to the local filesystem/localStorage and a fresh valid path is written
- **ZIP import: only first recording appears on map** — same root cause as above; the 8 recordings deleted by orphan cleanup were no longer in `allRecordings` so `audioSpots` only contained the one that survived; after the fix all 9 recordings persist and map correctly
- **ZIP import: imported recordings don't play back** — playback tried `getPlayableUrl()` which used the stale `audioPath` from the exporter's device; with the path stripped on import, playback correctly falls through to the locally-saved blob

### Changed
- **Audio file upload** — Plus (+) icon in recorder window allows uploading MP4/M4A/WebM/OGG/WAV files up to 6MB with current GPS location assigned; uploaded files become sound blobs on map with extracted duration metadata
- **Delete recordings** — Trash icon in sound blob popup with confirmation dialog; deletes native audio file, localStorage blob, and metadata while preserving associated breadcrumb/derive data
- **Dynamic spatial audio (Nearby mode)** — Unified 3D audio engine with real-time volume and HRTF-mode panning. Nearby sounds appear in the **Interactive Radar HUD** (corner-mounted) with "Set Theory" aesthetics. Features **manual spatial mixing** via a draggable user dot, allowing you to reposition yourself within the mix. Supported by up to 10 concurrent streams with proximity-based quadratic volume rolloff.
- **Proximity-based volume curve (50m range)** — Exponential decay optimized for Cercanos 50m radius: full volume at ≤5m, drops to ~37% at 25m, ~10% at 50m edge; makes distance clearly audible even with multiple concurrent sounds
- **Performance limits for concurrent audio** — Max 6 simultaneous audio streams in Cercanos mode, prioritizing closest sounds; prevents audio overload on medium-range Android devices
- **Animated playing markers in Cercanos** — Sound blobs currently playing nearby pulse with green glow and scale animation (1.0 → 1.15); provides visual feedback for active spatial audio sources
- **Timeline markers during recording** — Tap the pin button while recording to bookmark important moments (bird call, interesting sound). Each marker saves the offset timestamp + GPS position. Markers appear as point labels in Audacity exports and as selection rows in Raven Pro tables, enabling precise navigation to field moments
- **GPS drift mitigation for auto-derive** — Ignores GPS positions with accuracy >30m, uses dynamic threshold max(5m, accuracy × 1.5) for movement detection, only advances anchor position on real movement (prevents false triggers from GPS drift)
- **Bioacoustic standard format exports** — Raven Pro selection tables (.txt), Audacity labels (.txt), GPX waypoints for QGIS/ArcGIS; enables interoperability with established analysis tools
- **Animated breadcrumbs as default** — live trail draws itself progressively; mode no longer resets to heatmap on derive start
- **GPS-tracklog style for past derives** — completed session tracks rendered as audio-level-colored lines (green=moving, red=high audio, gray=stationary) instead of a dashed single-color polyline
- **Zoom-scaled sound blob markers** — duration circles shrink logarithmically as you zoom out (`Math.pow(2, zoom-19)`), minimum 25% size, preventing overlap at low zoom levels
- **Pulsing user location icon** — ultrared.png human figure with CSS `user-loc-pulse` ring animation replaces default Leaflet marker+circle
- **Smart default session visibility** — on load, picks the most relevant derive (most recordings, then most recent as tiebreaker) instead of showing all or none
- **Audio ZIP import (`export_summary.json` format)** — importer now detects and handles audio-only exports (no tracklog required); pre-scans all `metadata/*.json` files to build filename→metadata lookup map
- **Session layer auto-enable after import** — after importing an audio ZIP, `walkSessionIds` referenced by the imported recordings are added to `visibleSessionIds` automatically
- **Auto-fit map after import** — `mapInstance.fitBounds()` is called after import completes so all imported recordings are visible on-screen; recordings from sessions recorded in different areas of the reserve (e.g. morning vs afternoon derives 3.5km apart) no longer require manual panning to find
- **Stacked blob grouping** — recordings within 15m of each other are now grouped under one marker with a green count badge (×N) and combined total duration; clicking opens a popup listing all recordings with individual Reproducir buttons; previously only the topmost marker was visible and all others were silently hidden behind it
- **`audio/mp4` recording preference** — MediaRecorder now prefers `audio/mp4` first for cross-platform compatibility (Safari/iOS ZIP playback without transcoding)

### Fixed
- **Spatial audio stale closure bug** — Dynamic updates now use `userLocationRef` and `isMutedRef` to avoid capturing stale state; volume/panning recalculated with current GPS position every 200ms (was broken: used initial position only)
- **Cercanos loading modal blocking UI** — "Cargando audio..." modal now hides immediately after setup instead of waiting for all 6 audio files to download; audio loads in background, sounds start playing instantly
- **Storage quota exceeded on recordings >5MB** — Native platforms now always use Capacitor Filesystem (no localStorage quota). On web, removed artificial limits and raised sanity check to 50MB. Large recordings (5-min at standard quality) now save successfully.
- **Derive pill "Fin" button confusion** — Removed non-functional red Square icon and "Fin" text from derive counter pill; only the counter itself remains (tapping opens "Finalizar Deriva Sonora" modal)
- **Breadcrumb stale trail on relaunch** — added mount-time cleanup that clears breadcrumbs if no active session; prevents straight line from last session end to current GPS position
- **Tile layer blank at zoom 19** — added `maxNativeZoom` per provider (OSM=19, Stadia/Esri=18, OpenTopoMap=17) and `maxZoom={20}` on MapContainer; prevents requesting non-existent tile zoom levels
- **Export "NO AUDIO DATA" for some recordings** — atomic save order: blob is saved first, metadata only persisted on success; `saveRecording` now awaited in walk recording handler
- **ZIP import: "Missing required file tracklog/tracklog.json"** — format detection now checks for `export_summary.json` before falling to legacy tracklog validation
- **ZIP import: 0 markers after "7 recordings imported"** — fixed undefined `recordingId` variable (renamed to `filenameNoExt`); metadata lookup now matches by `meta.filename` → `meta.uniqueId` → filename-no-ext chain
- **Import: recordings with no GPS location no longer counted** — skipped with warning instead of failing silently inside `saveRecording`; recordings with `duration=0` get 1s minimum to pass validation
- **Derive tracking GPS watch conflict** — `breadcrumbService` is now a passive consumer via `feedPosition()`; only UnifiedMap owns the GPS watch (eliminates double-watch singleton bug)
- **`isTracking` used as function** — corrected to `isTrackingActive()` method call; removed spurious `startTracking()` calls on every GPS tick
- **`showBreadcrumbs` toggle destroying breadcrumb data** — tracking lifecycle decoupled from visibility toggle; `stopTracking()` no longer called on visibility change

### Changed
- **Cercanos mode range reduced to 50m** — was 100m; tighter radius makes spatial audio more coherent and focused
- **Cercanos shows all sounds in range** — removed `visibleSessionIds` filter; sounds appear if within 50m regardless of derive layer toggle state
- **Vertical stratum field reinterpreted** — changed from "microphone position" to "sound source origin"; labels now include context (e.g., "Suelo (<2m) — anfibios, insectos"); default value "No identificado" instead of required selection
- **Past session tracklines simplified** — Ramer-Douglas-Peucker decimation reduces breadcrumb count by 60-80% while preserving track shape and high-audio points; improves rendering performance
- **UI color scheme refinement** — top bar changed to cool gray rgba(240,242,245,0.68); breadcrumb mode buttons now monochrome grays (#5a5a6a, #6a6a7a, #7a7a8a); FABs increased transparency (0.82→0.65) with stronger blur (8px→12px)
- **Heatmap circle radius reduced** — `max(2, 8 * intensity)` metres (was `max(5, 20 * intensity)`)
- **iPhone 7 Plus / Safari UI compacted** — `bottomButtonStyle` padding 12→8px, font 14→12px, gap 12→8px; top bar height 40→36px; mic button padding 7→5px, icon 20→18px
- **Export MIME type** — extension derived from mimeType: `.mp4` default (was `.webm`)
- **Pre-export orphan cleanup** — `cleanupOrphanedRecordings()` runs before generating ZIP to avoid exporting metadata-only entries

---

## [2.1.0] — 2026-02-14

### Added
- **Derive Sonora v2.1 interop protocol** — structured ZIP packages with `manifest.json`, `session/`, `audio/`, `metadata/` layout; versioned schema for cross-device sharing
- **Import/Export modal** — unified UI for importing derive ZIPs (GeoJSON, GPX, legacy ZIP) and exporting per-session Deriva Sonora packages
- **Android file picker fix** — native file picker for ZIP import on Android via Capacitor Filesystem
- **Web geolocation fallback** — `navigator.geolocation` used when Capacitor GPS unavailable (Safari/browser)
- **Web audio recording** — MediaRecorder fallback path for browser environments

### Fixed
- **Safari/browser derive ZIP import** — format detection and path handling corrected for web context
- **Compact modals for iPhone 7 Plus** — modal height, font sizes, and button layout adjusted for 375px viewport
- **Web save fallback** — localStorage blob storage path for web builds

---

## [2.0.0] — 2026-02-10

### Added
- **Auto-derive** — walk session auto-starts when user moves >5m from initial position, auto-stops after 10 min inactivity
- **Always-on breadcrumb trail** — visible in all modes including animated
- **8 playback modes** — Nearby, Aleatorio, Concatenado, Jamm, Alba, Crepúsculo, Drone, Silencio
- **Per-derive colored polylines** — each session gets a unique color via golden-angle hue spacing
- **Auto-zoom** — map zoom adjusts logarithmically as you walk (z19 start, zooms out with distance); manual pinch overrides until GPS recenter
- **Solar bridge (Alba / Crepúsculo)** — independent dawn/dusk playback modes using sunrise/sunset times
- **Bioacoustic metadata schema** — species tags, habitat, behavior, distance, weather fields on recordings
- **5-minute recording timer** — auto-stops recording after 5 min
- **Mode-aware player count** — nearby species density indicator

### Fixed
- **Alba/Crepúsculo split** — previously shared state, now fully independent modes
- **5-min recording timer reset** — timer correctly resets on new recording start

---

## [1.x] — Pre-2026

Initial field-testing builds. GPS recording, basic map display, single playback mode.

---

## Roadmap — Planned Features

### Near-term (1-2 months)
- **Acoustic indices (ACI, ADI, H')** — automated on-device calculation of Acoustic Complexity Index, Acoustic Diversity Index, and Shannon Entropy for quantitative biodiversity assessment
  - Web Audio API FFT analysis for spectral processing
  - Per-recording index scores stored in metadata
  - Enables comparative analysis without manual listening
  - ~1-2 weeks development + scientific validation with biologists

### Medium-term (3-6 months)
- **Community species labeling system** — offline collaborative tagging interface to build training dataset for future ML models
  - User-contributed species identifications with confidence levels
  - Export to standard ML training formats (CSV + audio segments)
  - Builds foundation for regional acoustic models

### Long-term (6+ months)
- **On-device species detection** — lightweight ML inference for Neotropical dry forest taxa
  - Requires: curated dataset of 1000+ validated recordings per species
  - Collaboration with bioacoustic researchers needed
  - Note: BirdNET/Perch models are biased toward Northern Hemisphere species

- **Multi-device sync for spatial arrays** — coordinated simultaneous recording from multiple smartphones
  - GPS time sync + BLE/WiFi Direct discovery
  - Use case: measure sound propagation, spatial correlation analysis
  - Lower priority: limited field use cases vs. complexity

### Deferred / Not Planned
- ❌ **Real-time species alerts** — battery drain prohibitive for field use
- ❌ **Cloud ML processing** — conflicts with offline-first, community-owned data philosophy
