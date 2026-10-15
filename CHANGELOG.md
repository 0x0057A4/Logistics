# Änderungen

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
