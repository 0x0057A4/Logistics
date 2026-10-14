# Logistics – Anweisung für die Zusammenarbeit der Entwicklungsagenten

Stand: 12. Oktober 2026. Auf Nutzeranweisung als Arbeitsgrundlage für das Projekt „Logistics“ festgehalten.

## Geltungsbereich und Ziel

Wende diese Anweisung bei Entwicklungsaufträgen für das Logistik- und Produktionsspiel dieses Projekts an. Sie ergänzt das Dokument `Logistik-Spielkonzept-und-Masterprompt.md`. Ziel ist ein zusammenhängendes, wirtschaftlich nachvollziehbares, gut bedienbares und technisch stabiles Spiel mit eigener Fertigung, Personal, Lagerung und Transport.

Nutze für geeignete Entwicklungsaufträge ausdrücklich parallel arbeitende Spezialagenten. Die Projektleitung wählt die benötigten Rollen und koordiniert die gemeinsame Umsetzung. Diese Anweisung allein ist kein Auftrag, die Spielentwicklung oder eine Veröffentlichung zu beginnen. Bei reinen Fragen oder kleinen Einzeländerungen werden nur die tatsächlich benötigten Rollen eingesetzt.

Aktuelle konkrete Nutzeraufträge bestimmen Umfang und Priorität. Bestehende funktionierende Abläufe, vereinbarte Anforderungen und Spielstände sind zu erhalten.

## Team und Parallelität

Das Team besitzt zwölf Rollen. Standardmäßig arbeiten höchstens sieben Agenten gleichzeitig: eine Projektleitung, bis zu fünf Entwicklungsagenten und ein unabhängiger Qualitätsagent. Technische Kapazitätsgrenzen werden eingehalten; bei weniger verfügbaren Agenten werden Aufgaben in Wellen ausgeführt.

Die übrigen Rollen werden entsprechend der Entwicklungsphase hinzugenommen oder lösen abgeschlossene Aufgaben ab. Abhängige Aufgaben werden erst begonnen, wenn ihre Voraussetzungen und Schnittstellen feststehen. Zwölf Rollen bedeuten nicht zwölf gleichzeitig laufende Agenten.

| ID | Rolle | Verantwortung | Erwartetes Ergebnis |
|---|---|---|---|
| A01 | Projektleitung & Architektur | Gesamtplan, gemeinsame Datenmodelle, Schnittstellen, Aufgabenverteilung, Integration und technische Freigabe | Ein zusammenhängendes Spiel und nachvollziehbare Entscheidungen |
| A02 | Game Design & Balancing | Kernspielablauf, Fortschritt, Schwierigkeit, wirtschaftliche Entscheidungen und Motivation | Ausgewogene Kosten, Produktionszeiten, Aufträge und Entwicklungsstufen |
| A03 | Simulationskern | Spielzeit, Zustandsübergänge, Ereignisse, reproduzierbarer Zufall und Zusammenspiel der Systeme | Fachliche Ergebnisse unabhängig von Bildrate und Kameraposition |
| A04 | Produktion & Produktentwicklung | Stücklisten, Maschinenfähigkeiten, Arbeitspläne, Rüstzeiten, Qualität und Forschung | Fertigungsketten mit überprüfbaren Voraussetzungen und Engpässen |
| A05 | Lager & Materialfluss | Bestände, Eigentum, Lagerplätze, Reservierungen, Kommissionierung, innerbetriebliche Transporte und Warenfluss bei Retouren | Auffindbare, mengenmäßig korrekte Waren ohne Doppelreservierungen |
| A06 | Personal & Organisation | Qualifikationen, Aufgaben, Schichten, Pausen, Erfahrung und Abteilungsregeln | Beschäftigte mit tatsächlich notwendigen Tätigkeiten und begrenzter Arbeitszeit |
| A07 | Transport & Standortnetz | Fahrzeuge, Touren, Rampen, Lieferfenster, Rückladungen und externe Transportleistungen | Durchgängige Lieferketten zwischen Lieferanten, Standorten und Kunden |
| A08 | Wirtschaft & Markt | Einkauf, Nachfrage, Verträge, Preise, Zahlungen und Unternehmensrechnung | Nachvollziehbare wirtschaftliche Folgen und konsistente Geldbuchungen |
| A09 | 3D-Welt & Baumodus | Gebäude, Maschinenmodelle, Animationen, Kamera, Platzierung und räumliche Bedienung | Eine lesbare, lebendige und nutzbare Spielwelt |
| A10 | Oberfläche & Bedienbarkeit | Kompaktes HUD, Tabellen, Suche, Detailkarten, Warnungen, Tutorial und Barrierefreiheit | Verständliche Bedienung komplexer Abläufe |
| A11 | Qualitätssicherung & Integrationstests | Unabhängige Prüfungen, Fehlerreproduktion und Tests über mehrere Systeme hinweg | Nachgewiesene Funktionsfähigkeit des integrierten Stands |
| A12 | Performance, Spielstände & Veröffentlichung | Laufzeitmessungen, Speicherverbrauch, Speichern/Laden, Migrationen und statisches Build | Stabiler Betrieb, beständige Spielstände und ein geprüftes Veröffentlichungspaket |

## Verbindliche Zuständigkeiten für gemeinsame Daten

1. A05 verantwortet Änderungen an Warenbeständen, Eigentum, Lagerpositionen und Materialreservierungen. Andere Systeme benutzen dafür vereinbarte Befehle oder Schnittstellen.
2. A08 verantwortet Geldbewegungen, Forderungen, Verbindlichkeiten und finanzielle Buchungen. Andere Systeme melden die auslösenden fachlichen Ereignisse.
3. A03 verantwortet die Spieluhr, Ereignisreihenfolge und zentralen Zustandsregeln. Darstellung und Bedienung dürfen diese Regeln nicht umgehen.
4. A04 entscheidet über zulässige Produktionsprozesse; Verbrauch und Ausgabe von Material erfolgen über die mit A05 vereinbarten Übergänge.
5. A06 verantwortet Verfügbarkeit und Arbeitszuweisung von Beschäftigten. Eine Person darf nicht gleichzeitig widersprüchlichen Tätigkeiten zugeordnet werden.
6. A07 verantwortet Transportaufträge, Fahrzeuge und Touren; die Übergabe ihrer Waren wird mit A05 abgestimmt.
7. A09 und A10 zeigen den fachlichen Zustand und senden geprüfte Benutzerbefehle. Animationen und Anzeigeeffekte buchen weder Ware noch Geld.
8. A12 verantwortet das Speicherformat und die Migration in Abstimmung mit A03 und den jeweiligen Fachagenten. Gespeichert werden auch laufende Aufträge, Reservierungen und Ereignisse.
9. A02 schlägt Änderungen an Spielwerten vor; die zuständigen Fachagenten prüfen deren technische und fachliche Auswirkungen.
10. A01 entscheidet über gemeinsame Architektur und löst Zuständigkeitskonflikte. Änderungen an mehreren Fachbereichen werden gemeinsam geplant.

## Arbeitsweise

### Vor einer Entwicklungswelle

A01 prüft den aktuellen Stand, die relevanten Projektanweisungen und vorhandenen Spielabläufe. Jeder Auftrag wird so zugeschnitten, dass er ein konkret überprüfbares Verhalten liefert.

Vor parallelen Änderungen sind die benötigten Schnittstellen zu vereinbaren. Beispiel Materialreservierung: Menge, Materialart, Auftrag, Reservierungsdauer, Verbrauch, Freigabe bei Abbruch und Verhalten bei Ausfall müssen eindeutig definiert sein.

Jeder Agent erhält:

- Ziel und erwartetes Spielergebnis;
- zuständige Module und erlaubte Dateibereiche;
- Eingaben, Ausgaben und vereinbarte Schnittstellen;
- Abhängigkeiten und unveränderliche Annahmen;
- konkrete Abnahmekriterien;
- Hinweise auf relevante bestehende Prüfungen.

### Während der Umsetzung

- Arbeite bei einem vorhandenen Git-Projekt in getrennten Arbeitskopien beziehungsweise Worktrees. Andernfalls teile eindeutige, überschneidungsfreie Dateibereiche zu.
- Verändere gemeinsame Grundlagen oder fremde Dateibereiche erst nach Abstimmung mit A01 und dem zuständigen Agenten.
- Überschreibe keine fremden Änderungen. Melde Konflikte mit konkreten betroffenen Dateien und Schnittstellen.
- Liefere kleine integrierbare Änderungen. A01 führt geprüfte Ergebnisse laufend zusammen.
- Melde sachliche Blockaden früh und beschreibe, welche Entscheidung oder Schnittstelle fehlt.
- Nutze dieselben Einheiten, IDs, Zeitdefinitionen und Zustandsbegriffe im gesamten Spiel.
- Bewahre die Anonymisierung: nur eigenständig erzeugte Spielunternehmen, Personen, Adressen, Kennungen und Geschäftsdaten.
- Halte Bedienung und Hilfetexte auf Deutsch. Das HUD bleibt kompakt; die Spielwelt erhält den größten Bildschirmbereich.

### Übergabe eines Ergebnisses

Die Übergabe an A01 enthält knapp:

1. Umgesetztes Verhalten und dessen Zweck.
2. Betroffene Dateien und Schnittstellen.
3. Durchgeführte Prüfungen mit tatsächlichem Ergebnis.
4. Verbleibende Fehler, Grenzen und offene Abhängigkeiten.
5. Falls relevant: Folgen für bestehende Spielstände und nötige Migration.

Behaupte keine bestandenen Prüfungen, die nicht ausgeführt wurden. Kennzeichne Attrappen, Ersatzdaten, Teilumsetzungen und technische Einschränkungen ausdrücklich.

## Unabhängige Qualitätssicherung

Entwicklungsagenten liefern passende eigene Prüfungen mit. A11 prüft zusätzlich den zusammengeführten Stand und die Übergänge zwischen den Fachsystemen. Die Selbstprüfung des Entwicklers ersetzt keine unabhängige Prüfung eines wesentlichen neuen Ablaufs.

A11 meldet Fehler mit Ausgangszustand, Reproduktionsschritten, erwartetem und tatsächlichem Verhalten sowie Schweregrad. Der zuständige Fachagent behebt den Fehler; anschließend wird die konkrete Fehlerursache erneut geprüft.

A02 bewertet Spielbarkeit und wirtschaftliche Entscheidungen. A10 bewertet Verständlichkeit und Bedienung. A12 prüft Leistung, Spielstände und Veröffentlichbarkeit. A01 erteilt die technische Freigabe auf Grundlage dieser Ergebnisse. Eine technische Freigabe ist nicht automatisch ein Auftrag zur öffentlichen Veröffentlichung.

### Besonders wichtige Übergänge

| Übergang | Verpflichtend zu berücksichtigender Fehlerfall |
|---|---|
| Produktion ↔ Lager | Zwei Maschinen fordern gleichzeitig die letzten verfügbaren Bauteile an. |
| Personal ↔ Produktion | Eine Bedienperson beendet ihre Schicht während eines Arbeitsvorgangs. |
| Lager ↔ Transport | Ein Fahrzeug fällt aus, nachdem seine Ladung reserviert wurde. |
| Transport ↔ Wirtschaft | Eine Lieferung erfolgt teilweise; Zahlung und Restauftrag müssen konsistent bleiben. |
| Baumodus ↔ Materialfluss | Ein Umbau versperrt einen bislang genutzten Transportweg. |
| Retouren ↔ Lager ↔ Wirtschaft | Rückläufer werden genau einmal verbucht, eingelagert oder verwertet und erstattet. |
| Spielstand ↔ alle Systeme | Speichern und Laden während Fertigung, Beladung, Pause und Fahrt erhält sämtliche Vorgänge. |

## Definition von „fertig“

Eine wesentliche Funktion gilt erst als fertig, wenn sie:

- in den gemeinsamen Spielstand integriert und über die Oberfläche bedienbar ist;
- echte fachliche Daten verwendet und auf benötigte Ressourcen reagiert;
- Kosten, Zeit, Material, Personal und Transport entsprechend ihrem Zweck berücksichtigt;
- Warte-, Fehler- und Abbruchfälle nachvollziehbar behandelt;
- verständliche Zustände und Rückmeldungen zeigt;
- korrekt gespeichert und geladen wird;
- durch passende Verhaltensprüfungen und eine unabhängige Kontrolle abgesichert ist;
- bestehende funktionierende Abläufe erhält;
- ihre tatsächlichen Einschränkungen dokumentiert.

Eine sichtbare Maschine ist beispielsweise erst vollständig, wenn sie passendes Material und Personal erhält, Bearbeitungszeit benötigt, produziert, Kosten verursacht, bei Blockaden wartet und ihren Zustand korrekt speichert.

Keine negativen Warenbestände, doppelten Buchungen, verlorenen Ladeeinheiten oder zusätzlichen Erträge durch Kamerawechsel beziehungsweise höhere Bildrate. Prüfungen werden nach konkreten Risiken gewählt; kosmetische Änderungen benötigen keine künstlich aufgeblähten Testpakete.

## Erstes Parallelpaket der Spielentwicklung

A01 führt folgende erste Welle; A11 begleitet sie unabhängig:

| Entwicklungsrolle | Erstes Arbeitspaket |
|---|---|
| A03 Simulationskern | Spielzeit, Aufträge und gemeinsame Datenstrukturen |
| A04 Produktion | Ein Produkt mit mehreren spezialisierten Arbeitsstationen |
| A05 Lager | Anlieferung, Einlagerung, Reservierung und Materialbereitstellung |
| A08 Wirtschaft | Materialeinkauf, Auftragskalkulation und Zahlung |
| A09 3D-Welt & Baumodus | Eine baubare Halle mit sichtbaren Arbeitsabläufen |

Anschließend werden Personal, Transport und Bedienung mit den zuständigen Rollen integriert. Die Rollenbelegung wechselt nach Bedarf; die gesamte erste Entwicklungsphase ist erst abgenommen, wenn ein Auftrag Materialbestellung, Annahme, Einlagerung, Herstellung, Prüfung, Verpackung, Auslieferung und Bezahlung vollständig durchläuft und gespeichert werden kann.

Weitere Wellen erweitern diese funktionierende Kette um betriebliche Tiefe, mehrere Standorte, Fremdlogistik und Spezialtransporte. Fortschritt wird an spielbaren, geprüften Abläufen gemessen.
