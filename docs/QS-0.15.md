# QS 0.15 – GuV/Abschreibung, Warenarten, Mega-Hub, Mehrwertdienste, Grafik-Rahmen (A11, unabhängig)

Stand 18.10.2026. Geprüft: `claude/loving-wozniak-56yxt7` bis 1e122ee (0.15 inkl. A02-Balancing, A10-UI und A07-Fix B-0.15-1).
Kein Produktcode geändert. Grundlage: SCHNITTSTELLEN-0.15 (Abnahme), BALANCING-0.15, AGENTS.md (Pflicht-Übergänge).
Eigene Szenarien; Entwicklertests nicht übernommen.

## Ergebnis

**Freigabe 0.15: ja, mit drei bekannten Einschränkungen (keine hohe Schwere).**

Der Fachkern ist stabil:
- GuV stimmt mit einer unabhängigen Nachrechnung aus Geldbuchungen und Anlagen überein, gesamt und für jeden einzelnen Tag.
- Kühl- und Sperrgutverträge laufen bis zur Zahlung ohne Mengenverlust, ohne negative Bestände und ohne Doppelbuchung.
- Lohnfertigung mischt nie Fremd- und Eigenmaterial und zahlt genau einmal.
- Laden während Kühl-Entladung, Quergurt-Sortierung und VAS-Fertigung setzt bitgleich fort.
- Der A07-Fix B-0.15-1 wirkt: Kein Dock bleibt mehr blockiert.

Offen sind drei Befunde. Alle betreffen seltene Situationen oder Aufräumen nach Abbruch:

| Befund | Schwere | Rolle |
|---|---|---|
| QS-015-03 Storno Lohnfertigung: Kundenmaterial und Halbfabrikate bleiben dauerhaft im Lager | mittel | A04/A05/A08 |
| QS-015-02 Abriss eines arbeitenden Quergurts: beide Lagerkräfte bleiben an der abgerissenen Anlage gebunden | mittel | A04/A05 |
| QS-015-01 Quergurt in Status „power“ zählt weiter als Last; fällt die Energieversorgung aus, verliert der Standort die gesamte Kühlung | niedrig | A04/A05 |
| QS-015-04 Wartegrund „Kühllager fehlt“, obwohl das Kühllager nur ausgeschaltet oder ohne Strom ist | niedrig | A05/A10 |

## Befunde

### QS-015-03 Storno Lohnfertigung lässt Fremdeigentum zurück (mittel, A04/A05/A08)
- **Ausgang:** Seed 31, Fertigungslinie (Montage, Prüfung, Verpackung, Regale, Rampe), 1 Fertigungskraft, 2 Lagerkräfte, Lieferwagen.
  Echtes VAS-Angebot (17 × Leuchte, 33 €/Stück, Material je 17 Gehäuse, Platine, Karton).
- **Ablauf:**
  1. `acceptOrder`.
  2. Das Kundenmaterial wird eingelagert (owner = Auftrag). Die Fertigung beginnt sofort.
  3. `cancelOrder` (zulässig, weil keine Lieferung läuft).
  4. 3 Spieltage weiterlaufen lassen.
- **Erwartet:** Fremdmaterial geht an den Kunden zurück oder wird ausgebucht. Das entspricht dem Vertragsende bei Fremdlogistik
  (`settleOrder` → `inventory.remove`). Bei Storno vor Anlieferung entfällt die Anlieferung.
- **Tatsächlich:**
  - Nach 3 Tagen liegen noch 15 Gehäuse, 15 Platinen, 17 Kartons, 1 montierte und 1 geprüfte Leuchte im Lager, Eigentümer ist der stornierte Auftrag.
  - Beim Storno direkt nach Annahme liefert der Kunde trotzdem alle 51 Teile an. Sie bleiben ebenfalls liegen.
  - Laufende Jobs werden fertig, ihre Ausgabe gehört dem stornierten Auftrag.
  - Die Ware belegt dauerhaft Lagerplatz, ist für niemanden nutzbar und lässt sich nicht entsorgen.
- **Vorschlag:**
  - Bei `cancelOrder` kind `vas`: offene Anlieferungen (purchases mit owner = Auftrag, status `ordered`) streichen.
  - Freie Chargen des Auftrags per `inventory.remove` zurückgeben (wie `settleOrder`).
  - Laufende Jobs entweder abwarten und danach zurückgeben, oder den Storno ablehnen, solange ein Job läuft.
- **Test:** `tests/qa-015.test.js` BEFUND QS-015-03 (todo).

### QS-015-02 Verwaiste Sortierbindung nach Abriss (mittel, A04/A05)
- **Ausgang:** Mega-Hub nach echter Forschung, Quergurt, 3 Lagerkräfte (Schicht „all“), 3.000 Pakete inbound. Der Quergurt arbeitet mit Besetzung 2.
- **Ablauf:** `demolish` auf den Quergurt. Die Prüfung in `core.worldCommand` lässt den Abriss zu, denn der Quergurt hat weder `b.task` noch `b.job`.
- **Erwartet:** Beide Kräfte werden frei. Eine Person darf keiner Tätigkeit an einer nicht vorhandenen Anlage zugeordnet sein.
- **Tatsächlich:**
  - Beide Kräfte behalten `building-N:sort` bzw. `:sort2` mit der Tätigkeit „Sortierung“.
  - Im Lauf freigegeben wurden sie erst nach ≈ 430 Minuten durch die Ermüdungspause, bei Tagschicht wäre es das Schichtende.
  - In dieser Zeit fehlen sie beim Entladen und Beladen. `unloadNeed` gibt nur Bindungen vorhandener Sortieranlagen ab.
  - Ware geht nicht verloren.
  - Gegenprobe: Beim einfachen Sortierplatz besteht dasselbe Verhalten (1 Kraft) schon vor 0.15. Neu ist, dass der Quergurt doppelt so viele Kräfte bindet.
- **Vorschlag:** In `sorting.step` Bindungen `*:sort`/`*:sort2` freigeben, deren Gebäude fehlt. Alternativ beim Abriss eines Sortiergebäudes `releaseAll` aufrufen.
- **Test:** BEFUND QS-015-02 (todo).

### QS-015-01 Lastberechnung Kühlung zählt den stromlosen Quergurt mit (niedrig, A04/A05)
- **Ausgang:**
  - Mega-Hub mit Quergurt (12 kW), Labor (4), Rampe (1).
  - Energieversorgung (+40) und zwei Kühllager (16).
  - Gesamtlast 33 kW. Der Bau ist nur mit Energieversorgung möglich („Stromanschluss zu schwach“ ohne sie).
- **Ablauf:** Die Energieversorgung wird ausgeschaltet (Ausfall). Das Angebot sinkt auf 30 kW.
- **Erwartet:** Gleiche Vorrangregel in allen Modulen:
  - `sorting.js` versorgt erst die Grundlast (21 kW). Der Quergurt geht korrekt auf „power“ und sortiert nicht.
  - Damit wären die Kühllager versorgt.
- **Tatsächlich:**
  - `special.coolingCapacity` vergleicht das Angebot mit der Summe aller eingeschalteten Anlagen einschließlich des stehenden Quergurts (33 > 30).
  - Ergebnis: Kühlkapazität 0, alle Kühlpakete erwärmen sich und werden unter Qualität 70 gesperrt.
  - Ohne Quergurt (21 ≤ 30) bliebe die Kühlung erhalten.
- **Einordnung:** Der Fall ist selten und setzt einen Ausfall der Energieversorgung voraus. Die Folge ist aber teuer, und es gibt keinen Hinweis.
  Auch die Stromabrechnung (`economy.step`) zählt den stehenden Quergurt mit. Diese Regel bestand schon vor 0.15.
- **Vorschlag:** `coolingCapacity` mit derselben Reihenfolge wie `sorting.js` rechnen: Grundlast vor Sortieranlagen. Alternativ HUD-Warnung „Kühlung aus: Stromlast“.
- **Test:** BEFUND QS-015-01 (todo).

### QS-015-04 Wartegrund „Kühllager fehlt“ bei ausgeschaltetem Kühllager (niedrig, A05/A10)
- `yard.coldWait` meldet „Kühllager fehlt“, sobald `coolingCapacity` 0 ist. Das gilt auch, wenn ein Kühllager vorhanden, aber ausgeschaltet oder ohne Strom ist.
- Beobachtet im Kühlkettentest: Kühllager per `toggleBuilding` aus, der Kühl-Lkw wartet mit „Kühllager fehlt“.
- Vorschlag: eigener Text „Kühllager ohne Betrieb (aus/Strom)“. Kein Test (Text).

## Nachprüfung B-0.15-1 (A07, 1e122ee)
- **Eigener Test** (`qa-015` „Nachprüfung B-0.15-1“):
  - Seed 2, **ein** Dock, ein Kühllager, ein Kühlfahrzeug. Der Spieler nimmt **jedes** Kühlangebot an (Fehlplanung wie A02 „kuehlvoll“). 8 Spieltage.
  - Bei wartendem eigenem Fahrzeug hielt ein Fremd-Lkw mit Platzmangel das Dock in keiner Minute (max. 0 Min.).
  - Fremd-Lkw standen insgesamt 76 Minuten mit Teilstand in der Warteschlange.
  - 43 eigene Abfahrten, 783 von 840 Kühlpaketen zugestellt.
  - Mengenerhalt mit Teilstand alle 5 Min. erfüllt, `validateState` grün.
  - Laden im Zustand „Teilstand in Warteschlange“ setzt bitgleich fort.
- **A02-Reproduktion** `WDEBUG=parcel_cold node tests/balance-015.mjs ware --only kuehlvoll --seeds 2 --serial`:
  - Kein dauerhaft belegtes Dock mehr.
  - Zugestellt 3.420 Kühlpakete (vorher laut BALANCING-0.15: 270–600).
  - GuV 15 T: 16.946 € (vorher Mittel −3.099 €).
  - Die Kühlwerte in BALANCING-0.15 Abschnitt 3 sind damit überholt (Hinweis an A02).
- **Ergebnis:** behoben. Neuer Aspekt: keiner.

## Bestandene Prüfungen (selbst ausgeführt)

Node `tests/qa-015.test.js`: 14 bestanden, 3 todo (Befunde 01–03). Nur reguläre Befehle, mit diesen Ausnahmen:
- Quergurt-Mengenprüfungen legen Testaufträge und Pakete per `inventory.add` inbound an.
- Für den Defektfall wird `condition` gesetzt. Der Quergurt verschleißt im Modell nicht.

Gemeinsame Invarianten alle 5 Min.:
- keine negative oder überreservierte Charge;
- `payment:`/`tour-payment:` genau einmal und = Rechnungsbetrag;
- Kühlpaket nur im Kühlfahrzeug;
- Kühlbelegung ≤ Kühlkapazität;
- Sperrgut nie inbound;
- Mengenerhalt je Vertragsauftrag: entladen = Bestand + zugestellt + zurückgegeben;
- `o.paid` = Summe der Umsatzbuchungen;
- `validateState`.

1. **GuV/Abschreibung**
   - **Szenario:** Seed 17, Startvertrag, Lieferwagen, Lkw, Mietlieferwagen, Kredit 20.000 €, Abriss eines Regals an Tag 2, 4 Tage.
     - Kontostand = Start + Summe Buchungen, keine Geldbuchung für Abschreibung.
     - Ergebnis −3.200,06 € = unabhängig nachgerechnet:
       - Geld ohne Investition/Finanzierung, Rückbauerlös zählt;
       - Abschreibung −1.338,33 €;
       - Abgang −1.193,33 €.
   - **Tagesadditivität:** Für jeden Tag stimmt das Tagesergebnis mit der Nachrechnung überein. Summe der Tage = Gesamt, Abschreibung ebenso.
   - **Abriss:** Rückbauerlös 420 € (35 %) als Geld, Abgang = Anschaffung − kumulierte Abschreibung. Danach schreibt nur noch das Fahrzeug ab.
   - **Miete und Kredit:** Mietfahrzeug nicht im Anlagenspiegel, Miete als Aufwand. Zinsen erfasst, Kredit nicht ergebniswirksam.
   - **Tagesgenau:** Anschaffung zu ungerader Minute.
     - 1.439 Min. danach: 0.
     - Bei 1.440: 1/180 bzw. 1/90.
     - Deckel genau bei 90/180 Tagen.
   - **Altstand ohne Felder** (Gebäude, Kauf-, Mietfahrzeug, versetztes Gebäude):
     - lädt; GuV identisch, Quelle „ledger“;
     - ohne Belege 480/Katalogpreis;
     - neue Käufe setzen Felder.
   - **Laden:** `report()` identisch, Weiterlauf bitgleich.
2. **Kühlpaket**
   - **Ende-zu-Ende:** echtes Angebot, Seed 23, Zuschlag 7,50 € im Preis, bis Vertragsabrechnung (16 Aufträge).
     - 720 zugestellt, Umsatz 10.980 €, nur Kühlfahrzeug.
     - Gekühlte Lagerware max. 4 °C, kein Temperaturschaden.
     - Abrechnung: höchstens eine `penalty-open` je Auftrag, keine Fremdware übrig.
   - **Kühlkette:** Kühllager aus.
     - Erwärmung; unter Qualität 70 dauerhaft gesperrt (3 Chargen), auch nach Wiederkühlung.
     - Gesperrte Menge nicht verfügbar, Fremdware nicht entsorgbar.
   - **Fahrzeugregeln:** Lieferwagen/Lkw für Lieferung und Tour abgelehnt; `maxLoad` Kühlfahrzeug 400, Sperrgut Lieferwagen 3, Lkw 133.
   - **Laden mitten in der Kühl-Entladung:** bitgleich.
3. **Sperrgut**
   - **Ende-zu-Ende:** echtes Angebot, Seed 41, 24 Aufträge, 264 Stück, 8.184 €.
     - Nie inbound, Sortierzähler 0.
     - Teillieferung Lieferwagen 3 Stück: `o.paid` = bezahlte Lieferungen, Rest offen.
   - **Pflicht Lager↔Transport sinngemäß:** Lkw-Beladung nach Reservierung storniert. Reservierung, Personal, Rampe und Stapler frei, Ware erneut verfügbar.
4. **Quergurt/Mega-Hub**
   - **Bausperre und Preise:** Bau ohne Forschung gesperrt (Meldung „Mega-Hub“), Forschung 12.000 €, Bau 60.000 €.
   - **Durchsatz:** 2 Kräfte 40/min, 1 Kraft 20/min.
   - **Fehlwurf:** genau jedes 100. Paket (2.000 → 20).
     - Nachsortierung von Hand mit dritter Kraft.
     - Mengenerhalt in jeder Minute, jedes Paket genau einmal gezählt.
   - **Pflicht Personal↔Sortierung:** Schichtende 16:00 während der Sortierung (2 Tag-, 1 Nachtkraft).
     - Tagkräfte frei, Besetzung 1, keine Ware verloren.
     - Laden bei 15:59/16:00/16:01 bitgleich.
     - Ohne Kraft: Status „staff“, keine Bewegung.
   - **Vorrang Entladen:** Bei echtem Vertrags-Lkw gibt der Quergurt eine Kraft ab.
   - **Strom und Defekt:** Ausfall der Energieversorgung → „power“, Defekt → „broken“, jeweils Kräfte frei.
   - **Sperrgut:** nie über den Quergurt.
   - **Laden mitten in der Sortierung:** bitgleich.
5. **Mehrwertdienste**
   - **Ende-zu-Ende**, echtes Angebot, parallel eigenes Material gleicher Art im Lager:
     - Kundenmaterial ohne Einkaufsbuchung, jeder Job verbraucht nur Material seines Eigentümers.
     - Zustellung, Zahlung 17 × 33 € = 561 € in 7 Buchungen, jede genau einmal.
     - Materialeinsatz 0, Fertigware vollständig zugestellt.
   - **Pflicht Personal↔Produktion:** Fertigungskraft (Tagschicht) endet um 16:00 mitten im VAS-Arbeitsgang.
     - Kraft frei, Arbeitsgang ruht, Anlagen „staff“.
     - Laden bitgleich, Fortsetzung am Folgetag.
   - **Laden mitten in der Lohnfertigung:** bitgleich.

Browser (Chromium /opt/pw-browsers, nach `python3 scripts/package.py`; erzeugte Dateien danach per `git checkout` zurückgesetzt):

| Prüfung | Stand | Ergebnis |
|---|---|---|
| `tests/browser/quality.mjs` (setQuality/Automatik, prefs.quality, Budget je Probe-Szene × Stufe) | e37eb37 | 27/27 ok |
| `tests/browser/models-015.mjs` | e37eb37 | 14/14 ok |
| `tests/browser/ui-015.mjs` | e37eb37 und 1e122ee | je 16 OK, 0 FEHL, keine Konsolenfehler |
| `tests/browser/ui-flow.mjs` | e37eb37 | 7 OK, 0 FEHL |
| `tests/browser/rightclick.mjs` | e37eb37 | 8 OK, 0 FEHL |
| `npm run test:browser -- --repo` (Smoke) | e37eb37 und 1e122ee | je 32 bestanden, 0 fehlgeschlagen |

`npm test` 2× auf 1e122ee mit `qa-015`: je 676 Tests, 673 bestanden, 0 fehlgeschlagen, 3 todo (die drei Befundtests).
Vorher auf e37eb37 ohne `qa-015`: 655/655 bestanden.

## Hinweise (kein Befund)
- **Fehlwurf-Chargen:** Nach der Nachsortierung wechselt eine ganze Fehlwurf-Charge nur den Ort und behält `resort:true` im Lager.
  Das ist ohne Wirkung, solange sie nicht per Linie erneut nach inbound eines anderen Standorts geht. Dort würde sie von Hand statt am Sortierer sortiert.
- **Balancing-Text:** BALANCING-0.15 nennt die Kühlergebnisse vor dem Fix B-0.15-1. A02 sollte „kuehl/kuehlvoll“ neu messen.

## Nicht geprüft
- Bildrate auf echter GPU (Headless nutzt SwiftShader). Draw Calls und Dreiecke sind geprüft.
- „Lager voll“-Variante von B-0.15-1 mit Paletten/Sperrgut. Abgedeckt nur durch `tests/yard-dockrelease.test.js`.
- Linienfahrt mit Kühlpaketen zwischen zwei Standorten mit Kühllager (nur Entwicklertest `ware-own`).
- Mehrere Standorte mit Quergurt, Quergurt-Wartung über Werkstatt.

## Nachtrag A01 (18.10.2026)

- **QS-015-02 behoben:** Abriss gibt alle Personalbindungen `${gebäude}:*` frei (core.js). Befundtest aktiviert und grün.
- **QS-015-04 behoben:** Neuer Wartegrund „Kühllager außer Betrieb“ bei vorhandenem, aber abgeschaltetem/stromlosem/defektem Kühllager (yard.js, Hinweis im Torbuch). Gibt wie die anderen Platzgründe das Dock frei.
- **QS-015-01 (niedrig) und QS-015-03 (mittel):** auf 0.16 verschoben (Lastpriorität Energie; Rückgabe Fremdmaterial bei Storno Lohnfertigung). Testfälle bleiben als todo.
- A02-Kühlwerte in BALANCING-0.15 stammen von vor dem Fix B-0.15-1; Neumessung in 0.16.
