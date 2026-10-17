# QS 0.12 – Linienverkehr zwischen eigenen Standorten (A11, unabhängig)

Stand 17.10.2026. Geprüft: `claude/loving-wozniak-56yxt7` bis 27b8784 (Welle 3a). Kein Produktcode geändert.
Grundlage: SCHNITTSTELLEN-0.12-W3 (Abnahme), AGENTS.md (Pflicht-Übergänge), QS-0.10. Eigene Szenarien, Entwicklerangaben nicht übernommen.
Budget knapp: nur Risikoprüfung.

## Ergebnis

**Freigabe 0.12: ja, mit Auflage.** Die Abnahme ist erfüllt. Echter Mischvertrag (Gebiete an A und B aus dem Angebotsstrom):
Annahme A → Sortierung A → Linie → Entladen B → Sortierung B → Zustellung ab B → Zahlung. B-Pakete sind an A nicht zustellbar.
Mengen, Eigentum, Fristen (extraSla), Strafen und Fahrtkosten bleiben konsistent. Laden in jeder Linienphase gibt denselben Endhash.
Kein Befund verliert Ware oder bucht Geld doppelt.
Auflage: QS-W3-01 in 0.12.x beheben. Der Fehler kann den Ziel-Hub bei vollem Lager festsetzen.

| Befund | Schwere | Rolle |
|---|---|---|
| QS-W3-01 Lager am Ziel voll: Linienfahrt hält Lagerkraft und Stapler am Ziel ohne Fortschritt | mittel | A07/A05 |
| QS-W3-02 Späte Abfahrt (15:00) mit Tagschicht: Lkw steht über Nacht am Ziel-Dock, Formular warnt nicht | niedrig | A10/A02 |
| QS-W3-03 Versionsanzeige „0.11 · ENTWICKLUNG“ | niedrig | A12 |

## Befunde

### QS-W3-01 Lager am Ziel voll: Fahrt hält Lagerkraft und Stapler (mittel, A07/A05)
- Ausgang: A und B, Linie A→B, B mit 1 Lagerkraft. Lager B vor Ankunft mit Firmenware gefüllt (Testdaten über `inventory.add`).
- Repro: Linien-Lkw kommt an. Er entlädt alle Minuten, dann gilt `remaining=0` und der Wartegrund „Lager am Ziel voll“.
- Erwartet: Ohne Fortschritt keine Bindung, wie QS-W2-01. Lagerkraft und Stapler am Ziel sind frei für Sortierung, Hof und Zustellung.
- Tatsächlich: `linehaul.js` im Zweig `unloading` ruft nach der letzten `handling`-Minute `endHandling` erst nach erfolgreichem
  `relocate` auf. Bei `WAIT.full` bleibt `<id>:warehouse` gebunden. Bei Paletten bleibt auch `<id>:forklift` gebunden,
  weil `forkliftHolderActive` den Status `unloading` gelten lässt. Gemessen: nach 30 Min. Wartezeit sind 1 Lagerkraft und 1 Stapler gebunden.
  Folge (aus dem Code abgeleitet, nicht als Langlauf gemessen): Mit nur einer Lagerkraft an B kann B weder sortieren noch Fahrzeuge
  beladen. Zustellung würde Platz schaffen, also löst nur ein Eingriff des Spielers die Sperre.
  Ware und Mengen bleiben korrekt. Nach Platzfreigabe entlädt die Fahrt einmal (geprüft).
- Vorschlag: Bei `WAIT.full` (und `WAIT.cargo`) `endHandling` aufrufen. Dock darf gehalten werden.
- Test: `tests/qa-w3.test.js` QS-W3-01 und QS-W3-01b (todo).

### QS-W3-02 Späte Abfahrt läuft über Nacht (niedrig, A10/A02)
- Ausgang: Linie 12:00 und 15:00, Personal in Tagschicht (8–16 Uhr). Das ist der Standard beim Einstellen.
- Gemessen (Seed 1): 15:00-Fahrt ab 15:00, Ankunft B ≈ 15:57. Lagerkraft B hat um 16:00 Schichtende.
  Entladen endet erst am Folgetag um 08:01. Der Lkw hält über Nacht Dock B und Fahrpersonal A.
  Die 38 Pakete dieser Fahrt hatten Frist 22:00 und werden erst am Folgetag zugestellt. Seed 1 und Seed 2 haben je 2 Verspätungsstrafen.
  Die Ursache wurde nur für Seed 1 nachgeprüft. Fachlich ist das regelkonform.
- Vorschlag: Das Linienformular soll warnen, wenn Abfahrt + Fahrzeit + Entladen außerhalb der Schicht am Ziel liegt.
  Alternativ einen Handbuchsatz ergänzen.

### QS-W3-03 Versionsanzeige (niedrig, A12)
- `dist/app.js` Z. 90 `VERSION='0.11 · ENTWICKLUNG'`. Die Statusleiste zeigt 0.11. Vor der Veröffentlichung auf 0.12 anheben.

## Bestandene Prüfungen (selbst ausgeführt)

Node `tests/qa-w3.test.js` (12 bestanden, 2 todo). Nur reguläre Befehle. Testdaten: Vertragslaufzeit 2 Tage vor der Annahme
(Vertragsende im Prüfzeitraum), Lkw-Zustand 80 % (Wartung erst unter 100 % erlaubt), Kasse −10.000 €, Lager B voll.
- **Ende-zu-Ende, Seeds 1–3, je 4 Tage.** 2 Standorte, Mischvertrag aus dem Angebotsstrom, Linie 12:00/15:00, Spielerdisposition je Standort.
  Invarianten alle 5 Min., je Seed 1152 Prüfungen:
  - `offen im Hof + Bestand A + Bestand B + unterwegs + zugestellt + zurück = qty`;
  - keine negativen Mengen, keine Überreservierung;
  - jede Lieferung oder Tour ab `deliverySite`;
  - Zahlungen und Strafen genau einmal;
  - `validateState`.
  An A wird jede Minute versucht, B-Ware zuzustellen (Einzel und Tour): immer abgewiesen.
  | Seed | Aufträge A/B | B zugestellt | B bezahlt | Linienfahrten | verpasst (inkl. leer) | Strafen spät/offen |
  |---|---|---|---|---|---|---|
  | 1 | 2/2 | 110/110 | 933,58 € | 4 | 4 | 2/0 |
  | 2 | 4/4 | 140/140 | 1.087,94 € | 4 | 4 | 2/0 |
  | 3 | 2/4 | 78/78 | 735,54 € | 2 | 6 | 0/0 |
  - Fristen: für jeden neuen Auftrag gilt `due = lastEta + slaMinutes + extraSla`. Für B gilt `extraSla = remoteTerms = 300`, Zuschlag 1,18 €.
  - Fahrtkosten: je abgefahrener Fahrt genau eine Buchung `linehaul:<id>`, Betrag = `cost`, Kategorie Transport, kein Umsatz.
  - Vertragsende: alle Aufträge sind abgerechnet.
- **Laden in jeder Linienphase.** loading, transit, unloading und returning, jeweils sofort und +1 Min., Seed 1, 2 Tage mit Disposition.
  Alle 8 Läufe ergeben denselben Endhash wie der Lauf ohne Laden.
- **Wartung nach Reservierung.** Externe Wartung während `loading`: Fahrt storniert, Reservierung 0, Dock, Lagerkraft und Stapler frei.
  Die nächste Abfahrt nimmt die Ware mit (Menge ≥ vorher). `cancelLinehaul` gibt genauso frei.
  Wartung und Storno während `transit` werden abgewiesen.
- **Verpasste Abfahrt.** Lkw zum Ladeschluss 11:30 in Wartung: `missed=1`, Wartegrund „Fahrzeug benötigt Wartung“. Um 14:30 wird die Fahrt der 15:00-Abfahrt angelegt.
- **Dock B während Entladen abgeschaltet.** 30 Min. ohne Fortschritt, Wartegrund „Kein freies Dock“, Lagerkraft frei.
  Nach dem Einschalten fertig, Mengen korrekt.
- **Schichtende Lagerkräfte B während Entladen** (`setShift` night). 20 Min. ohne Fortschritt, „Keine Lagerkraft“, keine Bindung.
  Danach fertig.
- **Kasse leer bei Abfahrt** (Paket und Palette, QS-W2-01-Muster). Fahrt wartet 30 Min. nach `departAt` mit „Kasse reicht nicht“.
  Lagerkraft 0 und Stapler 0 gebunden. Mit Geld fährt sie ab, genau eine Buchung. Das Dock A bleibt in der Wartezeit belegt (Lkw steht am Tor).
- **Paletten auf der Linie** (Seed 2, Stapler A und B, Lkw je Standort). B-Paletten 20/20 zugestellt und bezahlt.
  Stapler B war 22 Min. an Linien-Entladung gebunden. Ohne Stapler an B: Entladen wartet mit „Kein Stapler“, ohne Lagerkraft.
- **Lager B voll.** Fahrt wartet, Ware bleibt auf dem Lkw, Mengen korrekt, `validateState` ok. Nach Platzfreigabe fertig. Bindung siehe QS-W3-01.

Browser `tests/browser/qa-w3.mjs` (Playwright global, Chromium 1600×900). Probe-Zustand: Seed 1, Mischvertrag, B-Pakete im Lager A, keine Linie.
Import über `#importFile`, alle 10 Prüfpunkte OK:
- Glocke meldet „Hauptlauf fehlt · Depot Morgenfeld → Ziel-Hub Birkenau · 55 Einheiten“.
- Taste N öffnet „Linienverkehr“. Formular: „12:00, 15:00“ und Lkw ausgewählt, „Linie einrichten“ legt `departures [720,900]` mit dem Lkw an. Die Linienkarte ist sichtbar.
- Tempo 12×: Fahrt wird `transit`. Karte „Hauptlauf unterwegs · 17 Einheiten“.
- Netzansicht: 1 Linienband, 1 Fahrtmarker mit Label „Linie Depot Morgenfeld → Ziel-Hub Birkenau 2 %“ (Screenshot).
- Auftragsakte (über die Suche) zeigt die Paketreise: Annahme-Hub ✓, Sortierung ✓, „Hauptlauf → Ziel-Hub Birkenau 55 · 17 an Bord · 38 bereit · nächste Abfahrt 15:00“,
  dann Ziel-Hub, Sortierung, Zustellung mit Frist.
- Keine Konsolenfehler.

`npm test` zweimal: 511 Tests, 509 bestanden, 0 fehlgeschlagen, 2 todo (QS-W3-01/01b).

## Nicht geprüft
Mehr als 2 Standorte, Gegenlinie B→A, Hof-Entladung und Linie gleichzeitig am einzigen Dock B, Retouren von B-Ware,
Fahrerschichtende während `transit`. Laut Code hält der Lkw dann an, wie beim Standorttransfer. Leistung bei vielen Linien.
