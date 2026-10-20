#!/usr/bin/env python3
"""
Writes the how-to pages, one per language, from one template:

    public/howto/index.html   English (the default)
    public/howto/de/index.html  Deutsch
    public/howto/fr/index.html  Français
    public/howto/es/index.html  Español

    python3 tools/make_howto.py

Text lives in TEXT below; markup in PAGE. {k:…} marks a key/button, {l:…} a
lit (white) word. Links are relative, so the pages work under any base path.
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
  nav_globe='globe', nav_apk='Android app ↓', nav_bit='bitácora',
  h1='How to use<br>Deriva Sonora',
  alt='Alpine Feminist Punk Parade: hand-lettered title over a drawing of an alpine village, a parade down the mountain road, and a long table of food.',
  intro='Walkers anywhere record the sounds of their {l:derives} (aimless walks) and, if they choose, share them. Here they are heard: a globe with a dot wherever someone shared a derive, the map of each place, and the {l:rings} to mix distant sounds together. A project of the {l:Alpine Feminist Punk Parade}. Three tones only: black, purple, and white for whatever is active or sounding.',
  open='Open the globe', get='Download the Android app (free)',
  h_web='Listen, on the web',
  h_globe='The globe',
  globe=['Each {l:blinking dot} is a shared derive: the more recent, the faster it blinks; {l:white} if it is from the last hour or was just uploaded.',
         '{k:drag} to turn it; the mouse wheel zooms. While the pointer is over the globe it stops spinning, so you can catch a dot.',
         'Hover a dot to see who and how many sounds; {k:click} to go there.'],
  h_map='The map of the place',
  map=['The globe turns to the dot and lands on a map of about {l:10 km}, drawn in purple lines.',
       '{l:Traces} are the walks, {l:squares} the sounds. Tap a trace to list its sounds, a square to hear it.',
       '{k:▶} listens; {k:→ rings} sends it to the mix; {k:◯ Globe} goes back.',
       'Every place has its own address (e.g. {l:…/AlpineFeministPunkParade/#46.5000,8.5000}): copy it to share that map.'],
  h_rings='The rings',
  rings=['Open {k:◎ rings} at the bottom. The sounds you sent wait on the edge: {l:drag them inside} the circle to hear them.',
         'Closer to the centre is louder; left or right pans. Drop one outside and it waits again.',
         'Sounds from far-apart places can play together: that is the point. Each one loops.',
         'Keyboard: {k:Tab} to a sound, arrows to move it, {k:Enter} in or out, {k:Delete} to remove. Your mix is kept in your browser.'],
  h_chat='The chat and the bitácora',
  chat='Beside the globe (below it on a phone) is {l:#AFPP}, the chat of the Alpine Feminist Punk Parade. Pick a nickname and {k:Join}. {k:/nick} renames you, {k:/me} describes an action; tap its title to fold it away. Everything said in #AFPP, and every shared derive, is kept in the public {a:bitácora}.',
  h_app='Record and share, with the app',
  h_install='Install',
  install=['{l:No Android?} Record in the browser instead: open {r:altred.xyz/AlpineFeministPunkParade/?recorder} in Safari or Chrome on a Mac, an iPhone or any computer, and allow location and the microphone. On a Mac, Location Services must be on for the browser (System Settings → Privacy & Security). On an iPhone, keep the screen on while walking. Sounds stay in that browser until you share the derive.',
           'On an Android phone, download {a:deriva-sonora.apk} and open it.',
           'Android asks to {l:allow installing apps from this source} (the browser or file manager): allow it for this install.',
           'The app is called {l:Deriva Sonora}.',
           'First run asks for an {l:alias}: it signs your derives. If you share one it is public, so it need not be your name. You can stay anonymous.',
           'Allow {l:location} (to draw your walk) and the {l:microphone} (to record). The app never uses location in the background.'],
  h_rec='Derive and record',
  rec=['Bottom bar: {k:◯ globe} · {k:● RECORD} · {k:≡ derives}; under record, {k:▶ start derive}.',
       'Wait for the GPS accuracy at the top ({l:⌖ ±6 m}): a sound needs a place.',
       '{k:● RECORD} opens the mic; tap it again ({k:■}) to stop (5 minutes at most). Recording starts a derive if none is running.',
       'When you stop, name it if you like (what do you hear?) and add notes, then {k:Keep} or {k:Discard}.',
       'Walk: your trace draws in {l:white}; you are the blinking square. {k:⌖} follows you again if you moved the map.',
       '{k:■ end derive} and give it a name. If the app closed mid-walk, the derive resumes where it was.'],
  h_share='Share',
  share=['After a derive with sounds the app offers to {l:share it to the global map}; or later, from {k:≡ derives}.',
         'The first time it explains what becomes public: your alias, the title and times, the trace (rounded to about a metre), the sounds with their names and notes. The bitácora notes that you shared it.',
         'Within seconds it is a white dot on the globe, for anyone.',
         '{k:On the global map} → {k:Yes} removes it from the server (trace and sounds), and from the bitácora. Deleting a derive in the app removes it too.',
         'Offline, everything stays on the phone; share when there is a network.'],
  h_others='Listen to others in the app',
  others=['On the app’s map, derives shared near you are {l:dashed} and their sounds are hollow squares: tap to listen.',
          '{k:◯ globe} opens the same globe and rings as the web; {k:← Recorder} goes back.'],
  note='What you do not share never leaves your phone. No accounts, ads or analytics. A shared derive can always be removed.',
  foot='Alpine Feminist Punk Parade · Deriva Sonora · permasoftware, 1-bit · typeface Lugar Común (SIL OFL) · map © OpenStreetMap',
 ),
 'de': dict(
  title='Deriva Sonora: Anleitung',
  nav_globe='Globus', nav_apk='Android-App ↓', nav_bit='Bitácora',
  h1='So funktioniert<br>Deriva Sonora',
  alt='Alpine Feminist Punk Parade: handgeschriebener Titel über einer Zeichnung eines Alpendorfs, einer Parade auf der Bergstraße und einer langen Tafel mit Essen.',
  intro='Überall nehmen Gehende die Klänge ihrer {l:Dérives} (zielloser Spaziergänge) auf und teilen sie, wenn sie möchten. Hier hört man sie: ein Globus mit einem Punkt, wo jemand eine Dérive geteilt hat, die Karte jedes Ortes und die {l:Ringe}, um weit entfernte Klänge zusammen zu mischen. Ein Projekt der {l:Alpine Feminist Punk Parade}. Nur drei Töne: Schwarz, Lila und Weiß für alles, was aktiv ist oder klingt.',
  open='Globus öffnen', get='Android-App herunterladen (kostenlos)',
  h_web='Hören, im Web',
  h_globe='Der Globus',
  globe=['Jeder {l:blinkende Punkt} ist eine geteilte Dérive: je neuer, desto schneller blinkt er; {l:weiß}, wenn sie aus der letzten Stunde ist oder gerade hochgeladen wurde.',
         '{k:Ziehen} zum Drehen; das Mausrad zoomt. Solange der Zeiger über dem Globus ist, hält er still, damit du einen Punkt erwischst.',
         'Fahr über einen Punkt, um zu sehen, wer und wie viele Klänge; {k:Klick}, um hinzugehen.'],
  h_map='Die Karte des Ortes',
  map=['Der Globus dreht sich zum Punkt und landet auf einer Karte von etwa {l:10 km}, in lila Linien gezeichnet.',
       '{l:Linien} sind die Wege, {l:Quadrate} die Klänge. Tipp auf einen Weg, um seine Klänge zu sehen, auf ein Quadrat, um es zu hören.',
       '{k:▶} hört; {k:→ Ringe} schickt den Klang in den Mix; {k:◯ Globus} geht zurück.',
       'Jeder Ort hat eine eigene Adresse (z. B. {l:…/AlpineFeministPunkParade/#46.5000,8.5000}): kopier sie, um diese Karte zu teilen.'],
  h_rings='Die Ringe',
  rings=['Öffne {k:◎ Ringe} unten. Die geschickten Klänge warten am Rand: {l:zieh sie hinein} in den Kreis, um sie zu hören.',
         'Näher an der Mitte ist lauter; links oder rechts verschiebt das Panorama. Lass einen draußen los, dann wartet er wieder.',
         'Klänge von weit entfernten Orten können zusammen spielen: genau darum geht es. Jeder läuft in Schleife.',
         'Tastatur: {k:Tab} zu einem Klang, Pfeile zum Bewegen, {k:Enter} rein oder raus, {k:Entf} zum Entfernen. Dein Mix bleibt in deinem Browser.'],
  h_chat='Der Chat und die Bitácora',
  chat='Neben dem Globus (auf dem Telefon darunter) ist {l:#AFPP}, der Chat der Alpine Feminist Punk Parade. Wähl einen Spitznamen und {k:Beitreten}. {k:/nick} ändert deinen Namen, {k:/me} beschreibt eine Aktion; tipp auf den Titel, um ihn einzuklappen. Alles, was in #AFPP gesagt wird, und jede geteilte Dérive steht in der öffentlichen {a:Bitácora}.',
  h_app='Aufnehmen und teilen, mit der App',
  h_install='Installieren',
  install=['{l:Kein Android?} Dann im Browser aufnehmen: {r:altred.xyz/AlpineFeministPunkParade/?recorder} in Safari oder Chrome auf einem Mac, iPhone oder Computer öffnen und Standort und Mikrofon erlauben. Auf dem Mac müssen die Ortungsdienste für den Browser an sein (Systemeinstellungen → Datenschutz & Sicherheit). Auf dem iPhone den Bildschirm beim Gehen anlassen. Die Klänge bleiben in diesem Browser, bis du die Dérive teilst.',
           'Lade auf einem Android-Telefon {a:deriva-sonora.apk} herunter und öffne die Datei.',
           'Android fragt, ob {l:Apps aus dieser Quelle installiert werden dürfen} (Browser oder Dateimanager): für diese Installation erlauben.',
           'Die App heißt {l:Deriva Sonora}.',
           'Beim ersten Start fragt sie nach einem {l:Alias}: er unterschreibt deine Dérives. Teilst du eine, ist er öffentlich – er muss nicht dein Name sein. Du kannst anonym bleiben.',
           'Erlaube den {l:Standort} (um deinen Weg zu zeichnen) und das {l:Mikrofon} (zum Aufnehmen). Die App nutzt den Standort nie im Hintergrund.'],
  h_rec='Gehen und aufnehmen',
  rec=['Untere Leiste: {k:◯ Globus} · {k:● AUFNEHMEN} · {k:≡ Dérives}; unter der Aufnahme {k:▶ Dérive starten}.',
       'Warte, bis oben die GPS-Genauigkeit erscheint ({l:⌖ ±6 m}): ein Klang braucht einen Ort.',
       '{k:● AUFNEHMEN} öffnet das Mikrofon; nochmals tippen ({k:■}) stoppt (höchstens 5 Minuten). Eine Aufnahme startet eine Dérive, falls keine läuft.',
       'Nach dem Stoppen kannst du ihn benennen (was hörst du?) und Notizen hinzufügen, dann {k:Behalten} oder {k:Verwerfen}.',
       'Geh: dein Weg wird {l:weiß} gezeichnet; du bist das blinkende Quadrat. {k:⌖} folgt dir wieder, wenn du die Karte verschoben hast.',
       '{k:■ Dérive beenden} und benennen. Wurde die App unterwegs geschlossen, geht die Dérive dort weiter, wo sie war.'],
  h_share='Teilen',
  share=['Nach einer Dérive mit Klängen bietet die App an, sie {l:auf die Weltkarte zu stellen}; oder später unter {k:≡ Dérives}.',
         'Beim ersten Mal erklärt sie, was öffentlich wird: dein Alias, Titel und Zeiten, der Weg (auf etwa einen Meter gerundet), die Klänge mit Namen und Notizen. Die Bitácora vermerkt, dass du geteilt hast.',
         'In Sekunden ist sie ein weißer Punkt auf dem Globus, für alle.',
         '{k:Auf der Weltkarte} → {k:Ja} entfernt sie vom Server (Weg und Klänge) und aus der Bitácora. Eine Dérive in der App zu löschen entfernt sie ebenfalls.',
         'Offline bleibt alles auf dem Telefon; teile, sobald es Netz gibt.'],
  h_others='Anderen zuhören in der App',
  others=['Auf der Karte der App sind Dérives, die in deiner Nähe geteilt wurden, {l:gestrichelt}, ihre Klänge hohle Quadrate: antippen zum Hören.',
          '{k:◯ Globus} öffnet denselben Globus und dieselben Ringe wie im Web; {k:← Rekorder} geht zurück.'],
  note='Was du nicht teilst, verlässt dein Telefon nie. Keine Konten, keine Werbung, keine Analyse. Eine geteilte Dérive lässt sich jederzeit entfernen.',
  foot='Alpine Feminist Punk Parade · Deriva Sonora · Permasoftware, 1-Bit · Schrift Lugar Común (SIL OFL) · Karte © OpenStreetMap',
 ),
 'fr': dict(
  title='Deriva Sonora : mode d’emploi',
  nav_globe='globe', nav_apk='appli Android ↓', nav_bit='bitácora',
  h1='Mode d’emploi<br>Deriva Sonora',
  alt='Alpine Feminist Punk Parade : titre écrit à la main au-dessus d’un dessin de village alpin, d’un cortège sur la route de montagne et d’une longue table garnie.',
  intro='Partout, des marcheuses et marcheurs enregistrent les sons de leurs {l:dérives} (marches sans but) et, s’ils le souhaitent, les partagent. Ici on les écoute : un globe avec un point là où quelqu’un a partagé une dérive, la carte de chaque lieu, et les {l:anneaux} pour mélanger des sons lointains. Un projet de l’{l:Alpine Feminist Punk Parade}. Trois tons seulement : noir, violet, et blanc pour ce qui est actif ou qui sonne.',
  open='Ouvrir le globe', get='Télécharger l’appli Android (gratuite)',
  h_web='Écouter, sur le web',
  h_globe='Le globe',
  globe=['Chaque {l:point qui clignote} est une dérive partagée : plus elle est récente, plus il clignote vite ; {l:blanc} si elle date de la dernière heure ou vient d’arriver.',
         '{k:glisse} pour le faire tourner ; la molette zoome. Tant que le pointeur est sur le globe, il s’arrête, pour que tu puisses attraper un point.',
         'Survole un point pour voir qui et combien de sons ; {k:clic} pour y aller.'],
  h_map='La carte du lieu',
  map=['Le globe tourne jusqu’au point et se pose sur une carte d’environ {l:10 km}, dessinée en traits violets.',
       'Les {l:tracés} sont les marches, les {l:carrés} les sons. Touche un tracé pour voir ses sons, un carré pour l’écouter.',
       '{k:▶} écoute ; {k:→ anneaux} l’envoie au mix ; {k:◯ Globe} revient.',
       'Chaque lieu a sa propre adresse (p. ex. {l:…/AlpineFeministPunkParade/#46.5000,8.5000}) : copie-la pour partager cette carte.'],
  h_rings='Les anneaux',
  rings=['Ouvre {k:◎ anneaux} en bas. Les sons envoyés attendent au bord : {l:glisse-les dans} le cercle pour les entendre.',
         'Plus près du centre, plus fort ; à gauche ou à droite, le son se place de ce côté. Lâche-le dehors et il attend à nouveau.',
         'Des sons de lieux très éloignés peuvent jouer ensemble : c’est l’idée. Chacun tourne en boucle.',
         'Clavier : {k:Tab} jusqu’à un son, flèches pour le déplacer, {k:Entrée} pour entrer ou sortir, {k:Suppr} pour le retirer. Ton mix reste dans ton navigateur.'],
  h_chat='Le chat et la bitácora',
  chat='À côté du globe (en dessous sur un téléphone) se trouve {l:#AFPP}, le chat de l’Alpine Feminist Punk Parade. Choisis un pseudo et {k:Entrer}. {k:/nick} change ton pseudo, {k:/me} décrit une action ; touche son titre pour le replier. Tout ce qui se dit dans #AFPP, et chaque dérive partagée, est gardé dans la {a:bitácora} publique.',
  h_app='Enregistrer et partager, avec l’appli',
  h_install='Installer',
  install=['{l:Pas d’Android ?} Enregistre dans le navigateur : ouvre {r:altred.xyz/AlpineFeministPunkParade/?recorder} dans Safari ou Chrome sur un Mac, un iPhone ou tout ordinateur, et autorise la position et le micro. Sur Mac, le Service de localisation doit être activé pour le navigateur (Réglages Système → Confidentialité et sécurité). Sur iPhone, garde l’écran allumé en marchant. Les sons restent dans ce navigateur jusqu’à ce que tu partages la dérive.',
           'Sur un téléphone Android, télécharge {a:deriva-sonora.apk} et ouvre-le.',
           'Android demande d’{l:autoriser l’installation d’applis depuis cette source} (navigateur ou gestionnaire de fichiers) : autorise-la pour cette installation.',
           'L’appli s’appelle {l:Deriva Sonora}.',
           'Au premier lancement elle demande un {l:alias} : il signe tes dérives. Si tu en partages une, il est public : pas besoin que ce soit ton nom. Tu peux rester anonyme.',
           'Autorise la {l:position} (pour dessiner ta marche) et le {l:micro} (pour enregistrer). L’appli n’utilise jamais la position en arrière-plan.'],
  h_rec='Dériver et enregistrer',
  rec=['Barre du bas : {k:◯ globe} · {k:● ENREGISTRER} · {k:≡ dérives} ; sous enregistrer, {k:▶ commencer une dérive}.',
       'Attends que la précision GPS s’affiche en haut ({l:⌖ ±6 m}) : un son a besoin d’un lieu.',
       '{k:● ENREGISTRER} ouvre le micro ; touche-le à nouveau ({k:■}) pour arrêter (5 minutes au plus). Enregistrer lance une dérive s’il n’y en a pas.',
       'À l’arrêt, nomme-le si tu veux (qu’entends-tu ?) et ajoute des notes, puis {k:Garder} ou {k:Jeter}.',
       'Marche : ton tracé se dessine en {l:blanc} ; tu es le carré qui clignote. {k:⌖} te suit à nouveau si tu as déplacé la carte.',
       '{k:■ terminer la dérive} et donne-lui un nom. Si l’appli s’est fermée en chemin, la dérive reprend là où elle était.'],
  h_share='Partager',
  share=['Après une dérive avec des sons, l’appli propose de la {l:partager sur la carte mondiale} ; ou plus tard, depuis {k:≡ dérives}.',
         'La première fois, elle explique ce qui devient public : ton alias, le titre et les heures, le tracé (arrondi à environ un mètre), les sons avec leurs noms et notes. La bitácora note que tu as partagé.',
         'En quelques secondes, c’est un point blanc sur le globe, pour tout le monde.',
         '{k:Sur la carte mondiale} → {k:Oui} la retire du serveur (tracé et sons) et de la bitácora. Supprimer une dérive dans l’appli la retire aussi.',
         'Hors ligne, tout reste sur le téléphone ; partage quand il y a du réseau.'],
  h_others='Écouter les autres dans l’appli',
  others=['Sur la carte de l’appli, les dérives partagées près de toi sont en {l:pointillés} et leurs sons des carrés vides : touche pour écouter.',
          '{k:◯ globe} ouvre le même globe et les mêmes anneaux que le web ; {k:← Enregistreur} revient.'],
  note='Ce que tu ne partages pas ne quitte jamais ton téléphone. Pas de comptes, de publicité ni d’analyses. Une dérive partagée peut toujours être retirée.',
  foot='Alpine Feminist Punk Parade · Deriva Sonora · permasoftware, 1 bit · police Lugar Común (SIL OFL) · carte © OpenStreetMap',
 ),
 'es': dict(
  title='Deriva Sonora: cómo usar',
  nav_globe='globo', nav_apk='app Android ↓', nav_bit='bitácora',
  h1='Cómo usar<br>Deriva Sonora',
  alt='Alpine Feminist Punk Parade: título escrito a mano sobre un dibujo de un pueblo alpino, un desfile por la carretera de montaña y una larga mesa con comida.',
  intro='Caminantes de cualquier lugar graban los sonidos de sus {l:derivas} (caminatas sin rumbo) y, si quieren, las comparten. Aquí se escuchan: un globo con un punto donde alguien compartió una deriva, el mapa de cada lugar, y los {l:anillos} para mezclar sonidos lejanos. Un proyecto de la {l:Alpine Feminist Punk Parade}. Solo tres tonos: negro, morado y blanco para lo que está activo o sonando.',
  open='Abrir el globo', get='Descargar la app Android (gratis)',
  h_web='Escuchar, en la web',
  h_globe='El globo',
  globe=['Cada {l:punto que parpadea} es una deriva compartida: cuanto más reciente, más rápido parpadea; {l:blanco} si es de la última hora o acaba de subirse.',
         '{k:arrastra} para girarlo; la rueda del ratón acerca. Mientras el puntero está sobre el globo, deja de girar para que puedas atrapar un punto.',
         'Pasa sobre un punto para ver quién y cuántos sonidos; {k:clic} para ir allí.'],
  h_map='El mapa del lugar',
  map=['El globo gira hasta el punto y aterriza en un mapa de unos {l:10 km}, dibujado en líneas moradas.',
       'Los {l:trazos} son los recorridos; los {l:cuadrados}, los sonidos. Toca un trazo para ver sus sonidos, o un cuadrado para escucharlo.',
       '{k:▶} escucha; {k:→ anillos} lo manda a la mezcla; {k:◯ Globo} vuelve.',
       'Cada lugar tiene su dirección (p. ej. {l:…/AlpineFeministPunkParade/#46.5000,8.5000}): cópiala para compartir ese mapa.'],
  h_rings='Los anillos',
  rings=['Ábrelos con {k:◎ anillos}, abajo. Los sonidos que mandaste esperan en el borde: {l:arrástralos adentro} del círculo para oírlos.',
         'Más cerca del centro, más fuerte; a la izquierda o la derecha, se oye por ese lado. Suéltalo afuera y vuelve a esperar.',
         'Pueden sonar juntos sonidos de lugares muy lejanos: esa es la idea. Cada uno suena en bucle.',
         'Teclado: {k:Tab} hasta un sonido, flechas para moverlo, {k:Enter} para entrar o salir, {k:Supr} para quitarlo. Tu mezcla se guarda en tu navegador.'],
  h_chat='El chat y la bitácora',
  chat='Junto al globo (debajo, en el teléfono) está {l:#AFPP}, el chat de la Alpine Feminist Punk Parade. Elige un apodo y {k:Entrar}. {k:/nick} cambia tu apodo, {k:/me} describe una acción; toca su título para plegarlo. Todo lo que se dice en #AFPP, y cada deriva compartida, queda en la {a:bitácora} pública.',
  h_app='Grabar y compartir, con la app',
  h_install='Instalar',
  install=['{l:¿Sin Android?} Graba en el navegador: abre {r:altred.xyz/AlpineFeministPunkParade/?recorder} en Safari o Chrome en un Mac, un iPhone o cualquier computador, y permite la ubicación y el micrófono. En el Mac, la Localización debe estar activada para el navegador (Ajustes del Sistema → Privacidad y seguridad). En el iPhone, deja la pantalla encendida mientras caminas. Los sonidos quedan en ese navegador hasta que compartas la deriva.',
           'En un teléfono Android, descarga {a:deriva-sonora.apk} y ábrelo.',
           'Android pedirá {l:permitir instalar apps de esta fuente} (navegador o gestor de archivos): permítelo para esta instalación.',
           'La app se llama {l:Deriva Sonora}.',
           'La primera vez pide un {l:alias}: firma tus derivas. Si compartes una, es público, así que no tiene que ser tu nombre. Puedes seguir anónimo.',
           'Acepta la {l:ubicación} (para dibujar tu recorrido) y el {l:micrófono} (para grabar). La app nunca usa la ubicación en segundo plano.'],
  h_rec='Derivar y grabar',
  rec=['Abajo: {k:◯ globo} · {k:● GRABAR} · {k:≡ derivas}; bajo grabar, {k:▶ iniciar deriva}.',
       'Espera a que arriba aparezca la precisión del GPS ({l:⌖ ±6 m}): un sonido necesita un lugar.',
       '{k:● GRABAR} abre el micrófono; vuelve a tocarlo ({k:■}) para parar (máximo 5 minutos). Si no habías iniciado una deriva, grabar la inicia.',
       'Al parar, ponle nombre si quieres (¿qué escuchas?) y notas, y {k:Guardar} o {k:Descartar}.',
       'Camina: tu recorrido se dibuja en {l:blanco}; tú eres el cuadrado que parpadea. {k:⌖} vuelve a seguirte si moviste el mapa.',
       '{k:■ terminar deriva} y dale un nombre. Si la app se cerró a mitad de camino, la deriva sigue donde iba.'],
  h_share='Compartir',
  share=['Al terminar una deriva con sonidos, la app ofrece {l:compartirla al mapa global}; o después, desde {k:≡ derivas}.',
         'La primera vez explica qué se vuelve público: tu alias, el título y las horas, el recorrido (redondeado a cerca de un metro) y los sonidos con su nombre y notas. La bitácora anota que la compartiste.',
         'En segundos es un punto blanco en el globo, para cualquiera.',
         '{k:En el mapa global} → {k:Sí} la quita del servidor (recorrido y sonidos) y de la bitácora. Borrar una deriva en la app también la quita.',
         'Sin conexión, todo queda en el teléfono; compártela cuando haya red.'],
  h_others='Escuchar a otros desde la app',
  others=['En el mapa de la app, las derivas compartidas cerca de ti aparecen {l:punteadas} y sus sonidos como cuadrados huecos: tócalos para escuchar.',
          '{k:◯ globo} abre el mismo globo y anillos de la web; {k:← Grabadora} vuelve.'],
  note='Lo que no compartes no sale de tu teléfono. Sin cuentas, publicidad ni analítica. Una deriva compartida se puede quitar siempre.',
  foot='Alpine Feminist Punk Parade · Deriva Sonora · permasoftware, 1 bit · tipografía Lugar Común (SIL OFL) · mapa © OpenStreetMap',
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
<link rel="icon" href="{up}favicon.ico">
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
  p, li {{ max-width: 40rem; }}
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

<h2>{h_web}</h2>
<h3>{h_globe}</h3>
<ul>{globe}</ul>
<h3>{h_map}</h3>
<ul>{map}</ul>
<h3>{h_rings}</h3>
<ul>{rings}</ul>
<h3>{h_chat}</h3>
<p>{chat}</p>

<h2>{h_app}</h2>
<h3>{h_install}</h3>
<ol>{install}</ol>
<h3>{h_rec}</h3>
<ul>{rec}</ul>
<h3>{h_share}</h3>
<ul>{share}</ul>
<h3>{h_others}</h3>
<ul>{others}</ul>

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
    s = re.sub(r'\{r:([^}]*)\}', rf'<a href="{up}?recorder">\1</a>', s)
    s = re.sub(r'\{a:([^}]*)\}', rf'<a href="{up}bitacora/">\1</a>', s)
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
