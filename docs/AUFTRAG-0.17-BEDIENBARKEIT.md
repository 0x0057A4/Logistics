# Nutzerauftrag 0.17 – Bedienbarkeit und Informationsdarstellung (18.10.2026)

Wortgetreu übernommener Auftrag des Nutzers nach Playtests (Gliederung gekürzt, Inhalt vollständig). Verbindlich für alle 0.17-Agenten; Umsetzungsregeln in `docs/SCHNITTSTELLEN-0.17-UI.md`.

Das Spiel funktioniert grundsätzlich. Die größten Probleme sind unübersichtliche Listen, fehlende Gesamtmengen, schwer verständliche Anlagenfunktionen, zu kleine Schrift und zu enge Fenster. **Änderungen im bestehenden Code umsetzen, nicht nur konzipieren.**

## 1. Rahmenbedingungen
- Zuerst aktuellen Code und Datenmodelle prüfen; Implementierungsstand ist maßgeblich.
- Funktionierende Mechaniken, Speicherfunktionen und Kompatibilität vorhandener Spielstände erhalten.
- Architektur beibehalten, kein Neuaufbau, kein Frameworkwechsel.
- Echte Simulationsdaten; keine erfundenen Bestände, Auslastungen, Prognosen oder Platzhalter.
- Alles auf Deutsch.
- **Assistent bleibt unverändert** (weder entfernen noch überarbeiten).
- **Keine Zeitsprünge, Daily Jumps oder vergleichbaren neuen Funktionen.**
- Forschung: keine visuelle Neugestaltung (späteres Update).
- Schrittweise vollständig abarbeiten, nicht nur kosmetisch.

## 2. HUD
- Zusammenhängende Farbpalette: klare Unterscheidung Hintergrund / Fenster / Bedienelemente / ausgewählte Zustände.
- Schwer lesbare Kombinationen (dunkles Grün, dunkles Blau, kontrastarme Schrift) beheben.
- Warnungen zusätzlich mit Text oder Symbol, nicht nur Farbe.
- Normale Inhalte etwa 14–16 px. Texte nicht immer weiter verkleinern.
- Abstände/Schaltflächen kompakt, aber bequem bedienbar.
- Hauptnavigation ohne vertikalen Scrollbalken erreichbar; Symbole/kleine Funktionsbilder mit kurzen Bezeichnungen (z. B. Lkw für Transport); verständliche Tooltips; bei Platzmangel Gruppen/aufklappbare Menüs; keine dauerhaft breite Seitenleiste, die das Gelände verdeckt; kompakte Übersichten, Details bei Bedarf.
- Ziel: weniger Suchen, bessere Lesbarkeit, mehr sichtbare Spielwelt.

## 3. Fenster
- Verschieben an der Titelleiste; Größe an Rändern/Ecken; Maximieren innerhalb der Spielfläche, erneute Betätigung stellt Größe/Position wieder her; sinnvolle Mindestgrößen; nach Auflösungsänderung nie außerhalb des sichtbaren Bereichs.
- Größe/Position über das vorhandene Einstellungssystem speichern.
- Tabellenköpfe und wichtige Filter bleiben beim Scrollen sichtbar; keine verschachtelten vertikalen Scrollbereiche.
- Fensterbedienung reicht keine Klicks/Kamerabewegungen an die Spielwelt durch.
- Große Datenmengen: Scrollen in der Tabelle, Seiten oder Virtualisierung erlaubt; nicht alles auf kleinstem Raum zusammendrücken.

## 4. Lager
- Standardmäßig **eine Zeile pro Produkttyp bzw. fachlich gleicher Variante**: Produkt | Gesamtbestand | Reserviert | Frei verfügbar | Lagerorte | Benötigte Ressourcen: verfügbar / benötigt (je Ressource: Materialname · verfügbare Menge / benötigte Menge · [+] Bestellen). Werte aus echten Daten.
- Mengen aus dem Datenmodell (ein Listeneintrag ≠ ein Stück); Gruppierung nach stabilen Produktkennungen und relevanten Varianten; Qualitätsstufen/Ausführungen nicht irreführend zusammenfassen; Einheiten eindeutig; physisch vorhanden vs. in Produktion vs. erwartete Lieferungen unterscheiden; gesperrte/beschädigte/unverfügbare Ware berücksichtigen; Gruppierung nur Darstellung (Objekte, Reservierungen, Chargen bleiben).
- Jede Produktzeile auf-/zuklappbar: Einzelbestände/Chargen mit Menge, Lagerort, Zustand/Qualität, Reservierung bzw. Auftrag, Charge/Objektkennung.
- Suche, Filter, sortierbare Spalten (Name, Menge, Verfügbarkeit).
- Zentrale Frage sofort beantwortbar: „Wie viele Arbeitsleuchten habe ich insgesamt, und wie viele davon kann ich verwenden?“
- Ressourcenspalte: nur tatsächliche Rezepte und Lagerdaten; je Ressource Name, Einheit, frei verfügbare und benötigte Menge; Bezug eindeutig beschriften; bei gewählter Produktionsmenge bzw. Auftrag Bedarf dafür, sonst **Bedarf für ein Stück** ausdrücklich kennzeichnen; durch Fertigware gedeckte Mengen nicht erneut als Bedarf; reservierte/gesperrte Ressourcen nicht frei; Fehlmengen mit Text („12 verfügbar / 20 benötigt · 8 fehlen“); bestellte Ressourcen separat „Im Zulauf“ (erst nach Wareneingang Bestand); viele Ressourcen → kompakte Zeile, Liste aufklappbar; kein Rezept → Hinweis.
- [+] neben jeder Ressource, Tooltip „Ressource bestellen“: öffnet vorhandene Einkaufsfunktion, Ressource vorausgewählt, fehlende Menge vorgeschlagen, vorgesehene Bestellungen berücksichtigt, Menge anpassbar, Preis/Gesamtkosten/Lieferzeit vor dem Kauf. **[+] löst keinen Kauf aus**; vorhandener Bestellablauf mit Liefer-/Einlagerungslogik.

## 5. Aufträge
- Kompakte Tabelle: Kennung und Kunde, Produkt, benötigte und gelieferte Menge, für diesen Auftrag reservierte Menge, zusätzlich frei verfügbarer Bestand, fehlende Menge, Liefertermin und verbleibende Spielzeit, Status, Wert/Vergütung, Aktionen. Mehrere Positionen: Hauptzeile mit aufklappbaren Positionen.
- Lager und Aufträge nutzen dieselbe Bestandsberechnung. Beispiel: Auftrag braucht noch 35, Lager 42, davon 20 für andere reserviert, für diesen 0 → **„35 benötigt · 42 auf Lager · 22 frei verfügbar · 13 fehlen“**. Reservierungen anderer Aufträge nicht frei; diesem Auftrag zugeordnete Mengen nicht doppelt abziehen; Gelieferte reduziert offenen Bedarf; keine Reservierungen erfinden; Verfügbarkeitsanzeige ist keine Zusage.
- Standardsortierung nächste Frist; Sortierung/Filter; offen/laufend/erledigt/überfällig nach Statusmodell; knappe/überschrittene Fristen deutlich; Simulationszeit; keine behauptete pünktliche Fertigstellung ohne belastbare Prognose.
- Aufträge vs. Verträge im Code prüfen und kurz an den Übersichten erklären (Verträge = laufende Vereinbarungen, Aufträge = einzelne Lieferverpflichtungen – nur wenn es der Implementierung entspricht).

## 6. Untere Betriebsleiste
- Zusätzlicher Tab „Aufträge“ neben Fahrzeugen: aktive Aufträge, verbleibende Frist, Fortschritt/Fehlmengen, Fristwarnungen; Klick öffnet den Auftrag in der vollständigen Übersicht; einklappbar, gleicher Bereich wie Fahrzeuge.

## 7. Anlagen erklären
- Beim Sortierplatz zuerst die Spiellogik prüfen (Aufgabe, Waren, Personal/Zuweisung, Wege/Ausrichtung/andere Anlagen, Wirkung räumlicher Nähe zu Rampe/Regal, automatisch oder nach Aktion).
- Anlagenfenster: 1. Zweck, 2. Voraussetzungen, 3. Ablauf, 4. Aktueller Zustand, 5. Nächster Schritt – mit konkreten Hinweisen („Kein Mitarbeiter zugewiesen“, „Wartet auf geeignete Ware“), soweit aus der Simulation ableitbar.
- Im Baumenü kurze Beschreibung und relevante Platzierungshinweise.
- **Keine erfundene Förderband-, Nachbarschafts- oder Durchsatzmechanik**; wenn „Laderampe → Sortierplatz → Regal“ keinen Vorteil hat, korrekt so erklären. Unvollständig angeschlossene Anlagen täuschen keinen Betrieb vor. Muster auf weitere Anlagen übertragen.

## 8. Umbenennen
- Depot/Standort, Montageplätze, Prüfstationen, Sortierplätze und vergleichbare Objekte. Im Objektfenster per Stiftsymbol; Enter bestätigt, Escape verwirft; leere Namen sinnvoll; interne Kennungen/Typen bleiben; Typ zusätzlich erkennbar („Prüfung – Arbeitsleuchten“ / „Typ: Prüfstation“); Name überall konsistent (Karte, Auswahllisten, Zuweisungen, Anlagevermögen); bleibt nach Speichern/Laden; alte Stände ohne Namen funktionieren.

## 9. Kamera und Rechtsklick
- WASD auch während des Bauens; Bauobjekt und Vorschau bleiben aktiv; keine unbeabsichtigte Platzierung; nicht während Texteingabe (Text-, Such-, Umbenennungsfelder); keine Klicks durch Fenster; keine hängenbleibende Bewegung bei Fokusverlust.
- Browser-Kontextmenü im gesamten Spielbereich unterdrücken, auch ohne offenes Fenster; vorhandene Rechtsklickfunktionen (Abbrechen/Abwählen) bleiben; Rechtsklick-Ziehen prüfen. Grenze: Browsergesten/Erweiterungen nicht vollständig kontrollierbar – nichts Unmögliches versprechen.

## 10. Personal- und Belegungsplan
- Wer arbeitet wann, an welchem Standort und an welcher Anlage/Aufgabe? Tabelle mit Zeitachse oder kompakte Gantt-Darstellung: Zeilen = Mitarbeitende, Achse = Stunden des gewählten Spieltags, Balken = geplante Arbeitszeiten, aktuelle Simulationszeit markiert, Standort und Arbeitsplatz, Pausen/Abwesenheiten/Schichten über Mitternacht, geplante Zuweisung vs. tatsächliche Tätigkeit.
- Filter nach Standort, Tätigkeit, Schicht. Unbesetzte Zeiträume nur, wenn Bedarf aus Daten ableitbar. Klick auf Mitarbeiter öffnet Details und, falls vorhanden, Auffinden der Position. Fehlendes als „Nicht zugeordnet“/„Nicht geplant“; keine künstlichen Pläne.

## 11. Liquidität
- Oben drei große Werte für den aktuellen Spieltag: **Heute eingenommen**, **Heute ausgegeben**, **Saldo heute** (Spielwährung), darunter die vorhandenen Zahlungsströme.
- Tatsächlich gebuchte Geldbewegungen; Tag nach Simulationszeit; unbezahlte Aufträge zählen nicht; Kreditauszahlungen nicht als Verkaufserlös; Saldo ≠ Gewinn; Hinweis „Zahlungseingänge minus Zahlungsausgänge“; keine Doppelzählung interner Umbuchungen; gleicher Zeitraum und Umfang; positive/negative Salden mit Vorzeichen und Text.

## 12. Kundendienst und Rückläufe als Board
- Spalten **Offen**, **In Bearbeitung**, **Abgeschlossen**; vorhandene Status sinnvoll zuordnen, echte Zusatzzustände (z. B. „Wartet auf Rücksendung“) als Unterstatus.
- Je Vorgang: Kunde/Vorgangsnummer, Produkt/Auftrag, Grund, Priorität/Frist, nächster Schritt. Anzahl je Spalte, Suche, Filter, Details per Klick, vergrößerbare Fenster, Status über vorhandene Aktionen. **Kein Drag-and-drop nötig.** Kein Abschluss nur durch visuelle Statusänderung, solange Rücksendung/Prüfung/Ersatz/Erstattung ausstehen.

## 13. Forschung
- Kein neuer Forschungsbaum; profitiert nur von allgemeinen Verbesserungen.

## 14. Technik und Abnahme
- Abhängigkeiten prüfen: Lager ↔ Ressourcen, Rezepte ↔ Produktionsmengen, Reservierungen ↔ Aufträge, Bestellungen ↔ Wareneingänge, Personalzuweisungen, Finanzen, Spielstände.
- Gemeinsame Berechnungen für mehrfach angezeigte Informationen; Lager, Ressourcen, Aufträge und Auftragsleiste ohne widersprüchliche Mengen.
- Keine vollständige Neuberechnung aller Listen je Renderframe; Aktualisierung nach Datenänderung und Simulationszeit.

### Verbindliche Prüfszenarien
1. Viele Einträge desselben Produkts zusammengefasst mit korrekter Gesamtmenge und aufklappbaren Details.
2. Unterschiedliche relevante Produktvarianten bleiben unterscheidbar.
3. Auftrag 35 Arbeitsleuchten bei 42 vorhanden und 20 anderweitig reserviert → 13 fehlen.
4. Mehrere Aufträge nutzen dieselbe Bestandslogik ohne doppelte verbindliche Zusage freier Ware.
5. Ressourcenanzeige nutzt tatsächliche Rezepte und benennt die Bedarfsbasis.
6. Reservierte Ressourcen nicht als frei.
7. [+] öffnet passende Bestellung mit vorausgewählter Ressource und nachvollziehbarem Mengenvorschlag.
8. Bestellte Ware separat und erst nach Wareneingang als Bestand.
9. Bei vielen Aufträgen bleiben Suche, Fristen und Aktionen bequem erreichbar.
10. Anlagen- und Depotnamen bleiben nach Speichern/Laden erhalten.
11. WASD im Baumodus, aber nicht während Texteingabe.
12. Rechtsklick öffnet im Spiel kein Browser-Kontextmenü.
13. Maximierte/verkleinerte Fenster bei verschiedenen Auflösungen bedienbar.
14. Schicht über Mitternacht korrekt im Personalplan.
15. Tagesübersicht stimmt mit gebuchten Zahlungsströmen überein.
16. Kundendienstvorgänge wechseln nach tatsächlicher Bearbeitung die Board-Spalte.
17. Bestehende Spielstände laden; Assistent unverändert.

Prüfen bei **1366 × 768** und **1920 × 1080** mit normaler Skalierung. Abschluss: kurze Übersicht der Änderungen, tatsächlich durchgeführte Prüfungen, verbleibende Grenzen; nicht durchgeführte Prüfungen ausdrücklich kennzeichnen.

**Erfolgskriterium:** In wenigen Sekunden erkennbar, welche Produkte verfügbar sind, welche Materialien fehlen, welche Ressourcen zu bestellen sind, welche Aufträge gefährdet sind, wer gerade arbeitet und wie sich der Geldbestand heute entwickelt hat – bei genügend Platz für das Betriebsgeschehen.
