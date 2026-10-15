# Übergabestand 0.9 – 15.10.2026

Spiel umgebaut zum Logistikunternehmen (Hub). Verbindlich: AGENTS.md, docs/KONZEPT-LOGISTIKHUB.md (abgenommen), docs/SCHNITTSTELLEN-0.9.md (Nutzerentscheidungen), docs/SCHNITTSTELLEN-0.9-W1.md. Deutsch, Caveman-Stil. Parallelrollen + unabhängige QS (A11).

## Stand

- Welle 0 (Fundament: WebGL, HUD, Indexe, Speichern) freigegeben (docs/QS-0.9-W0.md).
- Welle 1 (Hub-Kreislauf) integriert; Abnahme docs/QS-0.9-W1.md.
- Nutzerentscheidungen: Fertigung → später „Mehrwertdienste“; three.js lokal; NuriTrack-Dateien nur zur Ablaufanalyse, nicht veröffentlichen; 0.9 vor GuV/Abschreibung; Referenzgerät i5-1335U/16 GB/Iris Xe; Name vorerst „Industrie & Logistik“.
- Warenarten: Welle 1 nur Paket; Welle 2 Palette/Kühlware/Sperrgut + Kundensortiment/Mehrwertdienste; Welle 3 Container/Luft/Gefahrgut.

## Nächste Ziele

- Welle 2: Vertragsstrafen, Warenarten, Stapler, zweites Fahrzeug/Ausbaupakete, GuV/Abschreibung, Mehrwertdienste.
- Welle 3: Hauptläufe zwischen Standorten, Containerhof, Luft/See, Assistent, Replay, Wetter.
- 60-FPS-Messung durch Nutzer (?perf=1) auswerten.

---

# Übergabestand 0.8 – 15.10.2026

AGENTS.md, Spielkonzept, UMSETZUNGSPLAN.md und FUNKTIONSSTATUS.md bleiben verbindlich. Deutsch, knapp (Caveman). Parallelrollen und unabhängige QS gemäß AGENTS.md.

## Integriert

0.6-Rückladetouren und 0.7-Mietflotte samt Bedienung, Abrechnung, Rückgabe und Spielstandprüfung. Mietpreise je angefangenem Spieltag: Transporter 180 €, Lkw 520 €, Kühlfahrzeug 680 €. Rückgabe nur leer und frei am Heimatstandort. Historische Fahrzeugreferenzen bleiben erhalten.

Speicherfix: expliziter temporärer Betrieb, dauerhafte Nicht-gespeichert-Warnung, JSON-Import/-Export, erneute Speicherprüfung. Sichere Tab-Sperre bleibt erhalten. Browserbeschränkungen werden nicht aufgehoben. Abbruch einer Übernahme erlaubt kein Schreiben; beschädigte gespeicherte Daten werden nicht automatisch überschrieben.

Frühere Patches vollständig integriert; Originale unter archiv/integriert-0.7 aufbewahrt. Nicht erneut anwenden. Speicherformat 1 bleibt erhalten.

## Prüfung und Veröffentlichung

Siehe QS-0.8.md und TESTERGEBNIS-0.8.txt für tatsächliche Ergebnisse. Browser-/Touch-/Layoutprüfung offen; UI-Harness ersetzt keinen Browser. Root-index.html lädt dist/ über relative Basis für GitHub Pages. scripts/package.py aktualisiert Root-Einstieg und Quellpaket.

Ziel GitHub: 0x0057A4/Logistics. Bestehende Site: https://industrie-logistik.calmsiren9.chatgpt.site (Zugang privat erhalten). Veröffentlichungserfolg nur anhand Remote-Rückmeldung behaupten.

## Preview – nächste Ziele

- 0.8: Kundendiensttickets und Terminänderungen integriert; siehe QS-0.8.md.
- 0.9: Ergebnisrechnung und Abschreibung vertiefen.
- 1.0: verbleibende Konzeptfunktionen und Gesamtabnahme; kein zugesicherter Vollumfang allein durch Versionsnummer.

Nutzer autorisiert sämtliche zugehörigen Projektunterlagen/Ergebnisse auf GitHub, auch Dateiersetzung. Keine Zugangsschlüssel oder fachfremden Privatdaten aufnehmen. Vollkonzept weiterhin nicht vollständig umgesetzt.

## HTML-Speicherung 0.7.1

Nutzer hat vollständige HTML-Datei samt eingebettetem Spielstand ausdrücklich bestätigt. Funktion in Einstellungen → Spiel als HTML speichern. Offline-Datei öffnet denselben validierten Stand pausiert; Start mit 1×. Weitere Änderungen erneut herunterladen. Kein automatisches Überschreiben der Originaldatei. CSS/JS vollständig eingebettet, kein Server erforderlich. Website und GitHub bleiben mit root index.html. scripts/package.py erzeugt zusätzlich dist/portable.html. docs/QS-HTML-SPEICHERN.md dokumentiert unabhängige Prüfung; Browserprüfung bleibt offen.

## Kundendienst 0.8

Statusanfragen, Fristverlängerungen und Beschwerden im Servicefenster. Je Auftrag/Art ein Ticket; automatische Beschwerde bei Überfälligkeit. Antwortwahl startet 15/30/20 Minuten echte Servicearbeit. Schichten, Pausen und konkurrierende Retouren beachten. Verlängerung um 60–1440 Minuten, erst bei Abschluss; Kosten 2 % offenen Auftragswerts bei Antwortbeginn. Kulanz 5 % bezahlter Auftragssumme, höchstens 50 €. Kosten einmalig, fehlendes Kapital blockiert Abschluss. Überholte Terminänderungen ohne Wirkung/Kosten geschlossen. Kein Rücksetzen früheren Rufverlusts, keine rückwirkende Änderung alter Rechnungen. Antworttext dokumentiert Abschluss.

Speicherformat 1: alte Stände erhalten tickets=[]. HTML-Bundle enthält Kundendienstmodul. Adresskorrektur, individuelle Kundennachrichten und umfangreichere Kundenbeziehungen bleiben offene Konzeptteile. Nächste Entwicklung: 0.9 Ergebnisrechnung und Abschreibung. Vollständige 1.0-Konzeptabnahme weiterhin offen.
