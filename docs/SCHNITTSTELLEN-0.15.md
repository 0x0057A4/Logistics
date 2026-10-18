# Schnittstellen 0.15 – Wirtschaft + Grafik-Rahmen (A01)

Stand 17.10.2026. Fahrplan: docs/FAHRPLAN-BIS-1.0.md (Nutzer: „Ja“).

## Abnahme
- GuV (Ergebnisrechnung) je Zeitraum (heute, 7 Tage, gesamt) aus echten Buchungen + Abschreibung; Abschreibung bewegt **kein Geld** (nur Ergebnis), Anlagenwert sinkt nachvollziehbar.
- Warenarten Kühlpaket und Sperrgut mit eigenen Anforderungen (Kühlung bzw. kein Sortierer/großes Volumen), in Verträgen, Hof, Sortierung, Lager, Transport.
- Mega-Hub: großer Sortierer (Quergurt) als Ausbaustufe mit Forschung; Mehrwertdienste als Geschäftsfeld (bisherige Fertigung).
- Grafik-Rahmen: Qualitätsstufen Niedrig/Mittel/Hoch (automatisch nach Messung), LOD, Budget-Prüfung.
- Speichern/Laden, Determinismus, bestehende Abläufe erhalten.

## Katalog (A01 angelegt, Werte vorläufig)
- `ITEMS.parcel_cold` (Kühlpaket, cold:true, Volumen 0,05, Gewicht 0,5) · `ITEMS.bulky` (Sperrgut, Volumen 0,6, Gewicht 25, noSorter:true)
- `BUILDINGS.crossbelt` (Quergurtsorter, 6×3, 60.000 € (A02, vorher 120.000), Durchsatz 2.400/h, Personal 2, Strom 12) · `RESEARCH.megahub` (Mega-Hub, 12.000 € (A02, vorher 20.000), 240 Min.)

## S1 GuV + Abschreibung (A08: accounting.js, economy.js, core-Anlagenfelder minimal)
- Anlagen: Gebäude und gekaufte Fahrzeuge mit `acquiredAt`, `cost` (neue Käufe setzen Felder; Altbestand: aus Ledger ableiten oder Startzeitpunkt, dokumentieren). Lineare Abschreibung: Gebäude 180 Spieltage, Fahrzeuge 90 Spieltage, Restwert 0; Abriss/Verkauf → Restbuchwert als Abgang.
- GuV: Umsatz (Zustellung, Handling, Luft), Material/Einkauf, Personal, Energie, Miete, Transport, Wartung, Strafen, Lagergeld, Zinsen, Abschreibung → Betriebsergebnis, Ergebnis nach Zinsen. Reine Auswertung (`report(s,{from,to})`), keine neuen Geldbuchungen außer ggf. Abgang beim Abriss (kein Geld).
## S2 Warenarten (A05+A08: contracts.js content, sorting.js, inventory, transport/tours maxLoad, yard)
- Kühlpaket: nur in Kühllager-Kapazität einlagerbar (special.js-Regeln: Temperatur/Qualität), Sortierung nur mit Kühllager am Standort, Zustellung nur Kühlfahrzeug; Verträge mit content parcel_cold (Preiszuschlag).
- Sperrgut: nie über Sortierplatz/Quergurt; Handumschlag (Lagerkraft + Stapler) direkt nach stock; Lieferwagen nur wenige (Volumen/Gewicht), Lkw bevorzugt; Verträge mit content bulky.
## S3 Mega-Hub + Mehrwertdienste (A04: sorting.js-Anbindung crossbelt, production.js, contracts/economy Mehrwertdienst-Angebote)
- Quergurt: Bau nur nach Forschung megahub; Durchsatz 2.400/h mit 2 Lagerkräften (1 Kraft = halbe Leistung), Strom; Fehlwurfquote 1 % → Nachsortierung von Hand (Vorbild „Reject“).
- Mehrwertdienste: Kundenaufträge „Lohnfertigung/Verpackung“ – Kunde liefert Material (Fremdeigentum), wir fertigen/verpacken mit bestehenden Rezepten, Vergütung je Stück; Fertigware bleibt Kundeneigentum und wird zugestellt.
## S4 Grafik-Rahmen (A12+A09: scene3d.js, perf-overlay.js, app.js Einstellungen)
- `scene.setQuality('low'|'medium'|'high'|'auto')`: Pixelratio, Schattenandeutung, Instanz-Obergrenzen, Labels, Netz-Details. Auto: nach gemessener Frame-Zeit (10 s gleitend), Hysterese.
- LOD: entfernte Fahrzeuge/Personen/Pakete vereinfacht oder ausgeblendet; Budget-Konstanten (Draw Calls ≤ 150, Dreiecke je Stufe) mit Test, der jede Probe-Szene je Stufe prüft.
## Dateibereiche
| Agent | Darf | Nicht |
|---|---|---|
| A08 GuV | accounting.js, economy.js, core.js (nur Anlagenfelder/Validierung), Tests guv-* | app, scene* |
| A05+A08 Warenarten | contracts.js, sorting.js, inventory.js, special.js, transport.js, tours.js, yard.js, Tests ware-* | accounting, production, app, scene* |
| A04 Mega-Hub/MWD | production.js, sorting.js (nur crossbelt-Teil, mit A05 abstimmen: Funktion je Sortiertyp), economy.js (nur MWD-Angebote), Tests megahub-*/mwd-* | contracts (nur lesen), app, scene* |
| A12+A09 Grafik-Rahmen | scene3d.js, perf-overlay.js, app.js (nur Einstellung Qualität), Tests quality-* | Fachmodule |
Danach: A10 UI (GuV, Warenarten, Quergurt, MWD, Qualität), A09 Modelle Quergurt/Kühl/Sperrgut, A02 Balancing, A11.
