# Architektur zum Nachvollziehen

## Ein Zustand, mehrere Fachbereiche

`Simulation.state` enthält ausschließlich JSON-kompatible Daten. Eine Anzeige liest diese Daten. Sie erzeugt keine Ware und keine Buchung. Eine Nutzeraktion sendet einen geprüften Befehl an `Simulation.command`. Zuständiges Fachmodul validiert Voraussetzungen und ändert seinen Teil des Zustands.

Beispiel: „Lieferung starten“ reserviert vorhandene Ware. Erst nach echter Ladezeit verschiebt `inventory.transfer` diese Ware in Fahrzeugchargen. Bei Zustellung wird Fahrzeugware entnommen. Forderung und spätere Zahlung folgen als getrennte Ereignisse. Ein eindeutiger Buchungsschlüssel verhindert Wiederholung derselben Geldbewegung.

| Datei | Verantwortung |
|---|---|
| core.js | Zustand, Befehlsverteilung, feste Minutenschritte, PRNG, Speichern/Prüfen, isolierte Vorschau |
| catalog.js | Unabhängige Stammdaten für Waren, Arbeitspläne, Anlagen, Rollen, Fahrzeuge, Forschung |
| world.js | Flächen, Rotation, BFS-Erreichbarkeit, Energieprüfung beim Bauen |
| inventory.js | Warenmengen, Eigentum, Herkunft, Reservieren, Verbrauch, Übergabe und Kapazität |
| workforce.js | Beschäftigte, exklusive Zuweisung, Schichten, Pausen, Lernen, Standortreisen |
| production.js | Zulässige Maschinenprozesse, Job-Snapshot, Rüsten, Fertigung, Bewertung, Wartung |
| economy.js | Buchungen, Beschaffung, Verträge, späte Zahlungen, Kosten und Kredit |
| transport.js | Einzellieferung, Standorttransfer, Flotte, Wartung und Rampen |
| tours.js | Atomare Gesamtladung, mehrere Kundenstopps, Restmengenbindung und Teilrechnungen |
| service.js | Rücktransport, Prüfung, Erstattung, Reparatur/Verwertung, Rückruf |
| management.js | Forschung und lokale budgetierte Delegationsregeln |
| network.js | Standortkauf und feste Unternehmensgeografie |
| special.js | Physische Kühlkapazität, Temperatur und bleibende Qualitätsfolgen |
| multimodal.js | Externe Bahn-/See-/Luftleistung, Terminal, Dokumente und Fahrplan |
| scene.js | Reine Canvas-Darstellung, Projektion, Auswahl, Kamera, Bauvorschau |
| app.js | Deutsche Bedienung, Formulare, Tutorial, Fachfenster, Save/Import/Export |
| styles.css | Layout, Farben, responsive Darstellung, Fokus und Schriftoptionen |

## Feste Zeit statt Bildrate

`step(10)` führt zehn einzelne Spielminuten aus. Derselbe Seed und dieselben Befehle ergeben denselben fachlichen Zustand, unabhängig davon, wie oft die Karte gezeichnet wird. Die UI sammelt Zeit nur bei sichtbarem, aktivem Spiel. `requestAnimationFrame` darf keine Produktion abschließen oder Geld verändern.

## Mengen und Eigentum

Charge: Artikel, Menge, Ort, Standort, Eigentümer, Qualität, Einstandswert und Herkunft. Reservierungen markieren Teilmengen, die andere Vorgänge nicht mehr frei verwenden können. Ein atomarer Übergang wird vollständig durchgeführt oder abgelehnt; ein volles Ziellager lässt Ladung im Fahrzeug.

Verbrauchte Mengen werden nicht rückwirkend aus der Herkunft entfernt. Dadurch können Rückrufe Nachfolger finden. Diese Entscheidung kostet langfristig Speicher und ist bewusst als Grenze dokumentiert.

## Unterbrechung und Wiederaufnahme

Ein Job speichert Restzeit, verarbeiteten Material-Snapshot und Ausgabe. Schichtende entfernt nur aktuelle Arbeitszuweisung, nicht bereits verbrauchtes Material oder Fortschritt. Wartung kann laufenden Fertigungsauftrag suspendieren und anschließend fortsetzen. Vorheriger Job bleibt referenziert.

## Geld und doppelte Ereignisse

`book` nimmt Schlüssel, Betrag, Kategorie und Referenzen entgegen. Pflichtkosten werden täglich aggregiert; Zeitmarken erhalten Idempotenz. Ein laufzeitlokaler Index beschleunigt Buchungssuche, wird nach Laden aus JSON rekonstruiert. Er ist kein zweiter fachlicher Geldbestand.

Bestandbewertung und Zahlung sind unterschiedliche Vorgänge. Herstellkosten erhöhen Warenbewertung; sie dürfen bereits bezahlte Löhne nicht erneut abbuchen. Kredit erhöht Geld und Schuld, nicht Umsatz.

## Speicherung und Prognose

Beim Import wird zunächst vollständig geparst und validiert. Erst danach ersetzt UI den echten Zustand. Objektbezüge, Mengen, Status und Kapazitäten werden geprüft. Optionale Felder älterer Version-1-Stände erhalten definierte Standardwerte.

`forecast` lädt eine vollständige Kopie durch denselben Validator, führt ausgewählte Befehle aus und lässt sie vorauslaufen. Originalzustand und dessen Zufallsgenerator bleiben unverändert. Das Ergebnis ist ein Szenario unter festgehaltenen Annahmen, keine garantierte Marktentwicklung.

## Erweiterungsregeln

Neue Funktionen erhalten eigenes Modul oder erweitern zuständigen Eigentümer. Initialisierung, handle, step und validate werden gemeinsam integriert. Vor Änderung gemeinsamer Zustände Schnittstellen dokumentieren. Tests sollen fachliche Risiken prüfen: doppelte Ware, verlorene Ladung, vorzeitiges Geld, unterbrochene Arbeit und beschädigte Importe. UI- oder Grafikänderungen dürfen diese Zustände nicht verändern.
