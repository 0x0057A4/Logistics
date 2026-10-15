# Unabhängige Prüfung – Phase A

Prüferrolle: A11. Prüfung im Node-Laufzeitsystem mit echten Simulationsbefehlen. Produktionsmodule wurden durch A11 nicht verändert. Tests: `node --test tests/integration.test.js`.

## Geprüfte Abläufe

- Gleicher Seed und gleiche Befehle liefern bei Sammelschritten und einzelnen Minuten identische Zustände.
- Zwei Materialbestellungen kommen getrennt an und werden vollständig eingelagert.
- Einkauf → Annahme → Montage → Prüfung → Verpackung verbraucht passende Materialien und erhält Chargenherkunft.
- Zwei Maschinen können letzte Komponenten nicht doppelt verbrauchen.
- Bestände und Reservierungen bleiben nichtnegativ; Geld entspricht Anfangskapital plus eindeutigen Buchungen.
- Speichern/Laden während Fertigung, Pause, Wartung, Beladung und Fahrt erhält Zustände und Fortsetzung.
- Teilzustellung erhält Restauftrag und erzeugt zeitversetzte, einmalige Zahlung.
- Startauftrag wird vollständig produziert, geliefert und bezahlt.
- Prognose verändert Ausgangszustand nicht.
- Überschneidungen und Bebauung des Eingangstors werden abgelehnt.
- Fehlerhafte JSON-Daten, unbekannte Speicherformate, beschädigte Werte und Fahrzeugtypen sowie ungültige Bestellmengen werden abgelehnt.

## Befunde und Ergebnis

Lauf vom 13.10.2026: Erste 10 Prüfungen bestanden. Zusätzliche Wartungsprüfung deckte Fehler auf: Wartungsauftrag besitzt bewusst kein Fertigungsrezept, Spielstandprüfung lehnte ihn trotzdem ab. Kernagent hat Fehler korrigiert; anschließende Wartungsprüfung bestanden.

Zusätzlicher Importbefund: Unbekannter Fahrzeugtyp wurde angenommen. Kernagent hat Importprüfung korrigiert. Unabhängiger Wiederholungslauf: **13 Tests bestanden, 0 fehlgeschlagen, 0 übersprungen**. Laufzeit im Prüfcontainer rund 212 ms; dies ist keine Browser-Performancekennzahl.

## Aussagegrenzen

Diese Prüfung bestätigt den fachlichen Kern der ersten Ausbaustufe. Sie bestätigt keine vollständige Umsetzung des Gesamtkonzepts. Browserbedienung, Grafik, mobile Darstellung, Barrierefreiheit, längere Wirtschaftsbalance, große Standortnetze, Retouren, Zoll, Kühlketten und Spezialfracht sind hier nicht geprüft. Keine Aussage zur Vollständigkeit aller feindlich manipulierten Importkombinationen.

Räumliche Prüfung umfasst bisher Überschneidung und Eingangssperre. Eine komplexe Halle mit nachträglich abgeschnittenen Einzelstationen ist noch kein eigener automatisierter Testfall. Fahrerwechsel, vollständige Schichtübergänge und Langzeitermüdung sind nicht durch diesen ersten Testsatz abgedeckt.

## Phase B – Wiederholungsprüfung

Zusätzlich unabhängig geprüft: Labor- und Personalvoraussetzungen, zeitabhängige Forschung und Laborpause, Nachbestellregeln mit Sperrfrist und kumulativem Budget, Retourenabholung bis einmaliger Erstattung und Ersatzteilreparatur, Speichern laufender Retouren und Reparaturen sowie Kreditaufnahme ohne falschen Umsatzausweis. Wartungsprüfung verwendet nun Werkstatt, Ersatzteil und Technikperson.

Ergebnis: **17 Integrationstests plus 2 UI-Smokes bestanden**. UI-Smokes starten `app.js` isoliert mit minimalen DOM-/Canvas-Stubs, rendern 17 Fachfenster und prüfen Aufbauassistent, Formularbestellung und Speicherung mit echten Fachbefehlen. Keine DOM-Bibliothek vorhanden; keine installiert. Diese Prüfung beweist weder Browserkompatibilität noch Layout, Canvas-Ausgabe, Tastaturbedienung oder mobile Nutzbarkeit.

Statisch gemeldet: Oberfläche bezeichnete kumulatives Regelbudget als Budget je Bestellung und las `reason` statt `lastReason`. Projektleitung übernimmt UI-Korrektur. Phasenstand C wird gesondert geprüft.

## Phase C – Standortnetz und Eigentum

Vier zusätzliche unabhängige Integrationsprüfungen bestanden:

1. Physischer Standorttransfer; Zielhalle mit 40 Kartons voll. Acht Gehäuse verbleiben während blockierter Entladung im Fahrzeug. Regalbau ermöglicht anschließende vollständige Einlagerung. Kein Konzernumsatz entsteht. Speichern/Laden während Beladung, Fahrt, blockierter Entladung und nach Abschluss bleibt identisch.
2. Fremdlogistik erhält Eigentum des Kunden; Kundenware kann nicht für eigenen Herstellauftrag verkauft werden. Abrechnung nur zum Dienstleistungsentgelt.
3. Kontrollierte Lager-Fixture mit fremden Gehäusen und Platinen: Eigenfertigung verbraucht keinen Kundenbestand.
4. Kontrollierte Fertigwaren-Fixture: 17 Profilleuchten passen räumlich in Lieferwagen, überschreiten aber mit 85 die 80 Gewichtspunkte. Auftrag wird ohne Reservierungsreste abgelehnt; 16 Stück akzeptiert.

Gesamter Testlauf `node --test tests/*.test.js`: **68 bestanden, 0 fehlgeschlagen, 0 übersprungen**. Darin enthalten sind Entwicklerprüfungen und unabhängige A11-Prüfungen; Anzahl ist keine Aussage über vollständige Konzeptumsetzung.

## Begrenzte Wirtschafts- und Laufzeitprüfung

Reproduzierbar mit `node tests/balance-performance.mjs`. Seed 77; 480 Spielminuten; pro Halle eine Montage, Prüfung, Packstation, Rampe, Regal, fünf Beschäftigte und ein Lieferwagen. Einkauf jeweils 40 Gehäuse, Platinen und Kartons. Bestehende Herstellaufträge angenommen; Lieferungen bis acht Stück gebündelt, Tagesende kleinere Restmengen freigegeben.

Einstandortbetrieb nach acht Stunden: 40 Fertigprodukte erzeugt, 38 zugestellt, 3.220 € tatsächlich bezahlt, 1.250 € offene Forderungen. Materialeinkauf 1.800 €, laufende Personalkosten 771,19 €, Energie 25,60 €, Miete 6,40 €, Fahrten 54 €. **Operativer Zahlungsmittelüberschuss 562,81 €**, vor einmaliger Investition/Einstellung, ohne Abschreibung und einschließlich sämtlicher beschaffter Materialien. Verbleibende Forderungen und Lagerbestände erhöhen diesen Kassenwert nicht. Startbudget 85.000 € endet nach Investitionen bei 56.062,81 €.

Bewertung: Dieser konkrete erste Schichtablauf erwirtschaftet positiven operativen Cashflow. Keine Behauptung einer langfristig ausgeglichenen Wirtschaft. Mietkosten sind bewusst niedrige Spielwerte. Investitionsamortisation, Ausfälle, mehrere Schichten und spätere Produktfamilien wurden nicht wirtschaftlich optimiert.

| Last | Anlagen / Beschäftigte | 480 Minutenschritte | Serialisieren | Laden / Validieren | JSON-Größe |
|---|---:|---:|---:|---:|---:|
| 1 Standort | 5 / 5 | 17,3 ms | 0,3 ms | 4,1 ms | 61.121 Byte |
| 5 Standorte | 25 / 25 | 55,3 ms | 1,8 ms | 6,3 ms | 246.204 Byte |

Einmalige Node-Messung im Prüfcontainer, ohne Browser, Rendering oder statistische Wiederholungen. Fünf-Standort-Szenario belastet Produktion und Speicher; Verkaufsaufträge liegen nur am ersten Standort. Sein negativer Cashflow ist deshalb kein vergleichbarer Balancenachweis. Keine Aussage über Monate Spielzeit oder große Unternehmensnetze.

## Finale Erweiterungsprüfung – Sammeltouren und Phase D

Abschließender Gesamtlauf vom 13.10.2026: **99 Tests bestanden, 0 fehlgeschlagen, 0 übersprungen**. Befehl: `node --test tests/*.test.js`; Node-Gesamtlauf rund 418 ms. Nach Umstellung des Frachtstornos auf Bestätigungsdialog wurde der UI-Test an den tatsächlichen Bedienablauf angepasst und der Gesamtlauf wiederholt.

Unabhängige Prüfungen ergänzen die Entwicklerprüfungen:

- Sammeltour mit zwei Kunden: getrennte Mengen, Forderungen und einmalige Zahlungen; Speichern während Beladung und Fahrt; Vorschau bleibt ohne Wirkung auf Ursprung.
- Retoure nach Sammeltour: tatsächlicher Zustellnachweis und korrekte Erstattung. Ursprünglich fehlende Quellenverknüpfung wurde an Lagerentwicklung gemeldet, behoben und erneut geprüft.
- Temperaturware startet bei 4 °C. Ohne Kühlung steigt Temperatur pro Minute; bis 8 °C kein Qualitätsverlust, darüber zeitabhängiger Schaden. Nachträgliches Kühllager senkt Temperatur, heilt aber keine Qualität und hebt Schadenssperre nicht auf.
- Ungekühlter Lieferwagen lehnt Temperaturware ab; geeignetes Kühlfahrzeug hält tatsächliche Ladung bei 4 °C.
- Bahnauftrag mit fremder Ware: fehlendes Servicepersonal stoppt Dokumentprüfung. Fehlende Freigabe verursacht verpassten Anschluss. Nach Einstellung benötigt Prüfung zehn Minuten. Ladung behält fremdes Eigentum, Zahlung erfolgt einmalig nach Zustellung.
- Kopieren, Speichern und Vorschau prüfen jeweils den vollständigen Zustand einschließlich Touren, Retouren, Frachten, Temperaturprotokollen und Zahlungen.
- UI-Smokes prüfen jetzt 18 Fachfenster, Suchbegriffe gegen numerische und verschachtelte Daten sowie Formularübergabe für Versand-/Wartungsregeln, Spezialfracht, Dokumentprüfung und Stornierung. Keine unbekannten Befehle in diesen geprüften Übergaben.

## Grenzen gegenüber Gesamtkonzept

Der Stand ist eine zusammenhängende, spielbare Simulation mit mehreren Ausbausystemen. **Das umfangreiche Konzept ist nicht vollständig umgesetzt.** Insbesondere bleiben folgende Erweiterungen offen oder vereinfacht:

| Konzeptbereich | Tatsächliche Grenze |
|---|---|
| Welt und Darstellung | Canvas-Isometrie, kein echter Three.js-/WebGL-3D-Raum. Kein unabhängiger Browser-, Touch-, Layout- oder visueller Animationstest. |
| Innerbetrieblicher Transport | Personalzuweisung und Bereitstellzeiten; keine vollständig simulierten Stapler, Handwagen, Förderbandnetze, Roboter oder kollidierenden Fahrzeugwege. |
| Produktentwicklung | Vorgegebene Rezeptfamilien und Forschungsfreischaltungen; kein freier Konstruktionseditor oder vollständige auftragsindividuelle Produktionspolitik. |
| Lager | Chargen, Eigentum, Reservierungen, Quarantäne und Gesamtkapazitäten; keine vollständig individuell bewirtschafteten Regalplätze, Lagerstrategien, Leergutkreisläufe oder Staplerladeplanung. |
| Gelände und Verkehr | Rasterbau und Zugangskontrolle; keine frei modellierbaren Straßennetze, Wände, Rangierflächen, Stellplätze oder realer Verkehr. |
| Personal | Rollen, Schichten, Müdigkeit, Schulung und Versetzung; kein vollständiges Zufriedenheits-, Bewerber-, Vertretungs- und Abteilungsmodell. |
| Markt und Konzernausbau | Generierte Auftragsangebote; keine vollständige Konkurrenzwirtschaft, Unternehmensübernahmen, Händlernetze oder dynamische makroökonomische Preisbildung. |
| Speziallogistik | Zeit-/Temperaturmodell und generische Dokumentprüfung; keine tiefe Gefahrgutklassifizierung, spezifischen Schulungen oder detaillierten Hafen-/Flughafenbetriebe. |
| Finanzierung und Ergebnis | Zahlungsjournal, Kredite, Warenwerte und direkte Lieferbeiträge; keine vollständige Bilanz, Abschreibungen oder verursachungsgerechte Verteilung aller Gemeinkosten. |
| Energie | Begrenzte Leistung und Kosten; keine Solaranlagen-/Speicher-/Ladeinfrastruktur-Simulation. |
| Oberfläche | Kompaktes HUD und Fachfenster; keine vollständige individuelle Dashboardgestaltung, komplexe gespeicherte Tabellenansichten oder umfassende Barrierefreiheitsabnahme. |
| Langzeitbetrieb | Begrenzter Achtstunden-Test; keine Belastungsprüfung über Monate Spielzeit und keine umfassende Szenarien-/Schwierigkeitsbalance. |

Automatisierte grüne Tests ersetzen weder diese fehlenden Systeme noch eine echte Browserabnahme. Veröffentlichung bedeutet daher keine vollständige Abnahme sämtlicher Anforderungen des Masterprompts.

## Version 0.5 – Speicherung und Unternehmensrechnung

14.10.2026. Fachagenten A08 und A12 arbeiteten in getrennten Git-Arbeitskopien. Projektleitung integrierte Oberfläche; A11 prüfte unabhängig. Ausgangslauf: 99/99. Abschließender Gesamtlauf `node --test tests/*.test.js`: **119 bestanden, 0 fehlgeschlagen, 0 übersprungen**.

Neue Nachweise: fünf fachliche Rechnungsprüfungen; neun Schreibschutzprüfungen; sechs unabhängige UI-Regressionen. Letztere prüfen Modusimport samt Darstellungspräferenz, Neustart nach Versetzen, zwei konkurrierende Tabs mit anschließender Übernahme des neuesten Stands, getrennte Moduswechsel, Sicherungswiederherstellung und blockierten Import in einen belegten Modus. Zwei anfänglich rote Regressionen wurden nach Korrektur grün.

Speicherformat unverändert. Neue Auswertung verändert keine Spielwerte. Web Locks und Storage werden in Node kontrolliert ersetzt; keine Behauptung einer Prüfung echter Browser-Sperren. UI-Harness prüft Befehle und Rendering-Aufrufe, keine Pixel oder Touch-Ereignisse.

Browserprüfung bleibt blockiert: Managed-Sites-Anweisung erlaubt Browser-QA nur mit control-browser-Skill. Dieser Skill ist in der Arbeitsumgebung nicht verfügbar; deshalb kein Ersatzbrowser und kein Preview-Server gestartet. Vollständige Konzeptabnahme weiterhin offen; siehe FUNKTIONSSTATUS.md.

## Version 0.6 – GitHub-Übergabe 14.10.2026

Integrierter Stand erneut mit `node --test tests/*.test.js` geprüft: **137 bestanden, null fehlgeschlagen**. Rohprotokoll TESTERGEBNIS-0.6.txt. Enthält unabhängige Regressionstests für doppelte Abholung durch Import, Quellenbindung, Reihenfolge/Kapazität, Quarantäneblockade, Phasenspeicherung und Kühlfahrzeuge. Finale unabhängige Gesamtfreigabe noch offen. Browserprüfung weiterhin offen. 0.7-/Speicherpatches sind nicht Teil dieses 137-Test-Laufs.

## Version 0.7 – Abschlussprüfung 14.10.2026

161 Tests bestanden, 0 fehlgeschlagen. Unabhängige QS der Miet-Rückladetouren, Tagesgrenzen, Spielstandreferenzen und Speicher-Wiederaufnahme: siehe QS-0.7.md. JSON enthält keine Laufzeitsperre. Browser-/Touch-/Layoutprüfung weiterhin offen.

## 0.7.1 – HTML-Speicherung
15.10.2026: 171 Tests bestanden, null fehlgeschlagen. Acht unabhängige HTML-Prüfungen inklusive tatsächlicher Ausführung des vollständigen Bundles mit echter Scene und DOM-/Canvas-Stubs. Netzwerk und lokaler Speicher dabei verboten. Browserprüfung bleibt offen. Details: QS-HTML-SPEICHERN.md.
