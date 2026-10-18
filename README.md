# Industrie & Logistik

**Projektübergabe:** [Aktueller Kontext und nächster Schritt](docs/FORTSETZUNG.md). [Projektentscheidungen](docs/CHATKONTEXT.md). Integrierte Originalpatches liegen in `docs/archiv/integriert-0.7/`.

Version 0.15 · Entwicklungsfassung · 18. Oktober 2026

Eigenständige, deutschsprachige Unternehmenssimulation für PC-Browser. Vom leeren Werk über Arbeitsleuchtenfertigung bis zu mehreren Standorten, Sammeltouren und temperaturgeführter Fremdfracht. Alle Unternehmen, Personen und Wirtschaftswerte sind fiktiv.

**Diese Fassung ist spielbar, aber keine vollständige Abnahme aller Details des großen Projektkonzepts.** Der tatsächliche Status steht in `docs/FUNKTIONSSTATUS.md`. Fachlogik und Oberfläche verwenden denselben Zustand. Es gibt keine simulierten Dashboardzahlen ohne fachlichen Ursprung.

## Start (0.9: Logistikunternehmen)

Website öffnen, „Geführter Einstieg“ wählen. Neue Unternehmen starten pausiert; mit 1× fortsetzen. „Startbetrieb einrichten“ kauft Laderampe, Regal, Lagerkraft, Fahrer und Lieferwagen (ca. 14.500 €) über reguläre Spielbefehle.

1. Laderampe bauen, Lagerkraft einstellen.
2. Fenster „Verträge“: ersten Frachtvertrag annehmen.
3. Der Lkw des Versenders kommt zur angegebenen Uhrzeit: Torkontrolle, Dock, Entladen („Hof & Docks“).
4. Pakete werden sortiert – von Hand oder am Sortierplatz.
5. Fahrer und Lieferwagen: Zustellung je Zustellgebiet starten (Menge wird nach Fahrzeugkapazität vorgeschlagen).
6. Nach Zustellung entsteht eine Forderung; Zahlung folgt 60 Spielminuten später. Verspätung kostet Abschlag und Ansehen.

Eine Spielminute dauert bei 1× eine Echtzeitsekunde. Tagschicht 08:00–16:00. Hintergrund-Tab und geschlossene Anwendung erzeugen keinen Fortschritt. Messanzeige für Bildrate: `?perf=1` an die Adresse hängen (docs/MESSUNG-60FPS.md).

Die bisherige Leuchtenfertigung bleibt verfügbar und wird später Geschäftsfeld „Mehrwertdienste“.

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

## Version 0.7

Transport: Lieferwagen 180 €, Lkw 520 €, Kühlfahrzeug 680 € je angefangenem Spieltag (1.440 Spielminuten). Erste Rate sofort, weitere auch bei Stillstand. Mietfahrzeuge verwenden reguläre Fahrer, Rampen, Touren, Rückladungen und Wartung. Rückgabe nur leer, frei und am Mietstandort; angebrochene Tage werden nicht erstattet. Historische Lieferreferenzen bleiben erhalten.

### Speicher blockiert oder voll

Die Meldung betrifft den Browser-Speicher, nicht eine Sperre in der JSON-Datei. „Speicher erneut prüfen“ versucht normalen Betrieb wiederherzustellen. Alternativ „Temporär spielen“ bewusst bestätigen: keine lokale Sicherung, Fortschritt vor Schließen als JSON exportieren. JSON lässt sich später wieder importieren. Vorhandene lokale Spielstände werden nicht still überschrieben; Mehrfach-Tab-Schutz bleibt aktiv. Browser-Speicherrechte lassen sich durch das Spiel nicht erzwingen.

## Spiel und Spielstand als HTML

Einstellungen → **Spiel als HTML speichern**. Die heruntergeladene HTML enthält Spielcode, Darstellung, aktuellen Spielstand und Darstellungseinstellungen. Datei im Browser öffnen, mit **1×** fortsetzen. Funktioniert ohne Internet und ohne lokalen Browserspeicher. Weitere Änderungen durch erneuten HTML-Download sichern; die ursprüngliche Datei wird nicht automatisch überschrieben. Die Website behält zusätzlich ihre bisherige Browserspeicherung und JSON-Funktion.

## Kundendienst 0.8

Unter **Service** Statusanfrage, Terminänderung oder Beschwerde zu einem angenommenen Auftrag anlegen. Je Auftrag und Art ein Ticket. Überfällige aktive Aufträge erzeugen einmalig ein Beschwerdeticket. Antwort wählen; Kundendienstpersonal am Auftragsstandort bearbeitet sie während seiner Schicht. Fehlendes Personal, Pause und fehlendes Geld erscheinen als Wartegrund.

- Statusauskunft: 15 Arbeitsminuten, keine zusätzliche Gebühr.
- Terminantwort: 30 Arbeitsminuten. Einmalige Verlängerung um 60–1.440 Spielminuten; Zusage kostet 2 % des beim Bearbeitungsbeginn offenen Auftragswerts. Änderung erst nach Abschluss. Bereits entstandener Rufverlust bleibt bestehen.
- Beschwerde: 20 Arbeitsminuten. Entschuldigung kostenlos; Kulanz kostet 5 % bereits bezahlter Auftragssumme, höchstens 50 €. Löhne laufen zusätzlich.

Erledigte beziehungsweise überholte Terminwünsche werden nicht nachträglich auf abgeschlossene Lieferungen angewendet. HTML- und JSON-Spielstände behalten Tickets einschließlich laufender Bearbeitung.
