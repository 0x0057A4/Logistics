# QS 0.9 Welle 1 – Abnahme Hub-Kreislauf (A11, unabhängig)

Stand 15.10.2026. Geprüft: main 9fa76f7 (Release 0.9) + 05f0c42 (nur Katalog-Gerüst W2a, ungenutzt). Kein Produktcode geändert.
Entwicklerangaben nicht übernommen; eigene Invarianten und Szenarien.

## Ergebnis

**Freigabe 0.9: ja, mit Auflage.** Abnahmekriterien aus SCHNITTSTELLEN-0.9-W1 erfüllt (Vertrag → Lkw → Dock → Entladen →
Sortieren → Zustellung → Zahlung; Warten mit Grund; Abschlag; Laden in jeder Phase; Mengen erhalten). Kein Befund verliert
Pakete oder Geld. Auflage: QS-W1-01 (verwaiste Dockbelegung) in 0.9.x bzw. Welle 2 beheben.

| Befund | Schwere | Rolle |
|---|---|---|
| QS-W1-01 Dock nach Abschalten während Beladung dauerhaft belegt | mittel | A07 |
| QS-W1-02 Nach Migration läuft Spiel sofort mit 1× | mittel | A12 (A10) |
| QS-W1-05 Fertigungsreste im Einstieg (Menü, Baumenü) | mittel (Bedienung) | A10, A01 |
| QS-W1-03 Lkw bleibt am abgeschalteten Dock, obwohl anderes frei | niedrig | A07/A01 |
| QS-W1-04 Migrierter 0.8-Stand: erstes Vertragsangebot erst 17:00 | niedrig | A08 |

## Befunde

### QS-W1-01 Verwaiste Dockbelegung nach Abschalten während Beladung (mittel, A07)
- Ausgang: 2 Docks, sortierte Pakete, Lieferwagen frei.
- Repro: Lieferung disponieren → Lieferung belegt Dock A (Beladung) → Dock A ausschalten (Detail „Ein/Aus“) → Lieferung
  nimmt Dock B → Dock A wieder ein → Lieferung fährt ab.
- Erwartet: nach Abfahrt kein Dock mehr mit der Lieferung belegt.
- Tatsächlich: transport.js setzt `b.task` auf Dock B zusätzlich, gibt bei Abfahrt nur das erste Dock mit `task===sh.id`
  frei (`find`). Dock B bleibt **dauerhaft** belegt (`shipment-…`, Lieferung längst `complete`), auch nach Laden. Fremd-Lkw
  bekommen es nie (`isFreeDock` braucht `!b.task`), Abriss/Versetzen: „Anlage belegt“. Über die Oberfläche nicht lösbar.
- Variante tours.js (gleiches Muster, `dock.task=null` nur für das zuletzt gefundene Dock): abgeschaltetes Dock bleibt bis
  Tourende belegt (vorübergehend). Gleiches Muster in Transfers (transport.js `stepTransfers`) und service.js zu prüfen.
- Vorschlag: Freigabe über alle Gebäude mit `task===id` (wie yard.js `releaseDock`) bzw. alte Belegung beim Wechsel lösen.
- Test: `tests/qa-w1-findings.test.js` QS-W1-01, QS-W1-01b (todo).

### QS-W1-02 Nach Migration 0.8 → IndexedDB läuft das Spiel sofort mit 1× (mittel, A12/A10)
- Ausgang: frischer Browser, nur 0.8-Stand in localStorage (`industrie-logistik-v1-guided`, erzeugt mit dist aus bf76e22).
- Repro: index.html öffnen, 3 s warten.
- Erwartet: Stand geladen, Betrieb pausiert (wie bei normalem Neuladen).
- Tatsächlich: `speed` startet in app.js mit 1; Pause entsteht nur, wenn ein Takt während `guard.acquire` auf
  `canWrite()===false` trifft (Wettlauf). Nach Migration gewinnt der Takt nicht: Zeit läuft 780 → 781 → 784, Tempo 1 aktiv.
  3/3 reproduziert. Bei normalem Neuladen und Tab-Übernahme pausiert (je 2/2). Kein Mengen-/Geldfehler, aber ungefragtes
  Weiterlaufen (Löhne) und widerspricht „Betrieb pausiert“. Kann je nach Zeitverhalten auch beim normalen Start auftreten.
- Vorschlag: `speed=0` beim Laden eines Stands explizit setzen (bootstrap/loadStored).
- Test: `tests/browser/qa-w1.mjs --only=migrate` (Prüfung „nach Migration pausiert“).

### QS-W1-03 Lkw am abgeschalteten Dock wechselt nicht (niedrig, A07/A01)
- Repro: 2 Docks, Lkw entlädt an Dock A, Dock A ausschalten.
- Erwartet (Vorschlag, Regel fehlt in W1-S2): zurück in Warteschlange bzw. freies Dock B.
- Tatsächlich: bleibt `unloading` mit „Dock außer Betrieb“, bis Dock A wieder an. Mengen korrekt, Kraft freigegeben.
- Test: QS-W1-03 (todo). Entscheidung A01, ob gewollt.

### QS-W1-04 Migrierter 0.8-Stand ohne Vertragsangebot bis 17:00 bzw. 05:00 (niedrig, A08)
- `contracts.init` legt das Startangebot nur bei neuem Spiel an; `fromJSON` ruft kein init. 0.8-Stand (t=780) sieht im
  Vertragsfenster „Keine Frachtverträge“ bis t=1020. Tutorial-Schritt „Ersten Frachtvertrag annehmen“ hängt so lange.
- Test: QS-W1-04 (todo), Browser `--only=migrate` „Vertragsangebot nach Migration sofort sichtbar“.

### QS-W1-05 Fertigungsreste im Einstieg (mittel für Bedienung, A10/A01)
- Willkommen, Mission, Übersicht und Startbetrieb sind hub-bezogen und verständlich (8 Schritte, „Startbetrieb einrichten“).
- Reste: linke Leiste zeigt „Fertigung“, „Einkauf“, „Entwicklung“ ab Minute 0 (18 Einträge); Baumenü listet zuerst
  Montageplatz, Prüfstation, Packstation, Energieversorgung, Entwicklungslabor, Kühllager vor Laderampe/Sortierplatz, ohne
  Hinweis. Einsteiger bauen leicht Fertigungsanlagen ohne Nutzen. Hinweis „Fertigung folgt später …“ in der Übersicht ist gut.
- Vorschlag: im Einstieg Fertigungs-/Spezialeinträge ausblenden oder als „später“ kennzeichnen; Baumenü Hub zuerst.
- Test: `tests/browser/qa-w1.mjs --only=entry`.

## Bestandene Prüfungen (tatsächlich ausgeführt)

Node (`tests/qa-w1-flow.test.js`, `tests/qa-w1-edges.test.js`, Hilfen `tests/qa-w1-hub.mjs`), 17/17 grün:
- 5 Spieltage, 2 Verträge, Modus Wirtschaft, Seeds 1–3, Invarianten alle 5 Minuten (keine negativen Mengen, Reservierung ≤ Menge,
  je Hub-Auftrag `qty = offen + Bestand (inbound/stock/vehicle) + zugestellt`, kein Paket ohne Auftrag, je Lieferung/Stopp
  höchstens eine Zahlung, Betrag = Rechnung inkl. 10 % Abschlag bei Verspätung, `o.paid` = Summe, keine Überzahlung).
  Seed 1: 13 Aufträge, 1.490 Pakete, 1.490 zugestellt, 11.700 € · Seed 2: 21 / 1.850 / 1.790 / 13.654 € · Seed 3: 34 / 1.660 / 1.642 / 12.824,50 €.
- Laden beim ersten Auftreten jeder Phase (15–16 Ladevorgänge je Seed: approach, gate, queue*, toDock, docking, unloading,
  exit, „Kein freies Dock“*, Sortieren, Lieferung/Tour loading/transit/unloading/returning, Zahlung offen) → Endhash
  identisch zum Lauf ohne Laden (Seeds 1–3; * nur Seed 2). Laden alle 37 Minuten über 5 Tage (≥ 194 Ladevorgänge je Seed): identisch.
- Schichtende 16:00 während Torkontrolle: Wartegrund „Keine Torkontrolle“, niemand gebunden, Fortschritt bleibt, weiter ab 08:00.
- Schichtende während Entladen: Wartegrund Personal, Menge eingefroren über 900 Min., Dock bleibt belegt, morgens vollständig.
- Schichtende während Handsortierung: inbound unverändert über Nacht, morgens vollständig.
- Dock aus während toDock → zurück in Warteschlange, Dock frei; Dock aus während Entladen → „Dock außer Betrieb“, Menge fix,
  Kraft frei, wieder an → fertig. Abriss/Versetzen während Entladen abgelehnt. Abriss vor Ankunft → Lkw wartet, neues Dock → weiter.
- Zwei Lkw gleiche Minute, ein Dock, Laden jede Minute (400 Min.): nie Doppelbelegung, FIFO nach Torzeit, zweiter wartet sichtbar.
- Eigene Lieferung belegt Dock → Fremd-Lkw wartet „Kein freies Dock“ → danach Dock. Umgekehrt: Lieferung wartet „Laderampe fehlt“.
- Fahrzeug nach Reservierung: Werkstatt- und externe Wartung abgelehnt, Reservierung bleibt (auch nach Laden), Storno gibt exakt frei.
- Teillieferung (1/3): Zahlung nur Teilmenge, Auftrag aktiv, Rest lieferbar, danach erfüllt.
- Zusätzlich (nicht im Paket): 12 Spieltage, 3 Verträge, Seeds 1–3, Laden alle 1.000 Min.: Invarianten stündlich grün, Vertragsende sauber.
- Hinweis: eigentliche Fahrzeugpanne gibt es in 0.9 nicht; geprüft wurde Wartung/Storno nach Reservierung.

Browser (Chromium, Playwright global):
- `tests/browser/ui-flow.mjs` (A01) selbst ausgeführt: 7/7 OK (Zahlung 70.356 → 71.466 €, keine Konsolenfehler).
- `tests/browser/qa-w1.mjs` (neu, nur über Klicks bedient, `__qa` nur lesend in tmp-Kopie): 27/32 OK. Bestanden: neues Spiel
  pausiert; Neuladen pausiert; Neuladen während Entladen (20/230 entladen) und während Fahrt (160 Pakete im Fahrzeug):
  Spielstand byte-gleich, schreibbar, danach genau 1 Zahlung = Rechnung (1.280 €); F5 bei Tempo 12 ohne Verlust; zweiter Tab
  schreibgeschützt mit verständlichem Hinweis, Tempo und Befehle dort wirkungslos, nach Schließen von Tab A übernimmt B den
  gleichen Stand pausiert; Migration 0.8 → IndexedDB: Anlagen/Chargen gleich, Marker `meta/migrated`, beim zweiten Start
  localStorage-Original entfernt; keine Konsolenfehler. Nicht bestanden: QS-W1-02, QS-W1-04, QS-W1-05 (2 Prüfungen).
- 0.8-Stand: `git archive bf76e22 dist` in tmp, Simulation (guided, Seed 808, Dock/Regal/Montage, 3 Kräfte, Lieferwagen,
  Einkauf, Fertigungsauftrag, 300 Min.) → JSON; Aufruf `node tests/browser/qa-w1.mjs --state08=<datei>`.
- qa-w0*.mjs nicht angepasst (für diese Prüfungen nicht nötig).

`npm test` 2× grün: je 410 Tests, 406 bestanden, 0 fehlgeschlagen, 4 todo (Befundtests).

## Grenzen
- Szenarioaufbau setzt Ankunftsminuten von Angeboten vor der Annahme (Testdaten), sonst nur Spielerbefehle.
- Browserlauf bedient über die Oberfläche; Zustand wird über `__qa` gelesen, nicht verändert.
- Keine Leistungsmessung in dieser Welle.
