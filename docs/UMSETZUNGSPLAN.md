# Logistics – Umsetzungsplan mit Kapiteln und Agentenzuteilung
Stand: 12. Oktober 2026 · Planungsfassung 1.0

## Grundlage und Status

Dieser Plan konkretisiert die vier Entwicklungsphasen aus „Logistik-Spielkonzept-und-Masterprompt.md“ und die zwölf Rollen aus „AGENTS.md“, jeweils aus der Projektsammlung Logistics am 12. Oktober 2026 gelesen. Er ergänzt beide Dokumente. Die dortigen Zuständigkeiten bleiben maßgeblich.

Ergebnis dieses Auftrags ist die Umsetzungsplanung. Die folgenden Kapitel sind geplant, nicht bereits implementiert oder technisch abgenommen. Es werden keine Termine oder Entwicklungsdauern zugesichert. Die Reihenfolge richtet sich nach geprüften Ergebnissen.

Das Spiel wird modular entwickelt und als statisches Browserpaket ausgeliefert. Eine einzelne HTML-Datei ist für dieses Projekt keine festgelegte Anforderung. Alle Spieltexte sind deutsch, alle Spieldaten synthetisch, das HUD kompakt. Es gibt standardmäßig keine Offlinefortschritte und keine externen Spiel- oder KI-Dienste.

## 1. Team und Arbeitsregeln

| ID | Rolle | Dauerhafte Zuständigkeit |
|---|---|---|
| A01 | Projektleitung & Architektur | Schnittstellen, Aufgabenverteilung, Zusammenführung, technische Freigabe |
| A02 | Game Design & Balancing | Spielablauf, Fortschritt, Kosten, Schwierigkeit und Motivation |
| A03 | Simulationskern | Spieluhr, Ereignisse, Zustandsübergänge, reproduzierbarer Zufall |
| A04 | Produktion & Produktentwicklung | Rezepte, Maschinenfähigkeiten, Qualität und Forschung |
| A05 | Lager & Materialfluss | Mengen, Eigentum, Warenorte und Reservierungen |
| A06 | Personal & Organisation | Qualifikationen, Verfügbarkeit, Arbeitsaufträge und Schichten |
| A07 | Transport & Standortnetz | Fahrzeuge, Rampen, Touren und Transportleistungen |
| A08 | Wirtschaft & Markt | Einkauf, Markt, Verträge, Forderungen und Buchungen |
| A09 | 3D-Welt & Baumodus | Räumliche Darstellung, Platzierung, Kamera und Animation |
| A10 | Oberfläche & Bedienbarkeit | HUD, Tabellen, Warnungen, Hilfe und Barrierefreiheit |
| A11 | Qualitätssicherung & Integrationstests | Unabhängige Prüfung des zusammengeführten Stands |
| A12 | Performance, Spielstände & Veröffentlichung | Speichern, Migration, Leistung und statisches Paket |

**Gleichzeitig höchstens sieben Agenten:** A01 + bis zu fünf Fachagenten + A11. A01 und A11 sind in jeder unten genannten Welle zusätzlich eingeplant. Die Fachagenten in einer Welle dürfen parallel arbeiten, sobald ihre Schnittstellen vereinbart sind. Ein Agent bearbeitet innerhalb einer Welle nur ein aktives Paket; mehrere Kapitelzuordnungen werden gebündelt oder nacheinander bearbeitet.

A01 vergibt eindeutige Module und Dateien. Bei Git werden getrennte Arbeitskopien verwendet. Fachagenten greifen nicht unmittelbar in fremde Datenbestände ein: Warenänderungen laufen über A05, Geldbuchungen über A08, Personalzuweisung über A06 und Zeitereignisse über A03. Gemeinsame Schnittstellenänderungen benötigen Abstimmung und einen Integrationspunkt.

Jede Welle endet mit Zusammenführung und gezielter Prüfung. Bei Fehlern werden betroffene Fachagenten in freien Plätzen reaktiviert; die Belegungsgrenze wird nicht überschritten. A11 prüft unabhängig und implementiert nicht zugleich den zu prüfenden Fachablauf. Ein Wechsel zur nächsten Phase setzt die jeweilige Phasenabnahme voraus.

## 2. Kapitelübersicht

| Kapitel | Inhalt | Fachliche Federführung | Voraussetzung | Sichtbares Ergebnis |
|---|---|---|---|---|
| K00 | Gemeinsamer Entwicklungsvertrag | A01 | Konzept und AGENTS.md | Datenmodell, Schnittstellen und prüfbarer Umfang |
| K01 | Simulations- und Datenfundament | A03 | K00 | Verlässliche Uhr, Waren, Ereignisse und Buchungen |
| K02 | Erste betriebsfähige Halle | A09 | K01-Schnittstellen | Bauen, Einstellen, Wege und kompakte Bedienung |
| K03 | Erste vollständige Wertschöpfungskette | A01 | K01–K02 | Vom Einkauf bis zur bezahlten Lieferung |
| K04 | Produkte und Fertigungstiefe | A04 | Abnahme A | Varianten, Rüsten, Nacharbeit und Forschung |
| K05 | Personal, Energie und Instandhaltung | A06 | Abnahme A | Schichten, Versorgung und wartbare Anlagen |
| K06 | Kundendienst und Rückläufe | A05 | Abnahme A; Qualitätsübergänge aus K04 | Reklamation bis Erstattung oder Verwertung |
| K07 | Betriebsregeln und Engpassdiagnose | A03 | Integrierte K04–K06 | Erklärbare Automatisierung und Ursachenketten |
| K08 | Mehrere Standorte | A07 | Abnahme B | Ein zusammenhängendes Unternehmensnetz |
| K09 | Disposition und Transportoptimierung | A07 | K08-Datenmodell | Touren, Rampen, Rückladung und Fremdspediteure |
| K10 | Drei Geschäftsfelder und Unternehmensrechnung | A08 | K08–K09 | Eigenprodukte, Auftragsfertigung und Fremdlogistik |
| K11 | Kühlkette und Speziallogistik | A05 | Abnahme C | Temperaturfolgen und dokumentierte Sonderprozesse |
| K12 | Bahn, See, Luft und Terminals | A07 | Abnahme C; K11-Frachtvertrag | Mehrstufige Transporte mit Anschlüssen |
| K13 | Planung, Rückschau und Delegation | A03 | K11–K12 integriert | Isolierte Planung und nachvollziehbare Betriebsführung |
| K14 | Gesamtabnahme und Veröffentlichungspaket | A12 | Abnahme D | Geprüftes statisches Paket mit Anleitung |

Federführung ist die Verantwortung für das Kapitelergebnis, nicht die Erlaubnis, fremde Module zu überschreiben. Querschnittsaufgaben wie Speicherung, Bedienung und Tests beginnen früh und werden in jedem Kapitel erweitert.

## 3. Phase A – Ein vollständiger erster Betrieb

### K00 – Gemeinsamer Entwicklungsvertrag

**Ziel:** Alle Agenten arbeiten mit denselben Begriffen und verbindlichen Übergaben.

A01 legt Modulgrenzen, ID-System, Zeit- und Mengeneinheiten sowie Fehler- und Abbruchregeln fest. A02 definiert den Einstieg: kleine leere Halle, Arbeitsleuchte als erstes Produkt, knappe Ressourcen und eine nachvollziehbare erste Kundenlieferung. A03 und A12 vereinbaren Zustandsmodell und Speicherformat. A10 definiert das kompakte deutsche Bedienkonzept.

Ergebnisse: Datenmodelle für Standort, Person, Maschine, Rezeptversion, Charge, Lagerplatz, Reservierung, Auftrag, Transport, Buchung und Ereignis; Befehls- und Ereigniskatalog; dokumentierte Materialbewertung; gemeinsame Beispiele für erfolgreiche und abgebrochene Vorgänge.

Die Historie wird von Anfang an angelegt: fachliches Ereignis, Spielzeit, verursachender Auftrag, betroffene Objekte und Grund. Damit können Detailakten, spätere Rückschau und Ursachenanalyse denselben Verlauf nutzen.

Arbeits- und Transportaufträge erhalten bereits hier die Übergänge Reservieren, Abholen, Transportieren, Abliefern, Abbrechen und Wiederaufnehmen. Chargen führen Herkunft und Qualitätsstatus von Beginn an. Für K04/K05 wird vor Parallelbeginn ein gemeinsamer Maschinenvertrag für Rüsten, Wartung, Stromausfall, Personalwechsel und Materialverbrauch festgelegt.

**Abnahme:** Für jeden Datentyp steht genau ein schreibverantwortlicher Fachbereich fest. Reservieren, Übergeben, Verbrauchen, Stornieren und Wiederholen von Befehlen sind eindeutig beschrieben. Testfälle aus dem Konzept sind Kapiteln zugeordnet. Kein Agent muss unbekannte Schnittstellen erraten.

### K01 – Simulations- und Datenfundament

**Ziel:** Der Betrieb besitzt einen verlässlichen fachlichen Zustand.

A03 implementiert feste Spielzeit, Pause, Geschwindigkeiten, Hintergrundpause, Ereignisreihenfolge und reproduzierbaren Zufall. A05 baut das zentrale Waren- und Reservierungsmodell mit Eigentum, Menge, Ort und Zustand. A08 liefert Einkauf, Forderungen und einmalige Buchungen. A04 entwickelt ein versioniertes Einstiegsrezept mit Montage, Prüfung und Verpackung. A09 beginnt die räumliche Hülle auf Basis der vereinbarten Daten.

A12 integriert anschließend frühes Speichern und Laden einschließlich laufender Ereignisse. Ein einfaches statisches Build wird bereits hier eingerichtet; es darf kein erst am Projektende entdecktes Verpackungsproblem geben.

**Abnahme:** Zwei konkurrierende Reservierungen können dieselbe Ware nicht beanspruchen. Ein erneut zugestelltes Abschlussereignis erzeugt keine zweite Ware oder Zahlung. Gleiche Befehle und gleiche Spielzeit ergeben bei unterschiedlichen Darstellungsraten dieselben fachlichen Ergebnisse. Ein kleiner Testzustand lässt sich vollständig wiederherstellen.

### K02 – Erste betriebsfähige Halle

**Ziel:** Der Spieler kann einen funktionierenden Betrieb selbst einrichten.

A09 erstellt Rasterbau mit Drehen, Verschieben, Abriss, Zugangsvorschau und Kamera. A06 implementiert Einstellung, Grundqualifikationen, Wegezeiten und exklusiv zugewiesene Tätigkeiten. A10 baut HUD, Auswahl, Detailkarten, Zeitsteuerung und verständliche Wartegründe. A07 liefert Fahrzeug-, Rampen- und Beladungsgrundlagen. A12 bindet diese Zustände an Speicherung und Laufzeitdiagnose.

Zuständigkeitsgrenze: A09 verwaltet räumliche Belegung und Erreichbarkeitsdaten, A05 innerbetriebliche Transportaufträge und Warenübergaben, A06 die tatsächliche Arbeitskraft. A03 legt ihre Ereignisreihenfolge fest.

Eine einfache Energieversorgung ist bereits eine Startvoraussetzung der Maschinen; detaillierte Netze folgen K05. Die 2D-Ersatzansicht und Tabellen werden hier angelegt. Das Tutorial führt durch Bauen, Einstellen und Materialannahme.

**Abnahme:** Unzugängliche Platzierung wird begründet abgelehnt. Ein Umbau löst neue Wege oder erklärte Wartezustände aus. Belegte Anlagen verlieren beim Abriss keine Ware. Beschäftigte erledigen keine zwei Tätigkeiten gleichzeitig. Bei fehlendem WebGL bleibt eine bedienbare Betriebsübersicht verfügbar.

### K03 – Erste vollständige Wertschöpfungskette

**Ziel:** Ein Kundenauftrag lässt sich vom leeren Betrieb bis zum Zahlungseingang vollständig spielen.

A04, A05, A06, A07 und A08 integrieren Einkauf → Anlieferung → Prüfung → Einlagerung → Bereitstellung → Montage → Qualitätsprüfung → Verpackung → Beladung → Zustellung → Forderung → Zahlung. A01 führt zusammen. In einer anschließenden Welle vervollständigen A10 und A12 Bedienung und Speicherung; A02 prüft den Einstieg und die wirtschaftlichen Entscheidungen.

Mindestens zwei getrennte Zulieferungen, mehrere spezialisierte Stationen, ein eigenes Lieferfahrzeug und ein echter Kundenauftrag gehören zum Umfang. Zeit und Geld entstehen aus den tatsächlichen Abläufen.

Verkaufspreise, Einkaufskosten, Löhne, Energie- und Transportkosten sowie Liquidität gehören bereits zu dieser ersten Fassung. K10 vertieft die Unternehmensrechnung. Neben dem Erfolgsfall werden Materialmangel, voller Lagerplatz und blockierter Transport gezielt geprüft.

**Abnahme A – Erste spielbare Fassung:**

- Beide Zulieferungen werden verarbeitet oder zeigen jeweils ihren konkreten Wartegrund.
- Falsche Rezepte, fehlendes Material oder Personal sowie volle Ausgangspuffer verhindern den Start korrekt.
- Eine Lieferung enthält ausschließlich tatsächlich geladene Ware und überschreitet keine Kapazität.
- Ein Vertrag allein erzeugt keinen vorzeitigen Zahlungseingang.
- Unterbrechung und Wiederaufnahme während Fertigung, Beladung und Fahrt erhalten Zustand und Fortschritt.
- Material- und Geldverläufe sind nachvollziehbar; keine Doppelbuchungen oder verschwundenen Einheiten.
- Die Kette ist mit deutscher Bedienung, Tutorial und Ersatzansicht zugänglich.

Erst nach dieser Abnahme beginnt der Ausbau der Phase B. Die Fassung ist ein erster Betrieb, noch kein vollständiges Konzernspiel.

## 4. Phase B – Betriebliche Tiefe

### K04 – Produkte und Fertigungstiefe

**Federführung:** A04; Beiträge A02, A05, A08, später A10/A12.

Produktvarianten mit gemeinsamen Komponenten, Arbeitsplan- und Rezeptversionen, Losgrößen, Werkzeugwechsel, Rüstzeiten, material- und prozessabhängige Qualität, Ausschuss, Reparatur und Forschung mit Zeit-, Personal- und Geldbedarf. Zulieferer unterscheiden sich nach Qualität und Zuverlässigkeit.

**Abnahme:** Eine Produktänderung verändert keinen bereits gestarteten Auftrag rückwirkend. Ungeeignete Maschinen lehnen Prozesse ab. Materialbilanz und Nacharbeit bleiben korrekt. Forschung bucht ihre Ressourcen und schaltet eine tatsächliche Fähigkeit frei. Der Spieler kann einen Fertigungsengpass nachweisen.

### K05 – Personal, Energie und Instandhaltung

**Federführung:** A06 für Personal; A04 für Maschinenwartung; A09 für räumliche Versorgung. A08 verantwortet alle Kosten.

Schichten, Pausen, Einarbeitung, Erfahrung, Müdigkeit, Zufriedenheit, Vertretung und Abteilungsprioritäten. Versorgungskapazitäten, Lastspitzen, Werkstatt, Ersatzteile, Wartung, Defekte, Ladeplätze sowie spätere Solar- und Speicheranlagen.

A03 vereinbart die gemeinsame Behandlung von Unterbrechung und Wiederaufnahme. A06 weist Personal zu; A04 verwaltet Wartungszustand; A05 reserviert Ersatzteile; A09 modelliert Anschlüsse. Kein Modul führt eine zweite konkurrierende Beschäftigtenliste.

**Abnahme:** Schichtende während der Bearbeitung ist eindeutig geregelt. Ohne Techniker oder Ersatzteil endet Wartung nicht automatisch. Energieengpässe erklären betroffene Anlagen. Zusätzliche Maschinen erhöhen den Durchsatz nur bei ausreichenden weiteren Ressourcen.

### K06 – Kundendienst und Rückläufe

**Federführung:** A05 für Waren; A08 für Serviceentscheidungen und Erstattung. Beiträge A04, A06, A07.

Kundenanfragen, Adresskorrektur, Terminänderung, Beschwerden, Abholung, Retourenprüfung, Quarantäne, Reparatur, Wiederverkauf, Teilegewinnung und Entsorgung. Kundendienst beansprucht Personal und Bearbeitungszeit. Chargenherkunft ermöglicht gezielte Sperren und Rückrufe.

**Abnahme:** Ein mehrfach angestoßener Retourenabschluss erstattet genau einmal und lagert oder verwertet die Ware genau einmal. Gesperrte Ware bleibt unverkäuflich. Rückruf betrifft nur die nachvollziehbar betroffenen Chargen. Rücktransport und Reparatur belegen reale Kapazitäten.

### K07 – Betriebsregeln und Engpassdiagnose

**Federführung:** A03 für Regelmechanismus; A10 für Erklärung. Beiträge A02, A06, A08 und jeweilige Fachagenten über bestehende Befehle.

Regeln für Nachbestellung, Personalhilfe, Wartung und Expressversand mit Geltungsbereich, Priorität, Budgetgrenze, Wartezeit und Freigabe. Warnungen zeigen Ursache, betroffene Aufträge, Reaktionszeit und Handlungsoptionen. Nachfrage- und Preisschwankungen, Defekte und konfigurierbare Ereignisse wirken auf vorhandene Systeme.

**Abnahme B – Verständlich steuerbarer Betrieb:** Regeln erzeugen weder Doppelbestellungen noch endloses Hin-und-her-Schalten. Automatisierte Aktionen brauchen dieselben Ressourcen wie manuelle. Der Spieler erkennt eine konkrete Engpasskette, beseitigt sie und sieht die Wirkung auf Lieferung und Ergebnis. Alle neuen Zustände überleben Speichern/Laden. Frühere Lieferkette bleibt funktionsfähig.

## 5. Phase C – Unternehmensnetz und drei Geschäftsfelder

### K08 – Mehrere Standorte

**Federführung:** A07; Beiträge A03, A05, A08, A09/A12 in anschließender Integrationswelle.

Standorte kaufen, spezialisieren und ausbauen; gemeinsame Auftragsübersicht; Transfers mit echten Fahrzeiten; Standortwechsel zwischen Halle, Gelände und Unternehmensnetz. Entfernte Standorte werden fachlich weitergerechnet, ihre Darstellung darf vereinfacht werden.

**Abnahme:** Eine Transfercharge befindet sich genau an einem gültigen Ort beziehungsweise Transport. Kamera- oder Standortwechsel verändern weder Produktion noch Geld. Eigene Standorttransfers erzeugen keinen externen Umsatz. Laden erhält sämtliche Standorte und Transporte.

### K09 – Disposition und Transportoptimierung

**Federführung:** A07; Beiträge A05, A06, A08, A10.

Mehrere Stopps, Ladereihenfolge, Rückladung, Zeitfenster, Fahrerschichten und Pausen, Rampentermine, Wartezonen, Reichweite, Fahrzeugzustand, Miete und Fremdspediteure. Die Ankunftsprognose berücksichtigt Fahrt, Warteschlangen und Bearbeitung. Emissionsvergleiche verwenden nachvollziehbare Spielannahmen.

**Abnahme:** Gewicht, Volumen und Ausstattung werden vor Abfahrt geprüft. Fahrzeugausfall nach Reservierung lässt Ware weder verschwinden noch doppelt verfügbar werden. Eine Rückladung benötigt Platz und Zeit. Ein verpasstes Lieferfenster wird mit Ursache und wirtschaftlichen Folgen sichtbar.

### K10 – Markt, Fremdlogistik und Unternehmensrechnung

**Federführung:** A08; Beiträge A02, A04, A05, A07.

Eigene Produktverkäufe, kundenspezifische Auftragsfertigung und Logistik für fremde Eigentümer nutzen gemeinsame Kapazität. Angebote, Ausschreibungen, Daueraufträge, Teillieferungen und nachvollziehbare Nachfrage. Ergebnisrechnung nach Auftrag, Produkt, Route und Standort; Materialbewertung, Forderungen und Verbindlichkeiten; Kredite, Leasing, vereinfachte Versicherungen und Sanierung. Wettbewerb zunächst über Nachfrage und angebotene Kapazitäten.

**Abnahme C – Zusammenhängendes Unternehmen:** Ein Fremdauftrag verzögert bei knapper Kapazität die eigene Fertigung nachvollziehbar. Fremde Ware kann nicht als eigener Bestand verkauft werden. Teilzustellung, Restauftrag, Rechnung und Zahlung bleiben konsistent. Unternehmenssumme enthält keine doppelten internen Umsätze. Hoher Umsatz bei negativem Ergebnis ist nachvollziehbar erklärbar.

## 6. Phase D – Speziallogistik und Konzernsteuerung

### K11 – Kühlkette, Sondergut und Dokumente

**Federführung:** A05; Beiträge A07, A04, A06, A08.

Temperaturverlauf und zeitabhängige Qualitätsverluste; passende Lager, Verpackung und Fahrzeuge; Sondergutqualifikationen; fiktive Frachtklassen, Dokumente, Rückfragen, Prüfzeiten und Freigaben. A09/A10 ergänzen räumliche Anzeigen und Bedienung in der nächsten Welle.

**Abnahme:** Temperaturabweichungen verursachen reproduzierbare Folgen abhängig von Dauer und Produkt. Eine Warnung repariert keinen Defekt. Ungeeignete Ressourcen dürfen Spezialaufträge nicht ausführen. Eine Dokumentensperre blockiert die Weitergabe und ist nach gültiger Bearbeitung auflösbar.

### K12 – Bahn, See, Luft und Terminals

**Federführung:** A07; Beiträge A05, A08, A09, A03.

Zuerst buchbare externe Verbindungen mit Fahrplan, Kapazität, Kosten und Umbuchungsbedingungen. Anschließend eigene Spezialterminals mit Warteflächen, Umschlagpersonal, Ladeeinheiten und Betriebskosten. A06 integriert erforderliche Tätigkeiten vor Terminalabnahme; A10 die Bedienung.

**Abnahme:** Ein verpasster Anschluss führt zu neuer Planung, Lagerbedarf und nachvollziehbaren Mehrkosten. Umladung erhält Eigentum, Menge, Zustand und Historie. Keine Ware wird an mehreren Verkehrsträgern gleichzeitig geführt. Eigene Terminals benötigen reale Anlagen und Personal.

### K13 – Planung, Rückschau und Delegation

**Federführung:** A03; Beiträge A02, A06, A10, A12.

Die Planungsvorschau kopiert den vollständigen fachlichen Zustand einschließlich Zufallszustand und Ereignissen. Verglichen werden Ausbau, Schichten, Lieferalternativen und Investitionen. Ergebnisse zeigen Annahmen und Unsicherheit. Rückschau erklärt vergangene Störungen anhand der seit K00/K01 geführten Historie.

Rückschau bedeutet zunächst eine auswertbare Ereignis- und Kennzahlenhistorie. Ein vollständiges interaktives Wiederabspielen sämtlicher vergangener Spielzustände ist damit nicht zugesagt.

Abteilungs- und Standortleitungen handeln innerhalb von Prioritäten, Budgets und Freigabegrenzen. Größere Märkte, saisonale Spitzen und langfristige Spezialisierung ergänzen das Regelwerk.

**Abnahme D – Steuerbares Unternehmensnetz:** Eine Planung verändert keinerlei echte Waren, Buchungen, Reservierungen oder Zufallszustände. Delegation benutzt die vorhandenen Fachbefehle. Jede automatische Entscheidung ist begründet und prüfbar. Spezialtransport, Fertigung und Finanzierung wirken auf denselben Unternehmenszustand.

**Optionale spätere Erweiterungen:** Unternehmenszukäufe und eigenes Händlernetz sind im Konzept Möglichkeiten, keine Voraussetzung für die erste vollständige Konzernfassung. A02/A08 erstellen dafür erst nach K10 eine Nutzen- und Aufwandsbewertung; A01 vergibt bei Beauftragung eigene Kapitel. Sie werden nicht stillschweigend als umgesetzt behandelt.

## 7. K14 – Gesamtabnahme und Veröffentlichungspaket

**Federführung:** A12; Beiträge A02, A03, A09, A10; A11 unabhängig, A01 technische Freigabe.

Prüfung mit dokumentierten kleinen, mittleren und großen Betrieben. Gemessen werden Bildzeit, Simulationszeit, Speicher und Ladezeit auf benannten Testbedingungen. Optimierungen erhalten fachliche Ergebnisse. Worker, Detailstufen und gruppiertes Zeichnen werden bei nachgewiesenem Bedarf eingeführt.

Prüfumfang: Speicherstandmigration, beschädigte Importe ohne Verlust des letzten intakten Stands, WebGL-Ersatzansicht, Tastaturbedienung, Schriftgröße, farbunabhängige Zustände, Bewegungsreduktion, deutsche Texte, lokale Assets und fehlende Abhängigkeit von externen Laufzeitdiensten.

**Lieferumfang:** modularer Quellcode, statisches Build-Verzeichnis, deutsche Startanleitung, Architekturüberblick mit Lernkommentaren, Funktionsstatus, Änderungsprotokoll, reale Testergebnisse und bekannte Grenzen.

**Abnahme:** Die vollständigen Phasenprüfungen bestehen im integrierten Paket. Start und Laden funktionieren in der vorgesehenen statischen Hostingumgebung. Keine kritischen Fehler bei Waren, Geld oder Spielständen sind offen. Veröffentlichung erfolgt nur im Rahmen eines entsprechenden Auftrags; das geprüfte Paket und die technische Freigabe allein bedeuten noch keine öffentliche Veröffentlichung.

## 8. Konkreter Plan der parallelen Wellen

A01 und A11 sind immer zusätzlich aktiv. In jeder Zeile stehen höchstens fünf Fachagenten. Die Wellen folgen grundsätzlich nacheinander; parallel sind die Arbeitspakete innerhalb einer Zeile. Vorbereitende Entwürfe späterer Kapitel sind möglich, ihre Integration wartet auf die Voraussetzungen.

| Welle | Kapitel | Parallele Fachagenten und Pakete | Übergabe |
|---|---|---|---|
| W00 | K00 | A02 Einstieg; A03 Zustandsmodell; A05 Warenvertrag; A10 Bedienkonzept; A12 Speichervertrag | Gemeinsame Schnittstellen; A01 klärt mit A08/A04 beim Rollenwechsel Details vor W01 |
| W01 | K01/K02 | A03 Uhr/Ereignisse; A04 erste Produktion; A05 Waren/Reservierungen; A08 Einkauf/Buchungen; A09 Halle/Bau | Erstes Parallelpaket gemäß AGENTS.md |
| W02 | K01/K02 | A06 Personal; A07 Liefergrundlage; A09 Bau/Wege; A10 HUD/Ersatzansicht; A12 Speichern/Build | Betriebsfähige Komponenten |
| W03 | K03 | A04 Fertigung; A05 Übergaben; A06 Tätigkeiten; A07 Auslieferung; A08 Abrechnung | Fachlich vollständige Kette |
| W04 | K03 | A02 Spielbarkeit; A03 Zeitfehler; A09 Darstellung; A10 Tutorial; A12 Spielstände/Paket | Abnahme A |
| W05 | K04/K05 | A04 Varianten/Rüsten; A05 Chargen/Qualität; A06 Schichten; A08 Kosten; A09 Energie/Flächen | Fertigungs- und Betriebsvertiefung |
| W06 | K05/K06 | A04 Wartung/Reparatur; A05 Rückläufe; A06 Wartungs-/Servicepersonal; A07 Abholung; A08 Service/Erstattung | Rücklaufkette integriert |
| W07 | K07 | A02 Regelwerte/Ereignisse; A03 Regelkern; A06 Organisationsregeln; A08 Budgetprüfungen; A10 Diagnose | Erklärbare Automatisierung |
| W08 | K04–K07 | A02 Balance; A03 Fehlerbehebung; A09 Darstellung; A10 Bedienung; A12 Migration/Leistung | Abnahme B |
| W09 | K08/K09 | A03 Mehrstandortsimulation; A05 Transfers; A06 Fahrdienst; A07 Netz/Touren; A08 Standortrechnung | Transportnetz fachlich integriert |
| W10 | K08/K09 | A02 Transportbalance; A07 Disposition; A09 Netzansicht; A10 Planung/UI; A12 Speicher/Leistung | Mehrere Standorte spielbar |
| W11 | K10 | A02 Markt; A04 Auftragsfertigung; A05 Fremdeigentum; A07 Fremdlogistik; A08 Verträge/Rechnung | Drei Geschäftsfelder integriert |
| W12 | K10 | A02 Wirtschaftsprüfung; A03 Regression; A09 Ansichten; A10 Auswertungen; A12 Migration/Paket | Abnahme C |
| W13 | K11 | A04 Qualitätsfolgen; A05 Spezialwaren; A06 Qualifikationen; A07 Spezialtransport; A08 Dokumente/Kosten | Speziallogistik fachlich integriert |
| W14 | K12 | A03 Anschlussereignisse; A05 Umschlag; A07 Verkehrsträger; A08 Buchung; A09 Terminals | Multimodales Netz |
| W15 | K11/K12 | A06 Terminalpersonal; A07 Terminalabläufe; A09 Spezialanzeigen; A10 Bedienung; A12 Migration/Leistung | Spezialbetrieb vollständig spielbar |
| W16 | K13 | A02 Planungsszenarien; A03 isolierte Simulation/Rückschau; A06 Delegation; A10 Vergleich/UI; A12 Isolation/Speicher | Abnahme D |
| W17 | K14 | A02 Gesamtbalance; A03 Simulationsprüfung; A09 Grafikoptimierung; A10 Zugänglichkeit; A12 Releasepaket | Technische Gesamtfreigabe |

Diese Besetzung ist ein umsetzbarer Standard, keine starre Personalpflicht. A01 darf Rollen in einer Welle austauschen, wenn ein konkreter Fehler einen anderen Eigentümer benötigt. Ein frei werdender Platz kann nach Übergabe sofort neu besetzt werden. Ein zusätzlicher Fachagent wird nicht gleichzeitig als achter Agent gestartet.

## 9. Kapitelauftrag und Nachweis

Vor jeder Welle konkretisiert A01 jedes Paket anhand folgender Vorlage:

- Kennung: Kapitel und Teilpaket, etwa K03-P05.
- Ziel: ein beobachtbares Spielergebnis.
- Verantwortung: genau ein Fachagent und ausdrücklich erlaubte Dateien.
- Eingaben/Ausgaben: Daten und Befehle einschließlich Einheiten, IDs und Versionen.
- Voraussetzungen: abgeschlossene Übergaben und stabile Schnittstellen.
- Fehlerfälle: voller Zielplatz, Abbruch, Ausfall, Wiederholung oder Laden, soweit relevant.
- Abnahme: konkrete Ausgangslage, Aktion und erwarteter Zustand.
- Übergabe: tatsächliche Änderungen, ausgeführte Prüfungen, offene Grenzen und Speicherfolgen.

Statusfolge: geplant → bereit → in Arbeit → integriert → unabhängig geprüft → abgenommen. „Blockiert“ erhält eine konkrete fehlende Voraussetzung. Ein Kapitel wird nicht allein wegen vorhandener Schaltflächen abgeschlossen.

Für jedes Kapitel werden fachliche Umsetzung, Oberfläche, Speicherung und unabhängige Prüfung getrennt nachgehalten. Die nächste Phasenabnahme erfolgt erst, wenn diese vier Bereiche zusammenpassen.

## 10. Empfohlener nächster Entwicklungsauftrag

„Setze Phase A anhand von K00 bis K03 und W00 bis W04 um. Nutze die Rollen und Schreibzuständigkeiten aus AGENTS.md. Beginne mit dem gemeinsamen Daten- und Schnittstellenvertrag und entwickle anschließend die erste vollständig spielbare Kette von Materialeinkauf bis Zahlung. Halte höchstens sieben Agenten gleichzeitig aktiv. Liefere ein statisches Browserpaket, dokumentiere tatsächliche Prüfungen und kennzeichne offene Grenzen. Beginne Phase B erst nach bestandener Abnahme A.“

Dieser Text ist eine vorbereitete Folgeanweisung. Mit diesem Planungsdokument wird die Implementierung noch nicht als begonnen oder abgeschlossen ausgewiesen.

