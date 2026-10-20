# SoundWalk / DerivaSonora — UI/UX Reference

Visual and interaction reference for the SoundWalk map screen (`UnifiedMap`).

---

## Screen Elements

| Element | Type | Position | Visible when | Description |
|---|---|---|---|---|
| **Status bar gradient** | Fixed overlay | Top, full width | Always | Dark-to-transparent gradient so system clock/battery icons stay readable over the map tiles |
| **MapContainer** | Full-screen canvas | Background | Always | Leaflet map, zoom 19–20, no built-in zoom or attribution controls |
| **Tile layers** ×7 | Map layer | Behind all UI | `currentLayer` matches | OpenStreetMap, OpenTopoMap, CartoDB, OSM Humanitarian, Stadia Satellite, Esri World Imagery, CyclOSM — only the active one is opaque; all others `opacity: 0` |
| **User location marker** | Map marker | GPS coordinates | GPS active | Pulsing ultrared.png human figure with animated ring (`user-loc-pulse`) |
| **Sound blob markers** | Map markers | Each recording's GPS coords | Always (valid coords + duration > 0) | Duration circles that scale with recording length and current zoom level. Color: blue <30s, green 30–60s, red >60s. Tap opens Popup |
| **Marker Popup** | Map popup | Floats above tapped blob | On tap | Shows recording filename, duration, timestamp, species tags, notes. Triggers `handleMarkerClick` |
| **Live breadcrumb trail** | Map overlay | GPS path currently walked | `currentBreadcrumbs.length > 0` | `BreadcrumbVisualization` — modes: `animated` (default, draws progressively), `line` (instant colored line), `heatmap` (audio-intensity circles), `markers` (dot per crumb) |
| **Past derive tracklines** | Map overlay | Each completed session's GPS path | Session in `visibleSessionIds` + ≥2 breadcrumbs | `BreadcrumbVisualization` in `line` mode with `lineColor='auto'` — each segment colored by movement state and audio level (green=moving, red=high audio, gray=stationary) |

---

## Fixed UI — Top Area

| Element | Type | Position | Visible when | Description |
|---|---|---|---|---|
| **Top bar** | Fixed panel | Top, below safe-area inset | Always | Glass-morphism bar (`rgba(220,225,235,0.78)`, `blur(12px)`, purple shadow). Contains: back button, GPS recenter, breadcrumb mode toggle, search field, zoom ±, layer selector, info/import button, derive status pill |
| **Back button** | Icon button | Top-bar left | Always | Returns to landing screen |
| **GPS recenter** | Icon button | Top-bar | Always | Flies map back to user location at auto-computed zoom |
| **Breadcrumb toggle** | Cycle button | Bottom control bar | Always | Cycles through visualization modes: Línea → Calor → Anim. Active mode shown with colored background |
| **Layer selector** | Dropdown button | Top-bar | Always | Opens tile-layer picker dropdown (glass panel). Active layer highlighted in green |
| **Info / ⓘ button** | Circle button | Top-bar right | Always | Opens the large info/Capas/Import-Export modal |

---

## Fixed UI — Bottom Area

| Element | Type | Position | Visible when | Description |
|---|---|---|---|---|
| **Bottom control bar** | Fixed panel | `bottom: max(safe-area, 80px)`, centered | Always | Glass pill row containing: breadcrumb mode toggle, playback mode chips, history button |
| **Record FAB** | Round button 52px | `bottom: 130px`, `left: calc(50% - 80px)` | AudioRecorder not open | Semi-transparent red mic button (`rgba(194,74,110,0.82)`, blur). Starts derive if none active; opens AudioRecorder modal |
| **Play FAB** | Round button 52px | `bottom: 130px`, `left: calc(50% + 28px)` | Player panel collapsed | Semi-transparent green play button (`rgba(157,192,76,0.82)`, blur). Opens the expanded player panel |
| **Derive stats pill** | Tap target | `bottom: 138px`, centered | Active derive session | Shows elapsed time, distance walked, recording count, "Fin" button. Tap opens End Derive confirmation. Dims when paused |

---

## Modals and Panels

| Element | Type | Position | Visible when | Description |
|---|---|---|---|---|
| **Expanded player panel** | Draggable floating card | `bottom: 120px`, centered | `playerExpanded = true` | Glass-morphism (`rgba(220,225,235,0.78)`). Draggable by handle. Contains: title + recording count; 9 playback mode chips; active track timeline(s) with `TracklistItem` progress bars + playhead dot; ▶ Play / ■ Stop / 🔇 Mute; volume slider; proximity-volume toggle |
| **Info / Capas / Import-Export modal** | Centered modal | Screen center | ⓘ button pressed | Glass panel (`rgba(220,225,235,0.78)`, `blur(16px)`). Tabs/sections: Capas de Derivas (session visibility toggles + per-session export), Import/Export (ZIP import, export all recordings), playback mode info, bioacoustic metadata guide |
| **End Derive confirmation** | Floating card | `bottom: 120px`, centered | Derive pill tapped | Glass panel. Shows session stats (time, distance, recordings). Buttons: Pause/Resume, Finalizar (name + save), Cancelar |
| **AudioRecorder modal** | Bottom sheet | Full width, bottom | `isAudioRecorderVisible = true` | 5-minute recording modal with bioacoustic metadata fields: species tags, notes, habitat, distance, behavior. Save / Cancel |
| **SessionHistoryPanel** | Side panel | Overlays map | "Historial" button in bottom bar | Lists all completed derives with color swatch, recording count, date. Per-session: toggle map visibility, center map, launch playback |
| **AliasPrompt** | Centered modal | Screen center | First launch (no alias set) | One-time prompt for user alias/name |
| **Loading overlay** | Full-screen dim | Over everything | `isLoading = true` | Semi-transparent black + spinning circle + "Cargando audio…" during audio blob fetch |
| **Alert dialogs** | Custom modal | Screen center | Various error/empty conditions | Native-styled (not browser `alert()`). Used for GPS errors, empty-mode warnings (no recordings in window), etc. |
| **DetailView** | Side panel | Anchored to selected point | `selectedPoint` set | Shows detail for search-result map points with next/prev navigation |

---

## Playback Modes

### Bioacústica

| Mode | Icon | Logic |
|---|---|---|
| **Cercanos** | 📍 | Spots within 100m — spatial stereo pan by GPS bearing, volume by distance |
| **Reloj** | 🕐 | Recordings made within ±15/30/60 min of the current time-of-day |
| **Alba** | 🌅 | Recordings captured during dawn hours at their recording coordinates |
| **Crepúsculo** | 🌇 | Recordings captured during dusk hours at their recording coordinates |
| **Estratos** | 🌿 | Sorted by estimated frequency (duration used as proxy), playing ecoacoustic strata in sequence |

### Arte Sonoro

| Mode | Icon | Logic |
|---|---|---|
| **Cronológico** | 📅 | Sequential playback in recording timestamp order |
| **Jamm** | 🎛️ | All visible tracks simultaneously, each with independent stereo L↔R panning animation |
| **Migratoria** | 🦋 | Walk-order playback from a single visible derive session |
| **Espectro** | 🌈 | Sorted by spectral content estimate |

---

## Visual Language

| Token | Value | Used for |
|---|---|---|
| Primary purple | `#4e4e86` | Active states, player, breadcrumb line mode |
| Field green | `#9dc04cd4` | Play FAB, animated mode, recording count |
| Dusk red | `#c24a6e` | Record FAB, heatmap mode, >60s blobs |
| Warm amber | `#F59E0B` | Paused state, audio-level mid segments |
| Glass background | `rgba(220,225,235,0.78)` | All panels: top bar, player, modals |
| Glass shadow | `rgba(78,78,134,0.25) 0px 10px 30px` | All panels |
| Glass blur | `blur(12–16px)` | All panels |

---

## UX Suggestions & Roadmap

Ideas surfaced while preparing the Play Store release. Not yet built — recorded
here so they don't get lost.

### High value, low effort
- **Rename a recording later** — the recorder no longer has a filename field
  (names auto-generate for speed in the field). Add an inline rename in
  `DetailView` so a recording can be titled back at camp, without slowing capture.
- **First-run onboarding** — a 3–4 card walkthrough (record → walk a drift →
  listen nearby → export) the first time the map opens. Especially valuable for
  the youth-conservation use case where users are new to the concepts.
- **Weather/temperature as tap-chips** — mirror the species-chip treatment for
  the remaining "More details" selects, so the whole form is tappable with no
  dropdowns.

### Medium
- **Collector-mode differentiation** — the password-gated "collector" mode
  currently renders identically to soundwalk mode (`App.jsx` passes both to the
  same component without a `mode` prop). Either give collector mode a distinct
  UI/capability or retire it before release to avoid a dead door.
- **Streaming ZIP export** — export still builds the whole archive in memory
  (JSZip limitation). For very long soundwalks (>150 MB of audio) this risks OOM
  on low-end Android. A chunked/streaming writer, or a per-session size warning
  before export, would harden it.
- **Import "N updated" summary** — the importer is now idempotent; surface a
  clear "N recordings updated / M added" line so re-import behaviour is obvious
  to the user.

### Housekeeping
- **Drop MUI** — `@mui/material` (+ emotion) is imported only by
  `SharedTopBar.jsx` (one `Input`). Replacing it with a plain styled input
  removes a large dependency and shrinks the bundle.
- **Purge the 8.2 MB sample ZIP from git history** — `_archive/Manakai_recordings_2026-02-22.zip`
  was committed on the `apk-en` line and bloats every clone. Consider a history
  rewrite (or at least stop shipping it) once the release is cut.
- **Reconcile brand names in code** — user-facing UI now says SoundWalk/
  DerivaSonora consistently; internal identifiers still mix `BioMapp`/`biomap`
  (repo, namespace, storage-key prefixes). Storage keys must stay frozen (rename
  = data wipe on update), but comments/docs can converge.
