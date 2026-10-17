# QS 0.13 – Containerhof und Seeimport (A11, unabhängig)

Stand 17.10.2026. Geprüft: `claude/loving-wozniak-56yxt7` bis e0f4cfa (Welle 3b inkl. A09-Integration). Kein Produktcode geändert.
Grundlage: SCHNITTSTELLEN-0.13-W3b (Abnahme), AGENTS.md (Pflicht-Übergänge), QS-0.12. Eigene Szenarien, Entwicklerangaben nicht übernommen.
Budget knapp: nur Risikoprüfung.

## Ergebnis

**Freigabe 0.13: ja.** Abnahme erfüllt. Echter Containervertrag aus dem Angebotsstrom: Chassis → Tor → Containerhof → Umfuhr →
Entladen (Stapler + Lagerkraft) → Regal bzw. Sortierung → Zustellung (auch per Linie an B) → Zahlung → Leerabholung.
Mengen, Handling und Lagergeld je genau einmal; TEU nie überschritten; Laden in jeder Container-Phase gibt denselben Endhash.
Kein Befund verliert Ware oder bucht Geld doppelt. Beide Befunde sind niedrig.

| Befund | Schwere | Rolle |
|---|---|---|
| QS-W3b-01 Docks aus während Entladen: Wartegrund zeigt „Kein freies Dock“ statt „Dock außer Betrieb“ | niedrig | A07/A05 |
| QS-W3b-02 Versionsanzeige „0.12 · ENTWICKLUNG“ | niedrig | A12 |

## Befunde

### QS-W3b-01 Wartegrund bei abgeschalteten Docks (niedrig, A07/A05)
- Ausgang: Seed 2, Container im Entladen (≥ 3 Paletten entladen), beide Docks an A abgeschaltet.
- Ablauf: `stepHandling` setzt korrekt `WAIT.dockOff` und gibt alle Bindungen frei. Im selben Takt läuft `startUnstuffing`.
  Es findet kein freies Dock und überschreibt den Grund mit `WAIT.dock` („Kein freies Dock“).
- Erwartet: Der Spieler sieht, dass die Docks außer Betrieb sind.
- Tatsächlich: Hof-Fenster und Glocke zeigen „Kein freies Dock“. Fachlich korrekt: keine Bindung, Fortschritt bleibt, nach dem Einschalten fertig.
- Vorschlag: In `startUnstuffing` `WAIT.dockOff` melden, wenn am Standort ein Dock existiert, aber keins eingeschaltet und intakt ist.
- Test: `tests/qa-w3b.test.js` QS-W3b-01 (todo).

### QS-W3b-02 Versionsanzeige (niedrig, A12)
- `dist/app.js` `VERSION='0.12 · ENTWICKLUNG'`. Vor der Veröffentlichung auf 0.13 anheben. Test: QS-W3b-02 (todo).

## Bestandene Prüfungen (selbst ausgeführt)

Node `tests/qa-w3b.test.js`: 13 bestanden, 2 todo. Nur reguläre Befehle.
Aufbau: zwei Standorte. A hat Containerhof (8 TEU), 2 Docks, 3 Regale, Stapler, 3 Lagerkräfte, 3 Fahrer, Lkw, Lieferwagen und Linien-Lkw.
B hat Dock, 2 Regale, Stapler, 2 Lagerkräfte, Fahrer, Lkw und Lieferwagen. Linie A→B fährt 12:00 und 15:00.
Die Spielerdisposition stellt je Standort mit passendem Fahrzeug zu.

Testdaten:
- Vertragslaufzeit (2 bzw. 1 Tag) und Freizeit 30 Min. werden vor der Annahme gesetzt, damit Lagergeld anfällt.
- TEU-Fall: zwei Ankünfte à 3 Container, vor der Annahme gesetzt.
- Staplerladung 0, Standortenergie 0, Lager mit Firmenware gefüllt (`inventory.add`).

- **Ende-zu-Ende, Seeds 1–3, je 4 Tage (je 5760 Minuten).** Erstes Containerangebot des Stroms, Inhalt jeweils Paletten.
  - Jede Minute geprüft:
    - Lagergeld-Minuten = eigene Zählung (Status yard/toDock/unstuffing/empty ab `freeUntil`);
    - gebuchte Stunden = floor(Minuten/60), keine Lücke, kein Duplikat;
    - Handling genau einmal ab Status empty, vorher nie, Betrag = `pricePerContainer`;
    - `teuUsed ≤ teuCapacity`.
  - Alle 5 Min. geprüft:
    - `offen (Lkw-Hof) + Container-Rest + Bestand A + Bestand B + unterwegs + zugestellt + zurück = qty`;
    - keine negativen Mengen oder Überreservierungen;
    - Zustellung ab `deliverySite`;
    - Zahlungen und Strafen genau einmal;
    - `validateState`.

  | Seed | Inhalt | Container | Gebiete | Menge | zugestellt | bezahlt | Handling | Lagergeld | Strafen spät/offen |
  |---|---|---|---|---|---|---|---|---|---|
  | 1 | 20 Pal./Ctr. | 6 | nur B (per Linie) | 120 | 120 | 14.872 € | 2.250 € | 14 Std., −168 € | 5/0 |
  | 2 | 21 Pal./Ctr. | 6 | A, A | 126 | 126 | 11.970 € | 2.700 € | 14 Std., −168 € | 0/0 |
  | 3 | 19 Pal./Ctr. | 6 | A | 114 | 114 | 14.250 € | 1.950 € | 13 Std., −156 € | 0/0 |

  Alle Leercontainer wurden abgeholt, und alle Verträge wurden abgerechnet.
  Gegenprobe mit Standard-Freizeit (1440 Min.), nicht im Testpaket: 0 Std. Lagergeld. Kein Abholchassis wartete am Tor.
- **Zusammenspiel Linie (Seed 9, 2. Angebot, Pakete 540/Container, Gebiete A und B).**
  - In 3 Tagen fuhren 2 Linienfahrten 540 Container-Pakete nach B.
  - B: 540/540 zugestellt, 4.096,98 € bezahlt.
  - B-Ware wurde nie ab A zugestellt.
- **Laden in jeder Phase = gleicher Endhash (2 Tage, Seed 2).** Geladen wird jeweils bei Eintritt und eine Minute danach:
  - Chassis-Phasen: approach, gate, toYard, drop, exit;
  - Container-Status: yard, toDock, unstuffing, empty, pickup, gone;
  - Lagergeld bei 59 und 60 Minuten (Stundengrenze).
- **Pflichtfälle während Entladen** (Seed 2, Container mit ≥ 3 entladenen Paletten): Schichtende aller Lagerkräfte, beide Docks aus,
  Stapler leer, Strom weg, Lager voll.
  - Container geht zurück in den Hof (`yard`) und nennt den passenden Wartegrund (Docks: siehe QS-W3b-01).
  - Dock, Stapler und Lagerkraft sind nach 1 Min. frei, 20 Min. lang nicht neu gebunden, ohne Fortschritt.
  - `unloaded` bleibt erhalten. Kein anderer Container startet.
  - Nach Behebung wird vollständig entladen. Die Mengeninvariante gilt. `validateState` auch nach Laden.
- **Containerhof abreißen/versetzen, belegt:** abgelehnt („Anlage belegt. Vorgang zuerst abschließen.“). Ist der Hof leer
  (alle Container gone, TEU 0), gelingt der Abriss.
- **Vertragsende mit Container im Hof** (Laufzeit 1 Tag, Docks aus):
  - Bei Ende + Karenz + 30 Min. sind alle Aufträge noch aktiv, `settleWait` = „Container im Hof“, keine Endstrafe.
  - Nach Docks an wird entladen, danach je Auftrag genau eine Abrechnung (Storno, Rückgabe 12 bzw. 31 Paletten an den Versender).
  - Lagergeld läuft im Hof weiter: 147 Std. bei 3 Containern. Das ist regelkonform.
- **TEU-Grenze:** 3 Container (6 TEU) stehen im Hof. Das zweite Chassis (6 TEU) wartet in `queue` mit „Containerhof voll“, auch 30 Min. später.
  Nach Docks an fährt es ein, alle Container werden entladen. TEU lag jede Minute ≤ 8.

Browser (`node tests/browser/qa-w3b.mjs`, Playwright global, Chromium, 1600×900). Alle Punkte OK:
- Probe-Import über die Oberfläche.
- Vertragskarte (Taste V) zeigt „3 Container à 21 Paletten“, Handling, Freizeit und Lagergeld.
- Annahme per Knopf.
- Fenster „Containerhof“ (Taste C) listet die Container im Hof.
- Klick in der 3D-Szene auf container-60 öffnet das Fenster Containerhof, nicht die Anlagenakte.
- Keine Konsolenfehler.
- Testhilfe: Zeitsprung über `__qa.sim().step` (tmp-Kopie), bis Container im Hof stehen.

`npm test` zweimal: 555 Tests, 553 bestanden, 0 fehlgeschlagen, 2 todo (Befundtests).

## Grenzen

- Nicht geprüft:
  - Paketcontainer am Annahme-Hub mit hoher Last (z. B. 3 × 680 Pakete/Tag);
  - mehrere Containerhöfe je Standort;
  - Containerhof abgeschaltet oder defekt während Belegung;
  - Leistung im Browser.
- Lagergeld bei nächtlich wartendem Abholchassis (Torkontrolle braucht Lagerkraft) nur aus dem Code abgeleitet.
  Bei Standard-Freizeit 24 Std. kein Lagergeld beobachtet.
