# Balancing Depot-Stufe – Welle 1b/1c (A02)

> **Welle 1c:** Preise und Volumen neu (Abschnitt 9; gültig ist 9.6: 7–8,50 €/Paket). Die Werte in Abschnitt 3 und 5 sind der Stand Welle 1b.

Stand 15.10.2026. Grundlage: `docs/KONZEPT-LOGISTIKHUB.md` 3.2 (Stufe 1 Depot), `docs/SCHNITTSTELLEN-0.9-W1.md`.
Messung: `node tests/balance-hub.mjs` (deterministisch, Seeds 1–5, Modus „Wirtschaftsbetrieb“, 85.000 € Startkapital, 5 Spieltage; Amortisation wird bis 15 Tage weitergerechnet). `--json` gibt alle Rohwerte aus.

## 1. Problem vorher

- Startvertrag: 60–90 Pakete/Tag zu 2,60 € → **rund 180 €/Tag Erlös**.
- Feste Tageskosten der kleinsten Besetzung (1 Lagerkraft 18 €/h, 1 Fahrer 21 €/h, Tagschicht 8 h): **312 €/Tag Lohn**, dazu Miete ≈ 19 €, Strom ≈ 8 €, Fahrten ≈ 11–15 € je Tour.
- Folge: Jeder Vertrag verliert Geld, auch bei perfektem Betrieb. Die Grundausstattung (14.500 €) amortisiert sich nie.
- Ankünfte bis 16:00 Uhr bei Fahrern nur in der Tagschicht (08–16 Uhr): Späte Lkw waren **unvermeidbar verspätet**.

## 2. Zielbild Depot-Stufe

| Größe | Ziel | Begründung |
|---|---|---|
| Startvertrag allein | Betriebsergebnis > 0 | Der erste Vertrag muss Lagerkraft und Fahrer tragen. Sonst lernt der Spieler „Verträge kosten Geld“. |
| Guter Betrieb (Start- + zweiter Vertrag, 1 Lager, 1 Fahrer) | Grundausstattung amortisiert in ~3–5 Spieltagen (Ziel A01) | Schnelles Erfolgserlebnis und ein spürbarer erster Ausbauschritt |
| Schlechter Betrieb (Personal fehlt) | klarer Verlust | Fehlentscheidungen müssen sichtbar Geld kosten. |
| Verspätung | spürbar schlechter als pünktlich | 10 % Abschlag (vorhandene Mechanik) + Ansehensverlust + Fahrzeugblockade am Folgetag |
| Kapazität einer Lagerkraft (Handsortierung 2/min) | ~250 Pakete/Tag pünktlich | ergibt sich aus der Mechanik (Entladen 20/min, Sortieren 2/min, Beladen 5/min, 8-h-Schicht). Mehr Volumen verlangt Ausbau. |

„Erster Ausbau“ heißt hier: die Depot-Grundausstattung, die auch „Startbetrieb einrichten“ kauft. Laderampe 3.500 €, Lagerregal 1.200 €, Lagerkraft 350 €, Fahrer 450 €, Lieferwagen 9.000 € = **14.500 €** (17 % des Startkapitals).

## 3. Geänderte Spielwerte (nur Werte, keine Mechanik)

Alle Werte stehen gebündelt in `dist/contracts.js` → `TERMS` und `ARRIVAL_MINUTES`. Die Anzahl der Zufallszüge je Angebot ist unverändert.

| Wert | Vorher | Nachher | Grund |
|---|---|---|---|
| Ankunftsminuten (Folgeangebote) | 09:00–16:00 | **08:30–12:00** | Tagschicht kann entladen, sortieren und zustellen. Keine Zwangsverspätung mehr. |
| Startvertrag Ankunft | 10:00 / 11:00 | **09:00 / 09:30** | erster Lkw am ersten Vormittag, Zustellung noch am selben Tag |
| Startvertrag Pakete/Tag | 60–90 | **100–130** | füllt eine Lagerkraft zu rund der Hälfte |
| Startvertrag Preis/Paket | 2,60 € | **15,00 €** | Erlös ≈ 1.650 €/Tag deckt ≈ 340 € Fixkosten deutlich |
| Startvertrag Frist ab Tor | 10 h | **6 h** | fällig 15:00/15:30 Uhr, also vor Schichtende; Trödeln wird spürbar |
| Startvertrag Laufzeit | 7 Tage | 7 Tage | unverändert |
| Folgeangebote Pakete je Ankunft | 60–120 | **50–100** (1–2 Ankünfte) | Start- + typischer zweiter Vertrag ≈ 200–270 Pakete = Kapazität einer Lagerkraft |
| Folgeangebote Preis | 2,40–3,20 € | **13,50–16,00 €** (Schritt 0,25 €) | Ertragsziel guter Betrieb |
| Folgeangebote Frist | 8–12 h | **5–8 h** | Frist liegt in oder kurz nach der Tagschicht |
| Folgeangebote Laufzeit | 7–14 Tage | **5–10 Tage** | häufigere Vertragsentscheidungen |

Unverändert und bewusst nicht angefasst:
- `ITEMS.parcel` (Volumen 0,05, Gewicht 0,5): Der Lieferwagen fasst 160 Pakete nach Gewicht. Das ist nicht der Engpass.
- `BUILDINGS.sorter` (8.500 €, 240 Pakete/h): siehe Befund B2. `yard.js` rechnet die Gefährdung mit 4 Paketen/min (= 240/h). Eine Änderung des Durchsatzes würde diese Schätzung verfälschen.
- Startkapital 85.000 € (core.js): passt. Die Grundausstattung bindet 17 %. Es bleiben rund 70.000 € für Ausbau und Puffer. Der Spieler kann Fehler machen, ohne sofort in die Überziehung zu rutschen.

Die Preise sind fiktive Spielwerte (Zustellvergütung je Sendung in der Depot-Stufe). Spätere Stufen sollen mehr Volumen zu niedrigeren Stückpreisen bringen (Welle 2: Palette, TEU).

## 4. Szenarien (tests/balance-hub.mjs)

Grundausstattung jeweils: Dock, Regal, Lieferwagen. Nur reguläre Spielerbefehle. Endet ein Vertrag, nimmt der Spieler das nächste Angebot an.

- **start**: 1 Lagerkraft, 1 Fahrer, nur Startvertrag.
- **gut**: 1 Lagerkraft, 1 Fahrer. Startvertrag sofort, zweiter Vertrag beim ersten Angebot (Tag 1, 17:00 Uhr). Disposition: sobald ein Auftrag fertig sortiert ist; Sammeltour (2–4 Aufträge, bis 160 Pakete) oder Einzellieferung; früheste Frist zuerst; keine Abfahrt, die erst nach Schichtende zurückkäme.
- **ausbau**: wie gut, dazu ab Tag 2 ein Sortierplatz und ein dritter Vertrag, aber kein zusätzliches Fahrzeug (Informationsszenario, siehe B2).
- **traege**: wie gut, aber Disposition erst ab 14:00 Uhr und ohne Rücksicht aufs Schichtende.
- **schlecht**: wie gut, aber ohne Fahrer (zu wenig Personal).

## 5. Vorher/Nachher (Mittel Seeds 1–5, nach 5 Spieltagen)

Ergebnis = Geld Ende − 85.000 € (inkl. Investition). Betriebsergebnis = Ergebnis ohne Bau, Fahrzeugkauf und Einstellungsgebühren.

| Szenario | Stand | Ergebnis 5 T | Betriebsergebnis 5 T | Umsatz | Personal* | Transport | Energie | Miete | Pünktlich | Abschlag | Amortisation (Tage, Seeds 1–5) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| start | vorher | −15.345 € | −845 € | 936 € | −2.360 € | −86 € | −38 € | −96 € | 100 % | 0 € | nie |
| start | **nachher** | −7.881 € | **+6.619 €** | 8.400 € | −2.360 € | −86 € | −38 € | −96 € | 100 % | 0 € | >15 / 8,2 / 10,1 / >15 / >15 |
| gut | vorher | −14.356 € | +144 € | 1.999 € | −2.360 € | −160 € | −38 € | −96 € | 63 % | 75 € | nie |
| gut | **nachher** | −2.287 € | **+12.213 €** | 14.066 € | −2.360 € | −158 € | −38 € | −96 € | 88 % | 176 € | **6,2 / 4,3 / 5,3 / 5,2 / 6,3** (Median 5,3) |
| ausbau | vorher | −22.349 € | +651 € | 2.609 € | −2.360 € | −172 € | −131 € | −96 € | 43 % | 152 € | nie |
| ausbau | nachher | −8.734 € | +14.266 € | 16.232 € | −2.360 € | −179 € | −131 € | −96 € | 67 % | 494 € | 6,2 / 7,1 / 9,3 / 8,1 / 7,2 |
| traege | vorher | −14.876 € | −376 € | 1.414 € | −2.360 € | −96 € | −38 € | −96 € | 39 % | 92 € | nie |
| traege | **nachher** | −7.977 € | **+6.523 €** | 8.313 € | −2.360 € | −95 € | −38 € | −96 € | **7 %** | **849 €** | 9,0 / 10,3 / 12,3 / 10,4 / 9,1 |
| schlecht | vorher | −14.904 € | −854 € | 0 € | −1.070 € | 0 € | −38 € | −96 € | – | 0 € | nie |
| schlecht | **nachher** | −14.904 € | **−854 €** | 0 € | −1.070 € | 0 € | −38 € | −96 € | – | 0 € | nie |

\* Personal enthält die Einstellungsgebühren (800 € bzw. 350 €). Zinsen fielen in keinem Szenario an.

**Guter Betrieb, je Seed (nachher):**

| Seed | Verträge (Preis / Frist / Ankunft:Pakete) | Pakete an / zugestellt | Pünktlich | Ergebnis 5 T | Geld Tag 1–5 |
|---|---|---:|---:|---:|---|
| 1 | 15 €/6 h/9:30:100 · 14,25 €/5 h/10:30:100 | 900 / 900 | 100 % | −3.106 € | 71.650 → 81.894 € |
| 2 | 15 €/6 h/9:00:130 · 13,50 €/7 h/9:00:80+12:00:50 | 1.170 / 1.170 | 100 % | +435 € | 72.100 → 85.435 € |
| 3 | 15 €/6 h/9:00:110 · 14,25 €/7 h/9:30:70+12:00:50 | 1.030 / 980 | 85 % | −2.236 € | 71.790 → 82.764 € |
| 4 | 15 €/6 h/9:00:110 · 14,50 €/6 h/8:30:70+9:30:90 | 1.190 / 1.039 | 56 % | −1.730 € | 71.790 → 83.270 € |
| 5 | 15 €/6 h/9:00:110 · 13,75 €/6 h/11:30:60 | 790 / 790 | 100 % | −4.796 € | 71.790 → 80.204 € |

Im laufenden Betrieb bringt ein guter Tag mit zwei Verträgen **≈ 2.100–3.400 € Überschuss**.

## 6. Bewertung

- **(a) Startvertrag**: trägt sich jetzt. Allein bringt er ≈ +1.300 €/Tag Betriebsergebnis, vorher −170 €/Tag.
- **Amortisation**: Im guten Betrieb mit zwei Verträgen liegt sie bei 4,3–6,3 Spieltagen (Median 5,3), gerechnet ab Spielbeginn mit Anlaufzeit. Der zweite Vertrag beginnt erst an Tag 2. Damit liegt der Wert am oberen Rand des Zielkorridors. Kürzer (3 Tage) ginge nur über noch höhere Stückpreise (≈ 20 €) oder mehr Handsortierleistung (siehe B1). Darauf habe ich bewusst verzichtet.
- **Verspätung spürbar**: Die träge Disposition liefert gleich viele Pakete an, verdient aber fast nur die Hälfte (6.523 € statt 12.213 € in 5 Tagen). Ursachen: 849 € Abschlag, Touren laufen über Nacht und blockieren den Lieferwagen am Morgen, Ansehen fällt von 89 auf 14.
- **Schlecht**: ohne Fahrer −854 € Betriebsergebnis in 5 Tagen (Löhne, Miete, Strom), kein Umsatz, Ansehen 0.
- **Überlast** (Seeds 3/4, ≈ 270 Pakete/Tag): Eine Lagerkraft schafft das nicht mehr pünktlich (56–85 %). Das ist gewollt und das Signal für den ersten Ausbau.

## 7. Befunde für andere Rollen (keine Änderung in Welle 1b)

- **B1 (A05, sorting.js):** Die Handsortierung gibt die Lagerkraft nur für das Entladen frei, nicht fürs Beladen. Ein Fahrzeug wartet, bis der Wareneingang leer sortiert ist. Das ist plausibel, begrenzt aber die Depot-Kapazität auf ≈ 250 Pakete/Tag je Lagerkraft. Eine Anhebung von `HAND_RATE` (2 → 3/min) wäre der wirksamste Hebel, falls kürzere Amortisation gewünscht ist.
- **B2 (A05/A04, Sortierplatz):** Der Sortierplatz (4 Pakete/min) halbiert die Sortierzeit, bindet aber weiter eine Lagerkraft. Ohne zweites Fahrzeug bringt er keinen Mehrertrag (Szenario „ausbau“: Pünktlichkeit 67 %, Amortisation 6–9 Tage, schlechter als „gut“). Empfehlung für Welle 2: Sortierplatz zusammen mit zweitem Lieferwagen als „Ausbaupaket“ anbieten, oder den Durchsatz auf 480/h erhöhen und `yard.SORT_RATE` mitziehen (A07). Der Missionstext nennt das bereits.
- **B3 (A08):** Nicht zugestellte Pakete kosten nichts außer Ansehen. Überannahme von Verträgen ist daher nie ein Geldverlust. Eine Vertragsstrafe für liegengebliebene Pakete ist für Welle 2 vorgesehen (SCHNITTSTELLEN W1-S1).
- **B4 (A06):** Der Fahrer erreicht im Dauerbetrieb Müdigkeit 80 und macht gegen 15:30 Uhr eine 30-Minuten-Pause. Das ist in den Zahlen enthalten.
- **B5 (A01/A12):** Der Standortname „Werk Morgenfeld“ und die manuellen Startaufträge für Arbeitsleuchten (economy.init) stammen noch aus der Fertigungszeit. Sie sind nicht Teil meines Dateibereichs.

## 8. Geführter Einstieg (app.js)

Neue Missionsreihenfolge: Laderampe bauen → Lagerkraft einstellen → Ersten Frachtvertrag annehmen → Ersten Lkw entladen → Fahrer und Lieferwagen → Zustellung starten → Zahlung erhalten → Sortierplatz bauen (optional).

- Fertigung ist nicht mehr Teil des Einstiegs. Das Handbuch nennt sie als späteres Geschäftsfeld „Mehrwertdienste“.
- „Startbetrieb einrichten · ca. 14.500 €“ kauft die Grundausstattung über reguläre Befehle (build, build, hire, hire, buyVehicle). Es kauft nichts doppelt und bricht bei fehlendem Kapital ab. Danach öffnet sich das Vertragsfenster.
- Willkommensdialog und Handbuch (Abschnitte „Erste Zustellung“, „Wirtschaftlichkeit im Depot“, „Mehrwertdienste (später)“) sprechen jetzt vom Logistikunternehmen.

## 9. Welle 1c: Paketpreise senken, Wirtschaftlichkeit über Volumen

Stand 15.10.2026, Basis bb15c66. Vorgabe A01: Preis grob 3–6 €/Paket statt 15 €, mehr Pakete je Vertrag, soweit
1 Lagerkraft + 1 Lieferwagen das tragen. Ziel: Grundausstattung (14.500 €) bei gutem Betrieb in 3–6 Spieltagen bezahlt,
Verlust bei schlechtem Betrieb, Verspätung spürbar.

Neue Mechanik seit Welle 1b (in allen Zahlen enthalten): Beladen hat Vorrang vor Sortieren, `HAND_RATE` 3/min,
Torkontrolle braucht eine Lagerkraft (2 min), Entladerate über `workRate`, neue Spiele ohne Leuchtenaufträge.

### 9.1 Kapazität 1 Lagerkraft + 1 Lieferwagen (gemessen)

- Lieferwagen: 160 Pakete je Fahrt (Gewicht 80 / 0,5). Volumen (20 / 0,05 = 400) begrenzt nicht.
- Eine Sammeltour mit 160 Paketen dauert 2,5–3 h (Beladen 34 min, 30 min hin, je Stopp 2 min + 1 min/10 Pakete,
  20 min zwischen Stopps, 30 min zurück). In der Tagschicht (08–16 Uhr) sind so etwa drei Touren möglich.
- Gemessen: **350–400 Pakete/Tag** pünktlich. Die Lagerkraft ist dabei nur zu rund 50 % ausgelastet.
  Der Engpass ist die Fahrzeit des Lieferwagens in der 8-h-Schicht, nicht die Sortierung.
- Gegenproben (nur Messung, nichts davon geändert):
  - Lieferwagen mit 200 oder 240 Paketen Zuladung: +3–5 % Erlös.
  - Beladen 10/min statt 5/min: +5 % Erlös.
  - Beides wirkt kaum. Deshalb bleibt `VEHICLES.van` unverändert, ebenso `ITEMS.parcel` und die Fahrtkosten.
  - Fahrtkosten: 0,18 €/Einheit, je Tour 5–22 €. Das ist plausibel und ändert am Ergebnis wenig.

### 9.2 Geänderte Werte (`dist/contracts.js` → `TERMS`)

| Wert | W1b | **W1c** | Grund |
|---|---|---|---|
| Startvertrag Preis | 15,00 € | **6,00 €** | Vorgabe A01, oberer Rand des Korridors |
| Startvertrag Pakete/Tag | 100–130 | **200–250** | Volumen statt Preis. Füllt gut die Hälfte der Tageskapazität. Allein ≈ +1.000 €/Tag Betriebsergebnis. |
| Folgeangebote Preis | 13,50–16,00 € | **5,00–6,50 €** (Schritt 0,25 €) | Vorgabe A01 |
| Folgeangebote Pakete je Ankunft | 50–100 | **60–110** (1–2 Ankünfte) | Start + ein passender zweiter Vertrag ≈ 350–400 = Kapazität |
| Frist, Laufzeit, Ankunftsminuten | – | unverändert | – |

Die Zahl der Zufallszüge je Angebot ist gleich geblieben. Determinismus-Hashes (`tests/perf-determinism.test.js`) wurden
neu erzeugt. Gegenprobe: `contracts.js` aus bb15c66 reproduziert die alten Hashes exakt.

Tests: `tests/ui-guided.test.js` stellt beim ersten Versand höchstens eine volle Wagenladung zu, weil ein Gebiet jetzt
mehr als 160 Pakete haben kann.

### 9.3 Messung (`tests/balance-hub.mjs`)

Änderungen am Messskript, für vorher und nachher gleich:
- Neues Szenario **ueberlast**: immer drei Verträge, ohne Sortierplatz und ohne zweites Fahrzeug.
- **gut / traege / schlecht** nehmen Angebote nach Kapazität an: Die Tagesmenge aller laufenden Verträge bleibt
  ≤ 380 Pakete, unter den passenden Angeboten das mit dem höchsten Tageserlös. Vorher galt eine feste Zahl von zwei
  Verträgen. Dann hing das Ergebnis am Zufall der Angebotsgröße.
- Disposition: Passt eine Tour nicht mehr vor Schichtende, werden die spätesten Stopps weggelassen. Vorher fuhr der
  Lieferwagen dann gar nicht mehr, ab etwa 13:30 Uhr standen sortierte Pakete bis zum nächsten Tag.
- `--only gut,start` misst nur einzelne Szenarien.

„vorher“ = Werte aus Welle 1b mit der Mechanik und dem Messskript von Welle 1c (Override von `TERMS`).
Mittel Seeds 1–5 nach 5 Spieltagen. Ergebnis = Geld Ende − 85.000 €. Betriebsergebnis = ohne Bau, Fahrzeugkauf und Einstellungsgebühren.
Überschuss/Tag = mittlerer Geldzuwachs von Tag 2 bis Tag 5.

| Szenario | Stand | Ergebnis 5 T | Betriebsergebnis 5 T | Umsatz | Pakete zugestellt | Überschuss/Tag | Pünktlich | Abschlag | Amortisation (Tage, Seeds 1–5) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| start | vorher | −7.881 € | +6.619 € | 8.400 € | 560 | +1.324 € | 100 % | 0 € | 10,3 / 8,2 / 10,2 / 11,2 / >15 |
| start | **nachher** | −9.582 € | **+4.918 €** | 6.720 € | 1.120 | +984 € | 100 % | 0 € | >15 (alle) |
| gut | vorher | +2.369 € | +16.869 € | 18.789 € | 1.301 | +4.068 € | 73 % | 513 € | 4,1 / 4,2 / 5,1 / 4,1 / 4,2 |
| gut | **nachher** | −7.331 € | **+7.169 €** | 9.049 € | 1.529 | **+1.604 €** | 93 % | 67 € | **10,1 / 9,1 / 9,3 / 10,2 / 9,2** |
| ausbau | vorher | −6.073 € | +16.927 € | 18.933 € | 1.302 | +4.077 € | 78 % | 453 € | 6,2 / 6,3 / 6,3 / 5,2 / 8,1 |
| ausbau | nachher | −15.239 € | +7.761 € | 9.766 € | 1.724 | +1.770 € | 59 % | 413 € | >15 (alle) |
| ueberlast | vorher | +2.509 € | +17.009 € | 18.921 € | 1.302 | +4.114 € | 78 % | 465 € | 4,2 / 4,2 / 4,2 / 3,3 / 4,3 |
| ueberlast | nachher | −6.898 € | +7.602 € | 9.516 € | 1.687 | +1.746 € | 54 % | 454 € | 8,1 / 10,1 / 9,3 / 8,3 / 9,3 |
| traege | vorher | −7.992 € | +6.508 € | 8.299 € | 617 | +1.353 € | 7 % | 847 € | 10,1 / >15 / >15 / 10,0 / 11,1 |
| traege | **nachher** | −11.384 € | **+3.116 €** | 4.907 € | 897 | +641 € | 12 % | 439 € | >15 (alle) |
| schlecht | vorher | −14.904 € | −854 € | 0 € | 0 | −171 € | – | 0 € | nie |
| schlecht | nachher | −14.904 € | **−854 €** | 0 € | 0 | −171 € | – | 0 € | nie |

Personal in allen Szenarien −2.360 € (5 Tage inkl. 800 € Einstellung), Energie + Miete −134 € (mit Sortierplatz −227 €).
Transport −100 bis −235 €.

### 9.4 Bewertung

- **Plausibler Paketpreis:** erreicht. Er liegt bei 5–6,50 €, der Startvertrag bei 6 €.
- **Startvertrag trägt sich:** ja. ≈ +1.000 €/Tag Betriebsergebnis, Fixkosten ≈ 340 €/Tag.
- **Volumen statt Preis:** doppelte Paketmenge. Ein guter Tag bringt ≈ 1.600 € Überschuss bei 93 % Pünktlichkeit.
- **Amortisation 3–6 Tage:** mit 3–6 €/Paket **nicht erreichbar.** Gemessen sind 9,1–10,2 Spieltage, Median 9,3.
  Rechnung: Mehr als ≈ 400 Pakete am Tag schafft ein Lieferwagen in der Tagschicht nicht. Bei 6 € sind das höchstens
  ≈ 2.400 € Erlös und ≈ 2.000 € Überschuss am Tag. Die Investition von 14.500 € braucht damit allein ≈ 7 volle Tage,
  dazu kommt der Anlauf an Tag 1. Für 3–6 Tage wären ≈ 10 €/Paket nötig, oder eine höhere Tagesleistung des
  Lieferwagens (Mechanik `tours.js`/Schicht).
  - Preisvariante 8 € (Start 8 €, Folge 7,00–8,50 €), nur gemessen: gut amortisiert in 6,2–7,2 Tagen,
    Überschuss ≈ 2.270 €/Tag.
  - Zweiter Lieferwagen mit Fahrer und drei Verträgen bei 6 €, nur gemessen: 10–>15 Tage. Mehr Ausrüstung kürzt die
    Amortisation also nicht.
  - **Entscheidung A01 nötig:** Preis (6 € → ≈ 8–10 €) oder Zielwert (≈ 9–10 Tage).
- **Verlust bei schlechtem Betrieb:** ja. Ohne Fahrer −854 € Betriebsergebnis in 5 Tagen. Träge Disposition: +3.116 €
  statt +7.169 € (−57 %), Pünktlichkeit 12 %, Ansehen fällt auf 0–28.
- **Verspätung spürbar:** ja, über den Abschlag, liegengebliebene Pakete und den am Morgen gebundenen Lieferwagen.
- **Überlast:** bringt kaum Geld, +7.602 € statt +7.169 € (+6 %). Dafür sinkt die Pünktlichkeit auf 54 % und das
  Ansehen auf 0–29. Überannahme lohnt sich damit kaum noch. Bei 15 € war sie das beste Szenario.
  Eine Vertragsstrafe (B3) bleibt für Welle 2 sinnvoll.
- **ausbau** (Sortierplatz ohne zweites Fahrzeug) amortisiert nicht mehr. Das bestätigt B2: Der Sortierplatz hilft erst
  mit zusätzlicher Fahrleistung.

### 9.5 Neue Befunde für andere Rollen (nicht geändert)

- **B6 (A07/A12, Fahrzeugzustand):** Der Lieferwagen verliert je Tour 1–4 Zustandspunkte, im Betrieb ≈ 8 pro Tag.
  Nach ≈ 11 Spieltagen fällt er unter 15 und fährt nicht mehr. Die Wartung braucht eine Werkstatt, die nicht zur
  Grundausstattung gehört. Bei einer Amortisation um Tag 9–10 fährt der Lieferwagen noch. Kurz danach wird Wartung
  fällig (≈ 700 € plus Werkstatt). Das gehört in die Missionsführung oder in eine spätere Messung.
- **B7 (A10, Versandformular):** Das Formular schlägt als Teilmenge höchstens 20 vor, weil die Fahrzeugliste
  „20 Plätze“ zeigt (Volumen). Der Lieferwagen fasst aber 160 Pakete. Ein Vorschlag „min(Rest, Wagenladung)“ würde
  viele Kleinstfahrten vermeiden.
- **B8 (A02/A07):** Die Tagesleistung des Lieferwagens ist der eigentliche Hebel der Depot-Wirtschaft. Sie wird
  von der festen Fahrzeit je Tour bestimmt: 60 min hin und zurück, 20 min je weiterem Stopp. Zuladung und
  Ladegeschwindigkeit wirken dagegen kaum (9.1).

### 9.6 Entscheidung A01: Preis 7–8,50 €, Ziel Amortisation 6–8 Tage (gültiger Stand)

A01 hat den Zielkonflikt aus 9.4 entschieden. Startvertrag **8,00 €**, Folgeangebote **7,00–8,50 €** (Schritt 0,25 €),
Volumen wie in 9.2. Neues Ziel: Amortisation bei gutem Betrieb in 6–8 Spieltagen. Der Stand mit 6 € (9.3/9.4) ist damit
überholt. Determinismus-Hashes erneut erzeugt. Gegenprobe: `contracts.js` mit den 6-€-Werten (Commit 76498a8)
reproduziert dessen Hashes exakt.

Mittel Seeds 1–5, 5 Spieltage, gleiche Spalten wie 9.3:

| Szenario | Stand | Ergebnis 5 T | Betriebsergebnis 5 T | Umsatz | Pakete zugestellt | Überschuss/Tag | Pünktlich | Abschlag | Amortisation (Tage, Seeds 1–5) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| start | 6 € | −9.582 € | +4.918 € | 6.720 € | 1.120 | +984 € | 100 % | 0 € | >15 (alle) |
| start | **8 €** | −7.342 € | **+7.158 €** | 8.960 € | 1.120 | +1.432 € | 100 % | 0 € | 12,3 / 9,2 / 12,2 / >15 / >15 |
| gut | 6 € | −7.331 € | +7.169 € | 9.049 € | 1.529 | +1.604 € | 93 % | 67 € | 10,1 / 9,1 / 9,3 / 10,2 / 9,2 |
| gut | **8 €** | −4.297 € | **+10.203 €** | 12.083 € | 1.529 | **+2.272 €** | 93 % | 91 € | **6,3 / 6,2 / 6,3 / 7,2 / 6,2** |
| ausbau | 6 € | −15.239 € | +7.761 € | 9.766 € | 1.724 | +1.770 € | 59 % | 413 € | >15 (alle) |
| ausbau | **8 €** | −11.932 € | +11.068 € | 13.073 € | 1.724 | +2.511 € | 59 % | 553 € | 8,2 / >15 / >15 / 9,3 / >15 |
| ueberlast | 6 € | −6.898 € | +7.602 € | 9.516 € | 1.687 | +1.746 € | 54 % | 454 € | 8,1 / 10,1 / 9,3 / 8,3 / 9,3 |
| ueberlast | **8 €** | −3.680 € | +10.820 € | 12.734 € | 1.687 | +2.471 € | 54 % | 610 € | 5,3 / 7,1 / 6,3 / 6,2 / 6,2 |
| traege | 6 € | −11.384 € | +3.116 € | 4.907 € | 897 | +641 € | 12 % | 439 € | >15 (alle) |
| traege | **8 €** | −9.737 € | **+4.763 €** | 6.555 € | 897 | +978 € | 12 % | 586 € | 11,3 / >15 / >15 / >15 / >15 |
| schlecht | 6 € / 8 € | −14.904 € | **−854 €** | 0 € | 0 | −171 € | – | 0 € | nie |

Bewertung (Stand 8 €):
- **Amortisation gut:** 6,2–7,2 Spieltage, Median 6,3. Liegt im neuen Ziel von 6–8 Tagen.
- **Startvertrag allein:** ≈ +1.430 €/Tag Betriebsergebnis. Er trägt sich, amortisiert aber erst nach 9 bis über 15 Tagen.
  Der zweite Vertrag bleibt damit der erste lohnende Schritt.
- **Verspätung spürbar:** Bei träger Disposition liegt das Betriebsergebnis 53 % unter gut (+4.763 € statt
  +10.203 €). Pünktlich sind 12 %, das Ansehen fällt auf 0–28.
- **Schlecht:** −854 € Betriebsergebnis, kein Umsatz.
- **Überlast:** +6 % Geld gegenüber gut, aber 54 % pünktlich und Ansehen 0–29 statt 80–96. Kaum lohnend, aber nicht
  verlustbringend. Dafür bleibt B3 (Vertragsstrafe, Welle 2) nötig.
- **Ausbau** (Sortierplatz ohne zweites Fahrzeug): amortisiert in 8 bis über 15 Tagen, schlechter als gut. Das
  bestätigt B2.
- Die Befunde B6–B8 gelten unverändert.
