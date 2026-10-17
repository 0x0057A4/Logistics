# Schnittstellen Welle 3b – Containerhof und Seeimport (A01)

Stand 17.10.2026. Nutzerfreigabe: „Ja“ zu Welle 3b. Vorbild-Stationen: Containerhof (TEU), Containerchassis (Zubringer vom Seehafen).

## Ziel und Abnahme
Seeimport-Vertrag: Containerchassis bringt Container vom (fiktiven) Seehafen, stellt sie im Containerhof ab und fährt. Container wird zum Dock geholt und entladen (Stapler + Lagerkraft), Inhalt (Paletten oder Pakete) läuft in den bestehenden Ablauf (Paletten → Regal, Pakete → Sortierung → Zustellung/Linie). Leercontainer wird abgeholt. Steht ein Container länger als die Freizeit, fällt Lagergeld (Demurrage) an.
- Mengen, Eigentum, Strafen, Lagergeld je genau einmal; Speichern/Laden in jeder Phase; Containerhof-Kapazität (TEU) begrenzt.

## W3b-S1 Vertrag (A08, contracts.js)
- `contract.unit:'container'`, `contract.content:'pallet'|'parcel'`, `unitsPerContainer` (z. B. 18–22 Paletten oder 500–700 Pakete), Ankünfte 1–3 Container je Ankunft, Preis je Container (Handling) + bestehende Inhaltspreise/Strafen nach Inhalt, `freeMinutes` (Freizeit im Hof, z. B. 1440), `demurragePerHour` (€/Std. je Container danach).
- Angebote nur mit Containerhof (`containeryard`) am Standort oder ab Tag 5. Aufträge entstehen für den Inhalt (item = content) je Gebiet wie bisher (Eigentum Auftrag, deliverySite).
- Lagergeld bucht A08 (`demurrage:<containerId>:<stunde>` oder gebündelt täglich, idempotent), Kategorie „Lagergeld“.

## W3b-S2 Hof, Containerhof, Entladen (A07/A05)
- `BUILDINGS.containeryard` (A01 angelegt): 4×3, Kapazität `teu` 8.
- `s.containers[]`: `{id, site, contractId, orderIds, content, qty, unloaded, status:'arriving'|'yard'|'toDock'|'unstuffing'|'empty'|'pickup'|'gone', arrivedAt, freeUntil, dock|null}`.
- Ankunft: yard.js-Arrival mit `kind:'container'` (Fahrzeug Containerchassis, Kennzeichen wie bisher), Phasen approach→gate→toYard (statt toDock)→drop (2 Min)→exit; braucht freien TEU-Platz, sonst Warteschlange mit Grund „Containerhof voll“. Ohne Containerhof: Abstellen direkt am Dock nicht erlaubt → Wartegrund.
- Entladen: Befehl `unstuffContainer{id}` oder automatisch wenn Dock + Stapler + Lagerkraft frei (Regel: automatisch, älteste zuerst). Container fährt zum Dock (Hofumfuhr 3 Min, kein eigenes Fahrzeug nötig in 3b), Entladerate Paletten 1/min bzw. Pakete 20/min × workRate, Inhalt per inventory.add mit owner = Auftrag (Paletten stock, Pakete inbound), mergeKey = container.id.
- Leer → zurück in Hof (`empty`), Abholung: neue Chassis-Ankunft automatisch 120–240 Min später (`pickup`), danach `gone` (nach 1 Tag entfernen).
- Lagergeld läuft ab `freeUntil` bis Abholung (Status yard/toDock/unstuffing/empty) – Zeitquelle für A08: Feld `demurrageMinutes` am Container (von yard/container-Logik je Minute fortgeschrieben).

## Dateibereiche
| Agent | Darf | Nicht |
|---|---|---|
| A08 | contracts.js, economy.js (Kategorie), Tests contracts-*/container-contract-* | yard, containers, app, scene* |
| A07/A05 | yard.js, neues dist/containers.js (von A01 registriert), inventory.js, sorting.js, Tests container-* | contracts (nur Felder lesen), app, scene* |
Danach: A09 (Chassis, Container-Stapel im Hof, Umfuhr), A10 (Fenster/Akte Containerhof, Torbuch, Lagergeld), A11.
