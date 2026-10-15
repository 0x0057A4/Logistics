# Unabhängige QS – HTML-Spielstand, Version 0.7.1

A11 prüft den integrierten HTML-Export. Ausgeführt: `node --test tests/qa-html-save.test.js`. Ergebnis: **8 bestanden, 0 fehlgeschlagen**.

Geprüfte Übergänge:
- Export enthält exakt den serialisierten Simulationsstand einschließlich laufender Mietkosten und Einstellungen; weiterer Export ersetzt die eingebetteten Daten.
- Script-Endsequenzen und Sonderzeichen in Spielnamen bleiben passive JSON-Daten.
- Eingebetteter Stand hat Vorrang vor anderem lokalen Unternehmen; Start pausiert im Dateimodus.
- Gesperrter localStorage verhindert weder Start noch Spielbefehle.
- Einstellungen der Dateisitzung überschreiben keine vorhandenen Browser-Einstellungen. Gefundener Schreibzugriff im change-Handler wurde behoben; Regressionstest bestanden.
- Download als HTML, erneuter Start und weiterer Download erhalten den jeweiligen Stand exakt.
- Template enthält keine externen Startskripte, Stylesheet-Links oder Basis-URL; gebündeltes JavaScript ist syntaktisch gültig.
- Vollständiges gebündeltes JavaScript wurde in Node VM ausgeführt: echte Scene-Klasse mit Canvas-/DOM-Attrappen, gesperrter lokaler Speicher und gesperrter Netzwerkzugriff. Start und Export erhalten den Stand exakt. Dies prüft auch die Modulregistrierung zur Laufzeit.

Grenzen: Node VM und DOM-/Canvas-Attrappen sind kein Browser. Tatsächliche Downloadfreigabe, Öffnen über file://, Rendering und Browserdialoge bleiben ungeprüft. Der Export startet einen Download; er kann dessen Abschluss nicht bestätigen und überschreibt nicht automatisch die geöffnete Datei. Fortschritt muss erneut heruntergeladen werden.

Technisches Ergebnis: geprüfte HTML-Speicherpfade freigegeben; Browserprüfung weiterhin offen.
