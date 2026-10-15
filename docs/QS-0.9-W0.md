# QS 0.9 Welle 0 – A11 (unabhängige Prüfung)

Stand: 15.10.2026. Prüfstand: `claude/loving-wozniak-56yxt7` @ `99843c7` (A03 Indexe, A09 WebGL-Szene, A10 Leitstand-HUD, A12 Speichern/Migration/Bundler, A01 Fix save-guard).
Umgebung: Linux-Container, 4 Kerne, Node v22.22.0, Playwright global, Chromium 141 headless unter `/opt/pw-browsers`, WebGL nur SwiftShader (Software). Produktcode nicht verändert.

## Ergebnis

**Freigabeempfehlung Welle 0: ja, mit Auflagen.** Kein kritischer oder hoher Befund. Kern (Indexe, Determinismus, Laden, Tab-Sperre, Autosave-Schutz, 2D-Rückfall, XSS) hält eigene adversariale Prüfungen. Auflage vor Weitergabe von HTML-Spielständen: QS-W0-01 beheben (Regression durch neues DOM von HUD und 3D-Beschriftung). Übrige Befunde nach Plan in Welle 1.

| Schwere | Anzahl | Befunde |
|---|---|---|
| kritisch | 0 | – |
| hoch | 0 | – |
| mittel | 4 | 01, 02, 03, 05 |
| niedrig | 6 | 04, 06, 07, 08, 09, 10 |

## Ausgeführte Läufe (tatsächliche Ergebnisse)

| Lauf | Ergebnis |
|---|---|
| `npm test` vor QS-Tests (1×) | 243/243 bestanden |
| `npm test` mit QS-Tests (1×) | 258 Tests: 255 bestanden, 0 fehlgeschlagen, 3 todo (= Befundtests 05, 06, 07) |
| `npm run test:browser` | 24/24 bestanden, keine Konsolenfehler; HINWEIS file:// „1×“ statt Pause (= Befund 04) |
| `npm run test:browser -- --repo` | 24/24 bestanden; hinterlässt `export-<zeit>.html` im Repo-Root (= Befund 09, Datei gelöscht) |
| `node tests/browser/qa-w0.mjs` (neu, alle Abschnitte) | 54 Prüfpunkte: 48 bestanden, 6 fehlgeschlagen (alle = Befunde 01, 04, 08) |
| `node tests/browser/qa-w0-perf.mjs --seconds=120` (neu) | Kein Speicherwachstum; HUD/Panel-Kosten bei 12× (= Befund 02) |
| `npm run perf:browser -- --seconds=10 --state-mb=2.4` | 3D/SwiftShader 14,0 / 13,9 fps, Long Tasks 83 / 206 (Software-WebGL, nicht repräsentativ); Backup geschrieben |

Neue Dateien: `tests/qa-w0-sim.test.js` (15 Tests, in `npm test`), `tests/browser/qa-w0.mjs`, `tests/browser/qa-w0-perf.mjs` (nicht in `npm test`).
Prüfhaken: `qa-w0.mjs` hängt in der **tmp-Kopie** an `app.js` einen Lesezugriff `globalThis.__qa` an (sim, scene, save, render). Repo und das gebündelte `portable.html` bleiben ohne Haken.

## Befunde

### QS-W0-01 · mittel · A12 (Export), A10 (Fahrzeugleiste), A09 (Beschriftungsebene)
**HTML-Spielstand aus dem Dateimodus erneut gespeichert → doppelte Fahrzeugzeilen und veraltete 3D-Beschriftungsebenen, je Generation eine mehr.**
- Ausgangszustand: Startbetrieb mit 1 Fahrzeug, 200 Min. gespielt.
- Schritte: Einstellungen → „Spiel als HTML speichern“ (Gen 1) → Datei per file:// öffnen → 12× 4 s → erneut als HTML speichern (Gen 2) → öffnen → wiederholen (Gen 3).
- Erwartet: je Generation 1 Fahrzeugzeile, 1 Beschriftungsebene.
- Tatsächlich: Fahrzeugzeilen 1 → 2 → 3 bei Zähler „1“ (Screenshot geprüft: `vehicle-32` dreimal). `.scene3d-labels` 1 → 2 → 3, alle sichtbar, je 6 Chips; die alten Ebenen werden nie aktualisiert (stehen mit altem Text und alter Bildschirmlage über der Szene). DOM-Knoten 316 → 360 → 376. Spielstand selbst korrekt (eingebettet = Uhr, weiterspielbar), Größe 1073 → 1079 → 1082 KB.
- Ursache (Codelesung): `exportHtml` nutzt im portableMode `document.documentElement.outerHTML` als Vorlage. Laufzeit-DOM (schlüsselbasierte `#vbarList`-Zeilen, `scene3d-labels`, Klassen/Zustände) wird mit eingebettet; beim Start kennt `syncList` die alten Zeilen nicht.
- Prüfung: `qa-w0.mjs --only=portable` → „Gen 2/3: Fahrzeugleiste ohne doppelte Zeilen“ und „≤1 Beschriftungsebene“ FEHLER.

### QS-W0-02 · mittel · A10
**HUD- und Panel-Aktualisierung bei laufender Simulation kostet 2D-Bildrate (Hinweis c bestätigt und eingegrenzt).**
- Ausgangszustand: `?renderer=2d`, Startbetrieb, Material bestellt, 12×.
- Schritte: `node tests/browser/qa-w0-perf.mjs --renderers=2d` (15-s-Fenster).
- Erwartet: ≈ 60 fps wie ohne HUD.
- Tatsächlich: HUD sichtbar, 12×: 47,7–50,5 fps · „Nur Szene“ (HUD/Panels aus), 12×: 60,1 · HUD sichtbar, pausiert: 59,9 · Lagerpanel offen, pausiert: 59,9 · **Lagerpanel offen, 12×: 28,4–29,6 fps**. Keine Long Tasks (0 bzw. 2). Kosten entstehen also durch DOM-Aktualisierung während des Laufs (HUD 4×/s, Panel-Neuaufbau alle 900 ms), nicht durch Simulation oder Szene.
- Einschränkung: headless, Software-Compositing; absolute Werte nicht repräsentativ, relativer Einbruch (−50 % mit Panel) aber deutlich. Auf Referenzgerät nachmessen.

### QS-W0-03 · mittel · A12 (Hinweis d bestätigt, Schwelle präzisiert)
**Spielstand ab ≈ 2,7 MB: jeder Speichervorgang scheitert dauerhaft.**
- Ausgangszustand: großer gültiger Stand (`big-state.mjs`) als einziger localStorage-Inhalt, Modus sandbox, neu geladen.
- Schritte: `qa-w0.mjs --only=quota --mb=2.2,2.6,2.8,3.2,4.2` (je 2× 5 Min. + `save()`).
- Erwartet: Speichern oder klarer Ausweg.
- Tatsächlich: 2,20 und 2,60 MB speichern (Haupt- und Sicherungsstand). 2,80 / 3,20 / 4,20 MB: `save()` = false bei jedem Versuch, Status „NICHT GESPEICHERT · Speicher blockiert oder voll …“, Hauptstand bleibt auf geladenem t=4800 (Spiel t=4810), keine Sicherung. Fortschritt nur noch per Export. Meldung ist korrekt und sichtbar; kein Datenverlust des alten Stands.
- Grenze: Schwelle liegt zwischen 2,6 und 2,8 MB (Hauptstand + Sicherung ≈ 5 Mio. Zeichen), etwas höher als die von A12 genannten 2,4 MB.

### QS-W0-05 · mittel · A12 (Sicherung), A10 (Text/Dialog)
**Beschädigter Hauptstand + intakte Sicherung: „Gründen“ verspricht „Letzte Sicherung bleibt erhalten“, die einzige gültige Kopie ist aber nach dem zweiten Speichervorgang ersetzt.**
- Ausgangszustand: Hauptstand `guided` abgeschnitten (ungültiges JSON), Sicherung gültig (t=510).
- Schritte: Seite laden → Meldung „Gespeicherter Stand nicht geladen“ + Willkommensdialog → „Unternehmen gründen“ → Rückfrage bestätigen → weiterspielen bis zum nächsten Autosave.
- Erwartet: alte gültige Sicherung bleibt erhalten oder Dialog bietet „Letzte Sicherung laden“.
- Tatsächlich: erster Schreibvorgang lässt die Sicherung korrekt stehen (bestanden). Zweiter Schreibvorgang (Autosave nach ≤ 20 s) ersetzt sie durch das neue Unternehmen (t=480, seed 123). Willkommensdialog bietet keinen Weg zur Sicherung; „Letzte Sicherung laden“ liegt in den Einstellungen hinter dem Dialog (per Esc erreichbar; funktioniert, siehe bestandene Prüfung).
- Prüfung: `qa-w0-sim.test.js` „Befund 05“ (todo, schlägt erwartungsgemäß fehl). Vermutlich bereits vor Welle 0 so; gegen 0.8 nicht geprüft.

### QS-W0-04 · niedrig · A10 (Hinweis b bestätigt)
file:// Gen 1: Simulation pausiert (Uhr steht), Geschwindigkeitsleiste markiert „1×“ (`#speeds .active` = 1). Ursache (Codelesung): `bootstrap()` im portableMode setzt `speed=0`, ruft aber `setSpeed(0)` nicht; statisches HTML trägt `class="active"` an 1×. Ab Gen 2 korrekt „Ⅱ“ – nur weil der Klassenzustand über outerHTML mitkopiert wird (vgl. 01).

### QS-W0-06 · niedrig · A10
HUD „Lager x/y“ (Lager-API: stock+inbound+quarantine) und Lagerpanel „Einheiten am Standort“ (alles außer vehicle, also auch machine) zeigen bei Ware in Anlagen unterschiedliche Zahlen. Repro: Startbetrieb, 3 Gehäuse in `location:'machine'` → HUD 0, Panel 3. Prüfung: `qa-w0-sim.test.js` „Befund 06“ (todo, schlägt erwartungsgemäß fehl).

### QS-W0-07 · niedrig · A03
`docs/PERF-SIM-0.9.md` nennt „umsortiert“ als erkannten Fall. Ein In-place-Tausch zweier Chargen (gleiche Referenz, Länge, letztes Element) wird nicht erkannt; die Aktivliste behält dauerhaft die alte Reihenfolge, FIFO reserviert `batch-7` statt `batch-8`. Kein Spielmodul sortiert `s.batches` in place (grep) → heute nur theoretisch; Doku präzisieren oder Erkennung ergänzen. Prüfung: „Befund 07“ (todo).

### QS-W0-08 · niedrig · A09
WebGL abgeschaltet (`--disable-webgl --disable-3d-apis`) und `?renderer=3d` erzwungen: Rückfall auf 2D funktioniert und ist spielbar, aber three.js schreibt 2× `console.error` („THREE.WebGLRenderer: A WebGL context could not be created …“) plus Warnung. Automatikmodus und `?renderer=2d` ohne Konsolenfehler.

### QS-W0-09 · niedrig · A12 (Hinweis a bestätigt)
`npm run test:browser -- --repo` legt `export-<zeit>.html` (≈ 1 MB) im Repo-Root ab und löscht sie nicht (`smoke.mjs`: `htmlPath=join(root,…)`, `cleanup` bei `--repo` leer). Reproduziert, Datei manuell entfernt.

### QS-W0-10 · niedrig · A10/A01
Oberfläche nennt weiter Version 0.8: Statusleiste „0.8 · ENTWICKLUNG“, Einstellungen „Entwicklungsfassung 0.8“.

Nebenbefund (nur Codelesung, nicht ausgeführt): `tests/browser/scene3d.mjs` schreibt `docs/assets/scene3d-0.9.png` ins Repo.

## Bestandene Prüfungen (tatsächliche Ergebnisse)

### Node (`tests/qa-w0-sim.test.js`, in `npm test`)
- Laden-Weiterspielen-Laden, klein: 900 Min., 25 Ladevorgänge (alle 36 Min.) → gleicher SHA-256 wie durchgehender Lauf.
- Dienste-Szenario (Tour, Retoure, Rückruf, Kühlkette, Fracht; 300 Min. Vorlauf): 400 Min., Laden alle 17 Min., `used`/`capacity`/`available` je Standort×Artikel×Eigentümer alle 7 Min. vor und nach Schritt gegen eigene lineare Formeln → gleich; Endhash = durchgehender Lauf.
- Groß mit 3.000 Nullchargen: 300 Min., Laden alle 50 Min., Indexprüfung → gleich; Endhash = durchgehender Lauf.
- Determinismus: `step(1)`×600 = `step(12)`×50 = `step(600)` = unregelmäßige Takte 0–3 Min. (wie app.js) → identischer Hash.
- `forecast(480)` nach 1.000 Min. = echtes Weiterlaufen (Hash), Original unverändert, Index danach korrekt; `forecast(200,[hire])` = echte Ausführung.
- Rückruf über historische Nullcharge mit 500 Nachfahren: betroffene Menge = eigene Vorfahrenrechnung (501 inkl. angehängter Fixture), Sperre wirkt in derselben Minute (`available` −5), Erbe der Sperre bei neuer Charge, nach Laden Index korrekt, Doppelrückruf abgelehnt.
- `capacity` nach Bau/Versetzen/Abriss eines Regals in derselben Minute sofort korrekt.
- Migration: Stand ohne `research`/`rules` lädt, Verlauf über 200 Min. inhaltlich gleich (kanonischer Vergleich; Schlüsselreihenfolge unterscheidet sich, fachlich ohne Folge). Fehlgeschlagenes `fromJSON` setzt `wasValidated` nicht; `migrate(null)`, Schema 3 unverändert.
- HUD nach 600 Min.: Kasse, Uhr, `Lager`, `Personal im Dienst`, `Rampen`, `Fahrzeuge` = eigene Rechnung aus state; Glocke ≥ blockierte Anlagen + Fristüberschreitungen.
- Beschädigter Hauptstand + Sicherung: „Gründen“+Bestätigen schreibt ersten Stand ohne Sicherung zu überschreiben; „Letzte Sicherung laden“ stellt t=510 wieder her, Sicherung bleibt.
- Hauptstand während Betrieb von außen beschädigt → nächstes Speichern: Sicherung gültig, Hauptstand neuer.

### Browser (`tests/browser/qa-w0.mjs`)
- render: 3D aktiv. Ansicht ×4, Zoom, Drehen, Home, Labels ×4, Ziehen, Mausrad ×6, Hover, Klick, Panels, Glocke, Suche, Ein-/Ausklappen → Fachzustand bitgleich (Hash `199b77ae…` vor/nach). Gleichschritt 240 Min. mit 2 Frames je Minute inkl. `setClock`-Zwischenwerten: 3D = 2D = Node ohne Darstellung (`29a34d12…`). Keine Konsolenfehler.
- xss: `<img src=x onerror=…>` in Suche „/“ und Panelsuche als Text angezeigt; HTML in Kunden-, Personen-, Fahrzeug- (über Import gültig ladbar) und Standortnamen (Validator lehnt beim Import ab, hier direkt gesetzt) → 0 ausgeführte Handler, 0 eingeschleuste Elemente in HUD, 9 Panels, Akten, Suche, Glocke, Standortmenü, 3D-Beschriftung.
- build (3D-Klick): belegte Zelle („Fläche bereits belegt.“), Torzelle („Tor muss frei bleiben.“), Randzelle (19,15), außerhalb des Rasters → Geld, Ledger, Gebäude, seq unverändert. Gegenprobe freie Zelle: genau +1 Gebäude, +1 Buchung (−7.000 €).
- lifecycle: 5 Moduswechsel → Canvas 1, WebGL-Kontexte 2, Listener 23, Beschriftungsebene 1 unverändert. 24× `Scene3D` erzeugen+`destroy` → 24/24 Kontexte verloren (freigegeben), Listener-Delta 0, keine Beschriftungsreste, Hauptszene lebt, keine Warnung „Too many active WebGL contexts“.
- tabs (zwei Pages, ein Context): Tab B „Schreibschutz …“, 12× bewegt Uhr nicht (480→480), `save()` verweigert, Speicher unverändert; Tab A schreibt (480→555). Nach Schließen von A übernimmt B per „Speicher erneut prüfen“ und lädt den neueren Stand (t=555).
- autosave (echter Leerlauf-Autosave nach 23 s bei 12×): fremd beschädigter Hauptstand → Sicherung bitgleich erhalten, Hauptstand wieder gültig und neuer. Start mit beschädigtem Hauptstand → Meldung + Willkommensdialog; 21 s ohne Handlung → Sicherung unverändert.
- portable: Gen 1–3 per file://: eingebetteter Stand = Uhr = erwartet (680/731/782 bzw. je Lauf), 1 Canvas, keine doppelten IDs, 3D aktiv, Weiterspielen +52 bis +56 Min. je 4 s, Größe stabil (≤ +1 %), keine Konsolenfehler.
- fallback: WebGL aus (auto) und WebGL aus + `?renderer=3d` → 2D, spielbar (≥ 56 Min. in 5 s); `?renderer=2d` → 2D, Labelgruppe verborgen.
- quota: 2,20 und 2,60 MB speichern zweimal erfolgreich.

### Leistung (`tests/browser/qa-w0-perf.mjs`, 12×, 120 s, Lagerpanel ab 60 s offen)
| Szene | Heap nach GC 20 s → 120 s | DOM-Knoten | fps ohne / mit Panel | Long Tasks je 20 s |
|---|---|---|---|---|
| 3D (SwiftShader) | 7,0 → 7,4 MB | 375 / 473 konstant | 14,1–14,9 / 11,9–12,3 | 140–176 (Software-WebGL, längster 164 ms) |
| 2D | 5,4 → 5,7 MB | 368 / 466 konstant | 49,9–50,5 / 28,4–29,6 | 0 |
- Kein relevantes Speicher- oder DOM-Wachstum über 2 min bei 12× (≈ 1.440 Spielminuten). Panel-Einbruch siehe 02.

## Nicht geprüft / Grenzen
- Kein GPU-Gerät; 3D-Bildraten und Long Tasks ohne Aussagekraft für Referenzhardware. Firefox/Safari, Mobilgeräte, Bildqualität der 3D-Szene nicht geprüft.
- `localStorage`-Grenze nur in Chromium gemessen.
- Index-Prüfungen decken Spielerpolitik der Szenarien ab, keine echte Langzeitpartie > 3 Spieltage.
- Folgen für Spielstände: keine (Prüfungen schreiben nur in tmp-Kopien bzw. Testspeicher).
