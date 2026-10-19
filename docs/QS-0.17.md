# QS 0.17 – Bedienbarkeit und Informationsdarstellung (A11, unabhängig)

Stand 19.10.2026. Geprüft: `claude/loving-wozniak-56yxt7` auf 548598f.
Kein Produktcode geändert. Grundlage: AUFTRAG-0.17-BEDIENBARKEIT (17 Prüfszenarien), SCHNITTSTELLEN-0.17-UI (Referenz 1920 × 1080, Tabellenzeilen einzeilig), AGENTS.md.
Eigene Szenarien, Entwicklertests nicht übernommen. Primär 1920 × 1080, zusätzlich 1366 × 768 (Skalierung 100 %).

## Ergebnis

**Freigabe 0.17: nein, erst nach Behebung von QS-017-01 (hoch).** Danach Freigabe mit Befunden mittlerer/niedriger Schwere möglich.

Alle 17 Prüfszenarien sind fachlich erfüllt. Ausnahme: Szenario 10 bricht beim Umbenennen eines Standorts mit ungültigem Namen (QS-017-01).
Bestandsrechnung, Auftragsdeckung, Ressourcen, Einkauf und Liquidität stimmen mit den Simulationsdaten überein.
- Szenario 3 (35/42/20) ist exakt erfüllt, mit einer echten Reservierung durch eine geplante Lieferung eines anderen Auftrags.
- Der Assistent ist unverändert: `git diff d187565 HEAD -- dist/assistant.js` ist leer, und das Fenster öffnet.
- Es sind keine Zeitsprünge eingebaut.

| Befund | Schwere | Rolle |
|---|---|---|
| QS-017-01 Standort umbenennen erzeugt einen nicht ladbaren Spielstand | **hoch** | A01 (core `rename`) |
| QS-017-07 Fenster in Startlage zu schmal: waagerechter Überlauf bei Verträgen, Torbuch, GuV (Regression gegenüber 0.16) | mittel | A10-W |
| QS-017-08 1366 × 768 mit Wetteranzeige: Standortwahl überdeckt den Pause-Schalter (Regression) | mittel | A10-W |
| QS-017-06 Baumenü liegt über einem geöffneten Fenster (35 % bei 1920, 52 % bei 1366) | niedrig | A10-W |
| QS-017-03 Auftragszeilen zeigen „gedeckt“ für mehrere Aufträge, die sich denselben freien Bestand teilen | niedrig | A05/A10-S |
| QS-017-02 Nebentexte unter 12 px (10,8–11,7 px) in Tabellen und HUD | niedrig | A10 |
| QS-017-05 Chargen-Detailtabelle im Lager zweizeilig (Nutzervorgabe einzeilig) | niedrig | A05/A10-S |
| QS-017-04 Glocken-Zähler: Kontrast 4,41 : 1 (< 4,5) | niedrig | A10 |

## Befunde

### QS-017-01 Standort umbenennen → Spielstand nicht mehr ladbar (hoch, A01)
- **Ausgangszustand:** Beliebiger Stand, z. B. Sandbox, Seed 3.
- **Reproduktion (Node):**
  - Variante A: `rename {target:'site', id:'site-1', name:'A'}` liefert `ok:true`.
  - Variante B: Standort „Nordlager“ kaufen, dann in „depot morgenfeld“ umbenennen. Auch das liefert `ok:true`.
  - Danach `Simulation.fromJSON(sim.serialize())`.
- **Reproduktion (Browser):** Standortmenü → Stift → „A“ → Enter → Seite neu laden.
- **Erwartet:** Der Befehl lehnt ungültige Namen ab, mit denselben Regeln wie `buySite`:
  - 2–48 Zeichen;
  - eindeutig ohne Groß-/Kleinschreibung;
  - ohne `<>` und Steuerzeichen.

  Andernfalls muss der Stand ladbar bleiben.
- **Tatsächlich:**
  - Node: `Spielstand ungültig: Standortname beschädigt.` (`network.validate`: Länge ≥ 2, eindeutig).
  - Browser, zwei beobachtete Ausgänge:
    - Startdialog mit „Gespeicherter Stand nicht geladen: Spielstand ungültig: Standortname beschädigt.“;
    - oder „Temporärer Modus · NICHT GESPEICHERT“ mit Startstand „Depot Morgenfeld“.

  Der Fortschritt ist damit nicht mehr erreichbar. Zusätzlich nimmt `rename` Namen wie `<b>Depot</b>` an, die `buySite` ablehnt (Anzeige escaped, ladbar).
- **Vorschlag:** In `core.js` `rename` (site) die Prüfungen aus `network.js` (Zeilen 8–9) übernehmen. Gebäudenamen sind nicht betroffen (keine Eindeutigkeitsprüfung beim Laden).
- **Test:** `tests/qa-017.test.js` „QS-017-01“ (todo); `tests/browser/qa-017.mjs` (BEFUND QS-017-01).

### QS-017-07 Waagerechter Überlauf in Startlage (mittel, A10-W)
- **Ausgangszustand:** Stand wie `ui-016` (Seed 13, Hub mit 3 Frachtverträgen, Tag 3), Fenster ohne gespeicherte Geometrie.
- **Reproduktion:** Taste V (Verträge) bzw. H (Hof & Docks).
- **Erwartet:** Kein waagerechter Scrollbalken im Fensterinhalt, wie in 0.16 (`ui-016`/`ui-015` prüfen das).
- **Tatsächlich (`#panelBody` scrollWidth/clientWidth):**
  - Verträge: 638/458 bei 1920 und 638/378 bei 1366. Die Tabelle „Zufriedenheit Versender“ ist 619 px breit, das Fenster 460 px.
  - Hof & Docks: 802/610 bei 1366.
  - Gegenprobe 0.16 (d187565, gleicher Stand): Verträge 438/438, Hof 664/664, also kein Überlauf.

  Deshalb schlagen `ui-016` (Torbuch, Verträge bei 1440 × 900) und `ui-015` (GuV, Verträge) jetzt fehl.
- **Vorschlag:** Verträge als breite Fensterart öffnen, Hof/GuV breiter. Alternativ die Tabellen in ein eigenes waagerechtes Scrollelement legen.

### QS-017-08 Pause-Schalter bei 1366 × 768 überdeckt (mittel, A10-W)
- **Ausgangszustand:** Stand Seed 13 mit Wetteranzeige „Sturm“ in der Standortwahl, 1366 × 768.
- **Reproduktion:** Auf den Pause-Schalter klicken.
- **Erwartet:** Der Schalter ist bedienbar.
- **Tatsächlich:** Die Standortwahl ragt über den Pause-Schalter. `elementFromPoint` trifft das Chevron der Standortwahl, Playwright meldet „subtree intercepts pointer events“. Bei 1920 und in 0.16 bei 1366 gibt es keine Überdeckung. Die Leertaste funktioniert weiterhin.
- **Bild:** `qa017-kopf-wetter-1366.png` (Scratchpad, siehe unten).

### QS-017-06 Baumenü überdeckt geöffnetes Fenster (niedrig, A10-W)
- **Reproduktion:** Baumodus starten, Anlage wählen, Fenster „Finanzen“ öffnen.
- **Tatsächlich:** `#buildTray` (z 20) liegt über `#panel` (z 15). Bei 1920 sind 35 % der Fensterfläche verdeckt, bei 1366 52 %. Ein Klick in die untere Fensterhälfte trifft Baukarten.
- **Ohne Wirkung auf die Simulation:** Klicks in den sichtbaren Fensterbereich platzieren nichts, der Kontostand bleibt unverändert.
- **Vorschlag:** Fenster über dem Baumenü, oder Baumenü einklappen, solange ein Fenster offen ist.

### QS-017-03 „gedeckt“ trotz geteiltem Bestand (niedrig, A05/A10-S)
- **Ausgangszustand:** Aufträge über 35 und 8 Stück, 22 Leuchten frei.
- **Tatsächlich:**
  - Die Zeile zum Auftrag über 8 Stück zeigt grün „gedeckt“, die Zeile zum Auftrag über 35 Stück „13 fehlen“.
  - Ohne Fehlmenge (42 frei, Aufträge 35 + 20) zeigen beide Zeilen „gedeckt“.
  - Der Hinweis „Derselbe freie Bestand wird von 1 weiteren Auftrag benötigt“ steht nur in der Aufklappzeile.
- **Fachlich korrekt:** Es gibt keine doppelte verbindliche Zusage. Reservierungen gelingen nur bis zum Bestand (Test P4).
- **Vorschlag:** In der Zeile bei `competing>0 && poolDemand+open > freeOther` „gedeckt*“ bzw. „geteilt“ mit Tooltip anzeigen.

### QS-017-02 Schrift < 12 px (niedrig, A10)
- **Tabellen:** `small.muted` mit 10,8–11,7 px, z. B. Auftragskennung, „≥ 70 %“, „noch 22 Std.“, Chargen „Qualität 90 %“, „3 reserviert“, Standort.
- **HUD:** „& LOGISTIK“ 11 px, Glocken-Zähler 11 px, Fahrzeugkennung in der Betriebsleiste 10,8 px, Versionsmarke 10,8 px.
- Haupttexte, Leiste und Spaltenköpfe sind ≥ 12 px.

### QS-017-05 Chargen-Detailzeilen zweizeilig (niedrig, A05/A10-S)
- Aufgeklappte Leuchtenzeile: alle 14 Chargenzeilen sind zweizeilig (Menge/„3 reserviert“, Lagerort/Standort, Zustand/Qualität), bei 1920 und bei 1366.
- Hauptzeilen von Lager und Aufträgen sind einzeilig.

### QS-017-04 Kontrast Glocken-Zähler (niedrig, A10)
`bell-count wait` hat 4,41 : 1. Sonst gibt es in der Stichprobe (HUD, Lagerfenster) keine Werte unter 4,5.

## Prüfszenarien (eigene Prüfungen)

Node: `tests/qa-017.test.js`, 16 Tests, 15 bestanden, 1 todo (QS-017-01).
- Browser: `tests/browser/qa-017.mjs`: 112 OK, 0 FEHL, 19 BEFUND, keine Konsolenfehler.
  Die Zählung umfasst beide Auflösungen, den Wetterstand und den 0.16-Stand.
- Testaufbau: Fertigware (Leuchten) kommt über `api.inventory.add`. Alles andere läuft über reguläre Befehle bzw. den Browser.

| Nr. | Szenario | Ergebnis |
|---|---|---|
| 1 | 15 Chargen (verschiedene Mengen) → eine Zeile, Gesamt = Summe der Mengen; aufklappbar mit Menge, Lagerort, Qualität, Auftrag | erfüllt (Node + Browser 14 Chargen) |
| 2 | Leuchte / Profilleuchte / Kundenware (echte Fremdlogistik-Anlieferung) getrennt; Qualitätsbänder statt Mischwert; Quarantäne gesperrt, nicht frei; Ware unter Mindestqualität separat | erfüllt |
| 3 | 35 offen, 42 Lager, 20 per `dispatch` für den 20er-Auftrag reserviert → „35 benötigt · 42 auf Lager · 22 frei verfügbar · 13 fehlen“ in Node, Tabelle und Browser; nach Abfahrt weiter 13; Teillieferung 5 → 30 benötigt | erfüllt |
| 4 | Drei Aufträge (35/20/8) auf 42: Reservierungen nur bis zum Bestand (dritte nur 2), kein negativer Bestand, reserviert + frei = gesamt | erfüllt; Anzeige siehe QS-017-03 |
| 5 | Rezeptkette (Verpacken ← Prüfen ← Montieren), Zwischenware verrechnet (3 geprüfte → für 5 Stück nur 2 Gehäuse), „Bedarf für 1 Stück · Rezept …“, Hinweis „kein Rezept“ | erfüllt |
| 6 | Gehäuse per Standorttransfer reserviert (echter Befehl) → 4 verfügbar / 10 benötigt · 6 fehlen, Vorgang benannt | erfüllt |
| 7 | [+] öffnet die Beschaffung mit Ressource und Menge; Preis, Gesamtkosten und Lieferzeit sichtbar; Kontostand und Journal unverändert bis „Verbindlich bestellen“; Vorschlag zieht Zulauf ab (20 − 12 = 8) | erfüllt |
| 8 | Bestand 0 in jedem Status vor `stored` (ordered → receiving → checking → storing), danach 12; im Browser „5 im Zulauf“ nach Kauf | erfüllt |
| 9 | 3 Spieltage mit allen Angeboten: Standardsortierung nach Frist, Suche liefert genau einen Auftrag, Kopf/Filter sticky | erfüllt |
| 10 | Anlage und Standort umbenannt, **echtes Neuladen im Browser**: Kopfzeile, Suche und Anlagenakte zeigen die Namen, Typ bleibt sichtbar; leerer Name stellt den Standard her; > 40 Zeichen abgelehnt | erfüllt, **außer QS-017-01** |
| 11 | WASD im Baumodus bewegt die Kamera, Auswahl bleibt, nichts platziert; Tippen im Umbenennungsfeld bewegt die Kamera nicht | erfüllt |
| 12 | Rechtsklick auf Szene, Fenster, Leiste, Betriebsleiste, Kopfzeile: `defaultPrevented` 5/5 | erfüllt |
| 13 | Maximieren füllt die Spielfläche ohne Überlauf, Wiederherstellen pixelgleich, Mindestgröße bedienbar, Wechsel 1920 ↔ 1366 sichtbar und proportional, zurück pixelgleich | erfüllt; Startlage siehe QS-017-07 |
| 14 | Nachtschicht: Plan = `onShift` Minute für Minute (2 Tage); 960 gebuchte Lohnminuten am Tag; Browser-Balken 00–08 (`from-prev`) und 16–24 (`to-next`) | erfüllt |
| 15 | 4 Tage mit Lieferung, Zahlung, Kredit 5.000 und Tilgung 2.000: Kontoänderung 23:59 → 23:59 = Tageszeilen; Kredit getrennt, nicht als Einnahme. Browser: Ausgaben = Journal beim Laden + bestätigter Kauf (15 €) | erfüllt |
| 16 | Anliegen: Offen → Antwort → In Bearbeitung → (Kundendienstkraft, Zeit) Abgeschlossen, auch im Browser. Retoure: collecting … decision → Reparatur → repaired; vor Abschluss nie „Abgeschlossen“, Erstattung vorher; Board ändert den Stand nicht | erfüllt |
| 17 | Stand mit d187565-Code außerhalb des Repos erzeugt (Montage, Sortierplatz, Nachtschicht, Einkäufe, Aufträge). Lädt in 0.17 und läuft einen Tag bitgleich zum alten Code (Kontostand, Chargen); im Browser rendern alle Fenster, Assistent öffnet; `assistant.js` unverändert | erfüllt |

Zusatzprüfungen:
- **Tabellenzeilen einzeilig (1920 und 1366):** Hauptzeilen von Lager und Aufträgen erfüllt, Chargendetails nicht (QS-017-05).
- **Schrift ≥ 12 px:** Haupttexte erfüllt, Nebentexte nicht (QS-017-02).
- **Kontrast:** bis auf QS-017-04 ≥ 4,5.
- **HUD-Standardlage** (Kopf, Kennzahlen, Ansichtsumschalter, Leiste, Standortfluss, Kamera, Betriebsleiste, Statuszeile, Einstiegskarte) überlappt nicht. Ausnahme ist der Kopf mit Wetter bei 1366 (QS-017-08).
- **Rail** ohne Scrollbalken.
- **Fensterbedienung:** keine Klicks an die Szene (Baumodus, Kontostand unverändert).
- **Sortierplatz-Erklärung:**
  - Sie enthält Zweck, Voraussetzungen, Ablauf, Zustand und nächsten Schritt sowie „ohne Förderband und ohne Wegezeit“.
  - Gegenprobe in der Simulation: Sortierplatz neben Dock/Regal (5,11) und weit entfernt (16,2) sortieren in 2 Tagen identisch viel. Die Erklärung erfindet also keine Nähewirkung.
  - Die angegebenen Raten (5 bzw. 3 Pakete/Min.) entsprechen `sorting.js`.
- **Zeitsprünge:** keine Bedienung „überspringen/Tagessprung“. Neu ist nur der Befehl `rename`.

## Vorgegebene Läufe (nach `python3 scripts/package.py` auf 548598f)

Chromium /opt/pw-browsers. Erzeugte Dateien danach per `git checkout` zurückgesetzt, `docs/assets/hud-0.9-1366.png` gelöscht.

| Prüfung | Ergebnis |
|---|---|
| `npm run test:browser -- --repo` (Smoke) | 32 bestanden, 0 fehlgeschlagen |
| `tests/browser/hud.mjs` | 94 OK, 0 FEHL |
| `ui-017-window.mjs` | 110 OK, 0 FEHL |
| `ui-017-stock.mjs` | 55 OK, 0 FEHL |
| `ui-017-plan.mjs` | 35 OK, 0 FEHL |
| `ui-017-explain.mjs` | 25 OK, 0 FEHL |
| `ui-016.mjs` | 21 OK, **2 FEHL** (Torbuch, Verträge ohne Überlauf → QS-017-07) |
| `ui-015.mjs` | 13 OK, **3 FEHL** (GuV und Verträge ohne Überlauf → QS-017-07; „Mehrwertdienst mit Kundenmaterial und Vergütung“: Test erwartet den alten Text „Vergütung / Stück“; Angaben stehen jetzt im Tooltip bzw. in der Aufklappzeile → Test anpassen, kein Produktfehler) |
| `ui-flow.mjs` | 7 OK, 0 FEHL |
| `rightclick.mjs` | 8 OK, 0 FEHL |
| `weather-016.mjs` | 22 ok, 0 fehlgeschlagen |
| `quality.mjs` | 27/27 ok |
| `tests/browser/qa-017.mjs` (neu) | 112 OK, 0 FEHL, 19 BEFUND |

`npm test` 2× mit `qa-017`: je 803 Tests, 802 bestanden, 0 fehlgeschlagen, 1 todo (QS-017-01). Vorher ohne `qa-017`: 787/787.

Screenshots 1920 × 1080 (Scratchpad dieser Sitzung, nicht im Repo), unter `/tmp/claude-0/-home-user-Logistics/adf4144d-498f-5561-8a44-20592aac797e/scratchpad/shots/`:
- `qa017-hud-1920.png`, `qa017-lager-1920.png`, `qa017-einkauf-1920.png`, `qa017-auftraege-1920.png`;
- `qa017-liquiditaet-1920.png`, `qa017-sortierplatz-1920.png`, `qa017-personalplan-1920.png`, `qa017-board-1920.png`;
- `qa017-fenster-max-1920.png`, `qa017-assistent-1920.png`, `qa017-baumodus-fenster-1920.png`, `qa017-vertraege-ueberlauf-1920.png`;
- zusätzlich `qa017-kopf-wetter-1366.png`.

## Hinweise (kein Befund)
- **Fremdlogistik:**
  - Kundenware in Anlieferung erscheint als „12 fehlen“ (Angebot und vor Ankunft); die Betriebsleiste warnt „Ware fehlt“.
  - Das ist konsistent mit der Regel „Zulauf erst nach Wareneingang“. Der Kunde liefert die Ware aber selbst, die Warnung kann also zu unnötigem Handeln verleiten.
- **Lagerzeile „Frei“** enthält Ware unter Mindestqualität. Die Auftragsdeckung weist sie dagegen getrennt aus („frei, aber unter Mindestqualität“). Das ist korrekt, lohnt aber eine Legende.
- **Statuszeile** zeigt weiterhin „0.16 · ENTWICKLUNG“.
- **`npm test` schreibt `dist/portable.html`;** vor dem Commit zurücksetzen.

## Nicht geprüft
- Echte Bildschirmskalierung ≠ 100 % und echte GPU (Headless/SwiftShader).
- Browsergesten/Erweiterungen beim Rechtsklick (nicht kontrollierbar, siehe Auftrag).
- Dunkelmodus nur über die Entwicklerprüfung `ui-017-window` (Stichprobe). Eigene Kontrastprüfung nur im hellen Modus.
- Mehrere Standorte im Personalplan und Board-Filter je Standort; Rücklauf-Board im Browser (nur Node).
- Leistung der gecachten Bestandsrechnung bei sehr großen Ständen (kein eigener Messlauf).

## Nachtrag A01 (19.10.2026)

- **QS-017-01 behoben:** `rename` für Standorte prüft dieselben Regeln wie `buySite` (2–48 normale Zeichen, eindeutig, auch beim Zurücksetzen auf den Standardnamen). Anlagennamen ohne `<>`/Steuerzeichen. Zusätzlich Lade-Reparatur (`repairSiteNames` in den Schema-1-Auffüllungen) für bereits erzeugte ungültige Stände. Befundtest aktiviert, Reparaturtest in tests/rename-017.test.js.
- QS-017-02 bis -08: an A10 übergeben (Fix-Runde vor Release).
