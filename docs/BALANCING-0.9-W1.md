# Balancing Depot-Stufe – Welle 1b (A02)

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
