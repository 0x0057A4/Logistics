# Schnittstellen Welle 1 – Erster Hub-Kreislauf (A01)

Stand 15.10.2026. Nutzer-Freigabe: Konzept, Warenarten-Planung (Welle 1 nur „Paket“; Paletten, Kühlware und Sperrgut ab Welle 2; Kundensortiment und Mehrwertdienste ab Welle 2; Container, Luftfracht, Gefahrgut ab Welle 3).

## Ziel und Abnahme

Ein Vertragskunde schickt einen fremden Lkw. Der Lkw fährt ans Tor, wartet auf ein Dock, dockt an und wird entladen. Die Pakete werden sortiert, mit eigenem Fahrzeug zugestellt und bezahlt. Das Ganze ist sichtbar in 3D, bedienbar im HUD und übersteht Speichern und Laden.

**Abnahme** (A11):
- Neues Spiel → Vertrag annehmen → erster Lkw kommt nach Plan.
- Fehlt ein Dock oder Lagerpersonal: Lkw wartet sichtbar mit Grund.
- Entladen → Sortieren → Lieferung/Sammeltour → Zahlung.
- Verspätung kostet Abschlag.
- Speichern und Laden in jeder Phase verlustfrei.
- Mengen erhalten: angeliefert = sortiert + Bestand + zugestellt.

## Gerüst (A01, liegt vor)

- Module `dist/contracts.js` (A08), `dist/yard.js` (A07) und `dist/sorting.js` (A05), registriert in `core.js` MODULES (hinter customerService, in dieser Reihenfolge).
- Listen `s.contracts` und `s.yard`: in ARRAYS, ID-Prüfung und Schema-1-Auffüllung.
- Katalog: `ITEMS.parcel` (Paket, Preis 0 = Fremdware, Volumen 0,05, Gewicht 0,5) und `BUILDINGS.sorter` (Sortierplatz, 3×2, Rolle warehouse, Durchsatz 240 Pakete/h, Strom 3). Werte vorläufig.
- Schema bleibt 1 (Auffüllung wie bisher). Wann auf Schema 2 umgestellt wird, entscheidet A12 in Welle 1b.

## W1-S1 Vertrag (A08, contracts.js)

```
contract = {id, shipper, site, status:'offer'|'active'|'ended',
  lanes:[{id, name, distance}],          // Zustellgebiete, 1–3
  arrivals:[{minute, parcels}],          // Minute des Tages 0–1439, 1–3 Ankünfte je Tag
  laneShare:[…],                         // Anteil je lane, Summe 1
  pricePerParcel, slaMinutes,            // Frist ab Ankunft am Tor
  startT, endT, acceptedAt}
```

- Befehle: `acceptContract{id}`, `cancelContract{id}`. Angebote erzeugt `init`/`step` deterministisch über `api.random`. Startangebot: 1 kleiner Vertrag.
- Fälligkeit: Erreicht `s.t` die Ankunftsminute eines aktiven Vertrags, ruft contracts.js `yardApi.schedule(s, api, {contractId, site, parcels, eta})` auf (Export von yard.js). Der Lkw erscheint 15 Spielminuten vor `eta` als „approach“.
- Aufträge: Pro Ankunft und Zustellgebiet legt contracts.js einen Auftrag in `s.orders` an:
  `{kind:'logistics', source:'hub', contractId, lane, customer:'<Gebiet> (<Versender>)', item:'parcel', qty, price:pricePerParcel, due:eta+slaMinutes, quality:0, site, status:'active', delivered:0, paid:0}`
  Zustellung, Rechnung, Zahlung, Verspätungsabschlag und Tickets laufen über die vorhandenen Pfade (dispatch/tours/economy). Zeitpunkt der Anlage: wenn `schedule` aufgerufen wird. Die Auftrags-IDs stehen im Hofeintrag.
- Geld nur über `api.book`. Vertragsstrafen außer dem vorhandenen Abschlag kommen erst in Welle 2.

## W1-S2 Hof und Docks (A07, yard.js)

```
arrival = {id, site, contractId, orderIds:[…], carrier, plate,
  parcels, phase, phaseStart, phaseEnd, eta, dock:null|buildingId, waitReason:null|text,
  unloaded:0, atRisk:false}
phase: 'approach'→'gate'→'queue'→'toDock'→'docking'→'unloading'→'exit'→'gone'
```

- Torkontrolle (A06, W1b): 2 Arbeitsminuten mit Lagerkraft (`${arrival.id}:gate`), ohne Kraft Wartegrund „Keine Torkontrolle“.
- Feste Dauern (vorläufig): gate 2, toDock 2, docking 1, exit 3 Minuten. `phaseStart`/`phaseEnd` sind absolute Spielminuten. Bei offenen Phasen (`queue`, `unloading`) gilt `phaseEnd=null`; A09 interpoliert nur, wenn `phaseEnd` gesetzt ist.
- Dock-Zuteilung: freies Dock-Gebäude (`dock`, enabled, nicht von eigener Lieferung belegt, `b.task`-Regel wie transport.js) in FIFO-Reihenfolge nach Ankunft am Tor. Belegung `b.task = arrival.id`.
- Entladen: braucht eine Lagerkraft am Standort (`api.workforce.acquire`, Schlüssel `${arrival.id}:warehouse`). Rate = `workRate(kraft, 20)` aus workforce.js (A06, W1b): Erfahrung bis ×1,5, Müdigkeit über 50 bremst.
  - Jede Minute wandert die entladene Menge per `api.inventory.add('parcel', qty, site, {location:'inbound', owner:orderId, …})` auf die Aufträge, anteilig nach laneShare und vollständig erhalten.
  - Kein Platz im Lager oder kein Personal → Phase bleibt `unloading`, `waitReason` gesetzt.
- Befehle: `prioritizeArrival{id}`. `assignDock{id, dock}` ist optional.
- Sichtbarkeit nach außen: `arrival.atRisk`, wenn eta + slaMinutes nach Prognose nicht mehr zu halten ist (einfache Schätzung).
- Vom Spieler eigene Lieferungen nutzen dieselben Docks. Konflikte: Eine eigene Ladung hat Vorrang nur, wenn sie das Dock bereits belegt. Doppelbelegung ist verboten (validate).

## W1-S3 Entladen → Sortieren (A05, sorting.js + inventory.js)

- Pakete in `inbound` am Standort sind noch nicht versandfähig. Sortieren verschiebt sie in `stock`, getrennt nach Auftrag (owner bleibt gleich). Dafür `api.inventory.relocate` oder `move` nutzen bzw. erweitern, Mengen bleiben atomar.
- Sortierplatz (`sorter`): je Minute `throughput/60` Pakete. Braucht eine Lagerkraft, die mit `${building.id}:sort` gebunden wird, und Strom.
- Ohne Sortierplatz sortiert eine freie Lagerkraft am Dock langsam von Hand: 2 Pakete/Minute.
- Reihenfolge: Aufträge mit früherer Fälligkeit zuerst.
- Gebäudestatus für die Darstellung: `working`/`staff`/`power`/`idle` wie bei Produktion.
- Bestand und Kapazität: Pakete zählen mit Volumen 0,05 in `used`. Fremdware bleibt Eigentum des Auftrags und steht der eigenen Produktion und dem eigenen Verkauf nicht zur Verfügung (vorhandene owner-Regel).

## W1-S4 Darstellung (A09) und Bedienung (A10)

- **A09:**
  - Fremde Lkw aus `s.yard` (nicht `s.vehicles`) im Hof zeigen: Zufahrt, Torhalt, Warteschlange auf der Wartefläche, Andocken am zugeteilten Dock. Interpolation über `phaseStart`/`phaseEnd`.
  - Labels mit Kennzeichen und Phase. Farben: gelb = wartet, blau = fährt, grau = Ein-/Ausfahrt, grün = am Dock.
  - Modell für den Sortierplatz. Pakete in inbound und stock als instanzierte Rollcontainer bzw. Kartons, Dichte nach Menge.
  - Die Torposition kommt aus dem bestehenden Layout.
- **A10:**
  - Fenster „Verträge“ (Angebote, aktive Verträge, Annahme/Storno, Ankunftsplan).
  - Fenster „Hof & Docks“ mit Torbuch (Ankünfte heute, Phase, Wartegrund, Dock, Pakete) und Dock-Belegungsplan.
  - Standortfluss mit echten Stationen: Tor & Hof (yard), Entladung (Docks belegt/gesamt), Sortierung (Pakete in inbound, Durchsatz), Ausgang (versandfähige Pakete je Gebiet), Zustellung.
  - KPI „Verarbeitet heute“ (sortierte Pakete).
  - Glocke: Lkw wartet > 15 min, Vertrag gefährdet.
  - Deutsche Phasenlabels: approach „Anfahrt“, gate „Torkontrolle“, queue „Wartet auf Dock“, toDock „Zum Dock“, docking „Andocken“, unloading „Entladen“, exit „Ausfahrt“.
  - Tutorial-Schritt „Erster Vertrag“.

## Dateibereiche Welle 1a

| Agent | Darf ändern | Nicht |
|---|---|---|
| A08 | contracts.js, economy.js (nur falls nötig für Auftragsfelder), Tests `tests/contracts-*.test.js` | yard, sorting, app, scene* |
| A07 | yard.js, transport.js/tours.js (nur Dock-Belegungsregel gemeinsam), Tests `tests/yard-*.test.js` | contracts, sorting, app, scene* |
| A05 | sorting.js, inventory.js (Erweiterungen), Tests `tests/sorting-*.test.js` | contracts, yard, app, scene* |
| A09 | scene3d.js, scene-select.js, Tests `tests/scene3d-*` und `tests/browser/scene3d*.mjs` | Fachmodule, app.js |
| A10 | app.js (ohne save/activate/welcome/exportHtml), index.html, styles.css, UI-Tests, `tests/browser/hud*.mjs` | Fachmodule, scene* |

- core.js und catalog.js nur nach Absprache mit A01. Ein neuer Katalogwert wird in der Übergabe beantragt.
- Integrationstest des Gesamtkreislaufs `tests/hub-flow.test.js`: schreibt A01 nach dem Zusammenführen, A11 prüft ihn unabhängig.
- **Welle 1b** (danach):
  - A12: IndexedDB-Speicher (Grenze 2,7 MB), Entscheidung Schema 2, Listengrenze 100.000
  - A06: Rollen Torposten/Staplerfahrer, Entladerate
  - A02: Balancing des ersten Vertrags
  - A11: Abnahme
