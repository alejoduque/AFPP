# Google Play Store Listing — SoundWalk / DerivaSonora

Reference copy for the four listings (Paid / Free × English / Spanish) built
from this codebase, plus pre-answered Play Console questionnaires. Character
limits: **title ≤ 30**, **short description ≤ 80**, **full description ≤ 4000**.

The Spanish store-listing localization uses the **DerivaSonora** brand in its
text; the app's launcher name is already localized (`SoundWalk` default,
`DerivaSonora` on Spanish devices).

---

## App identities

| Listing | applicationId | Launcher name (EN / ES) | Build command |
|---|---|---|---|
| Paid | `com.soundwalk.recorder` | SoundWalk / DerivaSonora | `./build_paid.sh` |
| Free | `com.soundwalk.recorder.free` | SoundWalk Free / DerivaSonora Free | `./build_free.sh` |

Both are signed with the same `release.keystore`. **Enroll both in Play App
Signing at first upload and back the keystore up off-machine — losing it means
losing the ability to update either app.**

---

## PAID — English

**Title:** `SoundWalk — Sound Maps`

**Short description:**
`Record, map and listen to the sounds of your territory. A soundwalk instrument.`

**Full description:**

SoundWalk turns a walk into an instrument. Record geotagged sounds, trace your
path as a living GPS track, and listen back to your territory through nine
playback modes that range from rigorous bioacoustic science to sound art.

SoundWalk is built as part of doctoral research in artistic creation. It is two
things at once: a soundwalking and listening instrument for artists and
researchers, and a hands-on tool for young people in their own communities to
become active in conservation through bioacoustics — mapping the birds, insects,
water and voices of the places they live.

WHAT YOU CAN DO
• Record geotagged audio with rich, tap-fast bioacoustic metadata (habitat,
  sound stratum, distance, activity, species) — designed for the field, almost
  no typing.
• Walk a "sound drift" (deriva) that auto-tracks your GPS path.
• Listen in nine modes: Nearby (3D spatial audio with an interactive radar),
  Clock (same time of day), Dawn & Dusk (solar bridges across places), Strata
  (ecological layers), Chronological, Jamm, Migratory and Spectrum.
• Export and import complete soundwalks as ZIP packages, and export to
  bioacoustic standards: Raven Pro selection tables, Audacity labels, and GPX
  waypoints for QGIS/ArcGIS.
• Full offline operation — no account, no server, no ads, no tracking.

PRIVACY
Everything you record stays on your device. SoundWalk has no server and collects
no personal data. Full privacy policy: [YOUR-PRIVACY-URL]

Languages: English and Spanish (auto-detected, switchable in-app).

---

## PAID — Spanish (DerivaSonora)

**Título:** `DerivaSonora — Mapas sonoros`

**Descripción corta:**
`Graba, mapea y escucha los sonidos de tu territorio. Un instrumento de deriva.`

**Descripción completa:**

DerivaSonora convierte una caminata en un instrumento. Graba sonidos
geolocalizados, traza tu recorrido como un tracklog GPS vivo y vuelve a escuchar
tu territorio a través de nueve modos de reproducción que van desde la
bioacústica rigurosa hasta el arte sonoro.

DerivaSonora se construye como parte de una investigación-creación doctoral. Es
dos cosas a la vez: un instrumento de caminata sonora y escucha para artistas e
investigadores, y una herramienta práctica para que jóvenes de comunidades
marginadas se vuelvan activos en la conservación de sus territorios a través de
la bioacústica — mapeando las aves, los insectos, el agua y las voces de los
lugares donde viven.

QUÉ PUEDES HACER
• Grabar audio geolocalizado con metadatos bioacústicos ricos y rápidos de
  marcar (hábitat, estrato del sonido, distancia, actividad, especies) —
  pensados para el campo, casi sin escribir.
• Caminar una "deriva sonora" que rastrea automáticamente tu recorrido GPS.
• Escuchar en nueve modos: Cercanos (audio espacial 3D con radar interactivo),
  Reloj (misma hora del día), Alba y Crepúsculo (puentes solares entre lugares),
  Estratos (capas ecológicas), Cronológico, Jamm, Migratoria y Espectro.
• Exportar e importar derivas completas como paquetes ZIP, y exportar a
  estándares bioacústicos: tablas de selección Raven Pro, etiquetas de Audacity
  y waypoints GPX para QGIS/ArcGIS.
• Funcionamiento totalmente sin conexión — sin cuenta, sin servidor, sin
  publicidad, sin rastreo.

PRIVACIDAD
Todo lo que grabas permanece en tu dispositivo. DerivaSonora no tiene servidor y
no recopila datos personales. Política de privacidad: [YOUR-PRIVACY-URL]

Idiomas: español e inglés (detección automática, cambiable en la app).

---

## FREE — English

**Title:** `SoundWalk Free`

**Short description:**
`Map up to 5 sounds of your territory. A soundwalk & bioacoustics instrument.`

**Full description:**

The free edition of SoundWalk — a soundwalking instrument and a bioacoustics
tool for young people mapping the nature of their own communities.

Record geotagged sounds, walk a GPS-tracked "sound drift", annotate what you
hear with fast tap-based bioacoustic metadata, and listen back through nine
playback modes, from 3D spatial audio to solar-time "dawn and dusk" bridges
across places.

The free edition lets you map up to 5 recorded sounds — enough to try every
feature and run a first community mapping session. The full version unlocks
unlimited sounds and ZIP export/import for sharing complete soundwalks and
exporting to bioacoustic standards (Raven, Audacity, GPX).

Everything stays on your device. No account, no server, no ads, no tracking.

Full privacy policy: [YOUR-PRIVACY-URL]

Languages: English and Spanish (auto-detected, switchable in-app).

_(Play policy note: describe the free edition as a "limited edition", never as a
"trial" or "demo".)_

---

## FREE — Spanish (DerivaSonora Free)

**Título:** `DerivaSonora Free`

**Descripción corta:**
`Mapea hasta 5 sonidos de tu territorio. Instrumento de deriva y bioacústica.`

**Descripción completa:**

La edición gratuita de DerivaSonora — un instrumento de caminata sonora y una
herramienta de bioacústica para que jóvenes mapeen la naturaleza de sus propias
comunidades.

Graba sonidos geolocalizados, camina una "deriva sonora" rastreada por GPS,
anota lo que escuchas con metadatos bioacústicos rápidos de marcar y vuelve a
escuchar a través de nueve modos de reproducción, desde audio espacial 3D hasta
puentes de "alba y crepúsculo" que conectan lugares por su hora solar.

La edición gratuita permite mapear hasta 5 sonidos grabados — suficiente para
probar todas las funciones y hacer una primera jornada comunitaria de mapeo. La
versión completa desbloquea sonidos ilimitados y exportación/importación ZIP
para compartir derivas completas y exportar a estándares bioacústicos (Raven,
Audacity, GPX).

Todo permanece en tu dispositivo. Sin cuenta, sin servidor, sin publicidad, sin
rastreo.

Política de privacidad: [YOUR-PRIVACY-URL]

Idiomas: español e inglés (detección automática, cambiable en la app).

_(Nota de política de Play: describe la edición gratuita como "edición
limitada", nunca como "prueba" o "demo".)_

---

## Data safety questionnaire (both listings)

Pre-computed answers for the Play Console **Data safety** form. Verified against
the code: no network calls to any developer endpoint; the only outbound traffic
is OSM/tile-provider map requests.

- **Does your app collect or share any of the required user data types?** No.
  (Audio and location are processed on-device to create recordings and map
  tracks; they are stored locally and never transmitted to the developer or a
  backend.)
- **Location** — Accessed for app functionality (geotagging, on-map track).
  Not collected (not sent off device), not shared. Processed ephemerally /
  stored only on the device.
- **Audio** — Recorded by the user, stored on device only. Not collected in the
  Play sense (not transmitted), not shared.
- **Is all user data encrypted in transit?** Not applicable — no user data is
  transmitted. (Map-tile requests are standard HTTPS.)
- **Do you provide a way for users to request data deletion?** Yes — in-app
  delete (per recording / per session) and uninstall remove all data.
- **Advertising / analytics SDKs:** none.

Note for the ZIP-export feature (paid): this is user-initiated sharing, not
collection by the app — it does not change the answers above.

## Content rating

- Questionnaire answers: no violence, no sexual content, no profanity, no
  user-to-user communication, no purchases of virtual goods inside the app.
- Expected rating: **Everyone / PEGI 3**.

## Category & tags

- Category: **Education** (alternative: Music & Audio).
- Tags: field recording, bioacoustics, soundscape, citizen science,
  conservation, soundwalk.

## Store assets checklist (produced manually, not in this repo)

- [ ] App icon 512×512 (32-bit PNG).
- [ ] Feature graphic 1024×500.
- [ ] Phone screenshots ≥ 2 each for EN and ES (landing, map with markers,
      recorder with species chips, player with modes, radar HUD).
- [ ] Optional: short promo video.
- [ ] Privacy policy hosted at a public URL, then replace [YOUR-PRIVACY-URL]
      above. The site in docs/ is a portable static folder — host it on any
      static host (Netlify Drop, Cloudflare/Codeberg Pages, GitHub Pages for a
      public repo, or your own etc.altred.xyz web space) and use the resulting
      privacy.html URL. See docs/publish-guide.html → Part 0.
