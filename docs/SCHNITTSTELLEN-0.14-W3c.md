# Schnittstellen Welle 3c – Luftexport, Dispositionsassistent, Replay (A01)

Stand 17.10.2026. Nutzer: „Weiter“ zu Welle 3c.

## Ziel und Abnahme
- **Luftexport:** Vertrag mit fester Flugabfahrt. Pakete werden im Hub angenommen und sortiert und müssen vor Annahmeschluss am (fiktiven) Flughafen-Frachtterminal sein. Der Transport läuft per eigenem Zubringer-Lkw. Verpasster Annahmeschluss heißt nächster Flug, dazu Strafe. Bezahlt wird bei Übergabe am Terminal.
- **Dispositionsassistent** (Vorbild „Jev“): je Standort zuschaltbar. Übernimmt Routineentscheidungen über reguläre Befehle (Zustellung nach Frist und voller Ladung, Linienzuordnung freier Lkw, Vorziehen gefährdeter Lkw am Tor). Jede Entscheidung wird mit Grund protokolliert. Aus heißt: nur Standardregeln. Kein KI-Dienst, deterministisch.
- **Replay 60 Min.:** die letzten 60 Spielminuten als Ansicht zurückspulen (Momentaufnahmen alle 5 Spielminuten, nur im Speicher, nicht im Spielstand). Simulation pausiert im Replay. Fachzustand bleibt unverändert, zurück zu „Live“ jederzeit.
- Für alle drei gilt: speichern und laden möglich, wo fachlich relevant (Luftexport, Assistent-Einstellung). Keine doppelten Buchungen.

## W3c-S1 Luftexport (A08+A07, neues Modul dist/airexport.js)
- Fester Knoten `AIRPORT` (fiktiver Name, Koordinaten in airexport.js) als Ziel, kein kaufbarer Standort.
- Vertrag `unit:'air'` in contracts.js: Pakete, `flights:[minuteOfDay]`, `cutoff` (Min. vor Abflug, z. B. 90), Preis je Paket hoch, `penaltyMissed` je Paket bei verpasstem Flug. Aufträge item 'parcel', `deliverySite`=Annahme-Hub, `airExport:true`.
- Zubringer (`s.airShuttles[]`): Spieler legt Zubringerfahrt mit Lkw/Lieferwagen an (Befehl `dispatchAirShuttle{vehicleId,flight}`) oder Assistent. Beladen wie Linie (Dock + Lagerkraft), Fahrt zum AIRPORT (Distanz), Übergabe = Zustellung → Rechnung/Zahlung über bestehende Zahlungslogik (Buchung `air:<id>`), Rückfahrt leer. Ankunft nach Annahmeschluss → Ware wartet auf nächsten Flug am Terminal (Lagergeld klein) + Strafe einmal je Auftrag/Flug.

## W3c-S2 Assistent (A06/A07, neues Modul dist/assistant.js)
- `s.assistant = {sites:{[siteId]:{enabled, dispatch:true, lines:true, gate:true, budget}}, log:[]}` (log max. 200).
- Takt je 5 Min. pro aktivem Standort, ausschließlich über `api.command` mit regulären Befehlen. Keine Sonderrechte, gleiche Kosten und Grenzen.
- Regeln: Zustellung starten, wenn Fahrzeug frei und Auftrag in < 3 h fällig oder volle Ladung möglich. Verpasste Linienabfahrt → Lkw zuordnen. Lkw am Tor mit atRisk vorziehen. Luftzubringer rechtzeitig vor Annahmeschluss.
- Jede Entscheidung mit Grund und Bezug ins Log und in `api.log`.

## W3c-S3 Replay (A12+A10+A09, app.js/neues dist/replay.js, scene3d.js)
- Ringpuffer im Speicher mit 13 Momentaufnahmen (alle 5 Spielminuten, 0–60 Min.), komprimiert als JSON-String. Bei großen Ständen Puffer verkleinern, Speicherbudget ca. 30 MB.
- Replay-Leiste (Uhr-Knopf, Taste Z): Regler −60…0 Min., Abspielen ×4, „Live“. Im Replay rendert die Szene einen Snapshot-Zustand (`scene.setState(snapshotState)`), das HUD zeigt „Replay −25 Min.“. Befehle sind gesperrt, die Simulation pausiert. Zurück heißt: Live-Zustand wieder setzen.
- Keine Fachmutation, kein Einfluss auf den Spielstand.

## Dateibereiche
| Agent | Darf | Nicht |
|---|---|---|
| A08+A07 Luftexport | airexport.js, contracts.js, transport.js (nur Freigabe falls nötig), Tests air-* | assistant, app, scene* |
| A06/A07 Assistent | assistant.js, Tests assistant-* | Fachmodule (nur über Befehle), app, scene* |
| A12/A10/A09 Replay | replay.js, app.js (Replay-Teil), index.html, styles.css, scene3d.js (nur setState-Nutzung), Tests replay-* | Fachmodule |
Danach: A10 (UI Luftexport + Assistent), A09 (Flughafen-Zubringer optisch), A11.
