# Konzept: Umbau zum eigenen Logistikunternehmen (Hub-Ausbau)

Stand: 15.10.2026 · Status: **Entwurf zur Abnahme durch Nutzer** · Keine Umsetzung begonnen.

Grundlage: Spielstand 0.8 (`dist/`), `AGENTS.md`, `CONTRACT.md`, `docs/ARCHITEKTUR.md`, `docs/FUNKTIONSSTATUS.md`, Analyse von `NuriTrack · Logistics Control.html`.

---

## 1. Ziel

Das bestehende Spiel bekommt die Spielwelt und Bedienlogik der NuriTrack-Leitstand-Oberfläche. Spielinhalt: **eigenes Logistikunternehmen aufbauen**. Klein starten mit einem Depot, ausbauen bis zum Mega-Hub mit Sortieranlage, Containerhof und Standortnetz.

- Was NuriTrack mit API-Echtdaten zeigt, erzeugt künftig die deterministische Spielsimulation.
- Jede Zahl im HUD stammt aus dem Spielzustand (CONTRACT: keine Zufallswerte im Dashboard).
- Start über `index.html` im Repository-Hauptordner (GitHub Pages).
- Ziel 60 FPS auf Referenzhardware, mit adaptiver Qualität (siehe Abschnitt 6).

## 2. Reverse Engineering von NuriTrack – Ergebnis

### 2.1 Was die Datei tatsächlich enthält

- Es ist ein **gespeicherter Browser-Schnappschuss** von `nuri-track.vercel.app`. Technik: React, react-three-fiber, three.js r186, camera-controls 3.1.2, Tailwind, Lucide-Icons.
- Der Programmcode (`index-peh6Nd-7.js`) und das CSS stecken im Ordner `NuriTrack · Logistics Control_files/`. **Dieser Ordner fehlt im Repository.** Die Live-Seite ist aus der Arbeitsumgebung nicht erreichbar.
- Enthalten ist damit nur der DOM-Zustand eines Augenblicks (09:36 Uhr): Panels, Kennzahlen, Fahrzeug-Labels, Paketreise, Fahrzeugliste. Den 3D-Szenenaufbau, die Fahrwege und die Ankunftslogik der Lkw enthält die Datei **nicht**.
- Folge: Ablauf und Zeitverhalten sind aus Zustandsbegriffen, ETAs und Zählern **rekonstruiert**. Die konkreten Taktregeln entwerfen A02/A03 neu. Projektregel bleibt: nur abstrakte Prozesse übernehmen, kein fremder Code, keine fremden Daten.

### 2.2 Bildschirmaufbau

| Bereich | Inhalt im Vorbild | Übernahme ins Spiel |
|---|---|---|
| Vollbild-3D | three.js-Canvas unter einer 56 px hohen Kopfzeile; frei dreh- und zoombare Kamera | Hub-Szene in WebGL, Bedienung wie bisher (Ziehen, Rad, Drehen, Home) |
| Kopfzeile | Logo; Befehls-/Suchfeld mit Taste `/`; „Ops center“; Standortwahl (Kürzel, Name, „Docks 5/7 · Sorted 2.284“); Geschwindigkeit ×1/×2/×4/×8; Replay der letzten 60 min; Assistent „Jev“ an/aus; Uhr „LIVE 09:36“ mit Jahreszeit und Wetter; Sprachwahl; Meldungsglocke; Benutzerkarte | Bestehende Topbar wird nach diesem Muster umgebaut. Geschwindigkeiten 0/1/4/12 bleiben spielmechanisch, die Anzeige wird angepasst. Sprache nur Deutsch. |
| KPI-Karten oben links | Verarbeitet heute (Kartons, +Sortiert), Fahrzeuge vor Ort (+Zulauf, Container-TEU), Pünktlichkeit (+Hauptläufe, verspätet) | Aus echten Zählern des Spielstands |
| Linke Spalte „Standortfluss“ | 7 Stationen als Kette, je Zähler und Unterzeile; Kamerarundgang „Play tour“; einklappbar | Klick auf eine Station setzt den Kamerafokus und öffnet die Akte |
| Rechts oben | Zoom ±, Drehen links/rechts, Ansicht zurücksetzen; Labelgruppen Flotte / Infrastruktur / Alle; Labels aus; Panels aus (nur Szene) | Übernahme |
| Rechte Detailspalte | Standortakte: Typ, Adresse, Betriebszustand, Bestand/Kapazität, Docks belegt, Hauptlauf ausgehend heute, Eingang heute; Sortieranlage (Durchsatz, Fehlwürfe); Schlüsselbestände (OK/Niedrig); Stapler mit Akku % und Auftrag | Ersetzt bisherige Gebäudeakte |
| Szenario-Reiter | Straßenpaket, Seeimport, Luftexport, Retourenabholung, Dock-Belegungsplan, Torbuch, Fahrzeugakte | Werden Spielfenster (siehe 3.4) |
| „Reise eines Pakets“ | 8 Stationen mit Ort, ETA und Auslastung; Sendungsnummer, Inhalt, Empfänger, Zustellhinweis; „Verfolgen (×4)“ | Repräsentative Sendung pro Auftrag; Kamera folgt |
| Fußleiste | Docks 11/19 · Lkw 19 · Stapler 0/5 · Roboter 0 · Personen 3 | Statuszeile |
| Fahrzeugliste unten | Kennung, Firma, Route/Dock, Status, Restzeit, „gefährdet +22 min“ | Dispositionsliste, Klick fokussiert Fahrzeug |
| Szenen-Labels | Chips über Fahrzeugen mit Farbton (gelb = wartet, blau = unterwegs, grau = Ein-/Ausfahrt) | Gleiches Farbschema, nur sichtbare Fahrzeuge, gedrosselt |

### 2.3 Standortfluss eines Hubs

1. **Tor und Hof**: Einfahrt, Wartefläche, Ausfahrt.
2. **Seitenentladung**: Entladetore, z. B. 1/3 belegt, 36 heute.
3. **Wareneingang und Lager**: Palettenplätze 1.425/1.800, Stapler 0/5.
4. **Hub-Sortierung**: Quergurtsortierer, z. B. 27.458 Kartons/h. Fehlwürfe gehen an Nachsortierung, Handarbeit oder Sonderbehandlung.
5. **Hauptlauf-Ausgangsdocks**: z. B. 4/4, 42 Abfahrten heute.
6. **Zustell-Sortierfläche**: Rutschen und Zustellplätze 8/12, Beladung der 1-t-Transporter.
7. **Containerhof**: Lagerung in TEU, Chassis und Auflieger.

### 2.4 Fahrzeugklassen und Zustandsautomat

| Kürzel im Vorbild | Klasse | Rolle im Spiel |
|---|---|---|
| TR | Sattelzug im Hauptlauf | Verbindung zwischen eigenen Standorten und Kunden-Lagern |
| DV | 1-t-Transporter | Letzte Meile, Zustelltouren |
| AT | Luftfracht-Zubringer | Fahrt zwischen Flughafen-Terminal und Hub |
| CT | Containerchassis | Fahrt zwischen Seehafen und Containerhof |

Ablauf eines Fahrzeugs, rekonstruiert:

```
Autobahn → Einfahrt → zum Dock → Andocken → (Dock-Warteschlange) → Entladen/Beladen → Ausfahrt → Rückfahrt
                                                                              └→ Auslieferung (DV) → Rückfahrt
Querschnittlich: „gefährdet +N min“, sobald die Prognose das Zeitfenster reißt
```

### 2.5 Standortnetz im Vorbild (abstrahiert)

Fulfillment-Lager → Mega-Hub → Regional-Hub → Zustellgebiet. Dazu kommen ein Seehafen-Terminal und ein Flughafen-Terminal. Kennungen nach Muster `XX-01`. Im Spiel werden alle Orte, Firmen und Personen **fiktiv und deutschsprachig** neu erzeugt. Koreanische Orte, Namen und Adressen aus dem Vorbild werden nicht übernommen.

### 2.6 Zeitbezug, aus dem Schnappschuss abgeleitet

Paketreise (Spielzeit ab 09:34):

| Station | Uhrzeit | Dauer |
|---|---|---|
| Kommissionieren | 09:34 | – |
| Hauptlauf 1 | 10:19 | ca. 45 min |
| Hub-Sortierung | 11:18 | ca. 60 min |
| Hauptlauf 2 | 11:46 | ca. 30 min |
| Untersortierung | 12:11 | ca. 25 min |
| Zustellung beginnt | 13:05 | ca. 55 min |
| Zugestellt | 13:25 | ca. 20 min |

- Von Bestellung bis Zustellung vergehen damit rund 4 Stunden.
- Die Fahrzeugliste zeigt Restzeiten von 1–7 Minuten im Hof. Ein Hubtag hat also hohe Taktdichte.
- Diese Werte dienen A02 als **Orientierung**. Es sind keine verbindlichen Regeln.

### 2.7 Weitere Funktionen im Vorbild

- **„Jev“**: Assistent, der Entscheidungen übernimmt (z. B. Fehlwürfe nachsortieren). Ist er aus, gelten die Standardregeln. Im Spiel wird daraus ein **Dispositionsassistent auf Basis der vorhandenen Delegationsregeln**: lokal, nachvollziehbar, ohne KI-Dienst.
- **Replay 60 min**: Wiedergabe aus Chronik plus Momentaufnahmen. K13 hat das bisher als offen geführt.
- **Jahreszeit, Tageszeit und Wetter**: Beleuchtung, später Störereignisse (K07 offen).
- **Kamerarundgang**: Fahrt der Kamera durch die Stationen.
- **Zustellhinweise von Kunden**, z. B. „nur beim Pförtner abgeben“: deckt den offenen Punkt K06 „individuelle Kundennachrichten“ ab.
- **Meldungen und Vorfälle** (Glocke): Ereignisse aus der Simulation.

## 3. Spielkonzept

### 3.1 Kernschleife

Verträge mit fiktiven Versendern abschließen. Ware (Pakete, Paletten, Container) holen oder annehmen. Entladen, einlagern oder sortieren. Hauptlauf zu weiteren Standorten fahren, danach Zustelltour. Zustellung im Zeitfenster bringt Zahlung. Mit dem Ertrag Docks, Sortierer, Fahrzeuge, Personal und Standorte ausbauen.

### 3.2 Fortschritt

| Stufe | Betrieb | Freigeschaltet |
|---|---|---|
| 1 Depot | 1 Tor, 2 Docks, Handsortierung, 1 Transporter, kleiner Regalbereich | Erste Zustellverträge |
| 2 Umschlaglager | Mehr Docks, Stapler, Palettenlager, Lkw, Mietflotte | Hauptläufe, Sammeltouren, Retouren |
| 3 Regional-Hub | Gurtsortierer mit Durchsatzgrenze, Zustell-Sortierfläche, Schichtbetrieb | Zweiter Standort, Linienverkehr |
| 4 Mega-Hub | Quergurtsortierer, Containerhof, Kühlbereich, Terminal | Seeimport, Luftexport, Kühlkette |
| 5 Netz | Bis zu 8 Standorte | Assistent, Planung, Replay, Störungen |

### 3.3 Weiterverwendung der bestehenden Module

| Modul | Künftige Rolle |
|---|---|
| core, save-guard, portable-save, accounting | Bleiben. Schema 2 mit Migration von Schema 1. |
| inventory | Ladeeinheiten statt Einzelpakete (siehe 3.5); Eigentum der Versender bleibt (Fremdlogistik). |
| workforce | Neue Rollen: Torposten, Staplerfahrer, Sortierkraft, Disponent. Schichten und Pausen bleiben. |
| transport, tours, rental | Kern für Hauptlauf und letzte Meile. Neu: Hofzustände und Dock-Zeitfenster (K09 offen). |
| multimodal, special | Seeimport/Container, Luftexport, Kühlkette |
| service, customer-service | Retourenabholung, Tickets, Zustellhinweise |
| economy | Frachtverträge (Preis je Paket, Palette, TEU), Vertragsstrafen, später GuV und Abschreibung |
| management | Forschung, Regeln, Dispositionsassistent |
| network | Standortnetz mit Typen: Depot, Hub, Hafen, Flughafen |
| production | **Entscheidung offen** (siehe 8.1); Vorschlag: Mehrwertdienste wie Kommissionierung und Verpackung |
| scene | Wird durch eine WebGL-Szene ersetzt. Die Canvas-2D-Fassung bleibt als Rückfallebene ohne WebGL. |
| app | Neues HUD nach Abschnitt 2.2; Fachfenster bleiben erreichbar |

### 3.4 Neue Fachbausteine

- **Hof und Docks (A07/A03)**: Torbuch, Wartefläche, Andockreihenfolge, Dock-Belegungsplan, Wartekosten, Gefährdungsprognose.
- **Sortierer (A05/A04)**: Durchsatz in Kartons/h, Fehlwurfquote, Fehlwurfschlange, Zuteilung auf Rutschen und Relationen.
- **Stapler (A05/A06)**: Fahrauftrag, Akkustand, Ladestation, Bediener.
- **Hauptlauffahrplan (A07)**: feste Abfahrten zwischen Standorten, verbindlicher Ladeschluss.
- **Sendungsverfolgung (A10)**: Reise einer repräsentativen Sendung durch alle Stationen.

### 3.5 Mengenmodell

Das Vorbild zeigt 184.068 Kartons am Tag. Einzelne Paketobjekte wären für Speicher und 60 FPS untragbar. Deshalb gilt:

- Simuliert werden **Sendungslose**: Relation, Anzahl, Gewicht, Volumen, Frist und Eigentümer. Sie stecken in Ladeeinheiten (Rollcontainer, Palette, Wechselbrücke, Container).
- Die Szene zeigt eine **instanzierte Stellvertretermenge**. Ihre Dichte hängt fachlich vom Bestand ab, rein optisch.
- Keine negativen Bestände, keine verlorenen Ladeeinheiten. Kamera und Bildrate verändern keine Erträge.

## 4. Technik

### 4.1 Renderer

- **three.js wird lokal mitgeliefert** (MIT-Lizenz, feste Version in `dist/vendor/`). Kein CDN, auch nicht zur Laufzeit. Das weicht vom bisherigen Grundsatz „keine externen Bibliotheken“ ab und braucht deine Freigabe (8.2). Alternative wäre ein eigener WebGL2-Renderer, deutlich aufwendiger.
- Kein React, keine Laufzeit-Bundler. Die Struktur bleibt bei ES-Modulen wie bisher.
- `build-portable.py` wird um das Einbetten des Vendor-Moduls erweitert. Der HTML-Export mit Spielstand bleibt erhalten.

### 4.2 Trennung von Simulation und Darstellung

- Simulation: weiter feste Minutenschritte (`step`). Optional später in einem Web Worker.
- Darstellung: `requestAnimationFrame` in jedem Frame. Fahrzeugpositionen werden **zwischen zwei Spielminuten interpoliert**. Grundlage sind Startzeit, Ende und Weg der laufenden Phase, als reine Funktion. Daraus entsteht flüssige Bewegung, ohne dass sich der Zustand ändert.
- Animationen buchen weder Ware noch Geld (AGENTS.md, Punkt 7).

## 5. Spielstände

- **Schema 2** mit Migration von Schema 1. Alte Fertigungsstände bleiben ladbar.
- Gespeichert werden auch Hofwarteschlange, Docktermine, Sortierpuffer, Staplerauftrag und Fahrphase.
- Speichern im Leerlauf (`requestIdleCallback`) ohne erneute Vollvalidierung des Altstands. Damit entfällt der heutige Ruckler alle 20 s.
- Spielstände wachsen bisher unbegrenzt. Abhilfe: Verbrauchte Chargen mit Menge 0 kommen in einen Herkunftsindex. Die Rückverfolgung für Rückrufe bleibt erhalten.

## 6. 60 FPS – Leistungsbudget

Ehrliche Grenze: Dauerhaft 60 FPS auf **jeder** Hardware lassen sich nicht zusichern. Ziel: stabile 60 FPS auf Referenzgerät (Notebook mit integrierter GPU, 1080p, Chromium und Firefox aktuell). Darunter greift adaptive Qualität.

| Bereich | Maßnahme | Budget je Frame |
|---|---|---|
| Szene | Statische Halle zusammengeführt; Pakete, Paletten und Fahrzeuge als InstancedMesh; unter 150 Draw Calls; eine Schattenkaskade oder vorgebackene Schatten; Pixeldichte höchstens 1,5–2; dynamische Auflösung bei mehr als 16,6 ms | ≤ 8 ms GPU |
| Simulation | Indexe statt linearer Suchen (Chargen nach Standort und Artikel, Jobs nach Gebäude); Schritte bei 12× über Frames verteilt | ≤ 2 ms je Frame |
| HUD | DOM-Updates mit 4 Hz und nur bei geänderten Werten; Panels nicht mehr komplett per innerHTML neu aufbauen; virtuelle Listen | ≤ 1 ms |
| Labels | Nur für sichtbare Fahrzeuge, gesammelt per CSS-Transform, Anzahl begrenzt | ≤ 1 ms |
| Speichern | Leerlauf, inkrementell | kein Frame über 16,6 ms |

Messung:

- Chromium ist in der Arbeitsumgebung vorhanden. Damit sind erstmals echte Browserprüfungen per Playwright möglich (Start, Klickpfade, Speichern/Laden, Fehlerkonsole).
- Headless-Chromium rendert per Software. FPS-Werte daraus sind **nicht repräsentativ**. Für 60 FPS zählen Messungen mit `tests/perf-szene.mjs` (Frame-Zeitstatistik, p95/p99) auf echter Hardware, also bei dir.
- Lastszenario: Mega-Hub mit 8 Standorten, 120 Fahrzeugen und 20.000 Ladeeinheiten bei 12×.

## 7. Agentenplan nach AGENTS.md

Gleichzeitig höchstens 7 Agenten: A01 + 5 Entwicklungsagenten + A11. Jeder Entwicklungsagent arbeitet in einem eigenen Git-Worktree. A01 führt zusammen. Übergaben im Format aus AGENTS.md.

### Welle 0 – Fundament (A01, A03, A09, A12, A11)

| Rolle | Paket | Abnahme |
|---|---|---|
| A01 | Schema 2, Schnittstellen Hof/Dock/Sortierer/Ladeeinheit, Dateibereiche je Agent | Schnittstellendokument; 194 Bestandstests grün |
| A03 | Indexe, Zeitbasis für Interpolation (`phaseStart`/`phaseEnd`), Migration 1→2 gemeinsam mit A12 | Gleicher Seed ergibt gleichen Zustand; alte Stände laden |
| A09 | three.js-Einbindung, leere Hub-Szene, Kamera, Instancing-Gerüst, Rückfall auf Canvas 2D | Szene startet über `index.html` und portable HTML |
| A12 | Perf-Messrahmen, Playwright-Browserprüfung, Leerlauf-Speichern | Messprotokoll mit tatsächlichen Werten |
| A11 | Prüfplan Welle 1, Regressionsliste | Unabhängige Prüfung |

### Welle 1 – Erster Hub-Kreislauf (A03, A05, A07, A09, A10 + A11)

Ein Lkw kommt am Tor an, wartet, dockt an und wird entladen. Die Ladung wird eingelagert oder sortiert, auf Transporter verladen und zugestellt. Danach wird bezahlt.

- A03: Fahrzeugzustandsautomat (2.4), Hofereignisse
- A05: Wareneingang mit Paletten, Stapler, Handsortierung und Sortierer, Ausgangspuffer
- A07: Torbuch, Dock-Zuteilung, Zustelltour, Gefährdungsprognose
- A09: Hub-Modell mit 7 Stationen, fahrende Fahrzeuge (interpoliert), Labels
- A10: Kopfzeile, KPI-Karten, Standortfluss, Detailspalte, Fahrzeugliste, Statuszeile

### Welle 2 – Wirtschaft und Personal (A08, A06, A02, A04, A10 + A11)

Frachtverträge, Preise und Vertragsstrafen. GuV und Abschreibung (bisheriges Ziel 0.9). Hub-Rollen und Schichten. Ausbaustufen 1–5 und Balancing. Mehrwertdienste. Tutorial „Erstes Depot“.

### Welle 3 – Netz und Spezialverkehr (A07, A05, A09, A03, A12 + A11)

Hauptlauffahrplan zwischen Standorten. Seeimport mit Containerhof, Luftexport, Kühlkette. Sendungsverfolgung. Dispositionsassistent. Jahreszeit und Wetter. Replay der letzten 60 min.

### Welle 4 – Abnahme 1.0 (A11, A12, A02, A10, A01)

Pflicht-Fehlerfälle aus AGENTS.md. Lasttest. 60-FPS-Messung. Barrierefreiheit. Paket für GitHub Pages. Technische Freigabe. Veröffentlichung nur nach deinem Auftrag.

### Versionsvorschlag

- 0.9: Fundament + erster Hub-Kreislauf (Wellen 0–1)
- 0.10: Wirtschaft und Personal
- 0.11: Netz und Spezialverkehr
- 1.0: Gesamtabnahme

## 8. Offene Entscheidungen

1. **Fertigung**: Bleibt die bisherige Leuchtenfertigung erhalten?
   - a) Als Geschäftsfeld „Mehrwertdienste/Kontraktlogistik“ (**Vorschlag**)
   - b) Nur als alter Spielmodus
   - c) Sie entfällt. Alte Spielstände blieben trotzdem ladbar.
2. **three.js lokal mitliefern** (MIT)? Vorschlag: ja.
3. **NuriTrack-Datei**: Nach Abschluss der Analyse aus dem Repository entfernen. Grund: GitHub Pages würde die fremde Seite öffentlich ausliefern, und das widerspricht der Anonymisierung. Vorschlag: ja. Falls du den Ordner `_files` hast, kann er nur zur Ablaufanalyse gelesen werden. Code wird nicht übernommen.
4. **Versionsplan**: Hub-Umbau als 0.9 vor GuV und Abschreibung?
5. **Referenzhardware für 60 FPS**: Welches Gerät und welcher Browser?
6. **Spielname**: „Industrie & Logistik“ behalten oder neu benennen?
