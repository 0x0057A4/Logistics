# QS 0.16 – Wetter/Störungen, Personalrollen, Kundendienst, Fixes QS-015-01/03 (A11, unabhängig)

Stand 18.10.2026. Geprüft: `claude/loving-wozniak-56yxt7` bis a83e53d (0.16 inkl. A02-Balancing, A10-UI, A09-Wetter und Fix 0.16b).
Kein Produktcode geändert. Grundlage: SCHNITTSTELLEN-0.16 (Abnahme), BALANCING-0.16, AGENTS.md (Pflicht-Übergänge).
Eigene Szenarien; Entwicklertests nicht übernommen.

## Ergebnis

**Freigabe 0.16: ja, mit drei Befunden niedriger Schwere.**

Der Fachkern ist stabil:
- Jede Störung hat Ursache, Dauer, Wirkung und Ende. Meldung und Wartegrund sind sichtbar, auch im Browser.
- Störungen erzeugen weder Ware noch Geld. Kontostand = Start + Buchungen in jeder 10. Minute eines 8-Tage-Betriebs; keine Störungsbuchung.
- Pflichtfall Spielstand ↔ alle Systeme: 14 Ladeprüfpunkte bitgleich, je zwei bei Fahrt im Wetter, Beladung, Pause, Torstörung, Netzstörung,
  Stau und schwerem Wetter (Original läuft weiter und wird nach 120 Minuten mit dem geladenen Stand verglichen).
- Ohne Spezialisten verhält sich 0.16 bei Hof, Entladen, Torkontrolle, Beladung und Sortierung wie 0.15 (Abgleich gegen 4d301d2, siehe unten).
- QS-015-01 und QS-015-03 sind behoben. Die Fixes aus a83e53d (Staplerfahrer beim Fahrzeugumschlag, B-0.16-1, B-0.16-2) wirken.

| Befund | Schwere | Rolle |
|---|---|---|
| QS-016-01 Gebietsstau trifft die Einzellieferung, aber nicht die Sammeltour zum selben Zustellgebiet | niedrig | A07 |
| QS-016-02 Netzstörung: Stromkosten laufen in voller Höhe weiter, obwohl das Netz nichts liefert | niedrig | A08/A03 |
| QS-016-03 Anliegen „in Bearbeitung“ ohne Kundendienstkraft zeigt vor Fristende „eingehalten“ | niedrig | A10 |

## Befunde

### QS-016-01 Gebietsstau wirkt nicht auf Sammeltouren (niedrig, A07)
- **Ausgang:** Seed 31, Dock, 2 Regale, 1 Lager-, 1 Fahrkraft, Lieferwagen. Zwei Vertragsaufträge im Lager, Gebiet „Nordbezirk“ (lane-1) und „Südbezirk“.
  Ereignis `jam` mit `target:{contract, lane:'lane-1'}`, +60 %, aktiv.
- **Ablauf:**
  1. Einzellieferung des Nordbezirk-Auftrags per `dispatch`: Fahrt 48 Min. (30 × 1,6).
  2. Gleicher Aufbau, aber `dispatchTour` mit erstem Stopp Nordbezirk.
- **Erwartet:** Erste Etappe der Tour ebenfalls 48 Min. Der Stau liegt auf dem Gebiet, nicht auf der Fahrtart.
- **Tatsächlich:** 30 Min. `tours.js` ruft `travelMinutes(s,t.site,…)` ohne `{lane,contract}` auf. Deshalb wirken auf Touren nur Wetter und Staus ohne Ziel.
  Der Spieler kann einen gemeldeten Gebietsstau mit einer Sammeltour umgehen.
- **Vorschlag:** In `nextStop`/Abfahrt den Kontext des angefahrenen Stopps übergeben (`{lane:o.lane, contract:o.contractId}`), Rückfahrt ohne Gebiet.
- **Test:** `tests/qa-016.test.js` „QS-016-01“ (todo).

### QS-016-02 Netzstörung: Netzstrom wird weiter berechnet (niedrig, A08/A03)
- **Ausgang:** Seed 3, Montage, Sortierplatz, Kühllager (15 kW), keine Energieversorgung. Netzstörung für 210 Min.
- **Ablauf:** Eine volle Abrechnungsstunde in der Störung laufen lassen.
- **Erwartet:** Keine Netzstromkosten. Alle Anlagen stehen („power“), Kühlkapazität 0.
- **Tatsächlich:** 4,80 € (15 kWh × 0,32 €). `economy.step` summiert `power` aller eingeschalteten Anlagen und fragt `gridDown` nicht ab.
  Auch ohne Störung zahlt der Standort Strom für Anlagen im Status „power“. Diese Regel bestand schon vor 0.16 (QS-015-01, Einordnung).
  Neu ist, dass Netzstörungen jetzt regelmäßig auftreten (p = 0,2 je Tag, 30–120 Min.).
- **Einordnung:** Betrag klein (≈ 5–10 € je Störung), kein Geld aus dem Nichts. Es widerspricht aber der Meldung „Netzstrom fällt aus“.
- **Vorschlag:** Stromabrechnung je Standort: bei `gridDown` nur der Anteil, den Energiegebäude decken (dann 0 €), oder nur versorgte Anlagen.
- **Test:** „QS-016-02“ (todo).

### QS-016-03 Anzeige „eingehalten“ bei Anliegen ohne abgeschlossene Bearbeitung (niedrig, A10)
- **Ausgang:** Browser, importierter Stand ohne Kundendienstkraft. Manuelle Beschwerde, mit „Entschuldigung“ beantwortet, Status `processing`, Frist offen.
- **Erwartet:** Seit B-0.16-1 gilt die Frist erst mit Abschluss. Anzeige „noch … Min.“ oder „wartet auf Kundendienstpersonal“.
- **Tatsächlich:** Karte zeigt „Antwortfrist Tag 3 · 18:02 · eingehalten“ (`app.js` `ticketDeadline`: alles außer `open` ohne `expired` gilt als eingehalten).
  Nach Fristablauf zeigt sie korrekt „nicht fristgerecht“.
- **Vorschlag:** `eingehalten` nur bei `status==='closed' && completedAt<=respondBy`, sonst Restzeit.
- **Test:** `tests/browser/qa-016.mjs` (Zeile „BEFUND QS-016-03“, kein Abbruch).

## Nachprüfung Fix 0.16b (a83e53d)
- **Staplerfahrer beim Fahrzeugumschlag (`workforce.forkStep`):** 4 eigene Lkw mit je 10 Paletten, 1 Dock.
  - Lagerkraft 13 Min., Staplerfahrer 10 Min.
  - Schichtende 16:00 mitten in der Beladung: Staplerfahrer (Tag) gibt ab, Nachtlagerkraft übernimmt. 40 Paletten verladen.
  - Laden 15:59/16:00/16:01 bitgleich.
  - Ohne Spezialisten unverändert, siehe Abgleich 0.15.
  - **behoben.**
- **B-0.16-1:** Antwort ohne Kundendienstkraft bleibt `processing`. Die Frist läuft genau einmal ab („nicht fristgerecht“ einmal gemeldet, Zähler `ignored`).
  Mit Kraft ist die Bearbeitung vor der Frist abgeschlossen. Laden um die Fristminute bitgleich. **behoben.** Neuer Aspekt: Anzeige, QS-016-03.
- **B-0.16-2:** Gesperrte Fremd-Kühlpakete eines aktiven Auftrags (30 Stück) sind entsorgbar.
  - Kosten 60 €, `disposedQty` 30, Kühlplatz frei.
  - Zweite Entsorgung abgelehnt.
  - Vertragsabrechnung bucht `penalty-open` genau einmal (30 × 15 € = 450 €), `returnedQty` 0, Laden bitgleich.
  - Im Browser: Knopf in der Kühlkette, Kontostand −60 €, danach kein Knopf mehr.
  - **behoben.**

## Bestandene Prüfungen (selbst ausgeführt)

Node `tests/qa-016.test.js`: 18 bestanden, 2 todo (QS-016-01/02). Nur reguläre Befehle, mit diesen Ausnahmen:
- Die Störungslage wird als Testaufbau gesetzt (`s.disruptions` für den laufenden Tag).
- Testaufträge und -ware kommen per `s.orders.push`/`inventory.add`, der Vertrag ist angenommen und beendet.
- Für B-0.16-2 wird der Kühlschaden als Zustand gesetzt.

1. **Wetter und Störungen**
   - **Determinismus:**
     - Mit und ohne Störungen bleiben `s.seed` und die Angebote gleich: kein `api.random`.
     - Laden 1 Minute vor dem Tageswechsel ergibt denselben Tagesplan.
   - **Sammeltour:** Jede Etappe wird beim Start verlängert: Schnee ×1,35, Stau ohne Ziel ×1,5. Zustellung, Zahlung und Fahrtkosten bleiben gleich.
     Laden in der zweiten Etappe bitgleich.
   - **Linie:**
     - Linienstau ×1,4 auf der Hinfahrt.
     - Sturm am Ziel ×1,25 auf der Rückfahrt (ohne Linienstau).
     - Mengen erhalten, Laden während der Fahrt bitgleich.
   - **Luftzubringer** (vorher ohne Störungstests):
     - Schnee verlängert Hin- und Rückfahrt (×1,35), ein Stau ohne Ziel ebenfalls.
     - Ohne Störung pünktlich. Mit Schnee reißt der Annahmeschluss: Lagergeld genau einmal (10 €), Zahlung genau einmal und gleich hoch.
     - Laden während der Fahrt bitgleich.
   - **Fremd-Lkw (echter Vertrag):**
     - Schnee verschiebt die Ankunft um 30–45 Min., die geplante Ankunft ist gleich.
     - Fristen bleiben = geplante Ankunft + SLA. Meldung „Lkw-Ankunft … später“.
   - **Torstörung während der Kontrolle durch den Torposten:**
     - Torposten wird frei, die geleisteten Minuten bleiben, Wartegrund „Torstörung“.
     - Die Kontrolle endet erst nach dem Störungsende, danach wird vollständig entladen.
     - Laden an Beginn und Ende bitgleich.
   - **Netzstörung:**
     - Ohne Energiegebäude: Sortierplatz „power“, 0 sortiert. Paletten warten mit „Stapler ohne Strom“, 0 entladen.
     - Mit Energieversorgung läuft beides.
     - Mengen erhalten, Laden in der Störung bitgleich.
   - **Netzstörung und Kühlung (QS-015-01):** Die Energieversorgung (40 kW) deckt 4 Kühllager (32 kW) vor Grundlast und Montage.
     Die Montage steht, Kühlkapazität 400. Ohne Energieversorgung Kühlkapazität 0.
   - **Schalter Störungen aus (`settings`):**
     - Die Einstellung wird gespeichert. Eine laufende Torstörung endet regulär mit Meldung.
     - Ab dem Folgetag kein Wetter und keine Ereignisse (4 Tage).
     - Wieder ein: Planung ab dem nächsten Tag.
   - **Pflicht Spielstand ↔ alle Systeme:** Seed 4, 8 Spieltage.
     - Pakete und Paletten mit Staplerfahrer, Torposten, Tag- und Nachtschicht, 3 Fahrzeugen, externer Wartung.
     - 37 Störungsmeldungen, 1.681 Einheiten zugestellt.
     - 14 Ladeprüfpunkte bitgleich, Invarianten alle 10 Min. erfüllt.
2. **Personalrollen**
   - **Rolleninvariante** im 8-Tage-Betrieb und im Spezialistentest:
     - Jede Aufgabe ist höchstens einer Person zugeordnet.
     - Der Torposten hat nur `:gate`.
     - Der Staplerfahrer arbeitet nur an Paletten-/Sperrgutvorgängen.
     - Spezialisten sortieren nie.
   - **Nur Staplerfahrer und Torposten:** Der Torposten kontrolliert. Pakete werden weder entladen noch sortiert (Wartegrund Personal, Handsortierung „staff“).
   - **Pflicht Personal ↔ Lager:** Der Staplerfahrer (Tag) entlädt 40 Paletten über 16:00.
     - Die Nachtlagerkraft übernimmt in derselben Minute, der Stapler bleibt am Vorgang.
     - Laden 15:59/16:00/16:01 bitgleich, keine Palette verloren.
     - Ohne Ersatzkraft: Wartegrund Personal, Stapler frei, keine Bewegung.
   - **Ohne Spezialisten wie 0.15:**
     - Abgleich gegen 4d301d2 (Skript außerhalb des Repos) mit gleichem Aufbau: 2 Docks, Stapler, 2 Lagerkräfte, Lkw + Lieferwagen, Störungen aus.
     - Seeds 7/13/21 mit Palettenvertrag, Seed 7 nur Pakete, je 4 Tage.
     - Hof, Personal, Lieferungen, Bestände und Sortierung waren in jeder Minute identisch, vor und nach Fix 0.16b.
3. **Kundendienst**
   - **Störungsanliegen:** Schnee, Netz- oder Torstörung bei einer Frist ≤ 240 Min. erzeugen genau eine Statusanfrage „disruption“ (Frist 240).
     Regen (1,1) und ohne Störung: kein Anliegen.
   - **Frist:** siehe B-0.16-1.
   - **Angebotswirkung:** Testaufbau mit gestreuten Zufriedenheitswerten.
     Jedes neue Angebot hat `priceAdjust = round(0,12 · (score − 50)/50, 3)` des anbietenden Versenders, geprüft an ≥ 3 Angeboten.
   - **Kulanz:** je Anliegen genau eine Buchung `ticket-cost`, zweite Kulanz abgelehnt, auch über Laden. Siehe Hinweis.
4. **QS-015-03 Storno Lohnfertigung**
   - Storno während der Beladung einer VAS-Teillieferung wird abgelehnt.
   - Nach bezahlter Teillieferung (1 Leuchte, 33 €) und mit laufendem Job:
     - Storno gibt alles zurück (11 Gehäuse, 11 Platinen, 12 Kartons, 1 Halbfabrikat, 4 Leuchten).
     - Keine Geldbuchung, Jobs abgebrochen, bezahlte Lieferung bleibt.
     - Nach 3 Tagen kein Fremdeigentum und keine offene Anlieferung, Laden bitgleich.

Browser (Chromium /opt/pw-browsers, nach `python3 scripts/package.py` auf a83e53d; erzeugte Dateien danach per `git checkout` zurückgesetzt):

| Prüfung | Ergebnis |
|---|---|
| `npm run test:browser -- --repo` (Smoke) | 32 bestanden, 0 fehlgeschlagen |
| `tests/browser/ui-016.mjs` | 23 OK, 0 FEHL, keine Konsolenfehler |
| `tests/browser/weather-016.mjs` | 22 Prüfungen ok, 0 fehlgeschlagen, errors [] |
| `tests/browser/ui-015.mjs` | 16 OK, 0 FEHL |
| `tests/browser/ui-flow.mjs` | 7 OK, 0 FEHL |
| `tests/browser/rightclick.mjs` | 8 OK, 0 FEHL |
| `tests/browser/quality.mjs` | 27/27 ok |
| `tests/browser/qa-016.mjs` (neu: Netzstörung in Station/Fenster, Kundendienst „nicht fristgerecht“, Entsorgung Fremd-Kühlpakete) | 8 OK, 1 BEFUND (QS-016-03), keine Konsolenfehler |

`npm test` 2× auf a83e53d mit `qa-016`: je 756 Tests, 754 bestanden, 0 fehlgeschlagen, 2 todo (QS-016-01/02).
Vorher auf 200dcf7 ohne `qa-016`: 729/729 bestanden.

## Hinweise (kein Befund)
- **Wetter hängt vom Zufallsstand ab:** Der Tagesplan nutzt `s.seed` zum Planungszeitpunkt. So verlangt es die Schnittstelle (Muster `slotRandom`).
  Ein zusätzlicher `api.random`-Zug vor Mitternacht ändert die Störungen des Folgetags (Seed 11: Netzstörung erscheint).
  Das ist deterministisch, aber eine Spielerhandlung kann den Folgetag „neu würfeln“. Bei Bedarf nur `s.seed` vom Spielbeginn verwenden.
- **Schalter aus:** Das Wetter des laufenden Tags bleibt bis Mitternacht wirksam (Test: Schnee). Die Schnittstelle sagt nur „Planung entfällt“.
  Falls „aus“ sofort wirken soll, beim Ausschalten `weather` leeren.
- **Sortierung bei Netzstörung:** Steht der einzige Sortierplatz ohne Strom, sortiert auch niemand von Hand, weil die Anlage als aktiv zählt.
  Das bestand schon vorher (Strommangel). Durch häufige Netzstörungen tritt es jetzt öfter auf. BALANCING-0.16 bewertet das Aufholen als gewollt.
- **Kulanz je Auftrag:** Ein verspäteter Teilauftrag erzeugt Beschwerde und Teillieferung. Beide erlauben Kulanz, im Test 2 × 7 € auf 140 €.
  Je Anliegen genau einmal, je Auftrag also bis zu zweimal 5 % (je höchstens 50 €). Ob das gewollt ist, entscheidet A02/A08.
- **Containerhandling:** Die Zufriedenheit passt nur `pricePerParcel` an, nicht `pricePerContainer`.
- **`npm test` schreibt `dist/portable.html`** (portable-build); vor dem Commit zurücksetzen.

## Nicht geprüft
- Bildrate auf echter GPU (Headless/SwiftShader). Draw Calls und Dreiecke prüft `weather-016`.
- Störungen bei Containern und Standorttransfers (nur über `travelMinutes` ohne Gebiet, Code gelesen).
- Mehrere Standorte gleichzeitig mit Netzstörung und Linie; Kühlpakete auf der Linie während einer Störung.
- Langzeitwirkung der Zufriedenheit (Versenderwechsel `avoid`/`prefer`) über mehr als 4 Tage.

## Nachtrag A01 (18.10.2026)

- **QS-016-01 behoben:** Sammeltour übergibt Gebiet/Vertrag des Stopp-Auftrags an `travelMinutes` (tours.js `stopCtx`). Befundtest aktiviert, grün.
- **QS-016-02 behoben:** Stromabrechnung je Standort; bei Netzstörung nur der durch eigene Energiegebäude gedeckte Anteil (economy.js). Befundtest aktiviert, grün.
- **QS-016-03 behoben:** Antwortfrist zeigt „in Bearbeitung · noch …“ bis zum Abschluss; „eingehalten“ erst bei `completedAt ≤ respondBy` (app.js `ticketDeadline`).
