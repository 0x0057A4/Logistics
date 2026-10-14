# Logistikunternehmen mit eigener Fertigung

Funktionsanalyse, anonymisierte Spielkonzeption und Entwicklungsauftrag · Stand: 12. Oktober 2026

Dieses Dokument beschreibt ein neues, eigenständiges Spiel. Die Bestandsaufnahme der Referenz und die vorgeschlagenen Erweiterungen sind getrennt gekennzeichnet. Sämtliche Beispielunternehmen, Personen, Orte, Kennungen, Waren und wirtschaftlichen Werte des Spielkonzepts werden neu erzeugt. Der Arbeitstitel lautet **Industrie & Logistik**.

## 1. Ergebnis und Untersuchungsumfang

Das passende Ziel ist eine Unternehmenssimulation, in der Herstellung, Lagerung und Transport denselben Material-, Personal- und Geldkreislauf nutzen. Ein Auftrag beansprucht Maschinenzeit, Lagerplätze, Beschäftigte, Fahrzeuge und Liquidität. Die Betriebszentrale zeigt, weshalb ein Auftrag stockt, welche Entscheidungen möglich sind und was diese voraussichtlich kosten.

Untersucht wurden die kurzfristig auslesbare Bedienoberfläche und die von der Referenzseite öffentlich ausgelieferte Hauptprogrammdatei. Die Oberfläche kennzeichnet ihre Daten selbst als simuliert. Der Anwendungscode enthält ein deutlich größeres Spektrum als die fünf im vorgelegten Gemini-Prompt genannten Mechaniken.

**Grenze der Prüfung:** Die 3D-Anwendung brach in der verwendeten Browserumgebung mit einem Fehler beim Erstellen des WebGL-Kontexts ab. Deshalb ist dies eine Bestandsaufnahme der sichtbaren Oberfläche sowie der im öffentlichen Frontend erkennbaren Funktionsbeschreibungen und Abläufe. Es ist keine vollständige interaktive Funktionsprüfung, kein Leistungstest und keine Prüfung eines Backends. Im Code vorhandene Bedienelemente sind nicht automatisch als erfolgreich bedient zu verstehen.

Eine durchgängige eigene Fertigung mit Stücklisten, Maschinenkauf, Personalwirtschaft und Unternehmensrechnung war in den untersuchten Modulen nicht erkennbar. Diese Bereiche werden im folgenden Konzept neu entworfen. Vorhandene Personen, Fahrzeuge und Anlagen in einer Simulation bedeuten noch nicht, dass sie bereits kaufbar, baubar oder betriebswirtschaftlich verwaltbar sind.

### 1.1 Funktionsbestand der Referenz, neutral zusammengefasst

Die Referenz umfasst sieben Standortrollen: Hauptumschlag, Auftragslager mit Kühlbereich, regionales Verteilzentrum, Zustellgebiet, Hafen, Luftfrachtterminal und weiteres Lager-/Umschlagzentrum.

In der Betriebszentrale sind zehn Bereiche erkennbar: Ankunftsüberwachung, Kundenanfragen, Retouren, Kühlkette, Zollklassifizierung, Adresskorrektur, Spitzenauslastungsszenarien, Zustellrouten, Emissionsvergleich und Fahrerpausen.

Hinzu kommen durchgehende Sendungsverläufe für Straße, See, Luft und Rücktransport, Rampenbelegung, Torereignisse sowie Detailansichten für Fahrzeuge, Stapler, Roboter, Personen, Waren und Anlagen. Lagerprozesse unterscheiden Entladung, Prüfung, Einlagerung, Entnahme, Verpackung und Versand. Hafen und Flughafen besitzen eigene Umschlagabläufe. Sortieranlagen behandeln fehlerhafte Etiketten und ausgesonderte Sendungen.

Weitere Funktionen betreffen Vorfallmeldungen, Entscheidungsvorschläge mit Freigabeprotokoll, Standortwechsel, Objektsuche, Objektverfolgung, Zeitsteuerung, Rückschau, Wetter und Tageszeit. Eine optionale externe Textauswertung ist vorgesehen; daneben existieren Standardregeln. Einzelne Planungs-, Emissions- und Abgabenwerte sind ausdrücklich modellhafte Annahmen.

### 1.2 Konsequenz für die Übertragung

| Ausgangsfunktion | Eigenständige Spielmechanik | Entscheidung des Spielers |
|---|---|---|
| Standortnetz | Kauf, Ausbau und Spezialisierung eigener Niederlassungen | Zentrale Großanlage oder mehrere kleine Standorte? |
| Lieferverfolgung | Durchgängige Auftrags- und Chargenakte | Welcher konkrete Auftrag erhält Vorrang? |
| Ankunftsüberwachung | Verbindliche Lieferfenster und Anschlussplanung | Mehr Reserve einplanen oder höhere Auslastung riskieren? |
| Rampen- und Torplanung | Zeitfenster, Wartespuren, Pförtner, Rangierflächen | Zusätzliche Rampe bauen oder Ankünfte entzerren? |
| Lager und Fördertechnik | Frei errichtbare Lagerplätze, Wege und Materialflüsse | Fläche, Geschwindigkeit oder Flexibilität optimieren? |
| Sortierung und Fehlerausschleusung | Etikettenqualität, Nacharbeit und Sondergutlinien | Bessere Scanner kaufen oder Nacharbeit personell verstärken? |
| Kundenanfragen | Kundendienst mit eigener Bearbeitungszeit und Befugnissen | Kulanz, Ersatzzustellung oder Rückfrage? |
| Retouren | Rücktransport, Prüfung, Reparatur, Wiederverkauf und Recycling | Welcher Restwert rechtfertigt welche Bearbeitung? |
| Temperaturüberwachung | Zeitabhängige Verderbnis und gekühlte Kapazitäten | Umladen, nachkühlen, priorisieren oder abschreiben? |
| Zollklassifizierung | Fiktive Frachtkategorien, Dokumente und Prüffristen | Spezialpersonal beschäftigen oder Abwicklung zukaufen? |
| Adresskorrektur | Datenqualität und Ausnahmebearbeitung | Vor Abfahrt klären oder Zustellrisiko eingehen? |
| Spitzenauslastung | Absatzprognose, Vorproduktion und saisonale Planung | Zeitarbeit, Mietfahrzeuge oder dauerhafter Ausbau? |
| Routenplanung | Touren nach Kapazität, Zeitfenster und Rückladung | Expressfahrt oder gebündelte Tour? |
| Emissionsvergleich | Energie- und Transportstrategie mit Auftragsanforderungen | Welche Lösung erfüllt Kosten-, Zeit- und Umweltziele? |
| Fahrerpausen | Schichten, Ablösung, Rastplätze und Reichweiten | Zusätzliche Besatzung oder längere Reisezeit? |
| Hafenumschlag | Buchbare Seefracht, später eigener Terminalbetrieb | Günstigere große Lose oder geringere Kapitalbindung? |
| Luftfrachtabfertigung | Expresskapazitäten und passende Ladeeinheiten | Hohe Frachtkosten für einen kritischen Termin akzeptieren? |
| Vorfälle und Freigaben | Delegierbare Betriebsführung mit Budgetgrenzen | Welche Eingriffe darf die Betriebsleitung selbst vornehmen? |
| Rückschau | Ursachenanalyse vergangener Störungen | Welche bauliche oder organisatorische Änderung hilft tatsächlich? |
| Suche und Detailkarten | Verlinkte Unternehmensdatenbank | Vom Symptom bis zum verantwortlichen Prozess navigieren |

Die rechte und mittlere Spalte sind eigene Designvorschläge. Sie behaupten keine entsprechenden Kauf-, Bau- oder Managementfunktionen auf der Referenzseite.

## 2. Anonymisierung und eigenständige Gestaltung

Die Übertragung übernimmt abstrakte Prozesse. Es wird keine Kopie des ursprünglichen Datenbestands mit ausgetauschten Namen angelegt.

| Kategorie | Festlegung für das neue Spiel |
|---|---|
| Unternehmen, Marken, Logos | Neue fiktive Organisationen, eigene Grafiken und ein eigener Spieltitel |
| Personen | Neu erzeugte Spielfiguren mit unabhängigen internen IDs |
| Adressen und Geografie | Erfundenes Straßennetz und erfundene Orte ohne reale Wohnadressen oder Koordinaten |
| Standort- und Fahrzeugkennungen | Neu erzeugte Kennungen, z. B. ST-001 und FZ-001; keine Zuordnungstabelle zur Referenz |
| Sendungen und Chargen | Neue IDs aus dem Spielstand; keine übernommenen Trackingnummern |
| Nachrichten und Freitext | Eigene Vorlagen und generierte Spielereignisse; keine kopierten Kunden- oder Fahrernachrichten |
| Wirtschaftsdaten | Neue Spielwerte für Preise, Löhne, Kapazitäten, Verträge und Nachfrage |
| Länder, Zoll und Arbeitszeiten | Klar bezeichnete fiktive Spielregeln; keine stillschweigende Übernahme landesspezifischer Regeln |
| Modelle und Programmcode | Eigenständige Umsetzung; keine übernommenen Geometrien, Logos oder kopierten Programmteile |
| Spielstände und Exporte | Ausschließlich synthetischer Spielzustand; keine Zugangsschlüssel, Originaldaten oder Analyseprotokolle |

Der Quellenverweis am Dokumentende dient nur der Nachvollziehbarkeit der Untersuchung. Er ist kein Bestandteil der späteren Spielwelt. Die öffentlich erreichbare Referenzseite wurde nicht verändert.

Für die Anwendung gelten prüfbare technische Anforderungen: keine Konten, keine eigenen Trackingdienste, keine Werbe-SDKs, keine externen Spiel- oder KI-APIs, keine extern geladenen Schriften und keine Cookies der Spielanwendung. Spielstände bleiben lokal und lassen sich exportieren und löschen. Bibliotheken und Assets werden mit dem Spiel ausgeliefert.

Die Formulierung „100 % DSGVO-konform“ aus dem Ausgangsprompt wird nicht als ungeprüfte Garantie übernommen. Auch Hosting und Anwendung sind zu unterscheiden: GitHub dokumentiert bei GitHub Pages die Speicherung von Besucher-IP-Adressen zu Sicherheitszwecken [Q2].

## 3. Unternehmensmodell und Spielgefühl

Der Spieler gründet einen Betrieb in einer kleinen, weitgehend leeren Halle. Anfangs werden wenige Komponenten montiert und regionale Kunden beliefert. Später betreibt das Unternehmen Fabriken, Lager, Umschlagplätze und Transportverbindungen.

Drei Geschäftsfelder greifen ineinander:

1. **Eigene Produkte:** Entwickeln, herstellen, vermarkten und ausliefern. Produktpreis und Absatz bestimmen die Nachfrage.
2. **Auftragsfertigung:** Nach Kundenspezifikation produzieren. Vergütung hängt von Menge, Qualität und Termin ab.
3. **Logistik für Dritte:** Fremde Waren lagern, kommissionieren, verpacken und transportieren. Diese Waren bleiben buchhalterisch vom eigenen Bestand getrennt.

Die gemeinsame Kapazität schafft die wichtigen Entscheidungen: Ein lukrativer Fremdauftrag belegt dieselben Rampen und Beschäftigten, die gerade für die eigenen Produkte gebraucht werden. Eine gut ausgelastete Anlage kann trotz hoher Umsätze Geld verlieren. Eine leere Rückfahrt kann für Retouren oder Zulieferteile genutzt werden.

Automatisierung arbeitet während der laufenden Spielzeit. Als vorgeschlagener Standard pausiert das Spiel beim Schließen und beim Wechsel in einen inaktiven Tab; es entstehen keine nachträglichen Offlinefortschritte. Ein späterer Offline-Modus wäre eine gesonderte, ausdrücklich beschriebene Spielregel.

### 3.1 Drei miteinander verbundene Ansichten

| Ebene | Darstellung | Hauptentscheidungen |
|---|---|---|
| Halle | Maschinen, Beschäftigte, Regale, Förderbänder und tatsächliche Transportaufträge | Produktionsablauf, Materialbereitstellung, Arbeitsplätze und Wege |
| Betriebsgelände | Hallen, Straßen, Rampen, Wartespuren, Werkstatt, Energie und Erweiterungsflächen | Flächennutzung, Verkehr, Anlieferung und Versorgung |
| Unternehmensnetz | Standorte, Kunden, Lieferanten und Verkehrsverbindungen | Beschaffung, Standortstrategie, Transportmittel und Kapazitätsverteilung |

Jeder Datensatz ist zwischen diesen Ansichten verlinkt. Ein Auftrag führt zu seiner Charge, seinem Lagerplatz, dem zugewiesenen Fahrzeug und den verursachten Kosten. Entfernte Standorte werden weiterhin simuliert, ohne jedes Objekt gleichzeitig in 3D zeichnen zu müssen.

## 4. Die wesentlichen neuen Spielsysteme

### 4.1 Produkte, Konstruktion und Qualität

Produkte bestehen aus Stücklisten und Arbeitsplänen. Ein Arbeitsplan beschreibt erlaubte Maschinen, Bearbeitungsreihenfolge, Zeitbedarf, Qualifikation, Energiebedarf und Qualitätsprüfung. Varianten nutzen gemeinsame Komponenten, benötigen aber teilweise andere Werkzeuge oder Prüfprogramme.

Für den Einstieg eignet sich eine fiktive Technikbranche: Arbeitsleuchten, Sensorbausteine und kleine Steuergeräte. Später kommen Verpackungsmaschinen, Lagertechnik oder Kühlmodule hinzu. Der Spieler entscheidet über Leistung, Haltbarkeit, Reparierbarkeit, Materialqualität, Verpackung und Verkaufspreis.

Ein besseres Gehäuse senkt Transportschäden, benötigt aber mehr Material und Platz. Eine besonders leistungsstarke Ausführung verkauft sich teurer, dauert länger in der Montage und belastet die Prüfung stärker. Qualität ist damit ein Ergebnis der Produktionskette und kein frei hochziehbarer Prozentregler.

### 4.2 Maschinen mit festen Fähigkeiten

Jede Maschine erhält erlaubte Prozesse, Ein- und Ausgänge, einen Arbeitsbereich sowie Wartungszugang. Eine Maschine verarbeitet nur passende Materialien nach einem freigeschalteten Rezept.

| Maschinentyp | Beispielaufgabe | Wichtige Begrenzung |
|---|---|---|
| Trennmaschine | Material in Rohteile teilen | Materialtyp, Werkzeug und Ausschuss |
| Formmaschine | Gehäuseteile herstellen | Werkzeugwechsel und Losgröße |
| Elektronikarbeitsplatz | Baugruppe bestücken | Qualifikation und Teileversorgung |
| Montagebank | Komponenten zum Produkt verbinden | Beschäftigte und Bearbeitungszeit |
| Prüfstand | Funktions- und Qualitätsprüfung | Prüfprogramm und Prüfzeit |
| Verpackungsstation | Produkt und Beilagen verpacken | Kartons, Einlagen und Bedienpersonal |
| Etikettierer | Sendungen kennzeichnen | Etikettenvorrat und Lesbarkeit |
| Palettierer | Kartons zu Ladeeinheiten bündeln | Lademuster, Gewicht und Stellplatz |
| Reparaturplatz | Fehlerhafte Produkte nacharbeiten | Ersatzteile und Diagnosezeit |

Für jede Maschine werden Nennleistung, tatsächliche Leistung, Rüstzeit, Zustand, Energiebedarf, Personalbedarf, Eingangs- und Ausgangspuffer gezeigt. Die Anzeige erklärt einen Stillstand konkret: Material fehlt, Bedienperson fehlt, kein Strom, Ausgang voll, Werkzeugwechsel oder Defekt.

**Beispiel mit frei gewählten Spielwerten:** Fertigung schafft 120 Einheiten pro Stunde, Montage 80 und Prüfung 60. Die Linie liefert unter sonst idealen Bedingungen höchstens 60 geprüfte Einheiten pro Stunde. Ein zweiter Prüfstand verschiebt die Grenze auf 80; er verdoppelt nicht automatisch die Gesamtleistung. Tatsächliche Lieferung kann durch Personal, Lager und Transport weiter sinken.

### 4.3 Einkauf und Lieferanten

Lieferanten unterscheiden sich durch Preis, Mindestmenge, Lieferzeit, Zuverlässigkeit und Teilequalität. Rahmenverträge senken Preise, binden aber Mengen. Expressbeschaffung rettet Termine und verringert die Marge.

Ein teurer Zweitlieferant ist eine Absicherung gegen Ausfälle. Große Bestellungen reduzieren Stückkosten, belegen aber Lagerraum und Liquidität. Sicherheitsbestand, Wiederbestellpunkt und Bestellmenge werden pro Material festgelegt.

Bestellte Waren müssen tatsächlich angeliefert, geprüft und eingelagert werden. Die Anzeige trennt bestellt, unterwegs, eingetroffen, gesperrt, reserviert und frei verfügbar.

### 4.4 Materialfluss und Lager

Es gibt getrennte Bereiche für Wareneingang, Prüfung, Quarantäne, Rohstoffe, Zwischenprodukte, Fertigware, Versandbereitstellung und Retouren. Jeder Lagerplatz besitzt Volumen- und Gewichtsgrenzen sowie zulässige Warenarten.

Transport erfolgt durch Beschäftigte, Handwagen, Stapler, Förderbänder oder Roboter. Wege, Übergabeplätze und Kreuzungen begrenzen den Durchsatz. Die Simulation verhindert Doppelbelegung und widersprüchliche Reservierungen.

Lagerstrategien umfassen feste Plätze, freie Plätze, schnell drehende Artikel nahe der Entnahme sowie Entnahme nach Eingang oder Ablaufdatum. Auch Leergut, Paletten, Kartons und Verpackungsmaterial brauchen Platz und Rückführung.

Die Warenkette ist immer nachvollziehbar: Eine Einheit hat einen Besitzer, eine Menge, einen Ort und einen Zustand. Waren können nicht gleichzeitig frei im Lager und auf einem Fahrzeug verfügbar sein.

### 4.5 Beschäftigte und Schichten

Rollen umfassen Maschinenbedienung, Lager, Kommissionierung, Qualitätssicherung, Instandhaltung, Fahrdienst, Disposition, Kundendienst und Betriebsleitung. Pro Person werden Qualifikationen, Erfahrung, Schicht, Lohn, Belastung, Müdigkeit, Zufriedenheit und aktueller Auftrag simuliert.

Pausen, Einarbeitung und Vertretung brauchen eingeplante Zeit. Ein Facharbeiter kann mehrere Prozesse beherrschen, aber keine zwei entfernten Tätigkeiten gleichzeitig ausführen. Erfahrung verbessert passende Tätigkeiten; sie ersetzt kein benötigtes Werkzeug und keine freie Maschine.

Der Spieler kann Abteilungen mit Regeln führen, statt hunderte einzelne Arbeitsaufträge anzuklicken. Beispiel: „Das Lager erhält Mindestbesetzung; freie qualifizierte Kräfte unterstützen danach die Verpackung.“

### 4.6 Betriebsgelände und Baumodus

Errichtbar sind Wände, Tore, Wege, Arbeitsbereiche, Maschinen, Regale, Fördertechnik, Rampen, Parkplätze, Wartungsflächen und Versorgungsanlagen. Platzierung berücksichtigt Grundfläche, Anschlüsse, Ein- und Ausgang sowie Zugänglichkeit.

Ein Planungsmodus zeigt Baukosten, laufende Kosten und voraussichtliche Materialwege vor der Umsetzung. Bereichsvorlagen lassen sich kopieren und drehen. Umbauten im laufenden Betrieb verursachen Übergangszeiten; Maschinen mit Materialinhalt werden kontrolliert geleert oder umgelagert.

Rangierende Fahrzeuge benötigen freie Flächen. Eine zusätzliche Rampe bringt wenig, wenn ihre Zufahrt oder die Wareneingangszone blockiert bleibt.

### 4.7 Fuhrpark, Beladung und Zustellung

Fahrzeuge haben Nutzlast, Ladevolumen, Palettenplätze, Antriebsart, Reichweite, Temperaturausstattung, Zustand und Betriebskosten. Ihre Eignung ergibt sich aus diesen Eigenschaften.

Beladung berücksichtigt Reihenfolge, Warenverträglichkeit und Entladestellen. Eine ungeeignete Ladereihenfolge verursacht zusätzliche Arbeit. Lieferfenster, Verkehr, Warteschlangen, Schichten und Pausen verändern die prognostizierte Ankunft.

Der Spieler kombiniert eigene Fahrzeuge, Miete und Fremdspediteure. Rückladungen können Material oder Retouren aufnehmen. Regelmäßige Touren, Expressaufträge und Sammelverkehre teilen dieselbe Flotte.

### 4.8 Transportnetz, Bahn, Schiff und Flugzeug

Straßenverkehr ist der Einstieg. Bahn-, See- und Luftfracht werden zunächst als buchbare Leistungen externer Anbieter eingeführt. Eigene Umschlaganlagen und Spezialfahrzeuge folgen später, wenn die Größenordnung des Unternehmens sie sinnvoll macht.

Jede Verbindung besitzt Fahrplan, Transportdauer, Kapazität, Preis und Umbuchungsbedingungen. Ein verpasster Anschluss kostet reale Spielzeit. Große Ladeeinheiten werden erst bei sinnvoller Bündelung wirtschaftlich.

Das Spiel kann so ein großes Verkehrsnetz anbieten, ohne den Spieler bereits zu Beginn mit einem eigenen Flughafenbetrieb zu belasten.

### 4.9 Vertrieb, Verträge und Kunden

Aufträge entstehen aus Nachfrage, Angeboten, Ausschreibungen und Kundenbeziehungen. Die angebotenen Mengen und Liefertermine müssen vor Annahme mit der verfügbaren Kapazität verglichen werden können.

Verträge definieren Produkt, Menge, Qualitätsklasse, zulässige Teillieferungen, Terminfenster, Vergütung und Folgen von Abweichungen. Daueraufträge stabilisieren die Planung; Eilaufträge bringen höhere Erlöse bei größerem Risiko.

Scanner bleiben Geräte zur Identifikation und Qualitätskontrolle. Die Entdeckung neuer Kunden gehört in Vertrieb und Marktforschung. Die Sendungshistorie bleibt eine Diagnosefunktion; ein Forschungsbaum erhält einen eigenen Bereich.

### 4.10 Finanzen und Unternehmensführung

Der Spieler sieht Kontostand, offene Forderungen, Verbindlichkeiten, laufende Kosten, Lagerwert, Auslastung und Ergebnis je Produkt, Auftrag, Route und Standort. Zahlung und Ertrag sind getrennte Ereignisse: Ein ausgelieferter Auftrag kann noch unbezahlt sein; ein Materialeinkauf bindet bereits Geld.

Investitionen umfassen Maschinen, Fahrzeuge, Gebäude und Forschung. Laufende Aufwände umfassen Materialverbrauch, Löhne, Energie, Wartung, Miete, Transport und Ausschuss. Das Spielmodell erklärt verständlich, wie es diese Posten behandelt.

Logistik für das eigene Werk kann intern Kosten zugeordnet bekommen. Solche internen Verrechnungen erzeugen keinen zusätzlichen Konzernumsatz. Fremde Lagerware wird nicht als eigenes verkäufliches Vermögen behandelt.

Eine drohende Zahlungsunfähigkeit eröffnet Maßnahmen wie Verkauf, Vermietung, Umschuldung oder Verkleinerung. Ein harter sofortiger Spielabbruch ist als Standard nicht vorgesehen.

### 4.11 Qualität, Rückrufe und Retouren

Jede Produktionscharge ist mit verwendeten Komponenten, Maschinen und Prüfungen verbunden. Bei einem Fehler lässt sich der betroffene Bestand finden und sperren. Unbetroffene Ware bleibt lieferfähig.

Retouren werden abgeholt, zugeordnet und geprüft. Anschließend folgen Wiederverkauf, Reparatur, Teilegewinnung, Rücksendung an den Lieferanten oder Entsorgung. Rücktransport und Nacharbeit belegen normale Ressourcen und verursachen Kosten.

Frühe manuelle Einzelentscheidungen erklären das System. Später steuern Grenzwerte und Richtlinien den Großteil der Fälle; nur ungewöhnliche Situationen benötigen Eingriffe.

### 4.12 Kühlkette, Sondergut und Dokumente

Spezialwaren verlangen passende Lagerung, Fahrzeuge, Verpackung und Schulung. Temperaturabweichungen wirken abhängig von Dauer und Empfindlichkeit. Sensoren können Warnungen auslösen; eine Warnung allein beseitigt keinen Defekt.

Für grenzüberschreitende Spielverbindungen werden fiktive Frachtklassen und Dokumentprüfungen genutzt. Unvollständige Angaben verursachen Rückfragen oder Sperrung. Die Regeln sind im Spiel nachlesbar und werden nicht als reale Zoll- oder Rechtsberatung dargestellt.

### 4.13 Energie, Wartung und Ressourcen

Maschinen, Kühlung, Ladegeräte und Gebäude teilen eine begrenzte Versorgung. Lastspitzen können Produktionspläne beeinflussen. Solaranlagen, Speicher und effizientere Geräte verändern Kosten und Versorgungssicherheit.

Wartung braucht Werkstattkapazität, Personal, Ersatzteile und Stillstandszeit. Aufgeschobene Wartung erhöht das Ausfallrisiko. Neue Technologie verbessert ausgewählte Eigenschaften und kann zusätzliche Anforderungen mitbringen.

### 4.14 Automatisierung und delegierte Entscheidungen

Ein lokaler Regelsatz verarbeitet Zustand und Ereignisse. Dafür ist keine externe KI notwendig. Beispiele:

- Wenn verfügbarer Bestand unter dem Mindestwert liegt, bestellt der Einkauf bis zum Zielbestand, soweit sein Budget reicht.
- Wenn eine Warteschlange den Grenzwert überschreitet, fordert die Abteilung qualifizierte Unterstützung an.
- Wenn eine Lieferung zu spät droht, wird eine passende Alternative mit Mehrkosten vorgeschlagen.
- Wenn ein Stapler wenig Energie hat, beendet er eine sicher abschließbare Tätigkeit und reserviert einen erreichbaren Ladeplatz.

Jede Regel besitzt Priorität, Geltungsbereich, Budget und Erklärung. Widersprüche, häufiges Hin-und-her-Schalten und doppelte Bestellungen werden abgefangen. Vorgesetzte können innerhalb vom Spieler gesetzter Grenzen selbst handeln.

### 4.15 Markt, Ereignisse und langfristiger Ausbau

Nachfrage, Rohstoffpreise, Energiepreise und verfügbare Fachkräfte verändern sich innerhalb eines verständlichen Spielmodells. Ereignisse haben erkennbare Ursachen und Vorwarnungen: Verkaufsaktionen erhöhen Bestellungen, Unwetter verlängert Fahrzeiten, ein Qualitätsproblem erzeugt Reklamationen.

Wettbewerber können Aufträge anbieten, Kapazität verkaufen und um Kunden konkurrieren. Später sind Zukäufe, Spezialisierungen oder ein eigenes Händlernetz möglich. Seltene schwere Ereignisse sind abschaltbar.

## 5. Funktionen, die das Spiel besonders machen

**Ein Unternehmensgedächtnis:** Jeder Auftrag zeigt Materialherkunft, Fertigung, Prüfung, Einlagerung, Verladung, Lieferung, Bezahlung und mögliche Rückgabe. Die zugehörigen Personen und Anlagen sind anklickbar.

**Erklärbare Engpässe:** Eine Störung wird als Ursachenkette angezeigt, etwa „Lieferung verspätet → Verpackung wartet → Kartons noch im Wareneingang → kein qualifizierter Staplerfahrer im Dienst“. Dazu werden konkrete Gegenmaßnahmen und ihre Kosten angezeigt.

**Planung vor dem Bauen:** Eine Vorschau schätzt, wie zusätzliche Maschinen, andere Wege oder neue Schichten wirken. Die Vorschau arbeitet auf einer Kopie des Spielzustands und kennzeichnet ihre Annahmen. Sie kann keine Waren oder Gewinne in den echten Spielstand schreiben.

**Produktionspolitik je Auftrag:** Für kritische Aufträge kann der Spieler kleinere Lose, Zusatzprüfungen oder Expressmaterial zulassen. Massenaufträge nutzen andere Regeln. So entsteht strategische Vielfalt ohne hundert neue Menüs.

**Spezialisierung mit Folgen:** Ein günstiger Massenfertiger braucht andere Prozesse als ein Qualitätshersteller oder ein Speziallogistiker. Keine Strategie soll gleichzeitig in allen Kennzahlen überlegen sein.

**Reparatur als eigenes Geschäft:** Rückläufer können eine rentable Aufarbeitungslinie versorgen. Reparierbare Konstruktion senkt dabei Aufwand und Teileverbrauch.

**Einheitliche Betriebsakte:** Die Kennzahl „zu spät“ führt mit einem Klick zu betroffenen Aufträgen; diese führen zur Ursache. Tabellen, Karte und 3D-Welt zeigen denselben Zustand.

## 6. Beispiel eines zusammenhängenden Spielablaufs

Ein erfundener Kunde bestellt 600 Arbeitsleuchten mit einem Lieferfenster am Ende des fünften Spieltags. Alle Zahlen dieses Beispiels sind neue Spielannahmen.

1. Das Angebot kalkuliert Teile, Produktionszeit, Prüfungen, Personal, Verpackung, Fracht und erwarteten Ausschuss.
2. Der Einkauf bestellt fehlende Steuerplatinen; der Spieler wählt zwischen einem günstigen späten und einem teureren schnellen Lieferanten.
3. Die Produktion reserviert Materialien und Kapazitäten. Die Auftragsplanung zeigt, dass der Prüfstand die Leistung begrenzt.
4. Eine neue Schicht würde nur helfen, wenn eine qualifizierte Person tatsächlich verfügbar ist. Ein zweiter Prüfstand benötigt zusätzlich Platz, Strom und Materialzufuhr.
5. Die fertigen Leuchten gelangen zur Verpackung. Ein Fremdkundenauftrag blockiert einen Teil der Versandfläche.
6. Der Spieler priorisiert die Leuchten oder kauft kurzfristige Außenlagerung. Beide Entscheidungen haben sichtbare Kosten und Folgen.
7. Die Disposition vergleicht eine gebündelte Tour mit einer teureren Direktfahrt. Fahrerzeit und Rampenfenster gehen in die Prognose ein.
8. Eine gelieferte Teilmenge wird vom Kunden abgenommen. Die Rechnung wird später bezahlt; bis dahin bleibt eine Forderung offen.
9. Einige Geräte kommen zurück. Die Chargenakte zeigt eine fehlerhafte Komponentenlieferung. Verwandte Bestände werden geprüft und gegebenenfalls gesperrt.
10. Die Nachkalkulation zeigt, ob der Auftrag nach Expresskosten, Nacharbeit und Retouren noch profitabel war.

Das Spiel gewinnt Tiefe dadurch, dass dieselben Ressourcen in mehreren dieser Schritte konkurrieren.

## 7. Oberfläche und Darstellung

Die 3D-Welt erhält den größten Bildschirmbereich. Vorgeschlagen sind bei 1920 × 1080 eine etwa 44 Pixel hohe obere Leiste, eine schmale Werkzeugleiste links und eine nur bei Bedarf geöffnete Detailkarte rechts. Diese Maße sind Entwurfswerte und werden bei der Umsetzung auf Lesbarkeit geprüft.

Oben stehen Geld, Ergebnis, Auftragsrisiken, Unternehmensmeldungen und Zeitsteuerung. Unten erscheint die Bauleiste nur im Baumodus. Detailfenster sind anheftbar; ausgewählte Kennzahlen können als kleine Widgets bleiben. Große Vollbildtabellen öffnen sich gezielt für Planung und Vergleich.

Wichtige Ebenen sind Materialfluss, Wartezeiten, Auslastung, Energie, Arbeitswege und Liefertermine. Farbe wird durch Symbole und Text ergänzt. Texte bleiben auch ohne Glas- oder Unschärfeeffekt lesbar. Bewegungsreduktion, skalierbare Schrift, Tastenkürzel und vollständig deutsche Bedienung gehören zum Konzept.

Ein WebGL-Ausfall darf die gesamte Anwendung nicht verschwinden lassen. Eine einfache 2D-Betriebsübersicht und Tabellen sollen den gespeicherten Betrieb weiterhin zugänglich machen. Diese Anforderung folgt direkt aus der bei der Untersuchung beobachteten technischen Grenze.

## 8. Technische Leitplanken

### 8.1 Simulationskern

Die maßgeblichen Daten liegen in einem Simulationsmodell. Die 3D-Szene zeichnet diesen Zustand und verändert keine Warenbestände durch Animationen. Bedienaktionen werden als überprüfbare Befehle an die Simulation geschickt.

Vorgeschlagen ist ein fester Zeitschritt für operative Abläufe, ergänzt durch terminierte Ereignisse für Bestellungen, Fahrten, Zahlungen und Wartung. Ein reproduzierbarer Zufallsgenerator steuert Zufallsereignisse. Speicherung umfasst auch dessen Zustand, offene Reservierungen, laufende Arbeiten und geplante Ereignisse.

`requestAnimationFrame` dient der Darstellung. Browser können dessen Aufrufe in Hintergrund-Tabs pausieren; auch die Bildwiederholrate variiert [Q3]. Deshalb darf die Wirtschaft nicht nach dem Muster „pro gerendertem Bild Geld addieren“ arbeiten.

### 8.2 Fachliche Module

| Modul | Verantwortung |
|---|---|
| Simulation und Spielzeit | Zustandsänderungen, Ereignisse, Zufall und Geschwindigkeitsregeln |
| Material und Lager | Mengen, Eigentum, Position, Reservierung und Qualität |
| Produkte und Rezepte | Stücklisten, Arbeitspläne, Varianten und Freischaltungen |
| Produktion | Maschinenbelegung, Rüsten, Bearbeitung, Puffer und Ausschuss |
| Arbeitskräfte | Schichten, Fähigkeiten, Aufträge und Pausen |
| Bau und Wege | Platzierung, Erreichbarkeit, Verkehrsregeln und Versorgungsnetze |
| Beschaffung und Markt | Angebote, Bestellungen, Kunden und Nachfrage |
| Aufträge und Transport | Zusagen, Planung, Ladeeinheiten, Routen und Zustellung |
| Finanzen | Zahlungen, Forderungen, Kosten und Auswertungen |
| Qualität und Rückläufe | Prüfungen, Sperren, Reklamationen und Verwertung |
| Betriebsregeln | Automatisierung, Prioritäten, Budgetgrenzen und Erklärungen |
| Speichern | Versionierte Spielstände, Backups, Import, Export und Migration |
| Darstellung und Bedienung | 3D, 2D-Ersatzansicht, Tabellen und Werkzeuge |

Komposition und klar definierte Schnittstellen sind wichtiger als eine künstlich tiefe Vererbungshierarchie. Eine Maschine kann zum Beispiel Bearbeitung, Energieverbrauch und Wartung als getrennte Eigenschaften besitzen. Lernkommentare erklären Entscheidungen und Zusammenhänge.

### 8.3 Leistung und statische Veröffentlichung

Sichtbare Gegenstände können gruppiert gezeichnet werden; entfernte Bewegungen dürfen vereinfacht dargestellt werden. Auftragsmengen, Warenzustände und Geld bleiben dabei erhalten. Der Wechsel der Kamera oder eines Standortes darf die Produktion weder beschleunigen noch stoppen.

Der Quellcode wird modular entwickelt und zu einem statischen Verzeichnis gebaut. Bibliotheken, Modelle und Schriften liegen darin. GitHub Pages unterstützt die Veröffentlichung statischer HTML-, CSS- und JavaScript-Dateien [Q2]. Das Spiel benötigt keinen eigenen Laufzeitserver.

Ein Programm aus mehreren Quelldateien kann trotzdem einfach hochgeladen werden. Eine zwingende einzelne HTML-Datei ist für dieses Projekt bislang nicht als Nutzeranforderung festgelegt. Sie wäre eine zusätzliche Paketierungsentscheidung. Statisches Hosting und Öffnen per Doppelklick über `file://` sind unterschiedliche Betriebsarten und müssen bei Bedarf getrennt geprüft werden.

## 9. Entwicklungsphasen mit überprüfbaren Ergebnissen

| Phase | Inhalt | Abnahme |
|---|---|---|
| A: Durchgängiger erster Betrieb | Kleine leere Halle, Bau, Materiallieferung, Beschäftigte, mehrere spezialisierte Arbeitsplätze, Prüfung, Lager, ein Fahrzeug, Kundenauftrag, Zahlung, Speichern | Ein Auftrag durchläuft die vollständige Kette und verändert Bestände sowie Geld korrekt |
| B: Betriebliche Tiefe | Varianten, Rüsten, Schichten, Wartung, Reservierungen, Retouren, Automatisierungsregeln und verständliche Engpassdiagnose | Ein geplanter Engpass lässt sich erkennen und durch eine passende Entscheidung beseitigen |
| C: Unternehmensnetz | Mehrere Standorte, Fremdlogistik, Touren, Rückladung, Lieferfenster, Fremdspediteure und Standortrechnung | Eigenproduktion und Fremdaufträge konkurrieren nachvollziehbar um gemeinsame Kapazität |
| D: Speziallogistik und Konzern | Kühlkette, fiktive Dokumentprüfung, Bahn/See/Luft, größere Märkte, Planungsszenarien und Delegation | Die Erweiterungen wirken auf dieselben Mengen-, Zeit- und Geldmodelle |

Alle Kernbereiche erhalten früh klare Datenmodelle und Zuständigkeiten. Die Umsetzung erfolgt dennoch in vollständigen Abläufen. Eine Phase gilt nicht als fertig, wenn ihre Schaltflächen nur Attrappen sind. Neue Inhalte dürfen bestehende Spielstände und Abläufe nicht stillschweigend zerstören.

### 9.1 Verhaltensprüfungen

1. Zwei angelieferte Ladeeinheiten werden beide verarbeitet oder jeweils mit eigenem Wartegrund angezeigt; keine verschwindet.
2. Material kann nicht gleichzeitig an zwei Maschinen reserviert werden.
3. Eine Maschine startet ohne zulässiges Material, Personal oder Versorgung nicht.
4. Ein voller Ausgangspuffer hält die vorgelagerte Arbeit kontrolliert an.
5. Eine unpassende Maschine lehnt ein Rezept mit verständlicher Begründung ab.
6. Ein gesperrter Weg führt zu einer neuen Route oder einem erklärten Wartezustand.
7. Ein Fahrzeug überschreitet keine definierte Ladegrenze und liefert nur tatsächlich geladene Ware.
8. Eine Retoure wird nur einmal erstattet und nur einmal wieder eingelagert oder verwertet.
9. Derselbe Anfangszustand und dieselben Befehle führen bei gleicher Simulationszeit bei 1× und 4× zu gleichen fachlichen Ergebnissen.
10. Speichern und Laden während Fertigung, Fahrt und Pause erhält Fortschritt, Reservierungen und offene Ereignisse.
11. Eine Planungsvorschau verändert weder Bestände noch Geld des echten Betriebs.
12. Ein angenommenes Angebot erzeugt keinen Zahlungseingang vor dem im Vertrag vorgesehenen Zeitpunkt.
13. Fehlende 3D-Unterstützung zeigt eine bedienbare Ersatzansicht statt einer leeren Seite.
14. Ein alter oder beschädigter Spielstand wird migriert oder mit verständlicher Meldung abgewiesen, ohne den letzten intakten Stand zu überschreiben.
15. Kamerazoom, geöffnete Tabellen und unsichtbare Standorte verändern keine fachlichen Ergebnisse.

## 10. Vollständiger erweiterter Masterprompt

Der folgende Abschnitt ist als eigenständiger Entwicklungsauftrag kopierbar. Er ist ein Vorschlag für die spätere Umsetzung und bedeutet nicht, dass das Spiel bereits entwickelt wurde.

---

**BEGINN MASTERPROMPT**

### Rolle und Auftrag

Handle als erfahrener Entwickler für browserbasierte Wirtschaftssimulationen. Vereine die Perspektiven Game Design, Produktionsplanung, Logistik, Softwarearchitektur, 3D-Darstellung, Bedienbarkeit und Qualitätssicherung. Erkläre wichtige Architekturentscheidungen für einen Programmieranfänger in verständlichem Deutsch.

Entwickle schrittweise das eigenständige PC-Spiel **Industrie & Logistik**. Der Spieler gründet ein Unternehmen mit eigener Fertigung, Lagerung und Transport. Er entwickelt und verkauft eigene Produkte, nimmt Fertigungsaufträge an und bietet Logistikleistungen für andere Firmen an.

Das langfristige Ziel ist ein wachsendes Unternehmensnetz mit mehreren Fabriken und Logistikstandorten. Beginne mit einem kleinen Betrieb, dessen vollständige Wertschöpfungskette bereits spielbar ist. Baue jede Entwicklungsphase auf diesem funktionierenden Kern auf.

### Unverzichtbare Gestaltungsregeln

1. Alle Kennzahlen entstehen aus dem tatsächlichen Spielzustand. Zufällig animierte Dashboardzahlen sind unzulässig.
2. Herstellung, Personal, Lager, Transport und Geld sind fachlich gekoppelt. Zusätzliche Leistung entsteht nur, wenn die benötigten Ressourcen verfügbar sind.
3. Jeder relevante Vorgang besitzt eine nachvollziehbare Ursache, Dauer und Wirkung.
4. Waren besitzen eindeutige IDs beziehungsweise eindeutig verwaltete Chargen, Mengen, Eigentümer, Zustände und Positionen.
5. Maschinen besitzen feste zulässige Prozesse. Ein neues Rezept kann nicht ohne passende Anlage ausgeführt werden.
6. Entfernungen und Übergaben verursachen Zeit. Es gibt keine unsichtbaren sofortigen Transfers zwischen Lager und Maschine.
7. Automatisierung spart wiederholte Eingaben und benötigt weiterhin Personal, Anlagen, Energie und Kapazität.
8. Forschung ist ein eigener Bereich. Verfolgung und Prozesshistorie bleiben Diagnosewerkzeuge.
9. Kunden und Aufträge entstehen aus dem Markt- und Vertriebssystem. Scanner identifizieren und prüfen vorhandene Ware.
10. Die Oberfläche erklärt Stillstände und Handlungsoptionen mit Kosten und Auswirkungen.

### Fiktive Daten und lokaler Betrieb

Erzeuge sämtliche Unternehmen, Personen, Adressen, Standorte, Kennungen, Aufträge, Waren und Nachrichten unabhängig neu. Verwende keine ursprünglichen Marken, Logos, Kundendaten, Adressen oder kopierten 3D-Modelle einer Referenz. Baue eine fiktive Geografie mit eigenem Verkehrsnetz.

Die Spielanwendung benötigt keine Anmeldung, keine externe KI, keine Spielserver-API, keine Werbedienste und keine Telemetrie. Sie setzt keine Cookies. Liefere Bibliotheken, Schriften und Assets lokal mit; lade sie zur Laufzeit nicht von Drittanbieter-CDNs.

Speichere Spielstände lokal mit automatischen Backups. Biete JSON-Import und -Export sowie verständliche Löschfunktionen. Validiere importierte Daten und migriere ältere gültige Versionen. Eine fehlerhafte Datei darf den letzten intakten Spielstand nicht überschreiben.

Veröffentliche als statische Website, die sich für GitHub Pages eignet. Beschreibe den Unterschied zwischen der lokal berechneten Spielsimulation und dem Netzwerkzugriff zum erstmaligen Laden der Website. Gib keine ungeprüfte rechtliche Datenschutzgarantie ab.

### Spielstart, Zeit und Fortschritt

Starte in einer kleinen, weitgehend leeren Halle mit überschaubarem Budget, wenigen Beschäftigten und Zugang zu einer regionalen Lieferzone. Die erste Aufgabe lautet: ein einfaches Technikprodukt vollständig herstellen, prüfen, verpacken und ausliefern.

Biete Pause sowie mehrere Geschwindigkeiten. Alle Zeitangaben folgen derselben Spieluhr. Als Standard pausiert die Simulation beim Schließen und im inaktiven Tab; es gibt keine nachträglichen Offlineerträge. Mache dieses Verhalten sichtbar.

Fortschritt entsteht aus funktionierenden Prozessen, Produktentwicklung, Erfahrung, Nachfrage und Investitionen. Neue Anlagen bringen verständliche Vorteile und Folgekosten. Biete einen geführten Einstieg, einen Wirtschaftsmodus und einen freien Baumodus mit getrennten Spielständen. Zahlungsprobleme ermöglichen Sanierung und Verkleinerung.

### Herstellung und Produkte

Implementiere Produkte mit Stücklisten, Varianten, Qualitätsklassen und mehrstufigen Arbeitsplänen. Beginne mit Arbeitsleuchten und erweiterbaren Komponenten. Ein Produkt kann später Komponenten anderer Produkte verwenden.

Arbeitspläne enthalten Reihenfolge, Eingabematerialien, Ausgaben, Bearbeitungszeit, Maschinenfähigkeit, erforderliche Qualifikation, Energie, Werkzeug und mögliche Qualitätsverluste. Veränderungen an Rezepten oder Produkten werden versioniert, damit bereits laufende Aufträge verständlich bleiben.

Maschinen besitzen Anschaffungskosten, laufende Kosten, Zustand, Wartungsintervall, Rüstzeit, Arbeitsbereich, Ein- und Ausgangspuffer sowie erlaubte Rezepte. Zeige Nennleistung und tatsächliche Leistung getrennt. Modelle mindestens die Zustände frei, rüstend, arbeitend, ohne Material, ohne Bedienperson, Ausgang blockiert, Wartung und defekt.

Ergebnisqualität hängt vom Material, Maschinenzustand, Personal und gewähltem Arbeitsplan ab. Ausschuss und Nacharbeit beeinflussen Zeit und Kosten. Fertigware entsteht ausschließlich durch abgeschlossene zulässige Produktionsschritte.

### Beschaffung, Lager und innerbetrieblicher Transport

Beschaffung arbeitet mit Angeboten, Bestellungen, Lieferzeiten, Mindestmengen und Lieferantenqualität. Biete Alternativlieferanten und Expressbeschaffung. Trenne bestellt, unterwegs, eingetroffen, gesperrt, reserviert und verfügbar.

Baue Wareneingang, Prüfung, Quarantäne, Rohstofflager, Zwischenlager, Fertigwarenlager, Versand und Retourenbereich. Lagerplätze berücksichtigen Gewicht, Volumen, Zulässigkeit und Reservierung. Simuliere Packmittel und Leergut.

Beschäftigte, Handwagen, Stapler, Bänder und später Roboter führen Transportaufträge aus. Ein Auftrag wird nur einer geeigneten Ressource verbindlich zugeteilt. Abbruch, Umbau und Ausfall lösen Reservierungen kontrolliert oder übertragen sie nachvollziehbar.

Verhindere Doppelbelegung, negative Bestände und unbeabsichtigte Vervielfältigung. Ist ein Ziel voll oder unerreichbar, bleibt die Ware an einem gültigen Ort und erhält einen erklärten Wartezustand. Gegenseitiges Blockieren muss erkannt und durch Rücksetzen, Freigeben oder Umplanen aufgelöst werden können.

### Personal

Beschäftigte besitzen eine fiktive Identität, Rolle, Qualifikationen, Erfahrung, Lohn, Schicht, Belastung, Müdigkeit, Zufriedenheit und aktuellen Auftrag. Sie benötigen Wegzeit, Einarbeitung und Pausen.

Ermögliche Einstellung, Qualifizierung, Schichtplanung und Abteilungszuweisung. Ein Beschäftigter darf keine zwei Tätigkeiten gleichzeitig ausführen. Die Abwesenheit einer qualifizierten Person kann einen Prozess stoppen. Später dürfen Vorgesetzte Personal innerhalb festgelegter Prioritäten einsetzen.

Gestalte sinnvolle Entscheidungen zwischen zusätzlicher Schicht, Automatisierung, Schulung und Neubeschaffung. Stelle Beschäftigte als sichtbare, verständlich handelnde Figuren dar.

### Bau und Versorgung

Implementiere einen Rasterbaumodus mit Drehen, Verschieben, Abriss, Flächenplanung und Kopieren geeigneter Bereiche. Prüfe Grundfläche, Erreichbarkeit, Ein- und Ausgang sowie Wartungszugang vor der Platzierung.

Maschinen, Regale, Wege, Türen, Tore, Rampen und Versorgungsanlagen müssen tatsächlich nutzbar verbunden sein. Zeige Platzierungsfehler direkt in der Vorschau. Gebaute Hindernisse aktualisieren Wege und Aufträge.

Berücksichtige Kosten und Betriebsunterbrechung bei Umbauten. Entferne belegte Anlagen nicht mitsamt ihrem Inhalt. Ermögliche kontrolliertes Leeren oder Umlagern. Später kommen Werkstatt, Ladeinfrastruktur, Kühlung, Solaranlagen und Speicher hinzu.

### Fahrzeuge, Touren und Standorte

Fahrzeuge besitzen Ladevolumen, Nutzlast, Ladeeinheiten, Reichweite, Zustand, Antrieb, Temperaturausstattung und Betriebskosten. Passende Fahrer, Ladung und freie Ladebereiche sind Voraussetzung für eine Fahrt.

Eine Tour enthält Stopps, Ladung, Zeitfenster, Pausen und Rückladung. Ankunftsprognosen berücksichtigen verbleibende Strecke, Verkehr, Bearbeitung und Wartezeiten. Ein Ausfall kann ein Ersatzfahrzeug, Umladen oder eine geänderte Zusage erfordern.

Rampen besitzen eigene Zeitfenster und Warteschlangen. Anlieferung, Rangieren, Entladen und Abfahrt sind unterschiedliche Zustände. Ladeordnung und belegte Abstellflächen wirken auf die Dauer.

Erweitere später auf mehrere Standorte. Ergänze Fremdspediteure, Mietfahrzeuge und buchbare Bahn-, See- und Luftfracht mit Fahrplänen, Kapazitäten und Anschlüssen. Eigene Spezialterminals folgen als spätere Ausbaustufe. Alle Transporte verwenden denselben Waren- und Auftragsbestand.

### Markt und Verträge

Implementiere eigene Produktverkäufe, Auftragsfertigung und Logistik für Dritte. Diese Geschäftsfelder teilen Anlagen und Personal. Fremde Ware behält ihren fremden Eigentümer und kann nicht als eigene Ware verkauft werden.

Verträge bestimmen Menge, Spezifikation, Preis, Termin, Qualitätsanforderung, mögliche Teillieferung und vereinfachte vertragliche Folgen. Zeige vor Annahme eine Kapazitäts- und Kostenprognose. Nachfrage reagiert nachvollziehbar auf Preis, Qualität, Liefertreue und Kundenzufriedenheit.

Bestätigte Lieferzusagen beeinflussen Priorisierung und Reputation. Die tatsächliche Erfüllung ergibt sich aus dem Betriebsablauf und wird nicht beim Anklicken des Vertrags automatisch gutgeschrieben.

### Finanzen

Implementiere Kontostand, offene Forderungen, Verbindlichkeiten, Materialbestand, laufende Kosten und Investitionen. Zeige Ergebnis und Kosten je Auftrag, Produkt, Route und Standort.

Trenne Zahlungsvorgänge von betrieblichem Ergebnis. Lege die vereinfachten Regeln zur Materialbewertung und Kostenverteilung verständlich fest und benutze sie konsistent. Verhindere doppelten Umsatz durch interne Verrechnung zwischen eigenen Standorten. Jede Geldbewegung erhält einen nachvollziehbaren Buchungseintrag.

Biete später Kredite, Leasing, Versicherungsmodelle und Sanierung an. Stelle alle Preise, Zinsen und Abgaben als fiktive Spielwerte dar.

### Qualität, Service und Rückläufe

Führe eine Chargenakte von verwendeten Komponenten bis zur Auslieferung. Defekte ermöglichen gezielte Sperrung und Rückruf. Kundenanfragen betreffen Lieferstatus, Termin, Ablageort, Beschwerden und Rücksendung.

Retouren beanspruchen Abholung, Rücktransport, Prüfung, Lager und gegebenenfalls Reparatur. Ergebnisse sind Wiederverkauf, Nacharbeit, Teilegewinnung, Lieferantenrückgabe oder Entsorgung. Rückerstattungen werden genau einmal gebucht.

Erweitere auf Kühlwaren und andere Spezialfracht. Temperaturabweichungen wirken abhängig von Dauer und Produkt. Sondergut verlangt geeignete Anlagen und Qualifikation. Grenzabfertigung folgt dokumentierten fiktiven Spielregeln.

### Automatisierung, Forschung und Ereignisse

Baue einen lokalen Regelmechanismus mit Bedingungen, Aktionen, Priorität, Zuständigkeitsbereich, Wartezeit und Budgetgrenze. Typische Regeln betreffen Nachbestellung, Personalhilfe, Wartung, Ladung, Expressversand und Kundendienst.

Prüfe Voraussetzungen vor Ausführung. Verhindere doppelte Aktionen, Endlosschleifen und widersprüchliche Regeln. Zeige an, welche Regel eine Entscheidung aus welchem Grund getroffen hat. Teure Ausnahmen können als Vorschlag an den Spieler gehen.

Forschung verbraucht Budget, Personal und Zeit und schaltet neue Fähigkeiten frei. Erfahrung verbessert fachlich passende Leistungen. Fahrzeuge erhalten sinnvolle technische Umbauten; bloßes Fahren macht ihre physische Ladekapazität nicht größer.

Ereignisse wie Auftragsspitzen, Materialengpässe, Defekte und Wetter wirken auf bestehende Systeme. Schwere seltene Ereignisse sind konfigurierbar. Kennzeichne bei jeder Warnung Ursache, betroffene Aufträge, verbleibende Reaktionszeit und Handlungsoptionen.

### Bedienung und visuelle Gestaltung

Nutze eine gut lesbare, stilisierte isometrische 3D-Darstellung mit klaren Formen. Die Kamera lässt sich zoomen, drehen und bewegen. Wähle eine Perspektive, die Maschinen, Wege und Ladung unterscheidbar zeigt.

Entwirf ein kompaktes PC-HUD mit schmaler oberer Leiste, schlanker Werkzeugleiste, kontextabhängiger Bauleiste und einklappbaren Detailkarten. Die Spielwelt erhält den größten Bildschirmbereich. Glas- und Unschärfeeffekte sind sparsam und abschaltbar.

Biete vollständig deutsche Texte, Suchfunktion, Filter, Sortierung, verknüpfte Detailkarten, Tastaturbedienung, skalierbare Schrift und farbunabhängige Statusmerkmale. Große Tabellen öffnen sich gezielt. Merke Ansichten und Fensterlayouts lokal.

Jede Kennzahl führt zu ihren zugrunde liegenden Objekten. Eine Warnung öffnet den betroffenen Ort. Eine Sendungsakte zeigt ihre gesamte Geschichte. Zeige auch Ressourcen, die gerade warten, samt Wartegrund.

Ergänze eine Betriebsrückschau zur Analyse. Eine spätere Planungsvorschau arbeitet auf einer isolierten Kopie; sie verändert keine echten Spielwerte. Beim WebGL-Ausfall bleibt eine einfache 2D- und Tabellenansicht verfügbar.

### Architektur und Lernbarkeit

Trenne Simulationskern, Datenkataloge, Benutzerbefehle, Darstellung, Bedienung und Speicherung. Verwende klar abgegrenzte Module für Material, Produktion, Arbeitskräfte, Bau, Wege, Markt, Aufträge, Transport, Finanzen, Qualität und Betriebsregeln.

Klassen sind sinnvoll, wenn sie Verhalten und Zustand zusammenhalten. Verwende Komposition für kombinierbare Fähigkeiten. Erzwinge keine Vererbung nur zu Demonstrationszwecken. Kommentiere Zweck, Annahmen, Einheiten und Übergänge. Füge verständliche Beispiele für Wegbewegung, Bearbeitungszeit und Engpassberechnung hinzu.

Die Simulation besitzt eine feste Spielzeit, eine Ereignisplanung und reproduzierbaren Zufall. Die Bildrate darf die Ergebnisse nicht verändern. `requestAnimationFrame` aktualisiert die Darstellung; Modelle und Buchungen hängen nicht von der Zahl der gezeichneten Bilder ab.

Speichere auch laufende Tätigkeiten, Reservierungen, Wegfortschritt, Zahlungen und den Zustand des Zufallsgenerators. Wandle gespeicherte einfache Daten bei Bedarf kontrolliert in Laufzeitobjekte um.

Nutze bei wachsendem Betrieb gruppierte 3D-Darstellung, angemessene Detailstufen und gegebenenfalls einen Worker für Berechnungen. Entfernte Standorte dürfen gröber visualisiert, aber fachlich nicht falsch abgerechnet werden. Gib gemessene Leistungswerte mit Testszenario an; erfinde keine garantierten Objektzahlen.

### Umsetzung und Lieferumfang

Arbeite in vier nachvollziehbaren Phasen:

1. Vollständige erste Produktions- und Lieferkette einschließlich Bau, Personal, Lager, Transport, Zahlung und Speichern.
2. Betriebliche Tiefe durch Varianten, Rüsten, Schichten, Wartung, Rückläufe und Automatisierung.
3. Mehrere Standorte, Fremdlogistik, Touren, Rückladung und Unternehmensrechnung.
4. Kühlkette, Spezialfracht, Bahn/See/Luft, Planungsszenarien und weitergehende Delegation.

Beginne mit einem kurzen fachlichen Datenmodell und den wichtigsten Abhängigkeiten. Setze anschließend Phase 1 als spielbares, zusammenhängendes Ergebnis um. Arbeite nach erreichter Abnahme in den folgenden Phasen weiter. Bezeichne eine Teillieferung eindeutig als solche; behaupte kein vollständiges Konzernspiel, solange wesentliche Abläufe fehlen.

Liefere modularen Quellcode, ein direkt statisch veröffentlichbares Build-Verzeichnis, eine deutsche Startanleitung, einen kommentierten Architekturüberblick, eine Liste umgesetzter und geplanter Funktionen sowie überprüfbare Ergebnisse der fachlichen Tests. Halte wichtige Simulationsregeln außerhalb der UI-Komponenten.

### Zwingende Abnahmekriterien

- Zwei getrennte Lieferungen werden vollständig und ohne verlorene Ladeeinheiten verarbeitet.
- Bestände und Reservierungen sind jederzeit konsistent.
- Ungeeignete Maschinen, fehlendes Personal, volle Puffer und blockierte Wege werden korrekt behandelt.
- Jede Lieferung besitzt reale Ware, ein passendes Transportmittel und einen nachvollziehbaren Abschluss.
- Kundenumsatz, Zahlung, Rückerstattung und interne Verrechnung werden nicht doppelt gebucht.
- Gleiches Szenario und gleiche Befehle erzeugen bei gleicher Spielzeit dieselben fachlichen Ergebnisse, unabhängig von der Darstellungsgeschwindigkeit.
- Speichern und Laden erhält laufende Vorgänge; alte Spielstände werden kontrolliert migriert.
- Neue Inhalte beschädigen die bereits funktionierende Produktions- und Lieferkette nicht.
- Ohne WebGL bleibt der Betrieb über eine Ersatzansicht zugänglich.
- Keine Laufzeitverbindung zu externen Spiel-, KI-, Analyse- oder Werbediensten ist erforderlich.

**ENDE MASTERPROMPT**

---

## 11. Fünf vorgeschlagene Ausgangsentscheidungen

Diese Entscheidungen machen das Konzept konkret. Sie sind Vorschläge und können vor der Umsetzung geändert werden.

| Frage | Vorgeschlagener Standard |
|---|---|
| Was stellt das Unternehmen her? | Technikprodukte mit gemeinsamen Komponenten; Einstieg über Arbeitsleuchten |
| Wie beginnt das Spiel? | Kleine leere Halle; Ausbau zum Unternehmen mit mehreren Standorten |
| Wie tief ist die Simulation? | Einzelne Personen und Anlagen; mengengetreue Chargen und Ladeeinheiten statt jedes Schraubenkopfs als 3D-Objekt |
| Wie läuft die Zeit? | Pause und Zeitraffer; keine Offlinefortschritte im Standardmodus |
| Wie wird das Spiel ausgeliefert? | Modulare Entwicklung und statisches Build für PC-Browser und GitHub Pages |

## Quellen und Nachvollziehbarkeit

**Q1 – Referenz für die Funktionsbestandsaufnahme:** [Referenzseite](https://nuri-track.vercel.app/), abgerufen am 12. Oktober 2026. Ergänzend wurde die von dieser Seite verlinkte öffentliche Hauptprogrammdatei `assets/index-peh6Nd-7.js` statisch auf Funktionsbereiche, Bedienbeschreibungen und Ablaufmodelle untersucht. Die Bedienoberfläche konnte kurz ausgelesen werden; die 3D-Ausführung war in der verwendeten Browserumgebung durch einen WebGL-Fehler begrenzt. Funktionszuordnungen sind deshalb keine vollständigen Laufzeitnachweise.

**Q2 – Statisches Hosting und Hostingprotokolle:** [GitHub Docs: What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), abgerufen am 12. Oktober 2026. Belegt die Bereitstellung statischer HTML-/CSS-/JavaScript-Dateien sowie den gesonderten Hinweis auf Sicherheitsprotokolle des Hosters.

**Q3 – Darstellungszeit und Hintergrund-Tabs:** [MDN: Window.requestAnimationFrame()](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame), abgerufen am 12. Oktober 2026. Belegt die Verbindung zur Bildwiederholung, die zeitbasierte Animation und das übliche Pausieren im Hintergrund.

Alle Spielmechaniken, Beispielzahlen, Priorisierungen und Umsetzungsvorschläge außerhalb der gekennzeichneten Bestandsaufnahme sind eigene konzeptionelle Vorschläge. Eine Umsetzung des Spiels und eine Veränderung der Referenzseite sind nicht Bestandteil dieser Lieferung.

