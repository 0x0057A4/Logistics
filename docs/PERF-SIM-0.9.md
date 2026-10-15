# Leistung Simulationsschritt 0.9 (A03, Welle 0, S4)

Stand: 15.10.2026. Ziel: 60 FPS bei 12× Zeitraffer, auch mit großen und langen Spielständen, ohne dass sich fachliches Verhalten ändert.

## Budget

12× bedeutet 12 Spielminuten je Sekunde. Bei 60 FPS sind das ≈ 0,2 Spielminuten je Frame (16,7 ms). Eine Spielminute darf also im Mittel deutlich unter 83 ms liegen. Mit Darstellung und HUD im selben Frame sollte die Simulation höchstens wenige Millisekunden je Frame belegen.

## Messaufbau

- `node tests/perf-sim.mjs` (oder mit `--json`). Gemessen wird nur `sim.step(1)` je Spielminute, ohne Spielerpolitik und Aufbau. Szenarien in `tests/perf-scenarios.mjs`, fester Seed.
- **klein:** ein Standort, Startbetrieb wie `tests/balance-performance.mjs`, 480 Minuten.
- **groß ohne Historie:** Sandkasten, sechs Standorte (drei mit Doppellinie), 50 Gebäude, 42 Beschäftigte, Kühllager und Kühlfahrzeug mit Standorttransfer, 1440 Minuten Vorlauf, danach 480 Minuten gemessen (Tagschicht).
- **groß + 25.000 Nullchargen:** wie oben. Zusätzlich 25.000 verbrauchte Chargen (`qty=0`) mit Herkunftsketten vor den aktiven Chargen. Das bildet einen langen Spielstand nach. Testaufbau: Die Chargen werden in den serialisierten Zustand eingefügt und mit `Simulation.fromJSON` vollständig validiert geladen. Alles Übrige läuft über reguläre Befehle; Kühlmodule und Fertigware entstehen als Fixture über `api.inventory.add`, wie in den Bestandstests.
- Maschine: Intel Xeon @ 2,80 GHz, 4 Kerne, Linux 6.18, Node v22.22.0. Andere Prozesse liefen gleichzeitig. Deshalb sind je zwei Läufe angegeben.

## Ergebnisse (ms je Spielminute)

| Szenario | Chargen | vorher Median | vorher p95 | nachher Median | nachher p95 | Frame bei 12× vorher → nachher (Mittel) |
|---|---|---|---|---|---|---|
| klein | 182 | 0,054 / 0,064 | 0,235 / 0,265 | 0,047 / 0,044 | 0,224 / 0,206 | 0,02–0,03 → 0,02–0,03 ms |
| groß ohne Historie | 2.363 | 1,087 / 1,044 | 2,445 / 2,488 | 0,310 / 0,294 | 2,070 / 1,221 | 0,24–0,26 → 0,10–0,11 ms |
| groß + 25.000 Nullchargen | 27.363 | **53,5 / 41,7** | **144,3 / 83,0** | **0,496 / 0,472** | 4,838 / 1,308 | **9,2–12,9 → 0,14–0,21 ms** |

Vorher belegte der lange Spielstand bei 12× im Mittel 55–77 % eines Frames, in Spitzen mehr als einen ganzen Frame. Nachher liegt er unter 1,3 %. Die Höchstwerte (vorher 192–334 ms, nachher 17–22 ms) sind einzelne Ausreißer durch Speicherbereinigung oder Fremdlast und daher nicht reproduzierbar. Die Hashes der Endzustände sind vorher und nachher gleich: `31c1d56e…`, `66f055da…`, `a0777cdd…`.

## Maßnahmen

Alle Maßnahmen sind laufzeitlokal: eine `WeakMap` am Zustand oder lokale Variablen eines Minutenschritts. Nichts wird serialisiert. Nach `fromJSON` und in `forecast` werden die Indexe neu aufgebaut.

- `inventory.js`: Positionsindex ID → Arrayposition für alle Suchen nach einzelnen Chargen (release, consume, move, remove, relocate, restore, Rückruf, Rückruf-Erbe in `add`). Treffer werden an der Arrayposition gegengeprüft.
- `inventory.js`: Aktivliste aller Chargen mit `qty!==0||reserved!==0`, gruppiert je Standort und je Standort+Artikel, in Arrayreihenfolge. `available`, `reserve` (FIFO), `used` laufen nur über die passende Gruppe. Nullchargen bleiben als Herkunft im Array.
- `inventory.js`: `capacity` je Standort zwischengespeichert, bis die Gebäudeliste sich ändert oder eine Spielminute vergeht.
- `production.js`: Aufträge je ID für den Minutenschritt. Strombilanz in einem Durchlauf statt zweier Filter je Standort.
- `special.js`: Kühlschritt nur über die Aktivliste. Die Ladungszuordnung (Lieferung, Transfer, Retoure, Tour) wird erst bei der ersten Fahrzeugcharge einmal je Minute aufgebaut, statt pro Charge alle Fahrten zu durchsuchen.
- `economy.js`: unverändert; der vorhandene Buchungsindex genügt.

Reihenfolge und Gleitkomma-Summation bleiben die des Arrays. Nullchargen tragen exakt 0 bei.

## Invalidierung und Annahmen

- Wird `s.batches` ersetzt, gekürzt oder wechselt das letzte Element (Prüfung über Referenz, Länge und letztes Element), baut der Index sofort vollständig neu auf. Angehängte Chargen werden nachgetragen.
- In-place-Umsortierung (gleiche Referenz, Länge und letztes Element, z. B. Tausch zweier Chargen) erkennt die nächste Auffrischung der Aktivliste (nächste Spielminute oder Standortwechsel über `move`/`relocate`): Zu jeder aktiven Charge ist ihre Arrayposition gespeichert; steht dort nicht mehr dieselbe Charge, folgt ein vollständiger Neuaufbau. Kosten: ein Arrayzugriff je aktiver Charge und Auffrischung. Innerhalb derselben Minute vor der Auffrischung folgen `available`/`reserve` noch der alten Reihenfolge; `findBatch` erkennt eine verschobene Charge sofort über seine Gegenprüfung. Kein Spielmodul sortiert `s.batches` in place (QS-W0-07).
- Je Spielminute (`s.t` ändert sich) und nach Standortwechsel über `move` oder `relocate` frischt die Aktivliste aus den bisher aktiven und den neu angehängten Chargen auf: O(aktive Chargen). `location`, `owner`, `blocked`, `locked` und `site` werden bei jeder Abfrage live geprüft.
- **Annahme:** Nur `inventory.js` schreibt `qty`, `reserved`, `site` und `item` einer Charge. Eine Nullcharge wird nie wieder befüllt. `tests/perf-index.test.js` prüft die Quelltexte in `dist/` darauf. Eine direkte Wiederbefüllung einer Nullcharge außerhalb der API, etwa per Konsole, bliebe bis zum nächsten vollständigen Neuaufbau unsichtbar. Ein direkter Standortwechsel außerhalb der API wirkt erst ab der nächsten Spielminute. Beides kommt im Spiel nicht vor.

### Nachtrag QS-W0-07 (Positionsprüfung der Aktivliste)

Gleiche Maschine, je drei abwechselnde Läufe `node tests/perf-sim.mjs`, Median / p95 in ms je Spielminute:

| Szenario | ohne Prüfung | mit Prüfung |
|---|---|---|
| groß ohne Historie | 0,300 / 0,264 / 0,303 (p95 0,741 / 0,535 / 0,747) | 0,283 / 0,286 / 0,284 (p95 0,723 / 0,686 / 0,846) |
| groß + 25.000 Nullchargen | 0,456 / 0,450 / 0,437 (p95 0,805 / 0,887 / 2,311) | 0,463 / 0,501 / 0,484 (p95 0,829 / 0,924 / 1,250) |

Unterschied im Rauschen der Fremdlast; Ziel (< 1 ms je Spielminute im Median) eingehalten. Hashes unverändert (`tests/perf-determinism.test.js` grün). Eine erste Variante mit `Map`-Lookup je aktiver Charge kostete ≈ +15–25 % und wurde verworfen.

## Prüfungen

- `tests/perf-determinism.test.js`: 13 Zustandshashes in vier Szenarien. Erzeugt mit dem unveränderten Code (Commit `d81c0e0`, Fachcode wie `f986e5d`). Abgedeckt sind Produktion über 1200 Minuten mit Nacht, Einkauf, Lieferung, Sammeltour, Retoure, Rückruf, Kühlkette mit späterem Kühllager, Wartung, multimodale Fracht, sechs Standorte mit Kühltransfer und 3.000 Nullchargen sowie `forecast`. Nach der Optimierung sind alle Hashes gleich.
- `tests/perf-index.test.js`: Eine Zufallsfolge von 3.000 Lageroperationen vergleicht `available`, `used`, `capacity`, FIFO-Reservierungen und ID-Suche bitgenau mit den alten linearen Formeln. Dabei ändern fremde Module Felder direkt. Weitere Prüfungen: Der Index steht nicht im Spielstand. Ein ersetztes, gekürztes oder umgedrehtes Array baut den Index neu auf; ein In-place-Tausch bei gleichem letztem Element wird bei der nächsten Auffrischung erkannt (QS-W0-07). Andere Module schreiben die Indexfelder nicht.
- `npm test`: 202 von 202 grün (194 Bestand + 8 neu).

## Aussagegrenzen

- Gemessen wurde in Node, nicht im Browser. Darstellung, HUD und Speicherbereinigung des Browsers sind nicht enthalten. Für 60 FPS entscheiden Szene und HUD (A09/A10).
- Die Lastszenarien sind synthetisch. Die Spielerpolitik nimmt nur Leuchtenaufträge an, deshalb gibt es wenige Lieferungen.
- Restkosten außerhalb von A03: `economy.book` (Lohnbuchung je Person und Minute, Regex je Aufruf), `workforce.acquire` (lineare Personensuche) und lineare Suchen in `transport.js`, `tours.js`, `service.js` und `multimodal.js` bei Zustellungen. Bei großen Ständen spielen sie keine Rolle.
- **Befund für A01/A12:** `validateState` lehnt Arrays mit mehr als 100.000 Einträgen ab. Im großen Szenario entstehen ≈ 1.770 Chargen je Spieltag. Nach etwa 55 Spieltagen (bei 12× ≈ 110 Stunden Echtzeit) wäre ein Spielstand nicht mehr ladbar. Vor allem `s.batches` wächst unbegrenzt; das Ledger wächst durch die Tagesaggregation langsamer.
