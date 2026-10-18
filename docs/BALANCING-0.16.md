# Balancing 0.16 – Störungen, Personalrollen, Kundendienst, Sortierstufen, Kühlpaket (A02)

Stand 18.10.2026. Basis 04b8aef, danach zusammengeführt mit dem Integrationsstand (UI 0.16). Grundlagen: `docs/SCHNITTSTELLEN-0.16.md`,
Methodik wie `docs/BALANCING-0.15.md`.

Messung: `node tests/balance-016.mjs <teil>` mit Seeds 1–5 und 15 Spieltagen (Kundendienst 30 Spieltage). Alle Teile laufen deterministisch.
Sie verwenden nur `sim.command` und `sim.step`. Ausnahme ist `belt`: eine Teilsimulation wie in 0.15.
`--set modul.pfad=wert` überschreibt Werte nur im Messprozess. So entstehen die Vorher-Spalten.

| Teil | Inhalt |
|---|---|
| `disrupt` | Gleicher Betrieb mit und ohne Störungen (`settings.incidents`). Gegenmaßnahmen: Energieversorgung, Reservefahrzeug, Rückkehrpuffer |
| `roles` | Zusätzliche Kraft als Lagerkraft, Torposten oder Staplerfahrer in 7 Betrieben |
| `service` | Anliegen ignorieren, beantworten ohne Kundendienstkraft, beantworten mit Kundendienstkraft |
| `belt` | Hand, 1–8 Sortierplätze und Quergurt bei 500–8.000 Paketen/Tag. Kopfzahlsicht, ohne Störungen |

Betriebe:
- **gut:** 0.15-Referenz mit 1 Dock, Handsortierung, Lieferwagen und ≤ 380 Paketen/Tag.
- **gross:** 2 Sortierplätze, 3 Lieferwagen und ≤ 1.100 Paketen/Tag.
- **pal / pal2:** Paletten mit 1 bzw. 2 Lkw. Bis 40 bzw. 80 Paletten/Tag.
- **hof:** Pakete und Paletten, 3 Docks.
- **kuehl:** Aufbau wie in 0.15.

Gemeinsame Spielerpolitik:
- Disposition „früheste Frist zuerst“ wie in 0.15.
- **Neu:** Ein Fahrzeug unter Zustand 40 geht nach Schichtende in die externe Wartung. Ohne Wartung standen die Fahrzeuge ab Tag 16 still.
- Die Wartungsregel hebt alle Grundergebnisse an. Vergleichbar sind deshalb nur Zahlen aus diesem Skript, nicht die Absolutwerte aus 0.15.

## 1. Geänderte Spielwerte

| Datei / Wert | vorher | **nachher** | Begründung |
|---|---|---|---|
| `disruptions.js` `WEATHER_SHARE` | klar 0,55 · Regen 0,2 · Nebel 0,1 · Schnee 0,08 · Sturm 0,07 | **0,6 · 0,2 · 0,1 · 0,05 · 0,05** | Häufungen von Schnee und Sturm kosteten einzelne Läufe bis 41 % (gut, Seed 4: 4 Schneetage in 11). Der Mittelwert lag an der Obergrenze |
| `disruptions.js` `EVENTS.grid.duration` | 15–60 Min. | **30–120 Min.** | Netzstörungen waren wirkungslos (p = 0,5 kostete < 0,7 %). Die Energieversorgung lohnte sich nie. Jetzt beschädigt ein Ausfall ab ≈ 90 Min. ungekühlte Kühlpakete |
| `contracts.js` `SATISFACTION.priceSpan` | 0,08 | **0,12** | Zufriedenheit war wirtschaftlich kaum spürbar. Eine Kundendienstkraft trug sich auch bei 16 Verträgen nicht (+367 € in 30 T) |
| `catalog.js` `BUILDINGS.sorter.throughput` | 240/h | **300/h** | Klare Stufen je Kraft: Hand 180/h, Sortierplatz 300/h (×1,67), Quergurt 1.200/h je Kraft (B-0.15-4) |
| `catalog.js` `BUILDINGS.sorter.cost` | 8.500 € | **10.000 €** | Gleicht die höhere Leistung teilweise aus. Damit bleibt der Quergurt im erreichbaren Bereich eine Entscheidung |
| `catalog.js` `ROLES.gate` | Lohn 17 €/h, Einstellung 300 € | **15 €/h, 250 €** | Ein Torposten ist schmaler einsetzbar als eine Lagerkraft (18 €). Er soll als Zusatzkraft günstiger sein als diese |
| unverändert: Wetterfaktoren, Verspätungen, `jam`, `gate`, `WEATHER_CHANGE` | – | – | Schnee 1,35 / 30–45 Min. ist spürbar und durch Tests festgelegt. Gesenkt wurde die Häufigkeit, nicht die Stärke |
| unverändert: `ROLES.forklift` 20 €/400 €, `SPECIALIST_FACTOR` 1,25 | – | – | siehe Abschnitt 3. Engpass ist eine Logiklücke, kein Zahlenwert |
| unverändert: `AUTO`, `RESPONSE_MINUTES`, übrige `SATISFACTION` | – | – | Die Zufriedenheit reagiert nachvollziehbar, siehe Abschnitt 4 |
| unverändert: `HAND_RATE` 3/min, Kühlwerte (`TERMS.ware.parcel_cold`) | – | – | Der Auftrag nannte 2/min. Im Code steht 3/min (A01-Entscheidung W1c). Die Stufenleiter ist über den Sortierplatz gelöst. Kühl siehe Abschnitt 6 |

**Determinismus:** `perf-determinism` ist unverändert grün. Die Szenarien enden vor Spieltag 2, 14:00, und nutzen keine Hub-Sortierung.

**Spielstände:** Keine Migration nötig.
- Bestehende Störungen behalten ihre gespeicherte Dauer.
- `priceAdjust` alter Angebote liegt innerhalb der neuen Grenze 0,12.

## 2. Störungen und Wetter (`disrupt`)

Störungsverlust = GuV mit Störungen minus GuV ohne Störungen, gleicher Seed, nach 15 Tagen.

| Betrieb | GuV ohne Störungen | Verlust vorher | Verlust **nachher** | schlechtester Seed nachher |
|---|---:|---:|---:|---:|
| gut | 22.426 € | −2.394 € (−10,7 %) | **−1.096 € (−4,9 %)** | −3.138 € (vorher −9.155 €) |
| gross | 58.159 € | −3.363 € (−5,9 %) | **−2.733 € (−4,7 %)** | −5.086 € |
| pal | 65.928 € | −5.867 € (−8,9 %) | **−4.680 € (−7,1 %)** | −7.679 € |
| kuehl ohne Energie | 28.728 € | −2.620 € (−9,1 %) | **−3.344 € (−11,6 %)**, 36 Kühlpakete beschädigt | −7.402 € |
| kuehl mit Energie | 28.144 € | −2.719 € (−9,6 %) | **−2.445 € (−8,7 %)**, 0 beschädigt | −5.401 € |

**Gegenmaßnahmen:**

| Gegenmaßnahme | vorher | **nachher** |
|---|---:|---:|
| Energieversorgung (7.000 €) im Kühlbetrieb, mit Störungen | −682 € | **+316 €** (Abschreibung 583 € eingerechnet) |
| Energieversorgung bei Sortierplätzen (gross) | −490 € | −357 € |
| Reserve Lieferwagen + Fahrer, gut: ohne / mit Störungen | −1.603 / +138 € | −1.436 / −711 € |
| Reserve Lieferwagen + Fahrer, gross: ohne / mit Störungen | −558 / +1.384 € | −630 / **+938 €** |
| Rückkehrpuffer 60 statt 20 Min. vor Schichtende | −2.515 € (gut) | −3.341 € (gut) |

**Bewertung:**
- Störungen sind spürbar: 3–5 Stauereignisse, 2–4 Torstörungen und 3 Netzstörungen je 15 Tage, dazu jeder zehnte Tag schwer.
- Ein Betrieb mit Kapazitätsreserve verliert nur 2–4 %.
- Betriebe an der Kapazitätsgrenze verlieren 5–12 %. Verspätungen ziehen dort Rückstände über mehrere Tage nach sich.
- Der Ausreißer von −41 % (Häufung von Schnee) ist beseitigt.
- **Energieversorgung** lohnt sich jetzt dort, wo Kühlware am Netz hängt: Sie verhindert Kühlschäden und bezahlt ihre Abschreibung.
  Bei reinem Sortierbetrieb lohnt sie sich nicht, weil Sortierplätze einen Ausfall bis 2 Stunden aufholen. Das ist gewollt.
- **Puffer:**
  - Wer mit einer Fahrzeug- und Personalreserve plant, verliert durch Störungen 1,6–2 % statt 4,7–4,9 %.
  - Unter Störungen ist die Reserve 0,7–1,6 T€ mehr wert als ohne. Im großen Betrieb trägt sie sich, im kleinen nicht.
- Ein früheres Dispositionsende (60 Min. Rückkehrpuffer) schadet dagegen immer. Ware bleibt dann bis zum Folgetag liegen.
- Einen Puffer im Linienfahrplan habe ich nicht gemessen, weil kein Mehrstandortszenario vorhanden ist. Siehe Grenzen.

## 3. Personalrollen (`roles`)

Zusatzkraft gegen Grundbetrieb, ΔGuV nach 15 Tagen (vorher → **nachher**):

| Betrieb | + Lagerkraft | + Torposten | + Staplerfahrer |
|---|---:|---:|---:|
| gut (≈ 5 Lkw/Tag) | −2.011 → −2.178 | −2.311 → **−2.050** | – |
| gross | −2.185 → −2.330 | −2.461 → **−2.101** | – |
| hofknapp (2 Lagerkräfte, Pakete + Paletten) | −917 → −881 | −1.799 → −1.713 | −1.399 → −1.997 |
| pal (40 Paletten/Tag) | −598 → −1.273 | −1.634 → −2.234 | −1.191 → −1.143 |
| pal2 (80 Paletten/Tag, 2 Lkw) | −1.565 → −1.204 | −1.333 → −2.289 | −838 → −1.191 |

Die Streuung zwischen den Seeds beträgt ±2.000 €. Unterschiede unter ≈ 500 € sind deshalb Rauschen.

**Bewertung:**
- In keinem gemessenen Betrieb trägt sich eine zusätzliche Kraft. Die Engpässe sind Fahrzeuge und Angebotsmenge, nicht Personal.
- **Torposten:** Er ist jetzt die günstigste Zusatzkraft (2.050 € statt 2.311 € in 15 Tagen). Gegenüber einer weiteren Lagerkraft ist er im
  Paketbetrieb gleichwertig. Sinnvoll ist er nur bei vielen Torvorgängen und knappen Lagerkräften.
  Eine Torkontrolle dauert 2 Min. je Lkw, sein Nutzen bleibt daher klein. „Nicht immer“ ist erfüllt.
- **Staplerfahrer:** Im Palettenbetrieb ist er etwa so gut wie eine Lagerkraft, in pal2 vorher etwas besser. Er lohnt sich aber nicht als Zusatzkraft.
  - **Ursache (Logik, nur bewertet):** Der Faktor 1,25 wirkt nur beim Entladen fremder Lkw (`yard`) und bei Containern.
  - Beladen eigener Lkw (`transport`/`tours`) und Linienumschlag (`linehaul`) laufen als feste Restminuten. Dort ist der Staplerfahrer nicht schneller als eine Lagerkraft.
  - Gerade in pal/pal2 ist das Beladen der Großteil der Staplerarbeit.
- **Empfehlung A06/A01:**
  - `workRate(worker,…,'forklift',t)` beim Be- und Entladen eigener Fahrzeuge anwenden: `remaining` je Minute um die Rate senken statt um 1.
  - Danach Staplerfahrer neu messen. Erwartung: lohnt sich ab ≈ 60–80 Paletten/Tag.
  - Erst dann den Lohnaufschlag (20 € statt 18 €) bewerten.

## 4. Kundendienst und Zufriedenheit (`service`, 30 Spieltage)

| Betrieb (Verträge in 30 T) | Politik | Anliegen / abgelaufen | Ø Zufriedenheit vorher → **nachher** | Ø Preisanpassung | ΔGuV gegen ignorieren vorher → **nachher** |
|---|---|---:|---:|---:|---:|
| gut (≈ 7) | ignorieren | 216 / 216 | 8,7 → 14,3 | −4,0 % | – |
| gut | beantworten, ohne Kraft | 209 / 0 | 32,7 → 39,1 | +3,9 % | +1.085 → +2.120 € |
| gut | mit Kundendienstkraft | 207 / 0 | 41,8 → 50,8 | +4,6 % | −4.133 → **−3.236 €** |
| gross (≈ 24) | ignorieren | 290 / 290 | 25,2 → 32,7 | 0,0 % | – |
| gross | beantworten, ohne Kraft | 286 / 0 | 61,0 → 67,7 | +6,6 % | +4.970 → +7.585 € |
| gross | mit Kundendienstkraft | 288 / 0 | 73,9 → 78,6 | +7,6 % | +367 → **+3.033 €** |

Die nachher-Werte gelten mit den neuen Störungswerten. Diese erzeugen weniger Störungsanliegen.

**Bewertung:**
- Die Zufriedenheit reagiert nachvollziehbar:
  - Pünktlichkeit hebt sie.
  - Verspätungen und ignorierte Anliegen senken sie deutlich.
  - Beantwortete Anliegen heben sie leicht.
- Eine Kundendienstkraft (22 €/h) trägt sich jetzt im großen Betrieb mit vielen Verträgen: +3.000 € in 30 Tagen.
  Im kleinen Betrieb trägt sie sich nicht (−3.200 €).
- Die Wirkung kommt verzögert, weil die Preisanpassung nur neue Angebote betrifft. In den ersten 15 Tagen ist sie auch im großen Betrieb negativ.

**B-0.16-1 (A08, mittel):** Ein Anliegen gilt als fristgerecht, sobald der Spieler antwortet, auch ohne Kundendienstkraft.
- Es bleibt dann dauerhaft „in Bearbeitung“, mit dem Wartegrund „Kundendienstpersonal …“.
- Die Strafe −6 entfällt trotzdem.
- Das ist im großen Betrieb 4.500 € mehr wert als eine echte Kraft.
- Vorschlag: Frist erst bei Abschluss erfüllt, oder die Frist läuft auch im Zustand `processing` ohne Personal weiter.
- **Behoben (0.16b, A08):** Frist gilt erst mit abgeschlossener Bearbeitung (`completedAt ≤ respondBy`); ein Anliegen in `processing` läuft wie unbeantwortet ab (einmalig `ignored`, Meldung „nicht fristgerecht bearbeitet“). Test `tests/fix-016b.test.js`.

## 5. Sortierstufen (`belt`, Teilsimulation, Kopfzahlsicht)

| Pakete/Tag | Hand (180/h) pünktl. | vorher 240/h, 8.500 €: Sortierplätze / Kosten pro Tag | **nachher 300/h, 10.000 €** | Quergurt |
|---:|---:|---:|---:|---:|
| 1.000 | 100 % | 1 / 211 € | 1 / 220 € | 702 € |
| 2.000 | 58 % | 2 / 423 € | **1 / 220 €** | 702 € |
| 3.000 | 33 % | 2 / 423 € | 2 / 439 € | 702 € |
| 4.000 | 22 % | 3 / 634 € | **2 / 439 €** | 702 € |
| 6.000 | 15 % | 4 / 846 € | **3 / 659 €** | 702 € |
| 8.000 | 10 % | 5 / 1.057 € | 4 / 879 € | 702 € |

**Bewertung:**
- Die Stufenleiter ist klar:
  - Hand bis ≈ 1.000 Pakete/Tag.
  - Ein Sortierplatz bis ≈ 2.000 Pakete/Tag, statt 1.700. Je Kraft ist er jetzt deutlich stärker als die Hand.
  - Je weitere 1.500–2.000 Pakete ein weiterer Sortierplatz.
  - Der Quergurt wird in Kopfzahlsicht ab ≈ 6.500 Paketen/Tag günstiger, vorher ab ≈ 5.000. Mit Fläche, Strom und Arbeitszeitsicht liegt die Grenze früher.
- Der Mega-Hub bleibt damit eine Entscheidung für ausgebaute Standorte und ist nicht Pflicht.
- Bei einem Sortierplatz für ≤ 8.500 € würden Sortierplätze den Quergurt bis 8.000 Pakete/Tag dominieren. Deshalb kostet er jetzt 10.000 €.
- **Hinweis A05:** `yard.js` `SORT_RATE=4` schätzt die Gefährdung weiter mit 240/h, also etwas vorsichtig. Anpassen auf 5 oder aus dem Katalog ableiten.

## 6. Kühlpaket nach Dock-Fix B-0.15-1 (`balance-015 ware`, mit Störungen)

| Szenario | 0.15 (vor Dock-Fix) | 0.16 vor A02 | **0.16 nachher** |
|---|---:|---:|---:|
| kuehl (≤ 160/Tag), ΔGuV 15 T gegen gut | +4.322 € | +3.688 € | **+2.996 €** (Seeds −738 / +8.453 / −663 / +3.262 / +4.666) |
| kuehlvoll (jedes Angebot) | −20.994 € | −4.806 € | **−5.324 €** |

**Bewertung:**
- Der Dock-Fix hat die Strafe für Überbuchung von −21.000 € auf ≈ −5.000 € gesenkt. Annehmen ohne Planung bleibt ein Fehler, ist aber nicht mehr ruinös.
- Der gute Kühlbetrieb bleibt positiv, etwa +3.000 € in 15 Tagen.
- Das Minus gegenüber 0.15 kommt aus Wetter und aus der Netzstörung. Diese lässt sich mit einer Energieversorgung abfangen.
- Kühlwerte bleiben unverändert. Ein höherer Zuschlag würde Überbuchung wieder belohnen.

**B-0.16-2 (A05, mittel):**
- Temperaturgeschädigte Fremdpakete sind gesperrt, belegen aber weiter Kühlplätze bis Vertragsende.
- `disposeBatch` erlaubt nur Eigenware.
- Folge: Nach einem langen Netzausfall ohne Energiegebäude sinkt die Kühlkapazität dauerhaft.
- Bei p = 0,3 entstand so in Seed 4 ein Folgeschaden von −16.800 €. Deshalb bleibt p bei 0,2.
- Vorschlag: Gesperrte Fremdpakete an den Versender zurückgeben (Strafe „nicht zugestellt“) oder entsorgen lassen.
- **Behoben (0.16b, A05):** `disposeBatch` (special.js) entsorgt auch gesperrte, unreservierte Fremdware eines aktiven Auftrags (Lager, Quarantäne, Wareneingang) zu 2 €/Stk. Kühlplatz wird sofort frei. Protokoll `o.disposedQty`; `o.delivered` bleibt, daher bestraft die vorhandene Vertragsabrechnung (`penalty-open`) die Menge genau einmal als nicht zugestellt. Keine Erstattung. Oberfläche: Knopf „Entsorgen“ in der Kühlkette auch für diese Ware.

## 7. Angepasste Tests

Alle Anpassungen sind beabsichtigt:
- `tests/roles-016.test.js`: Torposten Lohn 15, Einstellung 400 + 250 = 650, Lohnsumme 35 €/h.
- `tests/ui-016.test.js`: Einstellungskosten `money−400−250`.
- `tests/sorting-own.test.js`: Testaufbau setzt `BUILDINGS.sorter.throughput = 240`, weil die Mengen der Datei auf 4/min geschrieben sind.
  Die Mechanik ist unverändert geprüft. Der Spielwert ist 300/h.
- `tests/balance-015.mjs`: Gesperrte Chargen zählen nicht als versandbereit. Sonst brach `ware` bei Kühlschaden ab.

`docs/SCHNITTSTELLEN-0.16.md` nennt noch Netzstörung 15–60 Min. und Torposten 17/300. Die Aktualisierung liegt bei A01.

## 8. Grenzen

- 5 Seeds, Streuung je Seed ±2.000 €. Rollenunterschiede unter 500 € sind nicht belastbar.
- Feste, einfache Spielerpolitik. Ein Linienfahrplan zwischen Standorten ist nicht gemessen; Mehrstandortszenario fehlt.
- `belt` ist eine Teilsimulation ohne Entladen und Zustellung.
- Die Zufriedenheitswirkung ist auf 30 Tage gemessen. Langfristige Versenderwechsel (`avoid`/`prefer`) sind nur indirekt enthalten.
