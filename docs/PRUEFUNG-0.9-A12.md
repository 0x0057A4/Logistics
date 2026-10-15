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

## Nachtrag: QS-Befunde W0-01, W0-05, W0-09 behoben (A12)

- **W0-01 HTML-Export im Dateimodus:** `portable.html` trägt ihre unveränderte Vorlage als inerte JSON-Zeichenkette (`#portable-template`, ≈ 16 KB) mit Platzhaltern für Stylesheet (`#portable-style`), Laufzeit (`#portable-runtime`) und sich selbst. Erneuter Export setzt Schale + Rohtext über `portableTemplate()` (`dist/portable-save.js`) zusammen; `outerHTML` des laufenden Dokuments wird nicht mehr verwendet. Build (Python) und App (JS) kodieren identisch, geprüft. Gen 1 → 2 → 3 byte-identisch bis auf Spielstand-/Prefs-Slot (Node-VM und Chromium file://). Dateien ohne Slot: Rückfall auf Schnappschuss beim Start vor jeder DOM-Änderung. HTML-Spielstände aus älteren Versionen enthalten ihren alten Code und bleiben fehlerhaft; Abhilfe: JSON exportieren und in aktueller Fassung importieren.
- **W0-05 Sicherung:** Gründen über vorhandenem Unternehmen hält dessen letzte gültige Sicherung fest (Marker `<key>-backup-hold` mit Spielzeit). Solange er steht, schreibt `save()` keine Sicherung. Freigabe nur über „Alte Sicherung verwerfen“ (Einstellungen, mit Rückfrage) oder erfolgreiches „Letzte Sicherung laden“. Willkommensdialog und Einstellungen zeigen „Letzte Sicherung laden“ nur bei gültiger Sicherung des betroffenen Modus. Vorbestehend: 0.8 (`bf76e22`) rotierte ebenso beim zweiten Speichern (Codelesung).
- **W0-09:** `smoke.mjs` speichert Downloads immer in ein eigenes tmp-Verzeichnis, auch mit `--repo`.
- Folgen für Spielstände: Format unverändert (`schema:1`). Neuer localStorage-Schlüssel `industrie-logistik-v1-<modus>-backup-hold` (klein). Während des Festhaltens hat der neue Stand keine eigene Sicherung (im Einstellungsfenster angezeigt).

## Nachtrag Welle 1b: Spielstände in IndexedDB (QS-W0-03), eigener Sicherungsplatz (QS-W0-11), Listengrenze

Stand: 15.10.2026, Basis `claude/loving-wozniak-56yxt7` @ `8a02509`.

### Speicherort (QS-W0-03)

- Neu `dist/storage.js` (`createSaveStore`). Backends hinter einer Schnittstelle: `idb` (IndexedDB, Datenbank `industrie-logistik-v1`, Objektspeicher `saves` mit Datensatz `{value,at}` und `meta`), `local` (bisheriges localStorage-Verhalten), `error`.
- Lesen bleibt synchron: `load(keys)` holt Hauptstand, `-backup`, `-backup-prev`, `-backup-hold` eines Modus nach Sperrerwerb in einen Cache. `write({key:text|null})` aktualisiert den Cache sofort und schreibt alle Schlüssel in **einer** Transaktion (`tx.commit()` sofort). `save()` bleibt synchron (Prüfung `owns()` → Schreiben ohne `await`). Statuszeile „Wird gesichert …“ bis zum Commit, danach „Gesichert …“. Commit-Fehler → „NICHT GESPEICHERT …“, `dirty` bleibt, Cache wird aus IndexedDB nachgeladen (danach wird der Altstand vor einer Rotation wieder geprüft).
- Reihenfolge: IndexedDB führt readwrite-Transaktionen mit gleichem Bereich in Erzeugungsreihenfolge aus, auch über Verbindungen. Vor Moduswechsel wartet `activate()` auf eigene offene Schreibvorgänge (`flush`); nach Sperrerwerb wird frisch geladen.
- Tab-Sperre (Web Lock + Lease), Einstellungen (`-prefs`) und Backend-Marker (`-backend`) bleiben in localStorage. `SPIELSTAND-SPERRE.md` gilt unverändert.
- Ohne IndexedDB (nicht vorhanden, Öffnen scheitert, 5 s ohne Antwort) und ohne Marker: Rückfall auf localStorage = bisheriges Verhalten inkl. temporärem Modus. Mit Marker `idb` aber unerreichbarer IndexedDB: **kein** stiller Rückfall auf veraltete localStorage-Daten; Schreibschutz mit Hinweis „Spielstandspeicher (IndexedDB) nicht erreichbar“, „Speicher erneut prüfen“ versucht erneut, temporärer Modus und Export bleiben.
- portableMode (file://) unverändert: kein Browserspeicher, `store` wird nie geöffnet.
- Startablauf: Spielstand wird jetzt in `bootstrap()` geladen (asynchron), nicht mehr beim Modul-Laden. Statuszeile zeigt bis dahin „Spielstand wird geladen …“. Klicks auf die Geschwindigkeit in diesem Moment (wenige ms bis ≈ 1 s bei 5 MB) werden ignoriert.

### Migration localStorage → IndexedDB

- Erster Start: alle Altschlüssel aller Modi (Haupt, `-backup`, `-backup-hold`) in **einer** Transaktion mit `durability:'strict'`, nur wenn `meta/migrated` fehlt (Prüfen und Schreiben in derselben Transaktion → zwei gleichzeitig startende Tabs migrieren genau einmal). Danach Rücklesen in neuer Transaktion und Vergleich; bei Abweichung Marker zurücknehmen und Rückfall localStorage.
- Originale bleiben bis zum **nächsten** Start. Entfernt werden sie erst, wenn `meta/migrated` in IndexedDB und der Marker `-backend=idb` in localStorage aus einem früheren Start vorliegen (Schutz gegen nicht dauerhaft geschriebene Daten, Chromium-Standard „relaxed“). Ab dann ist IndexedDB allein maßgeblich.
- W0-Marker `-backup-hold` wird beim ersten Schreibzugriff in den neuen Platz `-backup-prev` überführt (Sicherung → Platz, Marker gelöscht). Gelingt das nicht (z. B. localStorage voll im Rückfallmodus), gilt das W0-Festhalten weiter.
- Grenzen: Eine noch offene **alte** App-Version (vor W1b) schreibt weiter localStorage; deren Schreibvorgänge nach der Migration werden beim nächsten Start verworfen. Ein Zurückgehen auf eine alte Version findet ab dem zweiten Start keine localStorage-Stände mehr (Abhilfe: JSON-Export).

### Speichern beim Verlassen – Restrisiko

- `visibilitychange:hidden` und `beforeunload` rufen `leaveSave()`: bei Änderungen sofort `save()` (Transaktion + `commit()` noch im Ereignis). Steht ein Commit des Hauptstands aus, wird der zuletzt geschriebene Text zusätzlich als **Notfall-Kopie** `<key>-emergency` (`<at>\n<text>`) synchron in localStorage abgelegt, wenn ≤ 2,4 Mio. Zeichen. Sie wird nach bestätigtem Commit entfernt; passt sie nicht, wird eine ältere Kopie vorher entfernt (nie eine veraltete Kopie über einem neueren Stand).
- Nächster Start (als Sperrinhaber): Kopie neuer als der IndexedDB-Datensatz (`at`) → übernommen, Hinweis, sofort gespeichert (alter IndexedDB-Hauptstand rotiert in die Sicherung). Sonst verworfen.
- Ohne Kopie (Stand > 2,4 Mio. Zeichen) und offenem Commit fragt `beforeunload` nach (Browserdialog); der Commit läuft währenddessen weiter.
- **Restrisiko:** Bei Ständen > 2,4 Mio. Zeichen, die beim Schließen geändert sind, kann der Browser die Seite beenden, bevor der Commit bestätigt ist (Absturz, mobiles Beenden, Nutzer bestätigt den Dialog sofort). Dann gilt der letzte bestätigte Stand (Autosave ≤ 20 s alt). Bei kleineren Ständen deckt die Notfall-Kopie das ab, solange localStorage nicht voll ist. Im ersten Start nach der Migration belegen die Originale localStorage; die Notfall-Kopie passt dann oft nicht.

### Eigener Platz für das vorherige Unternehmen (QS-W0-11)

- Gründen über vorhandenem Unternehmen legt dessen letzten gültigen Stand (Hauptstand, sonst gültige Sicherung) in `<key>-backup-prev` (IndexedDB: Commit wird abgewartet; Fehler bricht das Gründen mit Meldung ab). Die laufende Sicherung `-backup` rotiert danach normal für das neue Unternehmen.
- Erneutes Gründen ersetzt den Platz durch das zuletzt ersetzte Unternehmen; die Rückfrage nennt das („Eine dort liegende ältere Sicherung wird dabei ersetzt.“).
- Einstellungen: Hinweis mit Spielzeit, „Vorheriges Unternehmen laden“ (Tausch: aktuelles Unternehmen belegt danach den Platz) und „Alte Sicherung verwerfen“ (löscht den Platz). „Letzte Sicherung laden“ nutzt die laufende Sicherung, bei ungültiger Sicherung den Platz.
- Kosten: drei Kopien je Modus. In IndexedDB unkritisch; im localStorage-Rückfall sinkt die Grenze aus 03 auf ≈ 1,7 MB, Gründen scheitert dann mit Meldung statt still Daten zu verlieren.
- Änderung an A11-Prüfungen: Befundtest 11 aktiv und grün. Befundtest 05 prüft jetzt den Platz `-backup-prev` statt `-backup` (alte Sicherung bleibt erhalten, liegt aber nicht mehr in der rotierenden Sicherung). **Bitte A11 nachprüfen.** `tests/browser/qa-w0.mjs` und `qa-w0-recheck.mjs` lesen Spielstände noch aus localStorage und müssen für IndexedDB angepasst werden (nicht geändert, A11-Bereich).

### Listengrenze in `validateState`

- Messung (`P.large`, 3 Spieltage, Node): je Tag +650 bis +970 Chargen (A03 maß bis ≈ 1.770 mit Spielerpolitik), Ledger +67 bis +78, Chronik auf 3.000 begrenzt, übrige Listen einstellig. Eine Charge ≈ 212 Zeichen, davon 69 % Nullchargen (Herkunft).
- Folge: Bei 100.000 Chargen wäre der Stand nach ≈ 55–150 Spieltagen nicht mehr ladbar, obwohl er erst ≈ 21 MB groß ist. Ledger erreicht 100.000 erst nach > 1.000 Tagen, Chronik nie.
- Umgesetzt (`core.js`): `SAVE_LIMITS={chars:30 Mio.,list:100.000,lists:{batches:1.000.000}}`, exportiert mit `saveHeadroom()` und `Simulation.LIMITS/headroom()`. Für Chargen greift damit praktisch zuerst die Textgrenze (≈ 140.000 Chargen). `save()` zeigt ab 60 % einer Grenze „Spielstand groß: x MB (y % der Ladegrenze)“ in der Statuszeile und **verweigert** das Schreiben eines Stands über einer Grenze („NICHT GESPEICHERT · Spielstand überschreitet Ladegrenze“), damit nie ein nicht mehr ladbarer Stand den ladbaren ersetzt. Format unverändert `schema:1`.
- Vorschlag A05/A03 (nicht umgesetzt): Nullchargen älter als N Tage verdichten, ohne Herkunft zu verlieren, z. B. Herkunftskette in eine kompakte Tabelle `lineage` (id → parents, item, created) überführen und die Charge entfernen; Rückruf (`recallBatch`) und `perf-index`-Prüfungen müssen dann über `lineage` laufen. Alternativ Tageszusammenfassung je Artikel/Standort für Chargen ohne Rückrufbezug. Danach Schemaschritt 1→2 über `MIGRATIONS` (A12).

### Prüfungen

| Prüfung | Ergebnis |
|---|---|
| `npm test` (2×) | 346 von 346 bestanden, 0 todo (neu: `tests/storage-idb.test.js` 13, `save-backup-hold` 2 zusätzlich; Befund 11 aktiv) |
| `npm run test:browser` | 32 von 32 bestanden, keine Konsolenfehler. Neu: Spielstand nur in IndexedDB (localStorage ohne Spielstand), zweiter Tab schreibgeschützt (IndexedDB unverändert, Uhr steht), Schließen mit ungespeicherter Änderung → Neustart lädt letzten Stand, **5,00-MB-Stand** gespeichert und nach Neuladen geladen (localStorage 272 Zeichen), Migration erster Start (Original bleibt, W0-Marker → Platz) und zweiter Start (Original entfernt) |
| `node tests/browser/perf.mjs --seconds=5 --state-mb=5 --renderer=2d` | Szenario „gross“ 5,0 MB aus IndexedDB, Autosave im Fenster: 60,1 fps, 0 Long Tasks, Sicherung geschrieben |

- IndexedDB-Ersatz für Node: `tests/idb-stub.js` (eigene Minimalumsetzung: Transaktionsreihenfolge, Auto-Commit, Atomarität, Fehlerinjektion `failPut`/`failOpen`/`hangOpen`/`freeze` = Tab beendet vor Commit). Keine Indizes/Cursor. Der UI-Harness erhält optional `indexedDB`; ohne Option läuft er im localStorage-Rückfall (alle bisherigen Prüfungen unverändert).
- `tests/browser/perf.mjs` spielt den großen Stand jetzt direkt in IndexedDB ein.
- Nicht geprüft: Firefox/Safari (IndexedDB-Transaktionsverhalten bei `beforeunload`, `tx.commit()` fehlt in älteren Safari-Versionen → Auto-Commit), Privatfenster mit gesperrter IndexedDB im echten Browser (nur Node-Stub), echter Browserabsturz während eines Commits, Speicherdruck/Eviction.
- Folgen für Spielstände: Format unverändert `schema:1`. Speicherort wechselt beim ersten Start automatisch nach IndexedDB. Neue Schlüssel: `-backup-prev` (IndexedDB), `-emergency` und `-backend` (localStorage).
