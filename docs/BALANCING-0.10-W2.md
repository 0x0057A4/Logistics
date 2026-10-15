# Balancing Welle 2b (Version 0.10) – A02, dazu A05 Stapler-Akku

Stand 15.10.2026, Basis 91c08cf. Grundlage: `docs/BALANCING-0.9-W1.md` 9.6 (Paketpreis 7–8,50 €, gut amortisiert in 6–8 Tagen),
`docs/SCHNITTSTELLEN-0.10-W2.md` (W2-S1 Vertragsstrafe, W2-S2 Paletten und Stapler).

Messung: `node tests/balance-hub.mjs` (deterministisch, Seeds 1–5, Wirtschaftsbetrieb, 85.000 € Startkapital). Bericht nach 5 und
10 Spieltagen, Amortisation bis 20 Tage. Je Szenario läuft ein eigener Prozess (≈ 75 s gesamt); `--serial`, `--seeds 1,2`, `--json`.

## 1. Ziele

| Ziel | Ergebnis |
|---|---|
| Überlast bringt weniger Geld als guter Betrieb | erreicht: 5 T −973 €, 10 T −4.236 € gegenüber „gut“ |
| Palettenausbau (Staplerplatz 6.500 € + Lkw 28.000 € + Fahrer 450 €) amortisiert in ≈ 8–12 Tagen | erreicht: **8 / 10 / 11 / 11 / 12 Tage** nach dem Ausbau |
| Palettenausbau ist eine echte Alternative zum zweiten Lieferwagen | ja: Zweitwagen + Lagerkraft 5–9 Tage (einmal >20), Paletten 8–12 Tage bei 2,6-fachem Mehrergebnis/Tag |
| Verspätete Paletten tun weh | ja: träge Palettendisposition amortisiert nie, Mehrergebnis 364 €/Tag statt 4.008 € |

## 2. Geänderte Spielwerte (`dist/contracts.js` → `TERMS`)

| Wert | W2a | **W2b** | Grund |
|---|---|---|---|
| `pallet.price` | 35–55 €/Palette (`[35,4,5]`) | **110–140 €** (`[110,5,6]`) | Ein Lkw schafft aus Ankünften 08:30–12:00 nur zwei volle Touren (≈ 40 Paletten/Tag). Bei 35–55 € brachte der Ausbau ≈ 1.300 €/Tag mehr und amortisierte nie (>20 Tage). Bei 110–140 € ≈ 4.000 €/Tag. Pro kg bleibt die Palette (300 kg) weit billiger als das Paket. |
| `penalty.parcel.late` | 1,50 € | **2,50 €** | ≈ 30 % des Paketpreises zusätzlich zum Abschlag 10 %. Damit ist Überannahme schon nach 5 Tagen schlechter als guter Betrieb. |
| `penalty.parcel.open` | 4,00 € | **8,00 €** | ≈ voller Paketpreis für liegengebliebene Ware bei Vertragsende. Wirkt ab Tag 7–11 (Vertragsende + 1 Tag). |
| `penalty.pallet.late` | 8 € | **25 €** | ≈ 20 % des Palettenpreises plus 10 % Abschlag |
| `penalty.pallet.open` | 20 € | **60 €** | ≈ 50 % des Palettenpreises |
| `pallet.units`, `sla`, `days`, `fromDay` | – | unverändert | – |
| Staplerplatz `BUILDINGS.forklift.cost` (catalog.js) | 6.500 € | **unverändert** | Der Lkw (28.000 €) dominiert die Investition. Eine Senkung um 2.000 € kürzt die Amortisation nur um ≈ 0,5 Tage; ein elektrischer Stapler samt Ladeplatz für 6.500 € ist schon günstig. Lieber über den Palettenpreis steuern. |

Zahl der Zufallszüge unverändert. Determinismus-Hashes (`tests/perf-determinism.test.js`) neu erzeugt.
Gegenprobe: `contracts.js` aus 91c08cf mit dem neuen `yard.js` reproduziert die vorherigen Hashes exakt (4/4 grün).

## 3. Messskript (`tests/balance-hub.mjs`)

- Paketszenarien nehmen nur Paketangebote an. Seit W2a gab es ab Tag 3 Palettenangebote. „gut“ wählte sie wegen des hohen Stückpreises, konnte sie ohne Stapler aber nicht entladen. Das verfälschte „gut“ in W2a (−8.100 € statt −4.297 € in 5 Tagen).
- Neue Spalten: Vertragsstrafe 5 T/10 T, Ergebnis 10 T, offene Einheiten an Tag 10, Paletten zugestellt und pünktlich.
- Neue Szenarien:
  - **zweitwagen**: wie gut. Zu Beginn von Tag 2 kommen ein zweiter Lieferwagen und ein zweiter Fahrer dazu (9.450 €). Kapazität 760 Pakete/Tag.
  - **zweitwagenlager**: wie zweitwagen, dazu eine zweite Lagerkraft (9.800 €).
  - **paletten**: wie gut. Zu Beginn von Tag 2 kommen Staplerplatz, Lkw und ein zweiter Fahrer dazu (34.950 €). Palettenverträge bis 40 Paletten/Tag. Der Lkw fährt nur Paletten (Touren bis 20 Paletten, 4 Stopps), der Lieferwagen weiter Pakete.
  - **paltraege**: wie paletten, aber Paletten erst ab 14:00 und ohne Rücksicht aufs Schichtende disponiert.
- Ausbau-Szenarien lehnen bei vollem Angebotsfenster (3 offen, keins passt) das älteste Angebot ab (regulärer Befehl).
- **Ausbau-Amortisation**: Tage nach dem Ausbau, bis das kumulierte Mehr-Betriebsergebnis gegenüber „gut“ (gleicher Seed) die Ausbauinvestition erreicht. Mehrergebnis/Tag ist der Mittelwert über die Tage 3–10.
- Die Disposition berücksichtigt das Fahrzeugtempo (Lkw 0,85).

## 4. Ergebnis (Mittel Seeds 1–5)

Ergebnis = Geld − 85.000 €. Amortisation = gesamte Investition ab Spielbeginn, Spieltage (Seeds 1–5). Ausbau-Amort. = Tage nach dem Ausbau, siehe oben.
„vorher“ = W2a-Werte (Preis 35–55 €, Strafe 1,50/4 € bzw. 8/20 €), gemessen mit demselben Skript.

| Szenario | Stand | Invest | Ergebnis 5 T | Ergebnis 10 T | Umsatz 5 T | Strafe 5 T / 10 T | Pünktl. Pakete | Paletten zugest. 10 T (pünktl.) | Amortisation (Tage) | Ausbau-Amort. (Tage) | Mehrergebnis/Tag |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|
| start | nachher | 14.500 € | −7.342 € | −2.667 € | 8.960 € | 0 / 0 € | 100 % | – | 12,3 / 9,2 / 12,2 / 16,2 / >20 | – | – |
| gut | vorher | 14.500 € | −4.533 € | +5.039 € | 12.021 € | 178 / 639 € | 93 % | – | 7,1 / 6,2 / 7,1 / 9,1 / 6,2 | – | – |
| gut | **nachher** | 14.500 € | **−4.652 €** | **+4.613 €** | 12.021 € | 297 / 1.065 € | 93 % | – | **7,1 / 6,2 / 7,2 / 9,1 / 6,2** | – | – |
| ueberlast | vorher | 14.500 € | −4.847 € | +3.472 € | 12.734 € | 1.167 / 4.242 € | 54 % | – | 6,3 / >20 / 8,2 / 7,3 / 6,2 | – | – |
| ueberlast | **nachher** | 14.500 € | **−5.625 €** | **+377 €** | 12.734 € | 1.946 / 7.337 € | 54 % | – | 7,1 / >20 / >20 / >20 / 6,2 | – | – |
| ausbau | nachher | 23.000 € | −13.690 € | −7.188 € | 13.073 € | 1.758 / 6.765 € | 59 % | – | 9,3 / >20 / >20 / >20 / >20 | >20 (alle) | −431 € |
| traege | vorher | 14.500 € | −10.843 € | −11.330 € | 6.555 € | 1.106 / 5.373 € | 12 % | – | >20 (alle) | – | – |
| traege | **nachher** | 14.500 € | −11.580 € | **−15.960 €** | 6.555 € | 1.844 / 10.003 € | 12 % | – | >20 (alle) | – | – |
| schlecht | nachher | 14.050 € | −14.904 € | −16.304 € | 0 € | 0 / 546 € | – | – | nie | – | – |
| zweitwagen | vorher | 23.950 € | −9.450 € | +8.096 € | 17.880 € | 659 / 3.416 € | 81 % | – | 7,3 / 7,1 / 7,3 / 6,3 / 8,2 | 7 / 7 / 7 / 5 / 9 | 1.459 € |
| zweitwagen | **nachher** | 23.950 € | −9.890 € | +5.819 € | 17.880 € | 1.099 / 5.693 € | 81 % | – | 8,1 / 7,3 / 8,2 / 7,1 / 9,1 | >20 / >20 / 8 / 6 / 11 | 1.227 € |
| zweitwagenlager | **nachher** | 24.300 € | −9.487 € | +8.064 € | 18.734 € | 616 / 3.746 € | 90 % | – | 7,2 / 6,3 / 8,2 / 6,3 / 8,3 | 7 / 7 / 9 / 5 / >20 | 1.546 € |
| paletten | vorher | 49.450 € | −35.871 € | −19.463 € | 16.744 € | 286 / 935 € | 89 % | 268 (96 %) | >20 (alle) | >20 (alle) | 1.329 € |
| paletten | **nachher** | 49.450 € | −27.865 € | **+1.545 €** | 24.988 € | 523 / 1.675 € | 89 % | 268 (96 %) | 10,1 / 9,2 / 9,3 / 8,3 / 11,2 | **11 / 10 / 11 / 8 / 12** | **4.008 €** |
| paltraege | vorher | 49.450 € | −37.906 € | −33.178 € | 14.793 € | 495 / 2.100 € | 89 % | 113 (35 %) | >20 (alle) | >20 (alle) | −385 € |
| paltraege | **nachher** | 49.450 € | −33.742 € | **−27.612 €** | 19.639 € | 1.178 / 5.204 € | 89 % | 113 (35 %) | >20 (alle) | >20 (alle) | 364 € |

Strafe als positiver Betrag. Palettenverträge in „paletten“ (nachher): 2–3 Verträge, 110–140 €/Palette, 25–40 Paletten/Tag.

## 5. Bewertung

- **Überlast < gut:** Schon nach 5 Tagen liegt Überlast 973 € unter „gut“, nach 10 Tagen 4.236 €. Dann laufen die ersten Verträge aus, und die offenen Pakete kosten 8 € je Stück. Vorher lag Überlast nach 5 Tagen nur 314 € darunter.
- **gut** bleibt fast gleich (−119 € in 5 Tagen). Pünktlich 93 %, Amortisation 6,2–9,1 Tage. Seed 4 liegt mit 9,1 Tagen über dem Ziel von 6–8 Tagen, war aber schon vor meinen Änderungen bei 9,1. Ursache ist der Angebotszufall, nicht die Strafe.
- **Palettenausbau:** amortisiert 8–12 Tage nach dem Bau (Median 11) und bringt ≈ 4.000 €/Tag mehr. Pakete bleiben zu 89 % pünktlich, weil die eine Lagerkraft jetzt auch Paletten entlädt und belädt.
- **Alternative zum zweiten Lieferwagen:**
  - Zweitwagen mit Lagerkraft: 9.800 €, ≈ 1.550 €/Tag mehr, amortisiert nach 5–9 Tagen. Billiger und schneller, aber die Paketangebote begrenzen den Ertrag.
  - Paletten: 34.950 €, ≈ 4.000 €/Tag mehr, amortisiert nach 8–12 Tagen. Mehr Kapital und Risiko, dafür deutlich mehr Ertrag.
  - Beide Wege lohnen sich, keiner dominiert.
  - Zweitwagen ohne zweite Lagerkraft wird durch die Strafe unattraktiv (zwei Seeds >20 Tage). Das ist gewollt: 760 Pakete/Tag schafft eine Lagerkraft nicht pünktlich.
- **Verspätete Paletten:** Bei träger Disposition sind nur 35 % pünktlich. Das bringt 5.204 € Strafe in 10 Tagen, das Mehrergebnis fällt von 4.008 € auf 364 €/Tag, der Ausbau amortisiert nie.
- **Träge Paketdisposition** und **schlecht** sind nach 10 Tagen stark negativ (−16.000 €).

## 6. A05: Stapler-Akku mit Hysterese (`dist/yard.js`)

- Vorher pendelte der Stapler bei leerem Akku im Minutentakt zwischen 9,5 und 10: eine Minute Laden, eine Minute Arbeit.
- Jetzt: Fällt `charge` unter 10, setzt `tickForklifts` das Feld `b.charging = true`. Der Stapler bleibt dann nicht einsatzbereit, bis `charge ≥ 30` (`FORKLIFT.resume`). Danach wird das Feld gelöscht.
- `acquireForklift` und `forkliftAvailable` prüfen `!charging && charge ≥ 10`. Der Wartegrund bleibt „Stapler lädt“.
- Spielstand: `b.charging` ist optional. Altstände ohne das Feld bleiben gültig. `yard.validate` lehnt andere Werte als `true` ab („Staplerakku“).
- Tests in `tests/pallet-own.test.js`:
  - Akku 8 → gesperrt bis 30, auch bei 10 und 15, Speichern/Laden erhält den Ladezwang.
  - Dauerbetrieb: genau ein Ladeblock von mindestens 20 Minuten ohne Entladung, kein Pendeln.
  - Ungültiger Wert wird abgelehnt.
- Für A10: Die Akkuanzeige kann `b.charging` als „lädt (bis 30 %)“ darstellen. Ich habe nichts an `app.js` geändert.

## 7. Befunde für andere Rollen (nicht geändert)

- **B9 (A07/A12, Fahrzeugzustand, = B6):** Nach ≈ 11–13 Tagen fallen Lieferwagen und Lkw unter Zustand 15 und fahren nicht mehr, weil die Werkstatt fehlt. Die Kurven ab Tag 12 sind deshalb flacher. Das verlängert die Ausbau-Amortisation an deren oberem Rand (Seed 5: 12 Tage). Ab Tag 18 schrumpfen die Mehrergebnisse auch wieder.
- **B10 (A07/A01, Palettenkapazität):** Ankünfte liegen nur zwischen 08:30 und 12:00 (`ARRIVAL_MINUTES`). Eine Palettentour dauert ≈ 2 h 15 min, die Tagschicht endet um 16:00. Damit schafft ein Lkw nur ≈ 2 volle Touren (≈ 40 Paletten) am Tag. Frühere Palettenankünfte oder eine Spätschicht würden den Lkw besser auslasten. Dann müsste der Palettenpreis wieder sinken.
- **B11 (A08):** Es gibt höchstens ein offenes Palettenangebot, neue Angebote kommen alle 12 h. Der Palettenbetrieb läuft deshalb erst ab Tag 3–5 voll an.
- **B12 (A10):** Spieler sollten Strafsätze und Paletten-Tageskapazität beim Annehmen sehen, z. B. als Hinweis „Lkw schafft ≈ 40 Paletten/Tag“.
