# Änderungen

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
