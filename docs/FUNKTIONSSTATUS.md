# Funktionsstatus 0.7

Stand: 14.10.2026. „Implementiert“ bedeutet vorhandene fachliche Funktion und Bedienung, nicht vollständige Abnahme sämtlicher Ausprägungen des ursprünglichen Konzepts. Kapitel sind bewusst nicht pauschal als fertig markiert.

| Kapitel | Implementierter Umfang | Offene Tiefe / Einschränkung |
|---|---|---|
| K00 Vertrag | Modulgrenzen, IDs, Minuten, Stückmengen, Buchungen, Ereignisse, fachliche Eigentümer | Weitergehende Modellspezifikation für zusätzliche Branchen |
| K01 Fundament | Deterministische Schritte, Waren/Reservierungen, Geld, Speicherung, Importprüfung, exklusive Tab-Schreibrechte, Modusladen, Speicher-Retry und expliziter temporärer Betrieb | Kein Worker; nicht erforderlich für gemessene Last |
| K02 Halle | Rasterbau, Drehen, Versetzen, Abrissschutz, BFS-Zugänge, Personal, Isometrie/Grundriss, HUD | Canvas-Isometrie statt WebGL/Three.js. Keine frei gebauten Wände, Tore, Wege oder Bereichskopien. Wegezeiten vereinfacht, keine Kollisionsnavigation einzelner Träger |
| K03 Lieferkette | Einkauf, Annahme, Prüfung, Lager, Montage, Prüfung, Verpackung, Beladung, Zustellung, Forderung/Zahlung | Packmittel beschränken sich auf Kartons; keine Leergutkreisläufe |
| K04 Fertigung | Drei Produktfamilien, spezialisierte Stationen, Versionen, Rüsten, Qualität, Nacharbeit, Forschung | Keine freie Produktkonstruktion/Parametervarianten, keine komplexen Losgrößen und Werkzeuginventare |
| K05 Betrieb | Schichten, Müdigkeit/Pausen, Training, Standortreisen, Energie, Werkstatt-/Fahrzeugwartung | Keine Urlaubsplanung, Zufriedenheitsmodellierung, Solar-/Speicheranlagen, Ladeinfrastruktur oder physische Netze |
| K06 Rückläufe | Tatsächliche Abholung, Quarantäne, Serviceprüfung, einmalige Erstattung, Reparatur/Verwertung, Chargenrückruf | Kein allgemeines Ticketsystem für Adressen/Terminänderungen. Kalte Retouren werden verwertet, nicht repariert |
| K07 Regeln | Nachbestellung, Versand, Wartung, Priorität, Budget, Sperrfrist, Gründe | Keine frei formulierte Regelsprache, Personalhilfe-/Expressregeln oder umfassende Störungs- und Wetterereignisse |
| K08 Standorte | Bis acht Hallen, eigene Anlagen/Personal/Lager, echte Transfers, Netzkarte, kein interner Umsatz | Feste fiktive Standorte, keine frei formbare Straßenkarte oder Standortflächenvergrößerung |
| K09 Disposition | Gewicht/Volumen, Rampenkonkurrenz, Fahrerpausen, 2–4 echte Tourstopps, Retouren-Rückladung, Quarantäneentladung, Transfers, Fahrzeugwartung, Mietfahrzeuge mit Tageskosten und Rückgabe | Rückladungen nur früher gelieferter Ware desselben aktiven Auftrags; kein Reichweiten-/Tankmodell, individuelle Rampentermine oder Straßenverkehrssimulation |
| K10 Wirtschaft | Eigenprodukte, Auftragsfertigung, Fremdlogistik, Teilmengen, verspätete Zahlung, Kredit/Kontokorrent, Lieferbeiträge, getrennte Geldflussbereiche und Forderungsübersicht | Auftragsfertigung nutzt standardisierte Produkte. Keine vollständige GuV/Abschreibung, Leasing, Versicherungen, variablen Verkaufspreise, Dauerverträge oder differenzierte Nachfrageelastizität |
| K11 Spezial | Kühlplätze, Temperaturdauer, irreversibler Schaden, passender Kühltransport, Dokumentprüfung | Eine Kaltwarenklasse; keine umfangreichen Gefahrgutklassen/Zertifikate und keine realen Zollregeln |
| K12 Verkehrsträger | Bahn/See/Luft als externe Angebote, Fahrplan, Kapazität, eigener Terminal, Dokumente, Anschlussversäumnis/Kosten | Je Buchung ein externer Hauptlauf; keine frei zusammengesetzte mehrgliedrige multimodale Route und keine eigenen Schiffe/Flugzeuge |
| K13 Führung | Isolierte Zustandssimulation, Vergleich mit zusätzlicher Fertigungskraft, Ereignischronik, delegierte Regeln | Keine beliebigen Ausbaupläne in Vorschau, Leitungsorgane als eigene Personen oder vollständiges Replay. Chronik auf 3.000 Ereignisse begrenzt |
| K14 Paket | Statisches Spiel, Quellcode, deutsche Anleitung, Fach-/UI-Bindungsprüfungen, begrenzter Laufzeit-/Balancetest | Browser-, visuelle, mobile und vollständige Barrierefreiheitsabnahme offen. Langzeitbalance und große Unternehmenslast nicht abschließend getestet |

## Offene Abnahme

Der Spielstand umfasst Funktionskerne aus allen vier Phasen. Die vollständige Konzernfassung des ursprünglichen Auftrags ist mit Version 0.7 noch nicht erreicht. Insbesondere Darstellung und räumliche Materialbewegung, fortgeschrittene Disposition, vertiefte Unternehmensrechnung sowie End-to-End-Browserprüfung müssen weitergeführt werden. Ein bestandener automatisierter Testlauf ersetzt diese Arbeiten nicht.

## Praktische Grenzen

- Rendering ist isometrische Canvas-Zeichnung aus tatsächlichen Spielzuständen, kein frei neigbares 3D-Modell.
- Alte Chargen bleiben für Herkunftsnachweise erhalten. Bei sehr langer Spieldauer wachsen Daten. Importgrenze derzeit 30 MB; Browserlokalspeicher kann früher knapp werden. Export bei Speicherwarnung nutzen.
- Automatische Sicherung und Backup verwenden Browserlokalspeicher. Kein geräteübergreifender Cloud-Spielstand.
- Spieler kann durch falsche Schichten, gesperrte Fracht oder fehlende Ressourcen in einen Wartezustand geraten. Gründe erscheinen in Fachfenstern. Kein automatischer Sanierungsberater.
- Schreibschutz über Web Locks ab Version 0.5: Ein schreibender Tab je Modus. Bereits geöffnete ältere Fassungen schließen; diese beachten Sperren nicht. Ohne Web Locks oder lokalen Speicher bleibt regulärer Betrieb schreibgeschützt; ausdrücklich bestätigter temporärer Betrieb ermöglicht Spielen mit JSON-Export ohne lokale Speicherung. Browserabnahme bleibt offen.
