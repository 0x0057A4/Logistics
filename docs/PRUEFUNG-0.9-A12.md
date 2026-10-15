# Prüfung 0.9 Welle 0 – A12 (Spielstände, Leistung, Veröffentlichung)

Stand: 15.10.2026, integriert mit `claude/loving-wozniak-56yxt7` (`d613cdd`: A03, A09, A10, Fix der Tab-Sperre). Umgebung: Linux-Container mit 4 Kernen, Node v22.22.0, Playwright 1.56.1, Chromium 141.0.7390.37 headless. Keine GPU. WebGL läuft über SwiftShader (Software).

## Ergebnis in Kürze

| Bereich | Ergebnis |
|---|---|
| `npm test` | 243 von 243 bestanden, dreimal hintereinander (darin 15 neue A12-Prüfungen) |
| `npm run test:browser` | 24 von 24 Prüfpunkten bestanden, mit echter 3D-Szene (http und file://), keine Konsolenfehler. Ein Anzeigehinweis, siehe unten |
| Speichern bei 5 MB (Node) | Median **157,9 ms → 34,6 ms** je Speichervorgang |
| Browser-Autosave bei 2,4 MB (gemessen auf dem Basisbranch `041ab13`, siehe unten) | Long Tasks 112 ms und 51 ms → **keine**. Längster Frame 116,6 ms → 33,4 ms |
| Kritischer Fund | Die Tab-Sperre warf im Browser „Illegal invocation“. Damit war Speichern in 0.8 nie möglich. A01 hat den Fehler in `041ab13` behoben |

## 1. Portable-Bundler mit three.js

- `scripts/build-portable.py` bettet Module unter `dist/vendor/` ein, ohne ihre Syntax zu analysieren. Bedingungen: keine Imports und genau ein `export{a as B,…}` am Dateiende. Aus diesem Block entsteht ein eingefrorener Namensraum mit Live-Gettern. Der übrige Code läuft unverändert in `(function(){…}).call(undefined)`, also strikt und mit `this` = undefined wie in einem Modul.
- Fehlformen werden abgelehnt: Import im Vendor-Modul, Export nicht am Ende, mehrere Exportblöcke, String-Exportnamen und doppelte Namen. Eigene Module lehnen jetzt auch `export{…}` ab, denn die bisherige Regel verlangte ein Leerzeichen nach `export`.
- `</script` und `<!--` werden wie bisher maskiert. Lizenzdateien `dist/vendor/*LICENSE*` gelangen nur dann als HTML-Kommentar vor das Laufzeitskript, wenn ein Vendor-Modul tatsächlich gebündelt wird.
- Ohne Import von three.js bleibt `dist/portable.html` gegenüber dem bisherigen Build unverändert. Mit der echten `scene3d.js` von A09 ist sie 1.079.280 Byte groß. Der HTML-Spielstand-Download im Rauchtest war 1055 KB groß.
- `portable.html` wird über eine tmp-Datei und `os.replace` atomar ersetzt. Damit ist das Rennen behoben, bei dem `portable-build.test.js` die Datei schrieb, während `qa-html-save.test.js` sie parallel las.
- Test-Harness `tests/qa-html-save.test.js`: Der VM-Kontext enthält jetzt `URLSearchParams`, das `scene-select.js` nutzt. Diese Einzeilen-Änderung steht in einem eigenen Commit, weil sie außerhalb des A12-Bereichs liegt.
- Geprüfte Alternative: Ein Blob-URL-Modul mit dynamischem `import()` funktioniert in Chromium auch unter file://. Verworfen wurde es, weil der Start dann asynchron würde, ein Modul-Loader zur Laufzeit nötig wäre und Firefox nicht geprüft ist.
- Prüfungen in `tests/portable-build.test.js`:
  - Vendor-Namensraum und alle Ablehnungsfälle (Node VM).
  - three.js r170 gebündelt in der VM: `Vector3(1,2,3).length() = √14`, `REVISION '170'`.
  - Der Lizenzkommentar ist enthalten, der Code ist syntaktisch gültig und es gibt kein vorzeitiges `</script>`.
  - Echtes Chromium unter file://: Eine tmp-Kopie von dist, deren app.js THREE importiert, rechnet korrekt (Vector3, Matrix4) und startet ohne Konsolenfehler.
  - Der Browsertest wird übersprungen, wenn Playwright fehlt.

## 2. Speichern ohne Ruckler (S3)

- Vorher führte `save()` vor jedem Schreiben `Simulation.fromJSON(alterStand)` aus, also eine Vollvalidierung.
- Jetzt gilt der Altstand ohne Prüfung als Sicherung, wenn er einem von zwei Strings gleicht:
  - dem zuletzt von diesem Tab geschriebenen String (`lastWritten` je Schlüssel);
  - dem Text, der zuletzt fehlerfrei über `fromJSON` geladen wurde (`Simulation.wasValidated`).
- Nur einen unbekannten Altstand prüft die Routine einmal vollständig, zum Beispiel einen Stand aus einem anderen Tab. Ein beschädigter Hauptstand ersetzt also weiterhin nie eine intakte Sicherung.
- Der Autosave läuft alle 20 s über `requestIdleCallback` (timeout 5 s), sonst über `setTimeout(…,0)`. Mehrfache Anforderungen werden gebündelt. Sperre, temporärer Modus und Dirty-Status prüft `save()` erst beim Ausführen, synchron und ohne `await`.
- `visibilitychange` (hidden) und `beforeunload` speichern weiterhin synchron. Unverändert blieben portableMode, temporärer Modus, SaveGuard und die Meldung bei Speicherfehlern.
- Node-Messung (`npm run perf:save`, Map statt localStorage, je 7 Läufe):

| Stand | vorher Median / max | nachher Median / max | davon `serialize` | entfallene `fromJSON` |
|---|---|---|---|---|
| 5,0 MB | 157,9 / 198,2 ms | 34,6 / 39,0 ms | 35,9 ms | 97,7 ms |
| 2,4 MB | 91,0 / 130,5 ms | 17,1 / 18,5 ms | 17,1 ms | 54,8 ms |

- Browser-Messung (`npm run perf:browser -- --state-mb=2.4`, Szenario „gross“, 25 s bei 12× mit einem Autosave im Fenster):
  - Vergleichsbasis „vorher“ ist `--ref=041ab13`, also der alte Speicherablauf mit bereits behobener Tab-Sperre.
  - Vorher: 2 Long Tasks (112 und 51 ms), längster Frame 116,6 ms.
  - Nachher: kein Long Task, längster Frame 33,4 ms.
  - Im Szenario „start“ gab es weder vorher noch nachher Long Tasks.
  - Bei beiden Messungen gilt für die Frame-Abstände: Median 16,7 ms, p95 und p99 je 16,8 ms, über 20 ms ≤ 0,7 %.
- Prüfungen in `tests/save-autosave.test.js` (6):
  - Periodisches Speichern ruft `fromJSON` 0-mal auf, das Backup ist der zuvor geschriebene Stand.
  - Der erste Speichervorgang nach einem Neustart prüft nicht erneut.
  - Ein beschädigter fremder Hauptstand bleibt aus der Sicherung, ein gültiger fremder Stand wird genau einmal geprüft.
  - Die Leerlauf-Bündelung funktioniert. Verliert der Tab die Sperre vor dem Leerlauf, schreibt er nichts. Ebenso schreibt der temporäre Modus nichts.
  - Der Rückfall auf setTimeout greift.
  - Das Verlassen speichert synchron.

### Integrierter Stand mit 3D-Szene (A09)

Gemessen mit `npm run perf:browser -- --state-mb=2.4` (automatische Wahl, also 3D über SwiftShader) und mit `--renderer=2d`:

| Szene | Szenario | fps | Median / p95 / p99 | über 20 ms | Long Tasks |
|---|---|---|---|---|---|
| 3D (SwiftShader) | start | 13,3 | 83,4 / 116,7 / 133,3 ms | 98 % | 166, längster 130 ms |
| 3D (SwiftShader) | gross | 14,0 | 83,3 / 116,7 / 116,8 ms | 96 % | 206, längster 145 ms |
| 2D (neues HUD) | start | 50,1 | 16,7 / 33,4 / 50 ms | 18 % | 0 |
| 2D (neues HUD) | gross | 50,0 | 16,7 / 33,4 / 50 ms | 18 % | 0 |

- Die Long Tasks der 3D-Szene entstehen bei jedem Frame durch Software-WebGL. Für die GPU-Leistung haben sie keine Aussagekraft.
- In 2D gibt es auch mit Autosave eines Stands von 2,4 MB keine Long Tasks.
- Vor A10 lag die 2D-Szene bei 60 fps und 0 % über 20 ms. Der Rückgang auf 50 fps kam mit dem neuen HUD. Ich habe ihn nicht weiter untersucht. Hinweis an A10/A01.

## 3. Migrationsrahmen

- `core.js` enthält jetzt `SCHEMA = 1`, `MIGRATIONS = []` (Schritte `{from,to,migrate}`) und `migrate(state)`.
  - Fehlen bei einem Schema-1-Stand Listen, ergänzt `migrate` sie: research, rules, transfers, tours, freights, tickets.
  - Danach führt es Schritt für Schritt bis SCHEMA aus. Sprünge über mehrere Stufen sind verboten.
  - Neuere oder unbekannte Stände bleiben unverändert und werden anschließend von `validateState` abgelehnt.
- `fromJSON` nutzt `migrate`. Das Format bleibt bei `schema:1`.
- Die 6 Prüfungen in `tests/save-migrate.test.js` decken ab:
  - Schema 1 wird bitgleich auf sich selbst abgebildet.
  - Fehlende Listen werden aufgefüllt, ohne vorhandene Daten zu überschreiben.
  - Schemata wie 0, 2 oder '1' werden abgelehnt.
  - Mit Testtabellen laufen die Schritte 1→2→3 in der richtigen Reihenfolge, einschließlich der Auffüllungen je Stufe, fehlender Zwischenschritte und verbotener Sprünge.
  - Nach dem Laden bleibt der fachliche Verlauf gleich.

## 4. Browserprüfung

- `tests/browser/smoke.mjs` (`npm run test:browser`) erzeugt eine tmp-Kopie wie `package.py`: Root-index.html mit `<base href="./dist/">` und ein frisches portable.html. Das Repository bleibt dabei unverändert. Den Repo-Root direkt prüft die Option `--repo`. Die Kopie wird über `python3 -m http.server` ausgeliefert.
- Ablauf und Ergebnis, alles bestanden:
  1. Willkommensdialog → Gründen. Der Stand t=480 wird gespeichert.
  2. 10 Panels öffnen.
  3. 30 s bei 12× laufen lassen: 359 Spielminuten.
  4. Der Autosave schreibt (t=705), das Backup enthält den vorherigen Stand.
  5. Nach dem Neuladen ist derselbe Stand geladen (839 → 839 Min.).
  6. Der JSON-Export ist gültig.
  7. Der HTML-Download (1055 KB, mit three.js) wird per file:// geöffnet: Die Uhr steht pausiert auf dem eingebetteten Stand, die 3D-Szene ist aktiv und der Hinweis „HTML-Spielstand geladen“ erscheint.
  - Die Zahlen in Schritt 3 bis 6 stammen aus dem Lauf vor der A09-Integration. Der integrierte Lauf ergab 356 Spielminuten, Autosave t=670, Neuladen 839 → 841 und alle Punkte bestanden.
  8. Keine Konsolen- oder Seitenfehler.
- `/favicon.ico` fehlt. Chromium meldet dazu eine 404 in der Konsole, die der Test bewusst ignoriert.
- `tests/browser/perf.mjs` (`npm run perf:browser`) misst die Abstände zwischen requestAnimationFrame-Aufrufen (Median, p95, p99, Anteile über 16,7, 20 und 33,4 ms) und Long Tasks. Das Ergebnis wird als JSON ausgegeben, mit `--out=` auch in eine Datei.
  - „over16_7“ zählt das Messrauschen bei 16,7–16,8 ms mit und liegt deshalb bei etwa 36 %. Aussagekräftig ist „over20“.
- Fund zu den Startflags: Mit `--use-angle=swiftshader --enable-unsafe-swiftshader` fiel die Bildrate der heutigen 2D-Szene headless auf 3–6 fps, ohne Long Tasks. Ursache ist das GPU-Compositing über SwiftShader. Ohne Flags liefert Chromium 60 fps, und WebGL ist trotzdem über SwiftShader verfügbar. Standard ist deshalb ohne Flags. Mit `--swiftshader` oder `BROWSER_SWIFTSHADER=1` lassen sie sich erzwingen.
- Die Chromium-Binärdatei wird über `PLAYWRIGHT_BROWSERS_PATH/chromium` gefunden (hier `/opt/pw-browsers/chromium`). Playwright wird lokal oder global aufgelöst. Es wird nichts installiert.

## Funde für andere Rollen

1. **Behoben durch A01 (`041ab13`):** `SaveGuard` rief `window.setInterval` mit this=SaveGuard auf. Das ergab „Illegal invocation“ und damit `storage-error`, sodass jeder Browserstart schreibgeschützt war. Mit dem Original-Guard schlug der Rauchtest genau an dieser Stelle fehl.
2. **A10:** Im file://-Modus ist die Simulation pausiert, die Geschwindigkeitsleiste markiert aber weiter „1×“. Der Rauchtest gibt das als HINWEIS aus und wertet es nicht als Fehler.
3. **A12/A01, Speicherkapazität:** Chromium nimmt pro Ursprung höchstens 5.000.000 Zeichen in localStorage auf (gemessen: 5 Mio. passen, 6 Mio. nicht). Hauptstand und Sicherung zusammen begrenzen den Spielstand damit auf etwa 2,4 MB. Größere Stände führen zu „NICHT GESPEICHERT · Speicher … voll“. Diese Folge ist aus der Messung abgeleitet, ein eigener App-Test dazu fehlt. Für Welle 1 empfohlen: IndexedDB oder eine Begrenzung des Wachstums (KONZEPT Abschnitt 5).

## Aussagegrenzen

- Die Browserwerte stammen aus headless Chromium mit Software-Rendering in einem Container. Sie sind **nicht repräsentativ** für GPU-Hardware und taugen nur für Vergleiche auf derselben Maschine. Für 60-FPS-Aussagen muss auf dem Referenzgerät gemessen werden.
- `serialize()` bleibt synchron: etwa 17 ms bei 2,4 MB und etwa 36 ms bei 5 MB in Node. Das ist ein einzelner langer Frame, aber kein Long Task über 50 ms. Inkrementelles Speichern ist nicht umgesetzt.
- In der Node-Messung fehlen die Schreibkosten von localStorage.
- Nicht geprüft: Firefox und Safari, mobile Geräte, echte Mehrtab-Szenarien im Browser, Bildqualität und Bedienung der 3D-Szene (zuständig: A09).
- Der große Teststand entsteht aus 8 Standorten und 3 Spieltagen, aufgefüllt mit Chronikeinträgen. Das ist realistisch geformt, aber keine echte Langzeitpartie.
- Folgen für Spielstände: keine. Das Format bleibt `schema:1`. Alte Stände laden wie zuvor. Die Sicherung behält dieselbe Bedeutung: zuletzt geschriebener, gültiger Stand.
