# assembly/ — shared with KLAP

`tbt.js`, `room.js`, `ascii.js` and `presence.js` are byte-identical copies of
KLAP's `web/static/js/assembly/` (the Klimat Action Protocol's live assembly).
Do not edit them here: fix them in both repos and check with

    tools/check_assembly_sync.sh ../Klap/KlimatActionProtocol

Everything AFPP-specific lives outside this folder (`../afpp-assembly.js`,
`src/afpp/`). Credits and licences (GPLv3) are in each file's header:
TBT by Jaromil and rgareus (dyne.org), hasciicam by Jaromil, the room relay
protocol from chatb (r-w-x.org/r/chatb).
