# Änderungen

## 0.16 – 18.10.2026 · Betrieb: Wetter, Störungen, Personalrollen, Kundendienst (Entwicklungsfassung)

- Wetter je Standort und Tag (klar, Regen, Nebel, Schnee, Sturm) ab Spieltag 2: längere Fahrten, verspätete Fremd-Lkw (Fristen bleiben).
- Störungen: Stau (Gebiet/Linie), Torstörung (Torkontrolle steht), Netzstörung 30–120 Min. (ohne Energieversorgung stehen Fertigung und Sortierung, Kühlung hat Vorrang). Fenster „Wetter & Störungen“, Glocke, Schalter in den Einstellungen.
- Personalrollen Staplerfahrer und Torposten: 25 % schneller in ihrer Tätigkeit, Lagerkraft springt ein.
- Kundendienst: automatische Anliegen (Verspätung, drohende Verspätung, Teillieferung, Störungsverzug) mit Antwortfrist; Zufriedenheit je Versender wirkt auf neue Angebote (bis ±12 %).
- Linienwarnung bei Ankunft nach Schichtende (QS-W3-02); Warenangebote zeigen Kühlplätze bzw. Sperrgut-Kapazität.
- 3D: Regen, Schnee, Nebel, Sturm, Störungsmarker, Westenfarben der neuen Rollen.
- Fixes aus 0.15: Kühlung zuerst bei Strommangel (QS-015-01), Rückgabe Kundenmaterial bei Storno Lohnfertigung (QS-015-03).
- Balancing: Sortierplatz 300 Pakete/h für 10.000 €; Details docs/BALANCING-0.16.md. Unabhängige Prüfung: docs/QS-0.16.md.

## 0.15 – 18.10.2026 · Wirtschaft, neue Warenarten, Mega-Hub, Grafikqualität (Entwicklungsfassung)

- Unternehmensrechnung mit Tab „GuV & Anlagen“: Ergebnisrechnung (Umsatz, Kostenarten, EBITDA, Abschreibung, EBIT, Ergebnis) mit Abstimmung zum Geldfluss; lineare Abschreibung (Gebäude 180, Fahrzeuge 90 Spieltage), Anlagenspiegel, Abgänge bei Abriss.
- Neue Warenarten als Verträge: Kühlpaket (Kühllager und Kühlfahrzeug nötig, Zuschlag 7,50 €/Paket, Temperaturschaden) und Sperrgut (Stapler, nie Sortierung, Lieferwagen max. 3 Stück).
- Quergurtsorter (60.000 €, Forschung Mega-Hub 12.000 €): 2.400 Pakete/h mit 2 Kräften, jedes 100. Paket Fehlwurf zur Handnachsortierung.
- Mehrwertdienste (Lohnfertigung): Kunden liefern Material, Vergütung 35 % des Produktwerts je Stück; nie Vermischung mit eigenem Material.
- Grafikqualität Automatisch/Niedrig/Mittel/Hoch (Einstellungen → Darstellung), Detailstufen nach Kameraabstand, feste Budgets (≤ 150 Draw Calls).
- 3D: Quergurtsorter mit umlaufenden Wagen, Kühlboxen, Sperrgut, Kühlauflieger und Pritschen-Lkw.
- Fremd-Lkw ohne Lagerplatz gibt das Dock nach 5 Min. frei, wenn ein eigenes Fahrzeug wartet (Fix B-0.15-1, vorher Dauerblockade).
- Balancing: docs/BALANCING-0.15.md. Unabhängige Prüfung: docs/QS-0.15.md.

## 0.14 – 17.10.2026 · Luftexport, Dispositionsassistent, Replay (Entwicklungsfassung)

- Luftexport zum fiktiven Frachtterminal Heidmoor: Verträge mit Flugplan und Annahmeschluss (11–14 €/Paket), eigener Zubringer (Fenster „Luftexport“, Taste X), Übergabe = Zustellung mit sofortiger Zahlung; verpasster Annahmeschluss → nächster Flug, Strafe höchstens einmal je Auftrag.
- Dispositionsassistent je Standort (Taste J, Schalter in der Kopfzeile): Zustellung, Linien, Tor, Luftzubringer – nur reguläre Befehle, Tagesbudget, Protokoll mit Begründung.
- Replay der letzten 60 Spielminuten (Taste Z): nur Ansicht, Befehle gesperrt, Speichern sichert Live-Stand; teure Aufnahmen werden automatisch seltener (60-FPS-Schutz).
- 3D: Luftzubringer am Standort, Frachtterminal in der Netzansicht, startendes Flugzeug.
- Unabhängige Prüfung docs/QS-0.14.md: Fix QS-W3c-01 (keine Doppelstrafe Flug/Vertragsende), QS-W3c-02 (Assistent-Budget mit echter Terminal-Distanz).

## 0.13 – 17.10.2026 · Containerhof und Seeimport (Entwicklungsfassung)

- Seeimport-Verträge (ab Containerhof oder Tag 5): 1–3 Container je Ankunft mit 18–22 Paletten oder 500–700 Paketen; Handling 250–450 € je Container zusätzlich zum Inhalt; 24 Std. Freizeit, danach 12 €/Std. Lagergeld je Container.
- Containerhof (4×3, 8 TEU, 40-Fuß = 2 TEU): Chassis stellt ab, Umfuhr zum Dock, Entladen mit Stapler (Paletten) bzw. Lagerkraft (Pakete), Leerabholung nach 2–4 Std.; Pakete laufen in Sortierung und Linienverkehr.
- Fenster „Containerhof“ (Taste C), Vertragskarten Container, Torbuch-Phasen, Station und Meldungen (Hof voll, Lagergeld, Freizeit endet).
- 3D: Containerhof mit gestapelten Containern, Chassis, Umfuhr; Lagergeld-Container rot markiert.
- Unabhängige Prüfung: docs/QS-0.13.md; Fix QS-W3b-01 (Wartegrund „Dock außer Betrieb“).

## 0.12 – 17.10.2026 · Linienverkehr zwischen eigenen Standorten (Entwicklungsfassung)

- Zustellgebiete gehören Standorten; ab 2 Standorten Verträge mit Gebieten anderer Hubs (Zuschlag 0,60 €+0,012 €/km je Paket, Frist +180 Min+2 Min/km).
- Linien mit Fahrplan, Lkw und Ladeschluss: Reservierung nach Frist, Beladen/Entladen mit Dock, Lagerkraft (+Stapler), Fahrt, Ankunft in den Wareneingang des Ziel-Hubs, dort Sortierung; Zustellung nur am zuständigen Standort.
- Fenster „Linien“ (Taste N), Paketreise in der Auftragsakte, Station „Hauptlauf“, Meldungen (Hauptlauf fehlt, Abfahrt verpasst, Verzug).
- 3D: Linien-Lkw am Dock und auf der Zufahrt; Netzansicht mit Linien, Richtungspfeilen, fahrenden Markern, Verfolgen.
- Fix QS-W3-01: Linienfahrt bei vollem Ziellager hält keine Lagerkraft/Stapler mehr. Unabhängige Prüfung: docs/QS-0.12.md.
- Bekannt (QS-W3-02): späte Abfahrten können nach Schichtende am Ziel ankommen; Entladen dann erst am Folgetag – Fahrplan entsprechend wählen.

## 0.11 – 17.10.2026 · Leitstand-Design (Entwicklungsfassung)

- Neues Design auf eigenen Gestaltungswerten (hell/dunkel, Abstände, Schatten, Typografie) nach NuriTrack-Vorbild, ohne übernommenes CSS; eigenes Linien-Icon-Set; Kennzahlen-Raster in der Objektakte.
- Befehlspalette im Suchfeld „/“ (z. B. „Vertrag annehmen“, „Tempo 12×“, „Bauen: Laderampe“, „Zum Dock 2“); „>“ zeigt nur Befehle.
- Tastenkürzel: Leertaste, 1–4, B, R, Esc/Rechtsklick, H, V, L, P, F (verfolgen), T (Rundgang), Q/E (drehen), +/−, Pos1, ? (Übersicht).
- 3D: Tagesverlauf nach Spielzeit, Nachtbeleuchtung (Hofmasten, Dockleuchten, Hallenlicht), Kamerarundgang, Verfolgen-Kamera, Label-Chips; Farbschema Tag/Nacht/Automatisch in den Einstellungen.

## 0.10 – 17.10.2026 · Vertragsstrafen, Paletten, Stapler (Entwicklungsfassung)

- Vertragsstrafen: verspätete Einheiten (2,50 €/Paket, 25 €/Palette) und bei Vertragsende liegengebliebene (8 €/60 €, Ware zurück an Versender) – je genau einmal gebucht.
- Palettenverträge (110–140 €/Palette): Staplerplatz mit Akku (lädt unter 10 % bis 30 %), Entladen/Beladen nur mit Stapler + Lagerkraft, direkt ins Regal, Zustellung per Lkw (20 Paletten je Fahrt).
- 3D: Stapler pendelt zwischen Dock und Regal, Paletten-Lkw mit Pritsche, Palettenstapel.
- UI: Strafsätze und angefallene Strafen, Stapler-Akku, neue Wartegründe und Meldungen; Einstieg zeigt Fertigung erst bei Bedarf, Baumenü Hub zuerst.
- Rechtsklick bricht ab wie Esc (Bau, Fenster, Auswahl); Browsermenü nur in Eingabefeldern.
- Fixes aus unabhängiger Abnahme 0.9 (docs/QS-0.9-W1.md): verwaiste Dockbelegung, Weiterlaufen nach Migration, Dockwechsel bei abgeschaltetem Dock, Startangebot nach Übernahme.
- Fix QS-W2-01: blockierte Abfahrt (Kasse/Ladung) hält weder Stapler noch Lagerkraft, kein Akkuverbrauch beim Warten (Lieferung und Sammeltour). Unabhängige Kurzprüfung: docs/QS-0.10.md.
- Balancing: docs/BALANCING-0.10-W2.md.

## 0.9 – 15.10.2026 · Hub-Umbau (Entwicklungsfassung)

Spiel wird eigenes Logistikunternehmen. Grundlage: abgenommenes `docs/KONZEPT-LOGISTIKHUB.md`, Schnittstellen `docs/SCHNITTSTELLEN-0.9*.md`.

- 3D-Spielwelt mit WebGL (three.js r170 lokal, kein CDN); ohne WebGL 2D-Rückfall. Fremd-Lkw mit Torkontrolle, Warteschlange, Rückwärts-Andocken, Labels.
- Erster Hub-Kreislauf: Frachtvertrag → Lkw am Tor → Dock → Entladen → Sortieren (Sortierplatz oder von Hand) → Zustellung → Zahlung. Pakete bleiben Eigentum des Versenders.
- Leitstand-HUD: Suche „/“, Kennzahlen, Standortfluss, Meldungsglocke, Fahrzeugleiste; Fenster „Verträge“ und „Hof & Docks“.
- Personal: Torkontrolle braucht Lagerkraft; Entladetempo nach Erfahrung/Müdigkeit; Entladen und Beladen vor Sortieren.
- Geführter Einstieg als Depot; Startbetrieb ca. 14.500 €; Paketpreise 7–8,50 €; Amortisation guter Betrieb ca. 6–7 Spieltage (Simulation, docs/BALANCING-0.9-W1.md).
- Versandmenge nach echter Fahrzeugkapazität (Lieferwagen ≈ 160 Pakete); externe Fahrzeugwartung.
- Speichern in IndexedDB (vorher ~2,7 MB Grenze), Übernahme alter Stände, eigener Platz für vorheriges Unternehmen; kein Speicher-Ruckler mehr.
- Fix: Tab-Sperre warf im echten Browser „Illegal invocation“ – 0.8 konnte dort nicht dauerhaft speichern.
- Leistung: Simulationsindexe (lange Stände ~80× schneller), HUD 4 Hz, Messanzeige `?perf=1` (docs/MESSUNG-60FPS.md).
- Erstmals echte Browserprüfungen (Chromium headless, Software-Rendering). 60-FPS-Nachweis auf Referenzgerät (i5-1335U, Iris Xe) steht aus.

Fertigung bleibt ladbar, wird später Geschäftsfeld „Mehrwertdienste“. Speicherformat weiter Schema 1, keine Migration nötig.

## 0.8 – 15.10.2026

Kundendiensttickets für Lieferstatus, Terminänderung und Beschwerden. Bearbeitung belegt Kundendienstpersonal mit Schichten und Pausen. Einmalige Terminverlängerung greift erst nach Bearbeitung; Kosten und Kulanz eindeutig gebucht. Automatische Beschwerde bei überfälligem aktivem Auftrag. Ticketverlauf, Wartegründe und kostenpflichtige Bestätigung in Serviceoberfläche. HTML-Speicherung und bisherige Retouren bleiben erhalten. Adresskorrektur und individuelle Kundennachrichten weiterhin offen.

## 0.7.1 – 15.10.2026

Eigenständiger HTML-Download mit Spiel und Spielstand. CSS und Spielmodule vollständig eingebettet. Öffnen setzt eingebetteten Stand pausiert fort; lokaler Browserspeicher wird im Dateimodus nicht verändert. Erneuter HTML-Download sichert weitere Fortschritte. JSON-Daten gegen Script-Injection maskiert. Versionsanzeigen vereinheitlicht. Browserabnahme weiterhin offen.

## 0.7 – 14.10.2026

Mietfahrzeuge mit laufenden Tageskosten und sicherer Rückgabe integriert. Mietverträge bleiben gespeichert; doppelte Fahrzeugzuordnung beim Import abgewiesen. Rückladungen und Fahrerprognose aus 0.6 enthalten. Speicherfehler werden abgefangen; expliziter temporärer Betrieb, JSON-Export/Import und Speicher-Retry ergänzen den regulären Tab-Schreibschutz. Browserabnahme bleibt offen.

## 0.6 – Arbeitsstand 14.10.2026, nicht veröffentlicht

Rückladungen auf Sammeltouren, vier bedienbare Stopps, reine Tourvorschau, mengengetreue Quarantäneentladung und erweiterte Importprüfung. Kühlladung im ungeeigneten Fahrzeug abgewiesen. Rückgabequellen gegen parallele Einzelabholung gesperrt. UI zeigt tatsächliche Ladung, Kosten und Wartegründe.

Speicherformat 1 bleibt erhalten. Browserprüfung weiterhin offen. Keine vollständige Konzeptabnahme.

## 0.5 – 14.10.2026

Unternehmensrechnung um getrennte Geldflussbereiche, Forderungen aller Transportwege, gebundenes Kapital und Verpflichtungen erweitert. Reine Auswertung; Speicherformat und Simulationsregeln erhalten.

Exklusive Tab-Schreibrechte pro Modus mit Web Locks; pausierter Lesezugriff ohne Schreibrecht. Gespeicherte Modi gezielt ladbar. Neustart bestätigt vorhandenen Speicherplatz. Import hält aktive Moduspräferenz korrekt; Import, Sicherung und Neustart löschen veraltete Bauauswahl. Beschädigter Hauptstand ersetzt keine intakte Sicherung.

Browserprüfung weiterhin offen: Vorgeschriebener control-browser-Skill in Arbeitsumgebung nicht verfügbar. Weiterhin keine vollständige Konzeptabnahme.

## 0.4 – 13.10.2026

Erste bereitstellbare Entwicklungsfassung. Leere Halle, Aufbauassistent, drei Fertigungsfamilien, Personal, tatsächliche Lieferkette, Materialherkunft, acht Standorte, Fremdlogistik, Sammeltouren, Rückläufe, Forschung, Regeln, Kühlkette, externe Bahn/See/Luft, Terminaldokumente, Geldjournal, Kredit, isolierte Planung und lokale Spielstände.

Behobene Befunde: Wartungsspielstände wurden zuvor abgelehnt; unbekannter Fahrzeugtyp beim Import zugelassen; Nullkosten speicherten -0; diagonal freier Eckpunkt wurde als Zugang gewertet; Rückläufe nach Sammeltour wurden nicht erkannt; UI-Suche scheiterte bei Zahlen; Regelbudget war falsch beschriftet; Frachtabfahrt las falsches Feld. Spezifische Wiederholungsprüfungen begleiten Korrekturen.

Abschlussstatus und ausstehende Konzeptfunktionen: docs/FUNKTIONSSTATUS.md. Tests und Messungen: docs/PRUEFUNG.md. Kein Anspruch einer vollständigen Konzernspiel- oder Browserabnahme.
