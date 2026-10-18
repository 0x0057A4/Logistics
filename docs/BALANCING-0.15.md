# Balancing 0.15 – Warenarten, Quergurtsorter, Mehrwertdienste (A02)

Stand 18.10.2026, Basis 6f34d92. Grundlagen: `docs/SCHNITTSTELLEN-0.15.md`, Methodik wie `docs/BALANCING-0.10-W2.md`.
Ziel: Jede neue Option soll eine echte Entscheidung sein. Sie soll also weder dominieren noch nutzlos sein. Bei gutem Betrieb soll die GuV
(`accounting.guv`, mit Abschreibung) nachvollziehbar positiv sein, bei Fehlplanung negativ.

Messung: `node tests/balance-015.mjs <teil>`. Alle Teile laufen deterministisch, nur mit Spielerbefehlen (`sim.command`) und `sim.step`.

| Teil | Art | Inhalt | Laufzeit |
|---|---|---|---|
| `offers` | Vollsimulation | Erreichbare Vertragsmenge Pakete/Tag an einem Standort, wenn der Spieler jedes Paket- und Paketcontainer-Angebot annimmt | ≈ 5 s |
| `belt` | **Teilsimulation** Sortierstufe | Handsortierung, 1–12 Sortierplätze und Quergurt bei 500–10.000 Paketen/Tag | ≈ 16 s |
| `ware` | Vollsimulation | Kühlpaket/Sperrgut gegen „gut“ (Paketdepot aus BALANCING-0.10-W2), 15 Spieltage, Seeds 1–5 | ≈ 2 min |
| `vas` | Vollsimulation | Lohnfertigung gegen eigene Fertigung, 10 Spieltage, Seeds 1–5 | ≈ 5 s |

Option `--set` überschreibt Werte nur im Messprozess, zum Beispiel `--set crossbelt.cost=120000,T.ware.bulky.price=22:1:6`.
So entstehen die „vorher“-Spalten.

## 1. Geänderte Spielwerte

| Datei / Wert | vorher | **nachher** | Kurzbegründung |
|---|---|---|---|
| `contracts.js` `TERMS.ware.parcel_cold.parcels` | 40–80 je Ankunft (`[4,8]`) | **30–60** (`[3,6]`) | Kühllager hat 100 Plätze. Zwei Ankünfte zu 70 + 50 legten zwei Docks lahm (Befund B-0.15-1, auch A10 im Browser) |
| `TERMS.ware.parcel_cold.surcharge` | 3,50 € | **7,50 €** (Preis 14,50–16 €) | Kühlfahrzeug (36.000 €, Abschreibung 400 €/Tag) und Kühllager tragen sich bei ≈ 100 Kühlpaketen/Tag erst ab ≈ 7 € Zuschlag |
| `TERMS.penalty.parcel_cold` | 3 / 11 € | **4,50 / 15 €** | wieder ≈ 30 % / 100 % des Preises |
| `TERMS.ware.bulky.units` | 8–24 Stück je Ankunft | **20–40** | Begrenzt hat die Zahl der Stopps, nicht die Menge: 4 Stopps je Lkw-Tour, Aufträge zu 4–10 Stück |
| `TERMS.ware.bulky.price` | 22–28 €/Stück | **30–36 €** | Stück 25 kg: 1,2–1,4 €/kg. Palette: 0,4 €/kg, Paket 15 €/kg |
| `TERMS.ware.bulky.sla` | 8–12 h | **20–28 h** (Folgetag) | Ankünfte bis 12:00 + 8 h fielen nach Schichtende. Rund 60 % kamen verspätet, obwohl der Lkw frei war |
| `TERMS.penalty.bulky` | 7 / 25 € | **9 / 33 €** | ≈ 27 % / 100 % des Preises |
| `catalog.js` `BUILDINGS.crossbelt.cost` | 120.000 € | **60.000 €** | Vorher erst ab ≈ 8.000 Paketen/Tag günstiger als Sortierplätze. Erreichbar sind 3.000–7.000 |
| `RESEARCH.megahub.cost` | 20.000 € | **12.000 €** (240 Min. unverändert) | Forschung ist einmaliger Aufwand ohne Abschreibung. Gleich teuer wie „Standortnetz“ |
| `economy.js` Lohnfertigungssatz | 18 % des Produktwerts | **35 %** (Leuchte 33 €, Profilleuchte 51 €, Sensor 39 €) | Bei 18 % brachte eine Linie nur für Lohnfertigung nie Gewinn |
| unverändert: `yard.js` `BULKY_BASE` | 2/min | 2/min | Entladung 40 Stück in 20 Min. ist nicht der Engpass. Engpässe sind Lkw-Stopps und Lagerplatz |
| unverändert: `crossbelt` Strom 12, Durchsatz 2.400/h, 2 Kräfte | – | – | Durchsatz und Besetzung sind Spielidee und werden fest geprüft (`megahub-own`) |
| unverändert: `ITEMS.parcel_cold` / `ITEMS.bulky` | – | – | Volumen und Gewicht sind plausibel. Sie bestimmen Lieferwagen 3 Stück / Lkw 133 Stück Sperrgut |
| unverändert: Angebotsrhythmus Lohnfertigung | 1×/Tag 14:00, 10–30 Stück, Frist 2 Tage | – | siehe Abschnitt 4 |

Zufallszüge und Logik bleiben unverändert. Die Determinismus-Hashes (`tests/perf-determinism.test.js`) bleiben gleich, 4/4 grün: Die Prüfszenarien
nehmen keine Warenangebote an und bauen keinen Quergurt. Die Angebotswerte von Warenarten stehen erst ab Tag 2/3 im Zustand
und gehen in die geprüften Hashes nicht ein.

## 2. Quergurtsorter (Mega-Hub)

### 2.1 Erreichbare Paketmenge (`offers`)

Pakete/Tag unter Vertrag an einem Standort, jeweils um 20:00 an den Spieltagen 1–20. Der Spieler nimmt jedes Paket- und Paketcontainer-Angebot an.

| Seed | Tag 5 | Tag 10 | Tag 15 | Tag 20 |
|---|---:|---:|---:|---:|
| 1 | 930 | 3.840 | 4.020 | 7.430 |
| 2 | 2.200 | 3.550 | 3.570 | 4.040 |
| 3 | 1.030 | 3.690 | 2.470 | 6.510 |
| 4 | 1.740 | 2.110 | 2.910 | 6.280 |
| 5 | 760 | 3.630 | 6.660 | 3.340 |

Ein Standort, der konsequent wächst, erreicht ab Tag 10 also 3.000–7.000 Pakete/Tag, vor allem über Paketcontainer.
Mehr liefert der Angebotsfluss nicht: zwei Angebote je Tag, höchstens drei offen.

### 2.2 Sortierstufe (`belt`, Teilsimulation)

**Aufbau:** Wirtschaftsbetrieb. Pakete werden gleichmäßig auf die Ankunftsminuten 08:30–12:00 verteilt und direkt inbound gebucht (`inventory.add`).
Sortierte Ware wird in der Folgeminute entnommen; das ersetzt die Zustellung. Sortierfrist = Ankunft + 270 Min.
(Frist 5–8 h abzüglich ≈ 2 h Beladen/Zustellung). Was bis Tagesende nicht sortiert ist, zählt als offen (8 €).

**Nicht modelliert:** Entladen, Beladen und Zustellung.

**Kosten:** Lohn, Strom und Abschreibung kommen aus der echten GuV, gemittelt über die Tage 2–6. Verspätung wird mit 2,50 € + 10 % Abschlag bewertet.

Die Tabelle zeigt beide Sichten:
- **Kopfzahl:** jede Sortierkraft eingestellt und ganztägig bezahlt.
- **Arbeitszeit:** nur die tatsächlich an Sortierung gebundenen Minuten. So rechnet man, wenn die Kräfte sonst ent- und beladen (Hub mit Personalpool).
- **Amortisation:** Mehrinvestition (Quergurt + Forschung − nötige Sortierplätze) geteilt durch die Geldersparnis je Tag, ohne Abschreibung.

Messergebnisse:
- Handsortierung: nur eine Kraft je Standort (`handsort`), höchstens ≈ 1.300 Pakete/Tag pünktlich.
- Ein Sortierplatz: pünktlich bis ≈ 1.700 Pakete/Tag. Er kostet 211 €/Tag einschließlich Kraft, Strom und Abschreibung.
- Der Quergurt sortiert jede gemessene Menge bis 10.000 Pakete/Tag zu 100 % pünktlich, mit 2 Kräften.

**Vorher (120.000 € + Forschung 20.000 €):**

| Pakete/Tag | nötige Sortierplätze | Kosten/Tag S / Q (Kopfzahl) | Δ/Tag | Amort. | Kosten/Tag S / Q (Arbeitszeit) | Δ/Tag | Amort. |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 2.000 | 2 | 423 / 1.035 € | −613 € | nie | 286 / 783 € | −497 € | 1.643 T |
| 4.000 | 3 | 634 / 1.035 € | −401 € | 922 T | 503 / 815 € | −311 € | 534 T |
| 6.000 | 4 | 846 / 1.035 € | −190 € | 366 T | 720 / 846 € | −126 € | 299 T |
| 8.000 | 5 | 1.057 / 1.035 € | +22 € | 213 T | 937 / 877 € | +60 € | 197 T |
| 10.000 | 6 | 1.268 / 1.035 € | +233 € | 142 T | 1.155 / 908 € | +248 € | 139 T |

Vorher war der Quergurt im erreichbaren Bereich nutzlos. Er war erst ab ≈ 8.000 Paketen/Tag günstiger, und die Amortisation lag über der
Nutzungsdauer von 180 Spieltagen.

**Nachher (60.000 € + Forschung 12.000 €):**

| Pakete/Tag | nötige Sortierplätze | Kosten/Tag S / Q (Kopfzahl) | Δ/Tag | Amort. | Kosten/Tag S / Q (Arbeitszeit) | Δ/Tag | Amort. |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1.000 | 1 | 211 / 702 € | −491 € | nie | 144 / 436 € | −291 € | nie |
| 2.000 | 2 | 423 / 702 € | −279 € | nie | 286 / 450 € | −164 € | 735 T |
| 3.000 | 2 | 423 / 702 € | −279 € | nie | 360 / 466 € | −106 € | 413 T |
| 4.000 | 3 | 634 / 702 € | −68 € | 373 T | 503 / 481 € | +22 € | 216 T |
| 5.000 | 3 | 634 / 702 € | −68 € | 373 T | 579 / 496 € | +83 € | 168 T |
| 6.000 | 4 | 846 / 702 € | +144 € | 130 T | 720 / 512 € | +207 € | 106 T |
| 8.000 | 5 | 1.057 / 702 € | +355 € | 63 T | 937 / 544 € | +393 € | 58 T |
| 10.000 | 6 | 1.268 / 702 € | +566 € | 32 T | 1.155 / 574 € | +581 € | 31 T |

**Bewertung:**
- **Unter ≈ 4.000 Paketen/Tag** sind Sortierplätze in jeder Sicht günstiger. 2–3 Sortierplätze kosten 26.000 € statt 72.000 €.
  Der Quergurt verliert dort 100–490 €/Tag. Er ist keine Pflicht.
- **Entscheidungszone 4.000–6.000 Pakete/Tag:**
  - in Arbeitszeitsicht +20 bis +200 €/Tag
  - in Kopfzahlsicht knapp negativ bis +144 €/Tag
  - Die Forschung (12.000 €) holt der Quergurt erst nach 60–500 Tagen herein.
  - Der Spieler muss also abwägen: Kapital und Forschung jetzt, gegen geringere Personal- und Flächenkosten.
- **Ab ≈ 6.000 Paketen/Tag** gewinnt der Quergurt klar. Bei 8.000–10.000 Paketen/Tag amortisiert er sich in 30–60 Spieltagen.
  Ab hier lohnt sich der Mega-Hub für einen ausgebauten Standort ab etwa Tag 10–15.
- Fläche (6×3 statt 4–6 × 3×2) und Strom (12 statt 12–18) sprechen zusätzlich für den Quergurt. Sie gehen nicht in die Tabelle ein.
- Eine Kostensenkung unter ≈ 50.000 € würde den Quergurt schon ab 3.000 Paketen/Tag überlegen machen. Er wäre dann dominant.

## 3. Warenarten (`ware`, Vollsimulation)

**Grundausstattung** wie BALANCING-0.10-W2 „gut“: Dock, Regal, Lieferwagen, 1 Lagerkraft, 1 Fahrer, Paketverträge bis 380 Pakete/Tag.

**Ausbau** zu Beginn von Tag 2 um 00:00, damit der Warenangebotsplatz um 06:00 den Ausbau schon sieht. Unpassende Warenangebote lehnt der Spieler sofort ab.

**Kennzahlen:**
- ΔGuV: GuV-Ergebnis nach 15 Tagen minus „gut“, gleicher Seed, einschließlich Abschreibung.
- ΔGuV/Tag: Mittel der Tage 6–15.
- Amort.: wie BALANCING-0.10-W2, Geld-Betriebsergebnis gegen „gut“ bis Tag 15.

Szenarien:

| Szenario | Ausbau | Invest | Annahme |
|---|---|---:|---|
| kuehl | Kühllager + 2. Dock + Kühlfahrzeug + Fahrer | 49.450 € | Kühlverträge bis 160 Kühlpakete/Tag |
| kuehlvoll | wie kuehl | 49.450 € | **jedes** Kühlangebot (Fehlplanung) |
| sperrgut | Staplerplatz + 2. Dock + 2 Regale + Lkw + Fahrer | 40.850 € | Sperrgut bis 120 Stück/Tag |
| sperrvan | Staplerplatz + 2. Dock + 2 Regale, **kein Lkw** | 12.400 € | jedes Sperrgutangebot (Fehlplanung, Lieferwagen 3 Stück) |
| paletten | Staplerplatz + Lkw + Fahrer (Referenz W2b) | 34.950 € | bis 40 Paletten/Tag |
| palsperr | wie sperrgut | 40.850 € | Paletten bis 40/Tag **und** Sperrgut bis 120/Tag auf demselben Lkw |

Ergebnis (Mittel Seeds 1–5; „gut“: GuV nach 15 T 17.895 €):

| Szenario | Werte | GuV 15 T | ΔGuV 15 T | ΔGuV/Tag | Strafen 15 T | Ware zugestellt (verspätet), Seeds 1–5 |
|---|---|---:|---:|---:|---:|---|
| kuehl (bis 240/Tag) | vorher | 3.470 € | −14.426 € | −1.256 € | 5.853 € | 610 (226) · 120 (98) · 2.340 (550) · 310 (140) · 1.560 (400) – zwei Seeds blockiert |
| kuehl (bis 160/Tag) | vorher | 18.237 € | +342 € | +46 € | 3.440 € | – |
| kuehl (bis 160/Tag) | **nachher** | **22.217 €** | **+4.322 €** | **+343 €** | 4.649 € | 1.040 (198) · 1.460 (416) · 1.300 (251) · 1.480 (320) · 1.190 (48) von 1.130–1.690 |
| kuehlvoll | vorher | −9.330 € | −27.225 € | −2.363 € | 4.876 € | – |
| kuehlvoll | **nachher** | **−3.099 €** | **−20.994 €** | **−2.053 €** | 5.195 € | 270–600 von 2.410–4.410 (Dock-Blockade) |
| sperrgut | vorher | 13.488 € | −4.408 € | −558 € | 11.919 € | 496–826 von 1.119–1.343, davon 180–491 verspätet |
| sperrgut | **nachher** | **36.528 €** | **+18.633 €** | **+1.265 €** | 4.885 € | 858 (24) · 1.041 (0) · 1.095 (0) · 1.110 (0) · 818 (223) |
| sperrvan | **nachher** | −67.767 € | −85.662 € | −8.002 € | 65.991 € | 36–45 von 3.211–4.019 |
| paletten | unverändert | 57.786 € | +39.890 € | +3.051 € | 2.994 € | Amortisation 11 / >14 / 11 / 9 / 10 T |
| palsperr | **nachher** | 29.648 € | +11.752 € | −12 € | 26.692 € | Paletten 192–343 von 411–448, Sperrgut 383–729 |

„vorher“ = Werte aus 6f34d92, gemessen mit demselben Skript über `--set`. „kuehl bis 240“ wurde vor der Absenkung von COLD_CAP gemessen.

**Bewertung Kühlpaket:**
- Bei gutem Betrieb ist die GuV positiv: +4.300 € in 15 Tagen, ≈ +340 €/Tag, nach 8.500 € Abschreibung.
- Wer jedes Angebot annimmt, verliert ≈ 21.000 €. Hauptursache ist die Dock-Blockade (B-0.15-1).
- Gegenüber den Paletten ist das Kühlgeschäft deutlich kleiner. Begrenzt wird es durch Kühllager (100 Plätze), Angebotsfluss (ein Warenangebot je Tag, ab Tag 3 zur Hälfte Sperrgut) und
  die Abschreibung des Kühlfahrzeugs (400 €/Tag).
- Ergebnis: eine Nischenentscheidung mit langer Amortisation (über 14 Tage, rechnerisch ≈ 50 Tage). Nicht dominant, aber auch nicht nutzlos.
- Die Geldamortisation bleibt über dem Messzeitraum.
  - Option A01/A05: Kühllager 200 Plätze. Dazu müssten `BUILDINGS.coldstore.capacity` und die Tests `special-own`/`ware-own` angepasst werden.
  - Ein höheres Angebotsvolumen würde die Ertragskraft verdoppeln, ist aber ohne Behebung von B-0.15-1 riskant.
  - Dieser Wert liegt nicht in meinem Dateibereich und ist nicht geändert.

**Bewertung Sperrgut:**
- Mit Folgetagsfrist und größeren Stopps ist die GuV positiv: +18.600 € in 15 Tagen, +1.265 €/Tag, bei 4 von 5 Seeds pünktlich.
- Das ist etwa 40 % des Palettenausbaus bei ähnlicher Investition.
- Sperrgut ist damit die einfachere, kleinere Lkw-Option. Es braucht keinen Palettenvertrag und hat geringes Verspätungsrisiko. Paletten sind die ertragsstärkere Option.
- Beides auf einem Lkw (palsperr) verschlechtert das Ergebnis gegenüber reinen Paletten um 28.000 €. Der Lkw ist der Engpass.
  Die Entscheidung lautet also „entweder–oder“ oder „zweiter Lkw“.
- Sperrgut ohne Lkw (sperrvan) ist massiv negativ. Das ist gewollt: Der Lieferwagen fasst 3 Stück.

## 4. Mehrwertdienste / Lohnfertigung (`vas`, Vollsimulation)

**Aufbau:** Montage, Prüfung, Verpackung (13.800 €), 2 Regale, Dock, Lieferwagen, 1 Lagerkraft, 1 Fahrer, n Fertigungskräfte. 10 Spieltage.

**Kennzahlen:**
- „Grenz“: ΔGuV gegen eine leere Halle, ohne Lagerkraft, Fahrer und Lieferwagen. Diese sind in einem Hub ohnehin vorhanden.
- Satzvarianten skalieren nur den gemessenen Lohnfertigungsumsatz. Das ist eine Rechnung, keine eigene Simulation, und so gekennzeichnet. Der Satz 35 % ist echt gemessen.

| Szenario | Stück LF / eigen | Umsatz LF / eigen | Grenz-ΔGuV @18 % | @25 % | @30 % | **@35 %** | @40 % |
|---|---:|---:|---:|---:|---:|---:|---:|
| vas1 (nur Lohnfertigung, 1 Kraft) | 139 / 0 | 4.587 € (@35 %) / – | −1.612 € | −695 € | −40 € | **+616 €** | +1.271 € |
| vas3 (nur Lohnfertigung, 3 Kräfte; Fehlplanung) | 143 / 0 | 4.719 € / – | −5.427 € | −4.483 € | −3.809 € | **−3.135 €** | −2.461 € |
| fert1 (nur eigene Leuchtenaufträge, 1 Kraft) | 0 / 77 | – / 8.932 € | +1.558 € | +1.558 € | +1.558 € | +1.558 € | +1.558 € |
| beide1 (eigene zuerst, Lohnfertigung füllt) | 137 / 64 | 4.512 € / 7.310 € | +2.695 € | +3.597 € | +4.241 € | **+4.886 €** | +5.530 € |

**Bewertung:**
- Bei 18 % war eine Linie nur für Lohnfertigung nutzlos: −160 €/Tag Grenzergebnis.
- Bei 35 % trägt sie sich knapp: ≈ +60 €/Tag im Mittel, Tag 1 ohne Angebot eingerechnet. Ohne Material- und Kapitalrisiko.
- Eigene Fertigung bringt je Stück mehr: Leuchte 106–121 € abzüglich 45 € Material ≈ 65 €, statt 33 €. Sie braucht aber Materialeinkauf, und die Aufträge kommen unregelmäßig.
- Am besten ist beides (beide1, +4.900 € in 10 Tagen). Lohnfertigung bleibt damit ein Lückenfüller und dominiert nicht.
- Zu viel Personal für die Angebotsmenge bleibt negativ (vas3).
- Über 40 % würde Lohnfertigung pro Kapitaleinsatz besser als eigene Fertigung und würde dominieren.
- **Angebotsrhythmus** (1×/Tag 14:00, 10–30 Stück, Frist 2 Tage) unverändert:
  - Bei ≈ 20 Stück/Tag ist eine Fertigungskraft (≈ 30 Leuchten/Tag) zu gut zwei Dritteln ausgelastet. Die Frist von 2 Tagen ist bei 1 Kraft nie gerissen (0 verspätet).
  - Ein zweites Angebot je Tag würde die Linie überlasten und vas3 (3 Kräfte) belohnen.

## 5. Befunde für andere Rollen (nicht geändert)

**B-0.15-1 (A05/A07, hoch): Dock-Blockade durch wartende Fremd-Lkw.** Ein Fremd-Lkw in `unloading` wartet auf Platz:
- Kühlpakete: Wartegrund „Kühllager voll“.
- Paletten/Sperrgut: Wartegrund „Lager voll“.

Er behält dabei sein Dock (`b.task`). Platz entsteht aber erst, wenn eigene Fahrzeuge laden, und dafür brauchen sie ein freies Dock.
Mit einem Dock blockiert das sofort und dauerhaft. Mit zwei Docks blockiert es, sobald zwei solche Lkw gleichzeitig stehen.

Reproduktion:
- Mit den neuen Werten: `WDEBUG=parcel_cold node tests/balance-015.mjs ware --only kuehlvoll --seeds 2 --serial`.
  - Ab Tag 3, 12:00 steht ein Kühl-Lkw dauerhaft bei 10/50 auf „Kühllager voll“, und das Kühlfahrzeug bleibt dauerhaft in `loading`.
  - Ab Tag 5 belegen zwei Kühl-Lkw (10/50, 0/50) beide Docks.
- Mit den alten Werten (40–80 je Ankunft, Annahme bis 240/Tag) in Seed 2 schon an Tag 3: beide Docks belegt (30/50, 0/70).
- Folge: Die Pakete bleiben bis Vertragsende liegen.

Auch A10 hat das im Browser gesehen: zweiter Kühl-Lkw nach 50 von 60 Paketen auf „Kühllager voll“.

Vorschlag: Ein Fremd-Lkw ohne Platz gibt das Dock nach kurzer Wartezeit frei und reiht sich wieder in `queue` ein. Oder eigene Beladungen haben Dock-Vorrang.
Meine Zahlenänderung (30–60 je Ankunft) senkt nur die Häufigkeit. Die Ursache behebt sie nicht.

**B-0.15-2 (A10):** Warenangebote sollten zeigen:
- Kühlpakete: belegte und freie Kühlplätze im Verhältnis zur Ankunftsmenge.
- Sperrgut: die Lkw-Tageskapazität in Stopps.

Wer Kühlangebote blind annimmt, verliert ≈ 21.000 € in 15 Tagen.

**B-0.15-3 (A01):** `docs/SCHNITTSTELLEN-0.15.md` nennt noch die vorläufigen Werte 120.000 € / 20.000 €.

**B-0.15-4 (A02-Hinweis):** Der Sortierplatz (240/h, 1 Kraft) ist nur ein Drittel schneller als Handsortierung (180/h). Er lohnt sich vor allem, weil
Handsortierung nur eine Kraft je Standort erlaubt. Für 0.16 sollte die Rolle des Sortierplatzes mit Handsortierung und Quergurt gemeinsam betrachtet werden.

## 6. Grenzen der Messung

- `belt` ist eine Teilsimulation. Ware wird per Inventar-API eingespeist und entnommen, Entladen und Zustellung fehlen.
  Forschung Mega-Hub wird als abgeschlossen gesetzt, ihre Kosten sind gesondert eingerechnet.
- `ware` misst nur 15 Tage. Amortisationen über 14 Tage sind nur als „>14“ ausgewiesen. Die ≈ 50 Tage beim Kühlpaket sind aus ΔGuV/Tag + Abschreibung geschätzt.
- Die Spielerpolitik ist einfach und deterministisch, zum Beispiel feste Annahmegrenzen und eine Disposition „früheste Frist zuerst“.
  Ein geschickter Spieler erreicht mehr, ein nachlässiger weniger.
- Lohnfertigung: „Grenz“ zieht geteilte Mittel pauschal ab. Ob Lagerkraft und Fahrer im Hub tatsächlich Zeit übrig haben, ist nicht simuliert.
