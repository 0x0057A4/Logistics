# QS 0.14 – Luftexport, Dispositionsassistent, Replay (A11, unabhängig)

Stand 17.10.2026. Geprüft: `claude/loving-wozniak-56yxt7` bis 6aa8e20 (Welle 3c inkl. A10-UI). Kein Produktcode geändert.
Grundlage: SCHNITTSTELLEN-0.14-W3c (Abnahme), AGENTS.md (Pflicht-Übergänge). Eigene Szenarien, Entwicklerangaben nicht übernommen.
Budget knapp: nur Risikoprüfung.

## Ergebnis

**Freigabe 0.14: nein, Stand jetzt.** Fachkern stabil: keine verlorene Ware, keine doppelte Zahlung, Laden in jeder
Zubringerphase und mitten im Assistentenbetrieb ergibt denselben Endhash. Replay ändert keinen Zustand und sperrt alle
Befehlswege. Offen sind zwei mittlere Befunde gegen die Abnahme:
1. Der Assistent überschreitet sein Tagesbudget mit Luftzubringern.
2. Luftaufträge erhalten bei Vertragsende eine Doppelstrafe.

Nach der Behebung von W3c-02 und einer Entscheidung zu W3c-01 genügt die Nachprüfung der Befundtests.

| Befund | Schwere | Rolle |
|---|---|---|
| QS-W3c-01 Vertragsende: Flugstrafen und zusätzlich penaltyOpen für dieselben offenen Pakete; Flugstrafen laufen nach Vertragsende weiter | mittel | A08/A02 |
| QS-W3c-02 Assistent-Budget: Zubringer wird mit 30 km geschätzt, gebucht wird die Flughafendistanz (48 km) | mittel | A06/A07 |
| QS-W3c-03 Versionsanzeige „0.13 · ENTWICKLUNG“ | niedrig | A12 |

## Befunde

### QS-W3c-01 Doppelstrafe bei Vertragsende (mittel, A08/A02)
- **Ausgang:** Seed 7, ein Hub mit Dock, 3 Regalen und Lkw. Echtes Luftangebot (Flüge 16:30 und 21:30, 13,50 €/Paket,
  5 Tage, `penaltyMissed` 3 €, `penaltyOpen` 8 €) wird angenommen. Danach startet kein Zubringer.
- **Ablauf:** `missedFlights` bucht je Auftrag und Flug genau einmal `air-missed:` (korrekt). Das läuft weiter, solange der
  Auftrag aktiv ist. Das gilt auch nach `endT` während der Kulanzfrist (`openGrace` 1440 Min.): je Auftrag 2 weitere
  Flugstrafen. Danach bucht `settle` für dieselben offenen Pakete zusätzlich `penalty-open:` (8 €/Paket).
- **Zahlen (10 Aufträge, 5+3 Tage):**
  - 130 Flugstrafen, −35.100 €;
  - zusätzlich 10 × penaltyOpen, −7.200 €;
  - alle 10 Aufträge tragen beide Strafen.
  - Beispiel order-57: 60 Pakete, Umsatz höchstens 810 €. Strafen: 12 Flugstrafen (−2.160 €) und penaltyOpen (−480 €).
- **Erwartet (Auftrag „keine Doppelstrafe mit penaltyOpen“):** Für dieselben Pakete fällt am Vertragsende entweder die
  Flugstrafe oder penaltyOpen an. Nach `endT` gibt es keine weiteren Flugstrafen.
- **Tatsächlich:** Beides fällt an. Buchungsschlüssel sind eindeutig, also kein Buchungsfehler, aber eine wirtschaftliche Doppelbelastung.
  Die Flugstrafe wächst ohne Deckel: bei 2 Flügen/Tag 6 €/Paket/Tag.
- **Vorschlag:**
  - Luftaufträge ab `endT` von `missedFlights` ausnehmen.
  - penaltyOpen um die Flugstrafen desselben Auftrags mindern, oder bei Luftaufträgen entfallen lassen.
  - A02: Deckel je Auftrag erwägen.
- **Test:** `tests/qa-w3c.test.js` QS-W3c-01 (todo).

### QS-W3c-02 Assistent überschreitet Tagesbudget mit Luftzubringer (mittel, A06/A07)
- **Ausgang:** Hub site-1 (0/0), Flughafen 48 km entfernt. Luftauftrag mit 30 sortierten Paketen. Assistent an, Tagesbudget
  24 € (= Schätzung 2 × 30 km × 0,40 €).
- **Ablauf:** `stepAir` prüft `affordable` mit `2*DELIVERY_DISTANCE*runningCost`, also 30 km. Der Befehl bucht bei Abfahrt
  `AX.tripCost(v, airportDistance)`, also 48 km.
- **Erwartet:** Gebuchte Fahrtkosten je Tag ≤ Budget (Abnahme „keine Budgetüberschreitung“).
- **Tatsächlich:** Budget 24 €, gebucht 38,40 €. `cfg.spent` wird danach auf 38,40 gesetzt, also über dem Budget.
  Pakete und Sammeltouren halten das Budget ein (eigener Test, 120 €/Tag, 3 Tage).
- **Vorschlag:** In `stepAir` die Kosten mit `AX.tripCost(v, AX.airportDistance(s, site))` schätzen (Einzeiler; import aus airexport.js ist lesend).
- **Test:** QS-W3c-02 (todo).

### QS-W3c-03 Versionsanzeige (niedrig, A12)
- `dist/app.js` `VERSION='0.13 · ENTWICKLUNG'`. Vor der Veröffentlichung auf 0.14 anheben. Test: QS-W3c-03 (todo).

## Bestandene Prüfungen (selbst ausgeführt)

Node `tests/qa-w3c.test.js`: 7 bestanden, 3 todo. Nur reguläre Befehle, mit zwei Ausnahmen: Testaufträge für Pflichtfälle
per `inventory.add`, und für den Kassenfall wird `s.money` gesetzt.

Invarianten alle 5 Min.:
- keine negative oder überreservierte Charge;
- Anzahl `air:` = Übergaben, Betrag = `invoiceAmount`;
- je Luftauftrag `delivered ≤ qty`, `paid = delivered × Preis`, `missedFlights` = Anzahl `air-missed:` des Auftrags, `Bestand + delivered ≤ qty`;
- kein Fahrzeug gleichzeitig in Zustellung, Tour, Zubringer und Linie;
- `validateState`.

- **Luftexport Ende-zu-Ende, echtes Angebot, Seeds 7 und 11, je 3 Tage.**
  - Ablauf: Hof → Sortierung → Spielerdisposition (Zubringer ≤ 150 Min. vor Annahmeschluss) → Übergabe → Zahlung.
  - Seed 7: Flüge 16:30/21:30, 3 Aufträge, 270 Pakete, 3 Übergaben, 3.510 € (je Übergabe genau einmal), Fahrtkosten 115,20 €
    (genau einmal je Abfahrt), 0 Strafen.
  - Seed 11: 6 Aufträge, 400 Pakete, 3 Übergaben, 4.600 €.
  - Laden bei Eintritt in loading, transit, handover und returning ergibt jeweils denselben Endhash.
- **Verpasster Flug (echtes Angebot, kein Zubringer).**
  - Strafe je Auftrag und Flug höchstens einmal, nur zu Flugplanzeiten, Betrag ≤ qty × 3 €.
  - Danach wird umgebucht.
  - Laden nach der ersten Strafe ergibt denselben Endhash. Vertragsende: siehe W3c-01.
- **Pflicht: Fahrer beendet Schicht unterwegs.** Einziger Fahrer in Tagschicht, Abfahrt 15:40.
  - Ab 16:00: `Kein Fahrpersonal`, `remaining` eingefroren, Fahrer frei.
  - Weiterfahrt am Folgetag (Fahrt 1017 statt 57 Min.).
  - Verpasster Annahmeschluss: Strafe genau einmal für diesen Flug, Lagergeld einmal, Zahlung genau einmal, 40/40 Pakete.
  - Laden während der Wartezeit ergibt denselben Endhash.
  - Hinweis: Das Fahrzeug steht unterwegs, bis eine Schicht beginnt. Das ist dasselbe Muster wie bei Zustellung und Linie, kein neuer Befund.
- **Pflicht: externe Wartung und Storno nach Reservierung, Kasse leer.**
  - Zweiter Lkw kann die letzten Pakete nicht doppelt reservieren.
  - Wartung bricht ab mit Grund „Wartung“; Reservierung, Dock und Personal werden frei.
  - Storno gibt das Fahrzeug frei.
  - Kasse 0: Zubringer wartet ohne Dock und Lagerkraft, Ware bleibt reserviert. Laden gültig.
  - Danach `air:` und `air-trip:` je genau einmal, 60/60 Pakete.
- **Assistent, Seed 7, 4 Tage, gleicher Seed mit und ohne.**
  - Aufbau: zwei Standorte, echte Verträge (Paket lokal, Paket mit Gebieten an B, Luft), Linie A→B ohne Lkw.
  - Jeder Befehl aus der Simulation wird mitgeschrieben: ausschließlich updateLine/prioritizeArrival/dispatchAirShuttle/dispatchTour/dispatch.
  - Ohne Assistent: 0 Befehle, 0 zugestellt, Luftstrafen −5.400 €, Kasse 357.914,24 €.
  - Mit Assistent: 15/15 Befehle erfolgreich (1 Linienzuordnung, 4 Zubringer, 10 Zustellungen), 1.172 zugestellt,
    Luft 4.680 €, 0 Luftstrafen, 0 Verspätungsstrafen, Kasse 373.883,04 €.
  - Invarianten alle 5 Min. in beiden Läufen erfüllt, kein Doppeleinsatz.
  - Laden nach 2 Tagen ergibt denselben Endhash.
- **Assistent Abschalten:** Nach `enabled:false` folgt in 1 Spieltag kein einziger Befehl.
- **Assistent Budget 120 €/Tag (Pakete und Linie):** Tatsächlich gebuchte Fahrtkosten je Tag ≤ Budget (Luft: siehe W3c-02).

Browser `tests/browser/qa-w3c.mjs`: Chromium über globales Playwright, tmp-Kopie, `__qa` nur in der Kopie.
Ergebnis: 30 OK, 0 FEHL, keine Konsolenfehler. Probe: Seed 7, Luftvertrag, sortierte Luftpakete, 3 offene Angebote, Import über die Oberfläche.
- Fenster Luftexport (X) mit Annahmeschluss und Zubringerformular. Fenster Assistent (J) mit Tagesbudget.
  Assistent per Fensterknopf an und wieder aus (Zustand geprüft).
- 12×: 65 Spielminuten (2106→2171), 13 Momentaufnahmen. Z öffnet Replay, Simulation pausiert, Regler −30 zeigt „Replay −31 Min.“.
- Gesperrt im Replay (jeweils mit Hinweis „… im Replay gesperrt“, Replay bleibt offen):
  - Taste B, Taste 3, Leertaste, Tempo-Knopf;
  - Palette: „Tempo 12“, „Vertrag annehmen“, „Bauen: …“, „Assistent einschalten“;
  - Knopf „Vertrag annehmen“ im Fenster V;
  - Formular „Zubringer starten“ im Fenster X.
- `serialize()` vor und nach allen Versuchen und nach Abspielen ×4 ist identisch.
- „Spiel speichern“ (Palette) im Replay: IndexedDB `saves/industrie-logistik-v1-sandbox` enthält exakt den Live-Stand (t=2172).
- „Live“: Leiste zu, Tempo 12× wiederhergestellt, Uhr läuft weiter.
- Gegenprobe: Formular „Zubringer starten“ live wirkt (60 Pakete, Flug 16:30, 38,40 €).

`npm test` 2× grün: 603 Tests, 600 bestanden, 0 fehlgeschlagen, 3 todo (die drei Befundtests).

## Nicht geprüft
- Bildrate und Speicherbudget des Replays bei großen Ständen (A12-Messung `tests/browser/replay.mjs` vorhanden, nicht wiederholt).
- Flughafen-Zubringer in der 3D-Szene (optisch).
- Vorziehen am Tor durch den Assistenten: im 4-Tage-Lauf kein atRisk-Lkw, also 0 Fälle. Abgedeckt nur durch die Entwicklertests.
