# QS 0.10 – Kurzprüfung Paletten und Vertragsstrafe (A11, unabhängig)

Stand 17.10.2026. Geprüft: `claude/loving-wozniak-56yxt7` bis 2559a39 (Release 0.10). Kein Produktcode geändert.
Grundlage: SCHNITTSTELLEN-0.10-W2 (Abnahme), BALANCING-0.10-W2, QS-0.9-W1. Entwicklerangaben nicht übernommen, eigene Szenarien.
Wegen knappem Budget nur Risikoprüfung, kein Breitentest.

## Ergebnis

**Freigabe 0.10: ja, mit Auflage.** Die Abnahme aus SCHNITTSTELLEN-0.10-W2 ist erfüllt. Ein Palettenvertrag läuft vollständig:
Lkw → Stapler entlädt nach `stock` → Lkw-Zustellung mit Stapler-Beladung → Zahlung je Palette. Die Mengen bleiben erhalten.
Die Strafen werden genau einmal gebucht. Laden in jeder Phase führt zum gleichen Endhash. Kein Befund verliert Ware oder bucht Geld doppelt.
Auflage: QS-W2-01 in 0.10.x beheben. Der Fehler blockiert bei leerer Kasse den Palettenbetrieb.

| Befund | Schwere | Rolle |
|---|---|---|
| QS-W2-01 Blockierte Palettenbeladung hält den Stapler, leert den Akku, Fremd-Lkw verhungert | mittel | A05/A07 |
| QS-W2-02 Standortfluss „Zustellung: N Pakete offen“ zählt Paletten als Pakete | niedrig | A10 |
| QS-W2-03 Handbuch „Paletten und Stapler“ nennt die Akku-Hysterese (bis 30 %) nicht | niedrig | A10 |

## Befunde

### QS-W2-01 Blockierte Palettenbeladung hält den Stapler und leert den Akku (mittel, A05/A07)
- Ausgang: 2 Docks, Staplerplatz, 2 Lagerkräfte, Lkw, Palettenvertrag aktiv, Paletten im Lager.
- Repro: Paletten-Lieferung disponieren. Die Kasse ist kleiner als die Fahrtkosten. Das ist erreichbar, weil Pflichtstrafen und
  Löhne ins Minus buchen. Danach kommt ein zweiter Paletten-Lkw an.
- Erwartet: Ohne Fortschritt hält die Lieferung den Stapler nicht und verbraucht keinen Akku. Der Fremd-Lkw entlädt.
- Tatsächlich: `transport.js` (Zweig loading) bindet Stapler und Lagerkraft und ruft jede Minute `useForklift` auf. Dann setzt es
  `remaining=1` und den Wartegrund „Betriebskosten können nicht bezahlt werden“. Gemessen: Akku 98 → 18 in 160 Min.
  Danach Ladezwang, Laden bis 30, dann holt die Lieferung den Stapler erneut. `transport` läuft vor `yard`, deshalb
  gewinnt sie jedes Mal. Der Fremd-Lkw steht über 2 h bei 0/12 mit „Kein Stapler“ und belegt dabei ein Dock.
  `tours.js` hat dasselbe Muster („Fahrtkosten nicht gedeckt“, „Reservierte Gesamtladung gesperrt“), ebenso transport „Ladung nicht verfügbar“.
- Vorschlag: In den Warteschleifen am Ende der Beladung Stapler und Lagerkraft freigeben bzw. `useForklift` nur bei echtem
  Fortschritt aufrufen (`--remaining`).
- Test: `tests/qa-w2.test.js` QS-W2-01 (todo).

### QS-W2-02 Standortfluss zählt Paletten als Pakete (niedrig, A10)
- Linke Leiste „Standortfluss“ → Zeile „Zustellung“: „28 Pakete offen“. Es gab nur Palettenaufträge (8 + 20 Paletten).
  Die Zeile „Versandbereit · Paletten“ ist korrekt. Quelle: app.js Z. 678 (`'Pakete offen'`).
- Test: Browser `tests/browser/qa-w2.mjs` (Screenshot), keine automatische Prüfung.

### QS-W2-03 Handbuch ohne Hysterese (niedrig, A10)
- Handbuch „Paletten und Stapler“: „Unter 10 % ist er nicht einsatzbereit.“ Seit W2b bleibt er bis 30 % gesperrt.
  Hof & Docks zeigt bereits „lädt bis 30 %“. Spieler wundern sich sonst, warum der Stapler bei 15 % steht.

## Bestandene Prüfungen (tatsächlich ausgeführt)

Node `tests/qa-w2.test.js` (9 Prüfungen grün, 1 todo). Alle Aufbauten nutzen reguläre Befehle mit Wirtschaftsbetrieb. Der
Palettenvertrag ist das echte Angebot um 17:00 nach Bau des Staplerplatzes. Testdaten, jeweils VOR der Annahme bzw. Ankündigung
gesetzt: Ankunftsminute, Laufzeit 1 Tag (Vertragsende), Akku 12 % (Hysterese), Zustand 0 (Ausfall), Kasse 1 € (QS-W2-01).
Invarianten alle 5 Minuten:
- Je Palettenauftrag gilt `qty = offen im Hof + Bestand + zugestellt + zurückgegeben`.
- Keine negativen Mengen, Reservierung ≤ Menge, Paletten nur in `stock`/`vehicle` mit Auftragseigentum.
- Stapler nie doppelt gebunden, Ladezwang nur unter 30.
- Zahlungen je Lieferung/Stopp höchstens einmal, mit Rechnung und Abschlag.
- Strafen: je verspäteter Lieferung/Stopp genau eine Buchung `qty × Satz`, keine bei pünktlicher Zustellung; `penalty-open` nur bei Storno zum Vertragsende.
- `yard.validate`.

Ergebnisse:
1. **E2E** (Seed 11, 4 Tage): 8 Aufträge, 32 Paletten, 32 zugestellt, 4.000,00 € bezahlt (125 €/Palette). Stapler gebunden beim
   Entladen und bei der Beladung. Rechnung je Lieferung = qty × Preis (×0,9 bei Verspätung). Lieferwagen trägt 0 Paletten.
2. **Seeds 1–3, je 6 Tage**: 12/6/20 Aufträge, 96/114/110 Paletten, alle zugestellt, keine Strafe, alle Invarianten grün.
   Im normalen Ablauf fällt der Akku nie unter 10. Der Ladezwang wurde deshalb nicht erreicht (Hinweis für A02: Akku wirkt bei 1 Vertrag nicht).
3. **Akku-Hysterese im Ablauf** (Akku 12 % beim Andocken): genau 2 Wechsel des Ladezwangs, ≥ 20 Min. Ladeblock, dabei keine
   Entladung und Wartegrund „Stapler lädt“. Menge danach exakt. Laden beim Ein-/Austritt und im Ladezwang (≥ 3 ×) → Endhash identisch.
4. **Strafe verspätet** (Disposition erst ab 16:00, Laden alle 97 Min., 45 Ladevorgänge je Lauf): Einzellieferung 2 Strafbuchungen
   (−375,00 €), Tour 4 Strafbuchungen `penalty:tour-…` (−700,00 €). Zahl der Buchungen = Zahl der verspäteten Zustellungen.
5. **Vertragsende** (Laufzeit 1 Tag): Die Lieferung ist zur Abrechnungszeit noch beladen und reserviert (Nacht, kein Fahrer). Dieser
   Auftrag bleibt `active` mit `settleWait`, ohne `penalty-open`. Alle übrigen Aufträge sind storniert, voll zurückgegeben
   und je einmal bestraft. Nach Laden und Zustellung wird der Rest genau einmal bestraft: `(qty−1) × 60 €`, Rückgabe `qty−1`.
   Danach 0 Paletten im Bestand und `settled`. Weitere 1.700 Min. mit Laden: keine zweite Buchung.
6. **Laden beim ersten Auftreten jeder Phase** (Seeds 1, 2, 3 mit Einzellieferungen, Seeds 1 und 3 mit Touren; je 15–16 Ladevorgänge):
   Endhash identisch zum Lauf ohne Laden. Erreichte Phasen: approach, gate, toDock, docking, unloading, exit, gone;
   Lieferung loading (auch „freie Laderampe fehlt“), transit, unloading, returning; Tour loading, transit, unloading, returning;
   Stapler frei/an Ankunft/an Lieferung/an Tour; Zahlung offen.
7. **Pflichtfall Fahrzeug fällt aus nach Reservierung**:
   - Während der Beladung wird die Wartung abgelehnt, ebenso eine Doppelreservierung über den zweiten Lkw.
   - Nach Laden gibt `cancelShipment` Reservierung, Stapler, Dock und Personal frei.
   - Lkw mit Zustand 0: Disposition abgelehnt, externe Wartung möglich. Der Ersatz-Lkw liefert vollständig und wird bezahlt.
   - Gleiches für die Sammeltour mit `cancelTour`; danach liefert die Ersatz-Tour und wird je Stopp einmal bezahlt.
8. **Dockwechsel QS-W1-03 mit Paletten-Lkw** (2 Docks, Abschalten während Entladen bei ≥ 2 Paletten):
   - Wechsel nach toDock am freien Dock, Fortschritt bleibt, Stapler und Lagerkraft sind frei, altes Dock frei.
   - Nach Laden vollständig entladen.
   - Kein Dock frei: Wartegrund „Dock außer Betrieb“, Menge fix, Stapler frei.

Browser (Chromium über globales Playwright, tmp-Kopie, Lesehaken `__qa`):
- `tests/browser/qa-w2.mjs`: 10/10 OK.
  - Probe-Zustand (Dock, Regale, Lagerkraft, Fahrer, Lkw, 16:55, ohne Staplerplatz) über „Importieren“ geladen.
  - Staplerplatz im Baumodus gebaut (genau 1). Rechtsklick beendet den Baumodus ohne zweiten Bau.
  - Tempo 12 bis zum Palettenangebot. Die Karte nennt Palette, Stapler, Lkw und die Strafsätze 25 €/60 €.
  - Vertrag per Klick angenommen.
  - Hof & Docks während der Entladung: Torbuch „2 / 20 Paletten“, Stapler 1 „Im Einsatz · Akku 99 % · Entlädt OHD-JV 3483 (2/20 Paletten)“.
  - Keine Konsolenfehler.
- `tests/browser/rightclick.mjs` selbst ausgeführt: 8/8 OK (Baumodus, Fenster, Rechts-Ziehen, Kontextmenü nur im Suchfeld, keine Konsolenfehler).

`npm test`: 2 × grün (je 456 Prüfungen, davon 1 todo QS-W2-01).

## Nicht geprüft
- Kühlware/Sperrgut, mehrere Standorte, Fremdfracht mit Paletten, Retouren mit Paletten, Stapler ohne Strom im Gesamtablauf
  (Einzeltest der Entwickler vorhanden), Performance mit vielen Palettenverträgen, 0.9-Migration mit laufenden Palettenvorgängen
  (Palettenverträge sind neu in 0.10).
- Ladezwang über die Oberfläche (nur über manipulierten Akku erreichbar, im Browser nicht gesetzt).
