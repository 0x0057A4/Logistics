# Unabhängige QS 0.7

Stand: 14. Oktober 2026. Rolle A11, eigener Worktree. Grundlage: 22b7e55.

## Geprüfter Ablauf

- Miettransporter führt zwei Kundentouren durch. Zweite Tour nimmt Rückladungen auf. Rückgabe wird während Beladung, Fahrt, Zustellung, Abholung, Rückfahrt und Rückentladung abgelehnt.
- Volles Quarantänelager hält Rückladung im Fahrzeug. Mietvertrag bleibt aktiv. Speichern/Laden erhält diesen Zustand. Freier Lagerplatz ermöglicht Entladung; anschließend lässt sich Fahrzeug zurückgeben. Zwei Retouren erzeugen genau zwei Erstattungen.
- Zeitversetzt gemietete Fahrzeuge behalten ihre individuellen Tagesgrenzen über Speichern/Laden. Je Grenze genau eine Mietbuchung. Rückgabe beendet weitere Gebühren dieses Vertrags.
- Zusätzliche Mietreferenz an fremdem Fahrzeug wird beim Import abgewiesen (bidirektionale Zuordnung).
- Alter Stand ohne Mietfeld kann neue Miete aufnehmen, verlängern, speichern/laden und zurückgeben.

## Ergebnis

`npm test`: **152 Tests bestanden, 0 fehlgeschlagen**, darunter vier neue unabhängige Integrationsprüfungen in `tests/qa-rental.test.js`.

Fachliche Freigabe der geprüften Mietintegration und ihres Zusammenspiels mit 0.6-Rückladungen. Keine offenen fachlichen Fehler in diesen Abläufen festgestellt. Mietpreise sind fiktive Spielwerte; quantitative Langzeitbalancierung nicht Bestandteil dieser Prüfung.

Browser-, Touch- und visuelle Prüfung bleiben offen: vorgeschriebener `control-browser`-Skill nicht verfügbar. Node-UI-Harness ist kein Ersatz für eine Browserabnahme. Speicherfix wird gesondert nach Integration geprüft. Gesamtspiel und vollständiges Konzept sind damit nicht abgenommen.

## Nachprüfung Speicherzugriff

Speicherfix aus f6b97c9, 3436ac5 und 7310dbc unabhängig integriert und gelesen.

- Ungesicherter Zustand plus „Speicher erneut prüfen“: synchroner Autosave-/Speicherpfad bleibt vor Zustimmung gesperrt. Dialogschließen ohne Zustimmung aktiviert weder Schreiben noch Simulationsgeschwindigkeit. Erneute Prüfung mit ausdrücklicher Zustimmung speichert exakt eigenen Stand.
- Temporäres Spiel in zweitem Tab verändert vorhandenen Speicher nicht. JSON enthält weder `writable` noch `temporary`. Nach Freigabe des ersten Tabs lässt sich dieses JSON in frischer Sitzung importieren und normal speichern. Schreibsperre ist Laufzeitschutz, keine Eigenschaft der JSON-Datei.
- Vorhandene Regressionen prüfen zusätzlich konkurrierende Tab-Übernahme, gesperrten Storage-Getter, vollen Speicher, beschädigtes JSON und abgelehnten Import.

Abschließendes `npm test`: **161 Tests bestanden, 0 fehlgeschlagen**, inklusive zwei neuer unabhängiger Speicherprüfungen in `tests/qa-storage.test.js`.

Fachliche Freigabe auch für Speicherfix. Tatsächliche Browserbeschränkungen werden nicht aufgehoben: bei blockiertem lokalem Speicher ist temporäres Spielen ausdrücklich zu wählen, Fortschritt muss als JSON exportiert werden. Eine echte Mehrfach-Tab-Sperre bleibt absichtlich wirksam. Browser-/Touch-Abnahme weiterhin offen.
