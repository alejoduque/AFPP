#!/usr/bin/env python3
"""
Writes the how-to pages, one per language, from one template:

    public/howto/index.html   English (the default)
    public/howto/de/index.html  Deutsch
    public/howto/fr/index.html  Français
    public/howto/es/index.html  Español

    python3 tools/make_howto.py

Text lives in TEXT below; markup in PAGE. {k:…} marks a key/button, {l:…} a
lit (white) word, {r:…} a link to the app, {a:…} to the bitácora (or the
APK when it names it), {p:…} to the permasoftware assembly. Links to the
site are relative, so the pages work under any base path.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'howto')
LANGS = ['en', 'de', 'fr', 'es']
NAMES = {'en': 'English', 'de': 'Deutsch', 'fr': 'Français', 'es': 'Español'}

TEXT = {
 'en': dict(
  title='How to use Deriva Sonora',
  nav_globe='open',
  nav_apk='Android app ↓',
  nav_bit='bitácora',
  h1='How to use<br>Deriva Sonora',
  alt='Alpine Feminist Punk Parade: hand-lettered title over a drawing of an alpine village, a parade down the mountain road, and a long table of food.',
  intro='Walkers anywhere record the sounds of their {l:derives} (aimless walks) and, if they choose, share them, even live as they walk. Here they are heard and talked about: a {l:planet} with a dot wherever someone shared a derive, the {l:street map} of each place, the {l:rings} to mix distant sounds, and {l:#AFPP}, the chat. It is one app, the same in a browser and on an Android phone. A project of the {l:Alpine Feminist Punk Parade}. Three tones only: black, purple, and white for whatever is active or sounding.',
  open='Open Deriva Sonora',
  get='Download the Android app (free)',
  h_stage='The planet and the map',
  h_globe='The planet',
  globe=['Each {l:blinking dot} is a shared derive: the more recent, the faster it blinks; {l:white} if it is from the last hour or was just shared.',
         '{k:drag} to turn it. The mouse wheel or a pinch zooms; while the pointer is over the planet it stops spinning, so you can catch a dot.',
         'Hover a dot to see who and how many sounds; {k:click} it to fly there.',
         'Keep zooming in and the planet {l:dives into the street map} at the place you are pointing at. Zoom the map far out and the planet comes back.'],
  h_track='The tracklog',
  track=['When someone shares a derive, or walks one {l:live}, the planet turns into a {l:tracklog}: it flies down to the walk and plays it in time, the walked path in purple, its last steps in white, each sound a ring that lights up when the walker reaches it.',
         '{k:♪ listen} plays each sound as it is reached. {k:◯ planet} (or {k:Esc}) goes back; {k:▶ tracklog} replays the latest walks.',
         'A live walk is followed as it happens. If you are on the street map, a line offers to {k:watch} instead of taking you away.'],
  h_map='The street map',
  map=['Purple line art of the place. {l:Traces} are walks, {l:squares} their sounds. Tap a trace to list its sounds, a square to hear it.',
       '{k:▶} listens; {k:→ rings} sends it to the mix. Your own derives and sounds are there too, and anyone walking live right now is a {l:dashed white} line with a blinking walker.',
       '{k:◯ planet} in the bar goes back up. {k:⌖} follows you again if you moved the map.',
       'Every place has its own address (e.g. {l:…/AlpineFeministPunkParade/#46.5000,8.5000}): copy it to share that map.'],
  h_rings='The rings',
  rings=['Open {k:◎ rings}. The sounds you sent wait on the edge: {l:drag them inside} the circle to hear them.',
         'Closer to the centre is louder; left or right pans. Drop one outside and it waits again.',
         'Sounds from far-apart places can play together: that is the point. Each one loops.',
         'Keyboard: {k:Tab} to a sound, arrows to move it, {k:Enter} in or out, {k:Delete} to remove. Your mix is kept on this device.'],
  h_walk='Walk and record',
  h_bar='The bar',
  bar=['At the bottom, always: {k:⌖ here} (or {k:◯ planet} on the map) · {k:● RECORD} · {k:▶ START DERIVE} · {k:≡ derives}.',
       'In a browser nothing asks for your location or a name until you use one of them. The first time you record or start a derive you choose an {l:alias}: it signs your derives. If you share one it is public, so it need not be your name; you can stay anonymous.'],
  h_rec='Derive and record',
  rec=['Allow {l:location} (to draw your walk) and the {l:microphone} (to record). The map flies to you; the GPS accuracy shows at the top ({l:⌖ ±6 m}): a sound needs a place.',
       '{k:● RECORD} opens the mic; tap it again ({k:■}) to stop (5 minutes at most). Recording starts a derive if none is running.',
       'When you stop, name it if you like (what do you hear?) and add notes, then {k:Keep} or {k:Discard}.',
       'Walk: your trace draws in {l:white}; you are the blinking square.',
       '{k:■ END DERIVE} and give it a name. If the app closed mid-walk, the derive resumes where it was.'],
  h_live='Walk live',
  live=['During a derive, {k:◍ live} streams it as you walk: everyone on the site sees your path (to about a metre) and the names of your sounds, and the planet turns into your tracklog.',
        'Optionally {l:your microphone too}: the people in #AFPP hear what you hear, while you walk.',
        'It asks each time. Nothing is kept: when the derive ends the live walk is gone, unless you share it.'],
  h_share='Share',
  share=['After a derive with sounds the app offers to {l:share it to the global map}; or later, from {k:≡ derives}.',
         'The first time it explains what becomes public: your alias, the title and times, the trace (rounded to about a metre), the sounds with their names and notes. The bitácora notes that you shared it.',
         'Within seconds it is a white dot on the planet, and the planet plays it as a tracklog for whoever is looking.',
         '{k:On the global map} → {k:Yes} removes it from the server (trace and sounds), and from the bitácora. Deleting a derive removes it too.',
         'Offline, everything stays on the device; share when there is a network.'],
  h_install='The Android app',
  install=['Download {a:deriva-sonora.apk} on the phone and open it.',
           'Android asks to {l:allow installing apps from this source} (the browser or file manager): allow it for this install.',
           'The app is called {l:Deriva Sonora}. It opens on the planet and flies to you once the GPS has a fix; it never uses location in the background.',
           '{l:No Android?} The same app works in the browser: {r:altred.xyz/AlpineFeministPunkParade} in Safari or Chrome on a Mac, an iPhone or any computer. On a Mac, Location Services must be on for the browser (System Settings → Privacy & Security); on an iPhone, keep the screen on while walking. Sounds stay in that browser until you share the derive.'],
  h_chat='The chat, #AFPP',
  chat=['Beside the map (below it on a phone) is {l:#AFPP}, the chat of the Alpine Feminist Punk Parade, bridged with its Telegram group. Pick a nickname and {k:Join}. {k:/nick} renames you, {k:/me} describes an action; tap its title to fold it away.',
        'Lines are {l:typed out again} at the pace they were written, hesitations and corrections included, and you see the others writing as they write ({l:> ana writes ::}).',
        '{k:voice · camera} opens your microphone or camera to the people in the chat. {k:ascii} sends your camera as text only: the image never leaves your device.',
        'Everything said in #AFPP, and every shared derive, is kept in the public {a:bitácora}, where lines can be played back as they were typed.'],
  note='What you do not share never leaves your device. No accounts, ads or analytics. A shared derive can always be removed.',
  foot='Alpine Feminist Punk Parade · Deriva Sonora · {p:permasoftware}, 1-bit · typeface Lugar Común (SIL OFL) · map © OpenStreetMap',
 ),
 'de': dict(
  title='Deriva Sonora: Anleitung',
  nav_globe='öffnen',
  nav_apk='Android-App ↓',
  nav_bit='Bitácora',
  h1='So funktioniert<br>Deriva Sonora',
  alt='Alpine Feminist Punk Parade: handgeschriebener Titel über einer Zeichnung eines Alpendorfs, einer Parade auf der Bergstraße und einer langen Tafel mit Essen.',
  intro='Überall nehmen Gehende die Klänge ihrer {l:Dérives} (zielloser Spaziergänge) auf und teilen sie, wenn sie möchten, sogar live beim Gehen. Hier hört man sie und spricht darüber: ein {l:Planet} mit einem Punkt, wo jemand eine Dérive geteilt hat, die {l:Straßenkarte} jedes Ortes, die {l:Ringe}, um ferne Klänge zu mischen, und {l:#AFPP}, der Chat. Es ist eine App, im Browser und auf einem Android-Telefon gleich. Ein Projekt der {l:Alpine Feminist Punk Parade}. Nur drei Töne: Schwarz, Lila, und Weiß für das, was aktiv ist oder klingt.',
  open='Deriva Sonora öffnen',
  get='Android-App herunterladen (kostenlos)',
  h_stage='Der Planet und die Karte',
  h_globe='Der Planet',
  globe=['Jeder {l:blinkende Punkt} ist eine geteilte Dérive: je neuer, desto schneller blinkt er; {l:weiß}, wenn sie aus der letzten Stunde ist oder gerade geteilt wurde.',
         '{k:Ziehen} dreht ihn. Mausrad oder zwei Finger zoomen; solange der Zeiger über dem Planeten ist, hält er an, damit du einen Punkt erwischst.',
         'Über einen Punkt fahren zeigt, wer und wie viele Klänge; {k:Klick} fliegt hin.',
         'Zoomst du weiter hinein, {l:taucht der Planet in die Straßenkarte} an der Stelle, auf die du zeigst. Zoomst du die Karte weit hinaus, kommt der Planet zurück.'],
  h_track='Das Tracklog',
  track=['Wenn jemand eine Dérive teilt oder {l:live} geht, wird der Planet zum {l:Tracklog}: Er fliegt zum Weg hinunter und spielt ihn in seiner Zeit ab, den gegangenen Weg in Lila, die letzten Schritte in Weiß, jeder Klang ein Ring, der aufleuchtet, wenn die Gehende ihn erreicht.',
         '{k:♪ hören} spielt jeden Klang, wenn er erreicht wird. {k:◯ Planet} (oder {k:Esc}) führt zurück; {k:▶ Tracklog} spielt die letzten Wege noch einmal.',
         'Einem Live-Weg folgt er, während er geschieht. Bist du auf der Straßenkarte, bietet eine Zeile {k:ansehen} an, statt dich wegzuholen.'],
  h_map='Die Straßenkarte',
  map=['Lila Linien des Ortes. {l:Spuren} sind Wege, {l:Quadrate} ihre Klänge. Tippe auf eine Spur für ihre Klänge, auf ein Quadrat, um es zu hören.',
       '{k:▶} hört; {k:→ Ringe} schickt ihn in die Mischung. Deine eigenen Dérives und Klänge sind auch da, und wer gerade live geht, ist eine {l:weiße gestrichelte} Linie mit einer blinkenden Gehenden.',
       '{k:◯ Planet} in der Leiste führt wieder hinauf. {k:⌖} folgt dir wieder, wenn du die Karte verschoben hast.',
       'Jeder Ort hat seine eigene Adresse (z. B. {l:…/AlpineFeministPunkParade/#46.5000,8.5000}): kopiere sie, um diese Karte zu teilen.'],
  h_rings='Die Ringe',
  rings=['Öffne {k:◎ Ringe}. Die geschickten Klänge warten am Rand: {l:zieh sie hinein} in den Kreis, um sie zu hören.',
         'Näher an der Mitte ist lauter; links oder rechts verschiebt das Panorama. Lass einen draußen los, dann wartet er wieder.',
         'Klänge von weit entfernten Orten können zusammen spielen: genau darum geht es. Jeder läuft in Schleife.',
         'Tastatur: {k:Tab} zu einem Klang, Pfeile zum Bewegen, {k:Enter} rein oder raus, {k:Entf} zum Entfernen. Dein Mix bleibt auf diesem Gerät.'],
  h_walk='Gehen und aufnehmen',
  h_bar='Die Leiste',
  bar=['Unten, immer: {k:⌖ hier} (oder {k:◯ Planet} auf der Karte) · {k:● AUFNEHMEN} · {k:▶ DÉRIVE STARTEN} · {k:≡ Dérives}.',
       'Im Browser fragt nichts nach deinem Standort oder einem Namen, bis du eine davon benutzt. Beim ersten Aufnehmen oder Dérive-Start wählst du einen {l:Alias}: er zeichnet deine Dérives. Teilst du eine, ist er öffentlich, er muss also nicht dein Name sein; du kannst anonym bleiben.'],
  h_rec='Gehen und aufnehmen',
  rec=['Erlaube den {l:Standort} (um deinen Weg zu zeichnen) und das {l:Mikrofon} (um aufzunehmen). Die Karte fliegt zu dir; die GPS-Genauigkeit steht oben ({l:⌖ ±6 m}): ein Klang braucht einen Ort.',
       '{k:● AUFNEHMEN} öffnet das Mikrofon; nochmals tippen ({k:■}) beendet (höchstens 5 Minuten). Eine Aufnahme startet eine Dérive, falls keine läuft.',
       'Danach kannst du sie benennen (was hörst du?) und Notizen hinzufügen, dann {k:Behalten} oder {k:Verwerfen}.',
       'Geh: deine Spur zeichnet sich {l:weiß}; du bist das blinkende Quadrat.',
       '{k:■ DÉRIVE BEENDEN} und gib ihr einen Namen. Schloss sich die App unterwegs, geht die Dérive dort weiter, wo sie war.'],
  h_live='Live gehen',
  live=['Während einer Dérive streamt {k:◍ live} sie beim Gehen: alle auf der Seite sehen deinen Weg (auf etwa einen Meter) und die Namen deiner Klänge, und der Planet wird zu deinem Tracklog.',
        'Wahlweise {l:auch dein Mikrofon}: Die Leute im #AFPP hören, was du hörst, während du gehst.',
        'Es fragt jedes Mal. Nichts wird gespeichert: Endet die Dérive, ist der Live-Weg weg, außer du teilst sie.'],
  h_share='Teilen',
  share=['Nach einer Dérive mit Klängen bietet die App an, sie {l:auf die Weltkarte zu stellen}; oder später, unter {k:≡ Dérives}.',
         'Beim ersten Mal erklärt sie, was öffentlich wird: dein Alias, Titel und Zeiten, die Spur (auf etwa einen Meter gerundet), die Klänge mit Namen und Notizen. Die Bitácora vermerkt, dass du sie geteilt hast.',
         'Nach Sekunden ist sie ein weißer Punkt auf dem Planeten, und der Planet spielt sie als Tracklog für alle, die gerade schauen.',
         '{k:Auf der Weltkarte} → {k:Ja} entfernt sie vom Server (Spur und Klänge) und aus der Bitácora. Löschen einer Dérive entfernt sie auch.',
         'Ohne Netz bleibt alles auf dem Gerät; teile, wenn es wieder Netz gibt.'],
  h_install='Die Android-App',
  install=['Lade {a:deriva-sonora.apk} auf dem Telefon herunter und öffne sie.',
           'Android fragt, ob {l:Apps aus dieser Quelle installiert werden dürfen} (Browser oder Dateimanager): erlaube es für diese Installation.',
           'Die App heißt {l:Deriva Sonora}. Sie öffnet auf dem Planeten und fliegt zu dir, sobald das GPS eine Position hat; den Standort nutzt sie nie im Hintergrund.',
           '{l:Kein Android?} Dieselbe App läuft im Browser: {r:altred.xyz/AlpineFeministPunkParade} in Safari oder Chrome auf einem Mac, iPhone oder jedem Computer. Auf dem Mac müssen die Ortungsdienste für den Browser an sein (Systemeinstellungen → Datenschutz & Sicherheit); auf dem iPhone den Bildschirm beim Gehen anlassen. Die Klänge bleiben in diesem Browser, bis du die Dérive teilst.'],
  h_chat='Der Chat, #AFPP',
  chat=['Neben der Karte (darunter auf dem Telefon) ist {l:#AFPP}, der Chat der Alpine Feminist Punk Parade, verbunden mit ihrer Telegram-Gruppe. Wähle einen Spitznamen und {k:Beitreten}. {k:/nick} benennt dich um, {k:/me} beschreibt eine Handlung; tippe auf den Titel, um ihn einzuklappen.',
        'Zeilen werden {l:noch einmal getippt}, im Tempo, in dem sie geschrieben wurden, mit Zögern und Korrekturen, und du siehst die anderen schreiben, während sie schreiben ({l:> ana schreibt ::}).',
        '{k:Stimme · Kamera} öffnet dein Mikrofon oder deine Kamera für die Leute im Chat. {k:ascii} sendet die Kamera nur als Text: das Bild verlässt dein Gerät nie.',
        'Alles, was im #AFPP gesagt wird, und jede geteilte Dérive bleibt in der öffentlichen {a:Bitácora}, wo Zeilen so abgespielt werden können, wie sie getippt wurden.'],
  note='Was du nicht teilst, verlässt dein Gerät nie. Keine Konten, keine Werbung, keine Analyse. Eine geteilte Dérive lässt sich jederzeit entfernen.',
  foot='Alpine Feminist Punk Parade · Deriva Sonora · {p:Permasoftware}, 1-Bit · Schrift Lugar Común (SIL OFL) · Karte © OpenStreetMap',
 ),
 'fr': dict(
  title='Deriva Sonora : mode d’emploi',
  nav_globe='ouvrir',
  nav_apk='appli Android ↓',
  nav_bit='bitácora',
  h1='Mode d’emploi<br>Deriva Sonora',
  alt='Alpine Feminist Punk Parade : titre écrit à la main sur un dessin de village alpin, une parade sur la route de montagne et une longue table de repas.',
  intro='Partout, des marcheuses et marcheurs enregistrent les sons de leurs {l:dérives} (marches sans but) et, s’ils le souhaitent, les partagent, même en direct pendant qu’ils marchent. Ici on les écoute et on en parle : une {l:planète} avec un point là où quelqu’un a partagé une dérive, la {l:carte des rues} de chaque lieu, les {l:anneaux} pour mélanger des sons lointains, et {l:#AFPP}, le chat. C’est une seule appli, la même dans un navigateur et sur un téléphone Android. Un projet de l’{l:Alpine Feminist Punk Parade}. Trois tons seulement : noir, violet, et blanc pour ce qui est actif ou sonne.',
  open='Ouvrir Deriva Sonora',
  get='Télécharger l’appli Android (gratuite)',
  h_stage='La planète et la carte',
  h_globe='La planète',
  globe=['Chaque {l:point qui clignote} est une dérive partagée : plus elle est récente, plus il clignote vite ; {l:blanc} si elle date de la dernière heure ou vient d’être partagée.',
         '{k:Glisser} la fait tourner. La molette ou deux doigts zooment ; tant que le pointeur est sur la planète elle s’arrête, pour attraper un point.',
         'Survole un point pour voir qui et combien de sons ; {k:clic} pour y voler.',
         'Continue à zoomer et la planète {l:plonge dans la carte des rues} à l’endroit que tu montres. Dézoome loin la carte et la planète revient.'],
  h_track='Le tracklog',
  track=['Quand quelqu’un partage une dérive, ou marche en {l:direct}, la planète devient un {l:tracklog} : elle descend vers la marche et la rejoue dans son temps, le chemin parcouru en violet, les derniers pas en blanc, chaque son un anneau qui s’allume quand la marcheuse l’atteint.',
         '{k:♪ écouter} joue chaque son quand il est atteint. {k:◯ planète} (ou {k:Échap}) revient ; {k:▶ tracklog} rejoue les dernières marches.',
         'Une marche en direct est suivie pendant qu’elle a lieu. Si tu es sur la carte des rues, une ligne propose de {k:voir} au lieu de t’emmener.'],
  h_map='La carte des rues',
  map=['Le lieu en lignes violettes. Les {l:tracés} sont des marches, les {l:carrés} leurs sons. Touche un tracé pour lister ses sons, un carré pour l’écouter.',
       '{k:▶} écoute ; {k:→ anneaux} l’envoie au mélange. Tes propres dérives et sons y sont aussi, et qui marche en direct maintenant est une ligne {l:blanche pointillée} avec une marcheuse qui clignote.',
       '{k:◯ planète} dans la barre remonte. {k:⌖} te suit de nouveau si tu as déplacé la carte.',
       'Chaque lieu a sa propre adresse (p. ex. {l:…/AlpineFeministPunkParade/#46.5000,8.5000}) : copie-la pour partager cette carte.'],
  h_rings='Les anneaux',
  rings=['Ouvre {k:◎ anneaux}. Les sons envoyés attendent au bord : {l:glisse-les dans} le cercle pour les entendre.',
         'Plus près du centre, plus fort ; à gauche ou à droite, le son se place de ce côté. Lâche-le dehors et il attend à nouveau.',
         'Des sons de lieux très éloignés peuvent jouer ensemble : c’est l’idée. Chacun tourne en boucle.',
         'Clavier : {k:Tab} jusqu’à un son, flèches pour le déplacer, {k:Entrée} pour entrer ou sortir, {k:Suppr} pour le retirer. Ton mix reste sur cet appareil.'],
  h_walk='Marcher et enregistrer',
  h_bar='La barre',
  bar=['En bas, toujours : {k:⌖ ici} (ou {k:◯ planète} sur la carte) · {k:● ENREGISTRER} · {k:▶ COMMENCER UNE DÉRIVE} · {k:≡ dérives}.',
       'Dans un navigateur, rien ne demande ta position ni un nom tant que tu n’utilises pas l’un d’eux. La première fois que tu enregistres ou commences une dérive, tu choisis un {l:alias} : il signe tes dérives. Si tu en partages une il est public, il n’a donc pas besoin d’être ton nom ; tu peux rester anonyme.'],
  h_rec='Dériver et enregistrer',
  rec=['Autorise la {l:position} (pour dessiner ta marche) et le {l:micro} (pour enregistrer). La carte vole vers toi ; la précision GPS s’affiche en haut ({l:⌖ ±6 m}) : un son a besoin d’un lieu.',
       '{k:● ENREGISTRER} ouvre le micro ; touche-le encore ({k:■}) pour arrêter (5 minutes au plus). Enregistrer commence une dérive s’il n’y en a pas.',
       'Ensuite, nomme-le si tu veux (qu’entends-tu ?) et ajoute des notes, puis {k:Garder} ou {k:Jeter}.',
       'Marche : ton tracé se dessine en {l:blanc} ; tu es le carré qui clignote.',
       '{k:■ TERMINER LA DÉRIVE} et donne-lui un nom. Si l’appli s’est fermée en route, la dérive reprend où elle était.'],
  h_live='Marcher en direct',
  live=['Pendant une dérive, {k:◍ direct} la diffuse pendant que tu marches : tout le monde sur le site voit ton chemin (à un mètre près) et les noms de tes sons, et la planète devient ton tracklog.',
        'Si tu veux, {l:ton micro aussi} : les personnes dans #AFPP entendent ce que tu entends, pendant que tu marches.',
        'Elle demande à chaque fois. Rien n’est gardé : quand la dérive se termine, la marche en direct disparaît, sauf si tu la partages.'],
  h_share='Partager',
  share=['Après une dérive avec des sons, l’appli propose de la {l:partager sur la carte mondiale} ; ou plus tard, depuis {k:≡ dérives}.',
         'La première fois, elle explique ce qui devient public : ton alias, le titre et les heures, le tracé (arrondi à un mètre près), les sons avec leurs noms et notes. La bitácora note que tu l’as partagée.',
         'En quelques secondes c’est un point blanc sur la planète, et la planète la rejoue en tracklog pour qui regarde.',
         '{k:Sur la carte mondiale} → {k:Oui} la retire du serveur (tracé et sons) et de la bitácora. Supprimer une dérive la retire aussi.',
         'Hors ligne, tout reste sur l’appareil ; partage quand il y a du réseau.'],
  h_install='L’appli Android',
  install=['Télécharge {a:deriva-sonora.apk} sur le téléphone et ouvre-le.',
           'Android demande d’{l:autoriser l’installation d’applis depuis cette source} (le navigateur ou le gestionnaire de fichiers) : autorise-le pour cette installation.',
           'L’appli s’appelle {l:Deriva Sonora}. Elle s’ouvre sur la planète et vole vers toi dès que le GPS a une position ; elle n’utilise jamais la position en arrière-plan.',
           '{l:Pas d’Android ?} La même appli fonctionne dans le navigateur : {r:altred.xyz/AlpineFeministPunkParade} dans Safari ou Chrome sur un Mac, un iPhone ou n’importe quel ordinateur. Sur un Mac, le Service de localisation doit être activé pour le navigateur (Réglages Système → Confidentialité et sécurité) ; sur un iPhone, garde l’écran allumé en marchant. Les sons restent dans ce navigateur jusqu’à ce que tu partages la dérive.'],
  h_chat='Le chat, #AFPP',
  chat=['À côté de la carte (en dessous sur un téléphone) se trouve {l:#AFPP}, le chat de l’Alpine Feminist Punk Parade, relié à son groupe Telegram. Choisis un pseudo et {k:Entrer}. {k:/nick} change ton pseudo, {k:/me} décrit une action ; touche son titre pour le replier.',
        'Les lignes sont {l:retapées} au rythme où elles ont été écrites, hésitations et corrections comprises, et tu vois les autres écrire pendant qu’ils écrivent ({l:> ana écrit ::}).',
        '{k:voix · caméra} ouvre ton micro ou ta caméra aux personnes du chat. {k:ascii} envoie ta caméra en texte seulement : l’image ne quitte jamais ton appareil.',
        'Tout ce qui se dit dans #AFPP, et chaque dérive partagée, est gardé dans la {a:bitácora} publique, où les lignes peuvent être rejouées comme elles ont été tapées.'],
  note='Ce que tu ne partages pas ne quitte jamais ton appareil. Pas de comptes, de publicité ni d’analyses. Une dérive partagée peut toujours être retirée.',
  foot='Alpine Feminist Punk Parade · Deriva Sonora · {p:permasoftware}, 1 bit · police Lugar Común (SIL OFL) · carte © OpenStreetMap',
 ),
 'es': dict(
  title='Deriva Sonora: cómo usar',
  nav_globe='abrir',
  nav_apk='app Android ↓',
  nav_bit='bitácora',
  h1='Cómo usar<br>Deriva Sonora',
  alt='Alpine Feminist Punk Parade: título escrito a mano sobre un dibujo de un pueblo alpino, un desfile por la carretera de montaña y una larga mesa con comida.',
  intro='Caminantes de cualquier lugar graban los sonidos de sus {l:derivas} (caminatas sin rumbo) y, si quieren, las comparten, incluso en vivo mientras caminan. Aquí se escuchan y se conversan: un {l:planeta} con un punto donde alguien compartió una deriva, el {l:mapa de calles} de cada lugar, los {l:anillos} para mezclar sonidos lejanos y {l:#AFPP}, el chat. Es una sola app, igual en un navegador y en un teléfono Android. Un proyecto de la {l:Alpine Feminist Punk Parade}. Solo tres tonos: negro, morado y blanco para lo que está activo o sonando.',
  open='Abrir Deriva Sonora',
  get='Descargar la app Android (gratis)',
  h_stage='El planeta y el mapa',
  h_globe='El planeta',
  globe=['Cada {l:punto que parpadea} es una deriva compartida: cuanto más reciente, más rápido parpadea; {l:blanco} si es de la última hora o se acaba de compartir.',
         '{k:Arrastrar} lo gira. La rueda del ratón o dos dedos hacen zoom; mientras el puntero está sobre el planeta se detiene, para atrapar un punto.',
         'Pasa sobre un punto para ver quién y cuántos sonidos; {k:clic} para volar allí.',
         'Sigue acercándote y el planeta {l:se sumerge en el mapa de calles} en el lugar que señalas. Aleja mucho el mapa y el planeta vuelve.'],
  h_track='La bitácora de rutas',
  track=['Cuando alguien comparte una deriva, o camina {l:en vivo}, el planeta se vuelve una {l:bitácora de rutas}: baja hasta la caminata y la reproduce en su tiempo, el camino recorrido en morado, los últimos pasos en blanco, cada sonido un anillo que se enciende cuando quien camina lo alcanza.',
         '{k:♪ escuchar} suena cada sonido cuando se alcanza. {k:◯ planeta} (o {k:Esc}) vuelve; {k:▶ bitácora de rutas} repite las últimas caminatas.',
         'Una caminata en vivo se sigue mientras sucede. Si estás en el mapa de calles, una línea te ofrece {k:ver} en vez de llevarte.'],
  h_map='El mapa de calles',
  map=['El lugar en líneas moradas. Los {l:trazos} son caminatas, los {l:cuadrados} sus sonidos. Toca un trazo para ver sus sonidos, un cuadrado para escucharlo.',
       '{k:▶} escucha; {k:→ anillos} lo manda a la mezcla. Tus propias derivas y sonidos también están, y quien camina en vivo ahora es una línea {l:blanca punteada} con alguien que parpadea.',
       '{k:◯ planeta} en la barra vuelve arriba. {k:⌖} te sigue de nuevo si moviste el mapa.',
       'Cada lugar tiene su propia dirección (p. ej. {l:…/AlpineFeministPunkParade/#46.5000,8.5000}): cópiala para compartir ese mapa.'],
  h_rings='Los anillos',
  rings=['Ábrelos con {k:◎ anillos}. Los sonidos que mandaste esperan en el borde: {l:arrástralos adentro} del círculo para oírlos.',
         'Más cerca del centro, más fuerte; a la izquierda o la derecha, se oye por ese lado. Suéltalo afuera y vuelve a esperar.',
         'Pueden sonar juntos sonidos de lugares muy lejanos: esa es la idea. Cada uno suena en bucle.',
         'Teclado: {k:Tab} hasta un sonido, flechas para moverlo, {k:Enter} para entrar o salir, {k:Supr} para quitarlo. Tu mezcla se guarda en este dispositivo.'],
  h_walk='Caminar y grabar',
  h_bar='La barra',
  bar=['Abajo, siempre: {k:⌖ aquí} (o {k:◯ planeta} en el mapa) · {k:● GRABAR} · {k:▶ INICIAR DERIVA} · {k:≡ derivas}.',
       'En un navegador nada te pide la ubicación ni un nombre hasta que usas uno de ellos. La primera vez que grabas o inicias una deriva eliges un {l:alias}: firma tus derivas. Si compartes una es público, así que no tiene que ser tu nombre; puedes seguir anónimo.'],
  h_rec='Derivar y grabar',
  rec=['Permite la {l:ubicación} (para dibujar tu caminata) y el {l:micrófono} (para grabar). El mapa vuela hacia ti; la precisión del GPS aparece arriba ({l:⌖ ±6 m}): un sonido necesita un lugar.',
       '{k:● GRABAR} abre el micrófono; tócalo otra vez ({k:■}) para parar (5 minutos como máximo). Grabar inicia una deriva si no hay ninguna.',
       'Al parar, nómbralo si quieres (¿qué escuchas?) y añade notas; luego {k:Guardar} o {k:Descartar}.',
       'Camina: tu trazo se dibuja en {l:blanco}; tú eres el cuadrado que parpadea.',
       '{k:■ TERMINAR DERIVA} y ponle un nombre. Si la app se cerró a mitad de camino, la deriva sigue donde estaba.'],
  h_live='Caminar en vivo',
  live=['Durante una deriva, {k:◍ en vivo} la transmite mientras caminas: todas las personas en el sitio ven tu recorrido (a un metro, más o menos) y los nombres de tus sonidos, y el planeta se vuelve tu bitácora de rutas.',
        'Si quieres, {l:también tu micrófono}: quienes están en #AFPP escuchan lo que escuchas, mientras caminas.',
        'Pregunta cada vez. No se guarda nada: al terminar la deriva la caminata en vivo desaparece, salvo que la compartas.'],
  h_share='Compartir',
  share=['Después de una deriva con sonidos la app ofrece {l:compartirla en el mapa global}; o después, desde {k:≡ derivas}.',
         'La primera vez explica qué se vuelve público: tu alias, el título y las horas, el trazo (redondeado a un metro, más o menos), los sonidos con sus nombres y notas. La bitácora anota que la compartiste.',
         'En segundos es un punto blanco en el planeta, y el planeta la reproduce como bitácora de rutas para quien esté mirando.',
         '{k:En el mapa global} → {k:Sí} la quita del servidor (trazo y sonidos) y de la bitácora. Borrar una deriva también la quita.',
         'Sin conexión todo queda en el dispositivo; comparte cuando haya red.'],
  h_install='La app Android',
  install=['Descarga {a:deriva-sonora.apk} en el teléfono y ábrelo.',
           'Android pide {l:permitir instalar apps de esta fuente} (el navegador o el gestor de archivos): permítelo para esta instalación.',
           'La app se llama {l:Deriva Sonora}. Abre en el planeta y vuela hacia ti en cuanto el GPS tiene posición; nunca usa la ubicación en segundo plano.',
           '{l:¿Sin Android?} La misma app funciona en el navegador: {r:altred.xyz/AlpineFeministPunkParade} en Safari o Chrome en un Mac, un iPhone o cualquier computador. En un Mac, los Servicios de localización deben estar activos para el navegador (Ajustes del Sistema → Privacidad y seguridad); en un iPhone, mantén la pantalla encendida mientras caminas. Los sonidos quedan en ese navegador hasta que compartas la deriva.'],
  h_chat='El chat, #AFPP',
  chat=['Junto al mapa (debajo en un teléfono) está {l:#AFPP}, el chat de la Alpine Feminist Punk Parade, enlazado con su grupo de Telegram. Elige un apodo y {k:Entrar}. {k:/nick} cambia tu apodo, {k:/me} describe una acción; toca su título para plegarlo.',
        'Las líneas se {l:vuelven a escribir} al ritmo en que se escribieron, con dudas y correcciones, y ves a las demás personas escribir mientras escriben ({l:> ana escribe ::}).',
        '{k:voz · cámara} abre tu micrófono o tu cámara a quienes están en el chat. {k:ascii} envía tu cámara solo como texto: la imagen nunca sale de tu dispositivo.',
        'Todo lo que se dice en #AFPP, y cada deriva compartida, queda en la {a:bitácora} pública, donde las líneas se pueden reproducir como se escribieron.'],
  note='Lo que no compartes no sale de tu dispositivo. Sin cuentas, publicidad ni analítica. Una deriva compartida se puede quitar siempre.',
  foot='Alpine Feminist Punk Parade · Deriva Sonora · {p:permasoftware}, 1 bit · tipografía Lugar Común (SIL OFL) · mapa © OpenStreetMap',
 ),
}
PAGE = '''<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#000000">
<title>{title}</title>
<meta property="og:title" content="{title}">
<meta property="og:image" content="https://altred.xyz/AlpineFeministPunkParade/afpp-card.png">
<link rel="icon" href="{up}deriva-icon.png">
<script src="{up}ticker/ticker.js" defer></script>
{alternates}
<style>
  @font-face {{ font-family: 'Lugar Comun'; src: url({up}fonts/LugarComun-Regular.woff2) format('woff2'); font-display: swap; }}
  :root {{ --ground: #000; --ink: #9b4dff; --lit: #fff; --dim: #6a3bb0; --mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }}
  * {{ box-sizing: border-box; }}
  html {{ background: var(--ground); }}
  body {{ margin: 0 auto; max-width: 46rem; padding: 0 16px 64px; background: var(--ground); color: var(--ink); font: 15px/1.6 var(--mono); }}
  ::selection {{ background: var(--ink); color: var(--ground); }}
  a {{ color: var(--lit); text-decoration: none; border-bottom: 1px dashed var(--ink); }}
  a:hover {{ border-bottom-color: var(--lit); }}
  header.top {{ display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px dashed var(--dim); position: sticky; top: 0; background: var(--ground); z-index: 1; }}
  header.top b {{ color: var(--lit); letter-spacing: 0.2em; font-size: 13px; }}
  header.top nav {{ display: flex; flex-wrap: wrap; gap: 12px; margin-left: auto; font-size: 13px; }}
  .langs a[aria-current] {{ color: var(--ground); background: var(--ink); border: 0; padding: 0 3px; }}
  .art {{ margin: 24px auto 0; max-width: 32rem; }}
  .afpp-ticker {{ display: block; width: 100%; height: 48px; image-rendering: pixelated; border-bottom: 1px dashed var(--dim); }}
  .art img {{ display: block; width: 100%; height: auto; image-rendering: pixelated; }}
  h1, h2 {{ font-family: 'Lugar Comun', var(--mono); font-weight: normal; color: var(--lit); letter-spacing: 0.04em; }}
  h1 {{ font-size: 2.2rem; line-height: 1.1; margin: 1em 0 0.3em; }}
  h2 {{ font-size: 1.4rem; margin: 2.2em 0 0.6em; padding-top: 0.6em; border-top: 1px dashed var(--dim); }}
  h3 {{ color: var(--lit); font-size: 1rem; margin: 1.6em 0 0.4em; }}
  h3::before {{ content: '// '; color: var(--dim); }}
  p, li {{ max-width: 40rem; overflow-wrap: anywhere; }}  /* long addresses wrap on a phone */
  ol, ul {{ padding-left: 1.4em; }}
  li {{ margin: 0.35em 0; }}
  li::marker {{ color: var(--dim); }}
  .lit {{ color: var(--lit); }}
  .k {{ color: var(--lit); border: 1px solid var(--ink); padding: 0 4px; white-space: nowrap; }}
  .get {{ display: flex; flex-wrap: wrap; gap: 10px; margin: 1.2em 0; }}
  .get a {{ border: 1px solid var(--ink); padding: 8px 14px; color: var(--ink); }}
  .get a.main {{ background: var(--ink); color: var(--ground); font-weight: bold; }}
  .get a:hover {{ background: var(--lit); color: var(--ground); border-color: var(--lit); }}
  .note {{ border-left: 2px solid var(--ink); padding: 2px 0 2px 12px; }}
  footer {{ margin-top: 3em; padding-top: 12px; border-top: 1px dashed var(--dim); font-size: 12px; color: var(--dim); }}
  @media (max-width: 520px) {{ body {{ font-size: 14px; }} h1 {{ font-size: 1.8rem; }} }}
</style>
</head>
<body>
<header class="top">
  <b>DERIVA SONORA · AFPP</b>
  <nav>
    <a href="{up}">{nav_globe}</a>
    <a href="{up}deriva-sonora.apk" download>{nav_apk}</a>
    <a href="{up}bitacora/">{nav_bit}</a>
    <span class="langs">{langs}</span>
  </nav>
</header>

<canvas class="afpp-ticker" data-scale="2" aria-hidden="true"></canvas>
<figure class="art"><img src="{up}afpp-logo.png" width="900" height="1200" alt="{alt}"></figure>

<h1>{h1}</h1>
<p>{intro}</p>
<div class="get">
  <a class="main" href="{up}">{open}</a>
  <a href="{up}deriva-sonora.apk" download>{get}</a>
</div>

<h2>{h_stage}</h2>
<h3>{h_globe}</h3>
<ul>{globe}</ul>
<h3>{h_track}</h3>
<ul>{track}</ul>
<h3>{h_map}</h3>
<ul>{map}</ul>
<h3>{h_rings}</h3>
<ul>{rings}</ul>

<h2>{h_walk}</h2>
<h3>{h_bar}</h3>
<ul>{bar}</ul>
<h3>{h_rec}</h3>
<ul>{rec}</ul>
<h3>{h_live}</h3>
<ul>{live}</ul>
<h3>{h_share}</h3>
<ul>{share}</ul>
<h3>{h_install}</h3>
<ol>{install}</ol>

<h2>{h_chat}</h2>
<ul>{chat}</ul>

<p class="note">{note}</p>
<footer>{foot}</footer>
</body>
</html>
'''


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def inline(s, up):
    s = esc(s)
    s = re.sub(r'\{k:([^}]*)\}', r'<span class="k">\1</span>', s)
    s = re.sub(r'\{l:([^}]*)\}', r'<span class="lit">\1</span>', s)
    s = re.sub(r'\{a:(deriva-sonora\.apk)\}', rf'<a href="{up}deriva-sonora.apk" download>\1</a>', s)
    s = re.sub(r'\{r:([^}]*)\}', rf'<a href="{up}">\1</a>', s)
    s = re.sub(r'\{a:([^}]*)\}', rf'<a href="{up}bitacora/">\1</a>', s)
    s = re.sub(r'\{p:([^}]*)\}', r'<a href="https://alejoduque.github.io/permasoftware-assembly/">\1</a>', s)
    return s


def build():
    for lang in LANGS:
        tx = TEXT[lang]
        up = '../' if lang == 'en' else '../../'
        here = lambda l: ('' if lang == 'en' else '../') + ('' if l == 'en' else f'{l}/')
        langs = ' '.join(
            f'<a href="{here(l) or "./"}" hreflang="{l}" lang="{l}"' + (' aria-current="page"' if l == lang else '') + f' title="{NAMES[l]}">{l.upper()}</a>'
            for l in LANGS)
        alternates = '\n'.join(f'<link rel="alternate" hreflang="{l}" href="https://altred.xyz/AlpineFeministPunkParade/howto/{"" if l == "en" else l + "/"}">' for l in LANGS)
        fields = {}
        for k, v in tx.items():
            if isinstance(v, list):
                fields[k] = ''.join(f'\n  <li>{inline(x, up)}</li>' for x in v) + '\n'
            elif k in ('h1',):
                fields[k] = v  # carries <br>
            elif k in ('title', 'alt'):
                fields[k] = esc(v)
            else:
                fields[k] = inline(v, up)
        html = PAGE.format(lang=lang, up=up, langs=langs, alternates=alternates, **fields)
        out = os.path.join(OUT, '' if lang == 'en' else lang, 'index.html')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, 'w', encoding='utf-8').write(html)
        print('wrote', os.path.relpath(out, ROOT))


if __name__ == '__main__':
    build()
