# Industrie & Logistik

**Projektübergabe:** [Aktueller Kontext und nächster Schritt](docs/FORTSETZUNG.md). [Projektentscheidungen](docs/CHATKONTEXT.md). Vorbereitete Änderungen liegen in `pending/`.

Version 0.6 · unveröffentlichter Entwicklungsstand · 14. Oktober 2026

Eigenständige, deutschsprachige Unternehmenssimulation für PC-Browser. Vom leeren Werk über Arbeitsleuchtenfertigung bis zu mehreren Standorten, Sammeltouren und temperaturgeführter Fremdfracht. Alle Unternehmen, Personen und Wirtschaftswerte sind fiktiv.

**Diese Fassung ist spielbar, aber keine vollständige Abnahme aller Details des großen Projektkonzepts.** Der tatsächliche Status steht in `docs/FUNKTIONSSTATUS.md`. Fachlogik und Oberfläche verwenden denselben Zustand. Es gibt keine simulierten Dashboardzahlen ohne fachlichen Ursprung.

## Start

Die veröffentlichte Website öffnen. „Geführter Einstieg“ wählen. Neue und bewusst geladene Unternehmen starten pausiert; mit 1× fortsetzen. In der Zentrale kann „Startbetrieb einrichten“ Anlagen, Personal und Fahrzeug durch reguläre, kostenpflichtige Spielbefehle aufbauen. Alternativ jede Anlage selbst platzieren.

1. Montageplatz, Prüfstation, Packstation, Lagerregal und Laderampe bauen.
2. Drei Fertigungskräfte, eine Lagerkraft und eine Fahrperson einstellen.
3. Je zwölf Gehäuse, LED-Platinen und Kartons bestellen.
4. Ersten Kundenauftrag über acht Leuchten annehmen.
5. Lieferwagen kaufen. Produktion läuft automatisch bei passenden Voraussetzungen.
6. Bei acht verpackten Leuchten im Auftragsfenster Lieferung starten.
7. Nach Zustellung entsteht eine Forderung; Zahlung folgt 60 Spielminuten später.

Ein Spielminute dauert bei 1× eine Echtzeitsekunde. Tagschicht läuft von 08:00 bis 16:00. Nachtschicht und vereinfachter durchgehender Betrieb sind einstellbar. Hintergrund-Tab und geschlossene Anwendung erzeugen keinen Fortschritt.

## Steuerung

- **B**: Baumodus; **R**: gewählte Anlage drehen; **Esc**: abbrechen/schließen.
- **Leertaste**: Pause/Fortsetzen.
- Karte ziehen: bewegen; Mausrad und +/−: zoomen; ↻: Ansicht drehen.
- Anlage anklicken: Akte. Alternativ über Fertigungsübersicht erreichbar.
- Standort wechseln: Standortfenster oder Netzkarte.
- In Einstellungen: Schriftvergrößerung, Bewegungsreduktion, Spielstandimport und -export.

## Ausbau

**Produkte:** Forschungslabor plus Entwicklungskraft schalten Profilleuchten und Industriesensoren frei. Arbeitspläne anschließend an allen drei Stationen umstellen. Rüsten und Materialbedarf beachten.

**Instandhaltung:** Werkstatt, Techniker und Ersatzteile ermöglichen Wartung. Fertigungsaufträge bleiben bei Unterbrechung erhalten. Personen lernen in 90 Schichtminuten; müde Beschäftigte pausieren.

**Retouren:** Gelieferte und bezahlte Ware kann zurückgenommen werden. Fahrzeug, Fahrdienst, Rampe, Lager und Service bearbeiten Rücktransport und Prüfung. Anschließend Reparatur oder Verwertung. Chargenrückruf sperrt nachverfolgbare Nachfolger.

**Standorte:** Forschung „Standortnetz“, danach bis zu acht Standorte zu je 25.000 €. Neue Hallen benötigen eigene Anlagen und Personal. Standorttransfers benötigen Fahrzeit, Zielrampe und Lagerpersonal. Interner Transport erzeugt keinen Umsatz.

**Drei Geschäftsfelder:** Eigene Produkte, vertraglich bestellte Fertigung und Fremdlogistik. Fremde Waren bleiben Eigentum ihres Kunden. Sie stehen eigener Produktion und eigenem Verkauf nicht zur Verfügung.

**Sammeltouren:** Zwei bis vier unterschiedliche Kundenaufträge teilen ein Fahrzeug. Gesamtgewicht und Ladevolumen werden vor der Reservierung geprüft. Stopps werden nacheinander beliefert; Rückfahrt erst danach.

**Speziallogistik:** Kalibriermodule benötigen Kühlung. Ein Kühllager besitzt 100 Kühlplätze, begrenzt durch Energieversorgung. Ungekühlte Ware erwärmt sich; Qualität unter 70 führt zu dauerhafter Sperre. Abkühlen repariert keinen Schaden.

**Bahn, See, Luft:** Externe Transportleistungen ab eigenem Terminal. Servicepersonal benötigt zehn Minuten für Dokumente, Lagerpersonal fertigt Ladung ab. Fahrpläne und Kapazitäten sind verbindlich; verpasste Anschlüsse erzeugen Wartezeit und Lagerkosten. Bereits gebuchte Frachtkosten verfallen bei Storno.

**Delegation:** Nachbestellung, Versand und Wartung als Regeln mit Standort, Priorität, Gesamtbudget und Sperrfrist. Gründe jeder Entscheidung bleiben in Chronik sichtbar. Für Versand gilt Menge als Obergrenze je Fahrt; Wartung verwendet Zustandsgrenze in Prozent.

**Planung:** Prognose kopiert gesamten Zustand einschließlich Zufall, Reservierungen und laufender Tätigkeiten. Ein oder acht Stunden sowie ein Spieltag; Alternative mit zusätzlicher Fertigungskraft. Prognose verändert echten Betrieb nicht.

## Geld und Bewertung

Alle Beträge sind fiktive Euro-Spielwerte. Geld, Umsatz und Kredit sind getrennt. Löhne werden pro Schichtminute berechnet, fortlaufende Kosten täglich im Journal aggregiert. Material trägt Beschaffungspreis; fertige Ware zusätzlich direkt zugeordneten Produktionslohn und Maschinenenergie. Diese Bewertung verursacht keine zweite Zahlung.

Die Lieferungsübersicht zeigt Rechnungswert minus Herstellbewertung und direkte Fracht. Gemeinkosten, Abschreibungen und Rückläufe sind darin nicht vollständig verteilt; die Zahl ist kein Konzerngewinn. Tourkosten werden nach Stückzahl auf Stopps verteilt. Standortmiete, Personal, Energie und Finanzierung sind zusätzlich im Journal sichtbar.

Darlehen: 8 % pro Spieljahr, höchstens 50.000 €. Nicht gedeckte Pflichtkosten erzeugen negatives Konto mit 15 % Kontokorrentzins. Freiwillige Ausgaben werden bei fehlender Liquidität abgewiesen. Es gibt keinen sofortigen Game-over-Bildschirm.

## Spielstände

Automatische lokale Sicherung alle 20 Sekunden und beim Verlassen. Voriger Stand bleibt als Backup. Spielmodi verwenden getrennte Speicherschlüssel. JSON-Export empfohlen, insbesondere vor Browserdatenlöschung oder Gerätewechsel. Import wird vor Übernahme geprüft; unbekannte Formate und beschädigte Zustände werden abgewiesen. Bestehende Version-1-Stände werden um optionale Erweiterungsfelder ergänzt.

Website muss anfangs geladen werden. Während der laufenden Simulation werden keine externen Spiel-, KI-, Werbe- oder Analysedienste aufgerufen. Keine externen Laufzeitbibliotheken oder Fonts. Der private veröffentlichte Link kann die Anmeldung des Hostingdienstes verlangen; das statische Spielpaket selbst besitzt keine Anmeldung.

## Eigenes statisches Hosting / GitHub Pages

Inhalt von `dist/` in Veröffentlichungsverzeichnis kopieren. `index.html` muss dort direkt liegen. Alle `.js`- und `.css`-Dateien mitkopieren. Kein Buildschritt, keine Installation erforderlich. Wegen ES-Modulen über HTTP(S) öffnen; Doppelklick auf `index.html` ist kein unterstützter Startweg.

Für einen lokalen HTTP-Server im Quellordner beispielsweise `python3 -m http.server 8000 --directory dist`, anschließend `http://localhost:8000`. Dies ist eine Startanleitung; Browserprüfung wurde in dieser Entwicklungsumgebung nicht ausgeführt.

## Entwicklung und Prüfungen

Node.js mit ES-Modulen erforderlich. `npm test` führt die gespeicherten Fachtests aus. Keine npm-Installation notwendig. `node tests/balance-performance.mjs` reproduziert das begrenzte Wirtschafts- und Laufzeitszenario. Ergebnisse und Aussagegrenzen: `docs/PRUEFUNG.md`.

Architektur: `docs/ARCHITEKTUR.md`. Aufgabenvertrag: `CONTRACT.md`. Teamzuständigkeiten: `AGENTS.md`. Dateien unter `dist/` sind lauffähiger modularer Quellcode und statisches Build zugleich.

## Erweiterung 0.5

Finanzen trennen betrieblichen Geldfluss, Investitionen und Finanzierung. Offene Kundenrechnungen aller Transportwege, gebundenes Material und Verpflichtungen werden aus dem tatsächlichen Zustand ausgewertet. Bewertungsgrenzen stehen direkt in der Ansicht; keine vollständige GuV oder Bilanz.

Einstellungen → „Modus laden“ wechselt zwischen vorhandenen Unternehmen. Import, Sicherung und Neustart entfernen alte Bauauswahl. Schreibschutz verhindert parallele Spielstandänderung desselben Modus durch kooperierende Tabs ab Version 0.5. Bereits geöffnete ältere Fassungen vorher schließen. Ohne Web Locks oder lokalen Speicher bleibt die Ansicht schreibgeschützt; Export bleibt möglich. Details: docs/SPIELSTAND-SPERRE.md.

## Erweiterung 0.6

Transport → Sammeltour: Zwei bis vier unterschiedliche aktive Aufträge kombinieren. Pro Stopp Zustellmenge und optional Rückgabemenge wählen. Rückgaben beziehen sich auf früher zugestellte, noch nicht retournierte Eigenware desselben Auftrags. Die Auswahl bindet Quellen sofort gegen doppelte Abholung. Stornieren vor Abfahrt gibt sie frei.

Das Fahrzeug stellt zu, lädt Retouren auf und fährt gemeinsam zurück. Gewicht, Volumen und Kühlung werden geprüft; volle Quarantäne oder fehlende Rampe/Lagerkraft halten Rückladung im Fahrzeug. Die bestehende Serviceprüfung erstattet genau einmal.

Die Vorschau zeigt Fahrtkosten, Stoppladung sowie Fahr-/Arbeitszeit. Fahrerprognosen sind Annahmen aus aktuellem Personalzustand; zusätzliche Rampen-/Materialengpässe können Termine verschieben. Laufende Phasen bleiben im JSON-Spielstand erhalten.

## GitHub Pages aus Hauptordner

`index.html` liegt direkt im Repository-Hauptordner und enthält die Spieloberfläche. `<base href="./dist/">` lädt Styles, Module und Downloadpaket aus `dist/`, auch unter dem Projektpfad `/Logistics/`. Für Pages: Branch `main`, Ordner `/ (root)`. `.nojekyll` kennzeichnet das unveränderte statische Paket. Pages-Aktivierung ist durch den Datei-Upload allein nicht nachgewiesen.

Nach Änderungen an `dist/index.html` erzeugt `python scripts/package.py` den Root-Einstieg erneut.
