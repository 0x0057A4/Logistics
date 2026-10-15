# Schnittstellen Welle 2a (Version 0.10) – A01

Stand 15.10.2026. Grundlage: BALANCING-0.9-W1.md (B2 Ausbau ohne Wirkung, B3 keine Strafe), Warenplanung (Welle 2: Palette, Kühlware, Sperrgut).

## Ziel und Abnahme
Überlast muss Geld kosten. Paletten-Verträge erzwingen Stapler, Lkw und Regalplatz statt Sortierung.
- Spät zugestellte Pakete kosten Vertragsstrafe; liegengebliebene bei Vertragsende ebenfalls – jeweils genau einmal gebucht.
- Palettenvertrag: Lkw bringt Paletten, Entladen nur mit Stapler + Lagerkraft, Einlagerung ins Regal, Zustellung nur mit Lkw (nicht Lieferwagen), Zahlung je Palette.
- Speichern/Laden in jeder Phase; Mengen erhalten; Determinismus.

## W2-S1 Vertragsstrafe (A08, contracts.js/economy.js)
- `contract.penaltyLate` €/Einheit: fällig je Einheit, die nach `order.due` zugestellt wird (zusätzlich zum bestehenden Abschlag 10 %), Buchung `penalty:<shipmentId>` Kategorie „Vertragsstrafe“.
- `contract.penaltyOpen` €/Einheit: bei Vertragsende + 1440 min je noch nicht zugestellter Einheit der Vertragsaufträge, Buchung `penalty-open:<orderId>`, Auftrag danach `status:'cancelled'`, Fremdware bleibt bis Rückgabe… (W2a: Ware wird an Versender zurückgegeben = aus Bestand entfernt über inventory API, protokolliert).
- Werte in TERMS, Balancing A02 später.

## W2-S2 Paletten und Stapler (A05+A07)
- `ITEMS.pallet` {name:'Palette', price:0, volume:1, weight:300} (A01 legt an). Kein Sortieren: Paletten gehen beim Entladen direkt nach `stock` (Owner = Auftrag).
- `BUILDINGS.forklift` {name:'Staplerplatz', w:1,h:1, cost 6500, power 2, role warehouse} (A01 legt an): 1 Stapler je Gebäude; Feld `b.charge` 0–100 (Start 100): Arbeit −0,5/min, Laden im Leerlauf +1/min; unter 10 nicht einsatzbereit.
- Vertrag `contract.unit:'parcel'|'pallet'` (Standard parcel). Palettenverträge: 6–20 Paletten je Ankunft, nur Lkw (VEHICLES.truck) kann zustellen (`maxLoad` regelt Gewicht: van 80 kg → 0 Paletten).
- Entladen Paletten (yard.js): braucht Lagerkraft UND freien, geladenen Stapler am Standort (Bindung `${arrival.id}:forklift` in `b.task` des Staplerplatzes), Rate 1 Palette/min × workRate-Faktor; Wartegründe „Kein Stapler“, „Stapler lädt“.
- Beladen von Paletten auf eigenen Lkw: ebenfalls Stapler (transport/tours) – sonst Wartegrund.

## Dateibereiche
| Agent | Darf | Nicht |
|---|---|---|
| A08 | contracts.js, economy.js, Tests contracts-*/penalty-* | yard, sorting, transport, scene*, app (UI-Teil A10 später) |
| A05/A07 | yard.js, sorting.js, inventory.js, transport.js, tours.js, Tests yard-*/pallet-* | contracts (nur Vertragsfeld `unit` lesen), app, scene* |
| A11 | nur Tests/docs | Produktcode |
Danach Welle 2b: A09 (Stapler-/Palettenmodell), A10 (UI Strafe, Paletten, Stapler-Akku), A02 (Balancing).
