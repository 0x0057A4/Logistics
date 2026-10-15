# Schnittstellen Welle 0 (Version 0.9) – festgelegt durch A01

Stand: 15.10.2026. Grundlage: abgenommenes `docs/KONZEPT-LOGISTIKHUB.md`.

## Abgenommene Entscheidungen

Der Nutzer hat am 15.10.2026 das Konzept abgenommen. Die Vorschläge aus Abschnitt 8 gelten:

| Punkt | Entscheidung (Nutzer, 15.10.2026) |
|---|---|
| Fertigung | Bleibt; wird Geschäftsfeld „Mehrwertdienste/Kontraktlogistik“ |
| three.js | Lokal: `dist/vendor/three.module.min.js` (r170, MIT, Lizenz in `dist/vendor/THREE-LICENSE.txt`). Kein CDN. |
| NuriTrack-Schnappschuss | Entfernen nach Abschluss der Analyse, sofern nicht mehr benötigt. Analyse abgeschlossen (KONZEPT 2.1–2.7), Datei entfernt; bei Bedarf aus Git-Historie (Commit f986e5d) wiederherstellbar, nicht veröffentlichen. |
| Version | 0.9 = Hub-Umbau; Ergebnisrechnung und Abschreibung danach |
| Referenzhardware 60 FPS | Notebook, Intel Core i5-1335U (13. Gen), 16 GB RAM, integrierte Grafik (Intel Iris Xe). Browser nicht genannt → Annahme aktuelles Chrome/Edge. |
| Name | „Industrie & Logistik“ vorerst; Umbenennung später |

## Unveränderliche Annahmen

- Fachzustand nur über `Simulation.command` und `step`. Darstellung und HUD buchen weder Ware noch Geld.
- Alle 194 Bestandstests (`npm test`) bleiben grün. Neue Prüfungen kommen hinzu.
- 1 Spielminute = 1 Echtzeitsekunde bei 1×. Ganzzahlige Minutenschritte.
- Bedienung und Texte auf Deutsch. Alle Namen fiktiv.
- Keine Netzwerkzugriffe zur Laufzeit.

## S1 – Szenen-Schnittstelle (A09 ↔ A10/app.js)

`dist/scene3d.js` exportiert `class Scene3D` mit **derselben öffentlichen API** wie `Scene` in `dist/scene.js`:

```
new Scene3D(canvas, callbacks)   // callbacks: onSelect(id|null), onPlace(x,y), onHover(x,y)
setState(state)                  // nur lesen, nie verändern
setBuild(type, rotation=0, movingId=null)
setView('hall'|'site'|'network'|'flat')
zoom(delta) · rotate() · home() · focus(id) → bool · destroy()
setClock(tFloat)                 // NEU, optional: gebrochene Spielzeit für Interpolation
setLabels('fleet'|'infra'|'all'|'none')   // NEU, optional
```

- Auswahl- und Rasterkoordinaten entsprechen denen der 2D-Szene: ganzzahlige Zellen `x`,`y` der Halle, Ursprung oben links, Tor bei (0,8).
- `dist/scene-select.js` exportiert `createScene(canvas, callbacks)`. Gibt es WebGL2 oder WebGL, entsteht `Scene3D`, sonst `Scene` (2D-Rückfall). Die Wahl erzwingt der URL-Parameter `?renderer=2d|3d`.
- app.js ersetzt einzig `new Scene(...)` durch `createScene(...)` und ruft `scene.setClock?.(t)` im Frame auf.

## S2 – Zeitbasis für flüssige Bewegung (A03 → A09)

- Im Spielzustand wird nichts geändert. app.js stellt `clockFloat = state.t + accumulator/1000` bereit (Werte von 0 bis unter 1 zwischen zwei Minuten).
- Ein Fahrzeug bewegt sich entlang eines Weges in Abhängigkeit vom Phasenfortschritt. Fortschritt = `1 - remaining/duration`, falls die Fachdaten beides tragen, sonst abschnittsweise Positionen.
- Interpolation darf nur Darstellungszustand ändern. Fehlende Felder führen zu stehenden Fahrzeugen, nie zu Fehlern.

## S3 – Speicherformat (A12 + A03)

- Welle 0 ändert das Format **nicht**. `schema:1` bleibt.
- Vorbereitet wird ein Migrationsrahmen `migrate(state)` in core.js. Er bildet Schema 1 unverändert auf sich selbst ab und hat getestete Hooks für Schema 2 (Welle 1).
- Das Speichern darf den alten Stand nicht mehr vollständig neu validieren, bevor es schreibt. Das Backup bleibt der zuletzt erfolgreich geschriebene Stand.

## S4 – Leistung (A03, A12)

- Interne Indexe sind laufzeitlokal: WeakMap oder nicht aufzählbare Felder. Sie werden nie serialisiert und nach `fromJSON` neu aufgebaut.
- Das Ergebnis jeder Fachfunktion bleibt bitgleich. Prüfung: Ein Determinismustest vergleicht den serialisierten Zustand nach N Minuten mit dem vorherigen Code (gleicher Seed, gleiche Befehle).

## Dateibereiche Welle 0

| Agent | Darf ändern | Darf nicht ändern |
|---|---|---|
| A03 Simulationskern | `dist/inventory.js`, `dist/production.js`, `dist/special.js`, `dist/economy.js` (nur Indexe), neue Tests `tests/perf-*.test.js` | core.js, app.js, scene* |
| A09 3D-Welt | neu `dist/scene3d.js`, `dist/scene-select.js`, in `dist/app.js` nur die Scene-Erzeugung und `setClock`, neue Tests `tests/scene3d-*.test.js` | Fachmodule |
| A10 Oberfläche | `dist/index.html`, `dist/styles.css`, `dist/app.js` (HUD, render, Panels), UI-Tests | Fachmodule, scene* |
| A12 Spielstände/Release | `dist/core.js` (nur `fromJSON`/`migrate`), `dist/app.js` (nur `save()`/Autosave), `scripts/*.py`, `tests/browser/*`, `tests/portable-build.test.js`, `package.json` | Fachmodule, scene* |

Root-`index.html` und `dist/portable.html` werden nur durch `python3 scripts/package.py` erzeugt. Das macht A01 bei der Integration.
