# Schnittstellen Welle 3a – Linienverkehr zwischen eigenen Standorten (A01)

Stand 17.10.2026. Nutzer: „Welle 3“. Aufteilung: 3a Linienverkehr (diese Datei), 3b Containerhof/Seeimport, 3c Luftfracht, Assistent, Replay.

## Ziel und Abnahme
Paketreise wie im Vorbild: Annahme-Hub A → Sortierung A → Hauptlauf (Linie, Lkw) → Ziel-Hub B → Sortierung B → Zustellung ab B → Zahlung.
- Zustellgebiete gehören einem Standort. Pakete für Gebiete von B werden in A nicht zugestellt, sondern über eine Linie nach B gebracht.
- Linie: fester Fahrplan (Abfahrtsminuten), zugeordneter Lkw, Ladeschluss. Verpasste Abfahrt = nächste Abfahrt.
- Mengen, Eigentum (Auftrag), Fristen, Strafen bleiben konsistent; Speichern/Laden in jeder Phase.

## W3-S1 Gebiete und Aufträge (A08, contracts.js)
- `lane.site` (Standort-ID, Standard = Vertragsstandort). Angebote mit Fremdgebieten nur, wenn ≥ 2 Standorte; Preis + Frist höher (Werte TERMS).
- Auftrag: `deliverySite` (= lane.site; fehlt → order.site). `order.site` bleibt Annahme-Hub.
- validate: deliverySite existiert.

## W3-S2 Linien (A07/A05, neues Modul dist/linehaul.js, registriert von A01)
- `s.lines[]`: `{id, from, to, departures:[min 0–1439], vehicleId|null, cutoff (min vor Abfahrt, Standard 30), active}`; Befehle `createLine{from,to,departures,vehicleId}`, `updateLine`, `deleteLine` (nur ohne laufende Fahrt).
- `s.linehauls[]` (Fahrten): `{id, lineId, vehicleId, from, to, status:'loading'|'transit'|'unloading'|'returning'|'complete', cargo:[batchIds], qty, remaining, duration, distance, departAt}`.
- Ladeschluss: zum Zeitpunkt Abfahrt−cutoff werden alle freien Pakete in `stock` am Standort `from` mit `order.deliverySite===to` reserviert (bis Fahrzeugkapazität, früheste Frist zuerst). Beladen mit Dock + Lagerkraft (wie transport.js), Paletten mit Stapler (Regeln W2).
- Ankunft B: Dock + Lagerkraft entladen → Chargen am Standort B in `inbound` (Eigentum bleibt) → Sortierung B (sorting.js unverändert nutzbar).
- Dispatch/Tour (transport.js/tours.js): Auftrag mit `deliverySite` ≠ aktueller Standort darf dort NICHT zugestellt werden; Zustellung nur am deliverySite. Reservierbar am deliverySite.
- Fahrtkosten wie Transfer (Distanz × runningCost), Buchung `linehaul:<id>` Kategorie Transport. Kein Umsatz.
- inventory: Standortwechsel fremder Ware über API (transfer → vehicle, Ankunft add/relocate an B), keine doppelten/negativen Mengen.

## Dateibereiche
| Agent | Darf | Nicht |
|---|---|---|
| A08 | contracts.js, economy.js (nur falls nötig), Tests contracts-*/lane-* | linehaul, yard, transport, app, scene* |
| A07/A05 | linehaul.js, transport.js, tours.js, inventory.js, sorting.js, Tests linehaul-* | contracts (nur Felder lesen), app, scene* |
Danach 3a-2: A09 (Linien-Lkw auf Netzkarte/Straße), A10 (Fenster „Linien“, Paketreise), A11.
