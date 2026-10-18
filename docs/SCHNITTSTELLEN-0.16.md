# Schnittstellen 0.16 – Betrieb (A01)

Stand 18.10.2026. Nutzerfreigabe: Fahrplan bis 1.0, Start 0.16 („Ja“, 18.10.2026).

## Ziel und Abnahme

Der laufende Betrieb wird lebendiger und anspruchsvoller: Wetter und Störungen verzögern Abläufe nachvollziehbar, spezialisierte Personalrollen lohnen sich, Kundendienst reagiert auf echte Ereignisse. Offene 0.15-Befunde werden geschlossen.

Abnahme (A11): Jede Störung hat Ursache, Dauer, Wirkung und Ende, sichtbar in Meldung und Wartegrund. Alles übersteht Speichern/Laden bitgleich. Keine Störung erzeugt Ware, Geld oder negative Bestände. Ohne Störung bleibt der Ablauf wie in 0.15.

## Unveränderliche Annahmen

- Fachzustand nur über `Simulation.command`/`step`, ganzzahlige Minuten.
- Determinismus: `perf-determinism`-Hashes bleiben gleich. Neue Zufallsquellen nutzen **nicht** `api.random`, sondern einen eigenen Generator aus `s.seed` und Spieltag (Muster `contracts.slotRandom`). Erste Wirkung frühestens ab Spieltag 2 (t ≥ 1.800 + 480).
- Neue Listen/Felder sind optional (Schema 1 mit FILLS-Auffüllung in core.js, nur A01).
- Deutsch, fiktive Namen.

## S1 Wetter und Störungen (A03/A07, neues Modul `dist/disruptions.js`)

- Modul in core.js MODULES direkt **vor** `contracts` (A01 trägt ein; Gerüst liegt vor). Zustand `s.disruptions={day, weather:{[siteId]:{kind,since,until}}, events:[…], log:[]}`.
- Wetter je Standort und Tag (Wechsel zur Tagesgrenze, ggf. ein Wechsel am Tag): `clear|rain|fog|snow|storm`. Jahreszeit spielt keine Rolle.
- Ereignisse `event={id, kind, site, startT, endT, target?, text}`; Arten mindestens:
  - `jam` Stau auf einer Zustellgebietsrichtung (lane) oder Linie: zusätzliche Fahrtzeit.
  - `gate` Torstörung: Torkontrolle steht 20–90 Min. (yard Wartegrund „Torstörung“).
  - `grid` Netzstörung: Standortstrom fällt 30–120 Min. aus (A02), außer ein Energiegebäude deckt den Bedarf (Wirkung über `special`-Energieberechnung, Vorrang Kühlung, siehe S4).
- Exporte (rein lesend, ohne Seiteneffekte):
  - `travelFactor(s, site, {lane?, line?})` ≥ 1 (Wetter × Stau).
  - `arrivalDelay(s, site, contractId)` Minuten Verspätung fremder Lkw (Wetter).
  - `gateDown(s, site)` bool · `gridDown(s, site)` bool · `active(s, site)` Liste für UI.
- Verbraucher: Dauer wird **beim Start** einer Fahrt/Phase berechnet und im Fahrzeug/Eintrag gespeichert (kein Nachrechnen pro Minute) – transport.js, tours.js, linehaul.js, airexport.js, yard.js (eta in `schedule`), contracts.js (eta). Änderung je Stelle minimal.
- Meldungen über `api.log('disruption', …)`; Glocke wertet A10 aus.

## S2 Personalrollen (A06, workforce.js + Aufrufer)

- Neue Rollen in `ROLES` (A01 trägt in catalog.js ein): `forklift` Staplerfahrer (Lohn 20, Einstellung 400), `gate` Torposten (Lohn 15, Einstellung 250; A02).
- Neue API `api.workforce.acquireAny(roles, site, task)`: erste passende freie Person in Rollenreihenfolge; bestehende Bindung bleibt, solange gültig.
- Staplerarbeiten (yard Paletten/Sperrgut, containers, linehaul/transport/tours Staplerumschlag) nutzen `['forklift','warehouse']`, Torkontrolle `['gate','warehouse']`. Spezialist arbeitet mit Faktor 1,25 (`workRate`), Lagerkraft wie bisher.
- Lagerkräfte bleiben universell; ohne Spezialisten ändert sich nichts.
- 0.16b: Be-/Entladen eigener Fahrzeuge mit Stapler (transport, tours, linehaul) baut die Restzeit je Minute um `workforce.forkStep(w,t)` ab (Staplerfahrer `workRate(w,1,'forklift',t)`, Mittel 1,25; sonst 1). `afterStep` hält die Restzeit ≥ 0.

## S3 Kundendienst-Ausbau (A08, customer-service.js, contracts.js)

- Automatische Anliegen: verspätete Zustellung (Beschwerde), Wetter-/Störungsverzug (Statusanfrage), Teillieferung. Höchstens ein Anliegen je Auftrag und Art (vorhandene Regel).
- Antwortfrist je Anliegen; unbeantwortet → Zufriedenheit sinkt.
- Zufriedenheit je Versender `s.shippers[name]={score 0–100,…}` oder am Vertrag; wirkt auf Preis/Annahme neuer Angebote desselben Versenders (A02 balanciert).
- Geld nur über `api.book` (Kulanz wie bisher).

## S4 Offene 0.15-Befunde (A04/A05)

- QS-015-01: Energie-Lastverteilung mit Vorrang (Kühlung zuerst, dann Sortierung/Fertigung); stehende Anlagen ohne Strom zählen nicht doppelt. `special.js`.
- QS-015-03: Storno Lohnfertigung (`kind:'vas'`) gibt Kundenmaterial und Halbfabrikate an den Kunden zurück (Abgang aus Bestand mit Protokoll, keine Geldbuchung), offene Kundenanlieferungen werden storniert. `economy.js`/`production.js`/`inventory.js`.

## Danach (Runde 2)

- A10: UI für S1–S4, Warnung Linienankunft nach Schichtende (QS-W3-02), Angebote zeigen Kühlplätze/Lkw-Kapazität (B-0.15-2).
- A09: Wetterdarstellung (Regen/Schnee/Nebel, günstig), Störungsmarker.
- A02: Störungshäufigkeit, Rollenlöhne, Zufriedenheit; Sortierstufen Hand/Sortierplatz/Quergurt (B-0.15-4); Kühl-Balancing nachmessen.
- A11: unabhängige Prüfung.

## Dateibereiche Runde 1

| Agent | Darf ändern | Nicht |
|---|---|---|
| A03/A07 Störungen | `dist/disruptions.js`; minimal transport/tours/linehaul/airexport/yard/contracts (nur Dauer/eta/Torstörung); `special.js` nur `gridDown`-Abfrage; Tests `tests/disruptions-*.test.js` | workforce, customer-service, economy, app, scene* |
| A06 Rollen | `dist/workforce.js`; Aufrufer-Zeilen mit `acquire` für Stapler/Tor in yard/containers/linehaul/transport/tours/sorting; Tests `tests/roles-*.test.js` | disruptions, customer-service, app, scene* |
| A08 Kundendienst | `dist/customer-service.js`, `dist/contracts.js` (Zufriedenheit/Angebote); Tests `tests/service-016*.test.js` | yard, transport, app, scene* |
| A04/A05 Befunde | `dist/special.js` (Lastverteilung), `dist/economy.js`, `dist/production.js`, `dist/inventory.js`; Tests `tests/fix-016*.test.js` | disruptions, app, scene* |

core.js und catalog.js nur A01. Konflikte in gemeinsam berührten Dateien löst A01 beim Zusammenführen.
