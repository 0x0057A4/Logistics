# Fahrplan bis 1.0 (vom Nutzer abgenommen, 17.10.2026)

| Version | Inhalt |
|---|---|
| 0.14 | Welle 3c: Luftexport, Dispositionsassistent, Replay 60 Min. (in Abnahme) |
| 0.15 | Wirtschaft: Ergebnisrechnung (GuV) und Abschreibung, Warenarten Kühlware und Sperrgut, Ausbaustufe Mega-Hub mit großem Sortierer, Mehrwertdienste (bisherige Fertigung) · dazu Grafik-Rahmen: Qualitätsstufen Niedrig/Mittel/Hoch (automatisch nach Messung), Detailstufen (LOD), verbindliches Leistungsbudget je Darstellung |
| 0.16 | Betrieb: Störungen und Wetter, Personalrollen (z. B. Staplerfahrer), Kundendienst-Ausbau, Fahrplan-Warnung bei Ankunft nach Schichtende (QS-W3-02); aus 0.15: QS-015-01 Lastpriorität Energie, QS-015-03 Rückgabe Fremdmaterial bei Storno Lohnfertigung, Angebote zeigen Kühlplätze/Lkw-Kapazität (B-0.15-2), Sortierstufen neu abstimmen (B-0.15-4), Kühl-Balancing nachmessen |
| 0.17 | Bedienbarkeit nach Playtest des Nutzers (18.10.2026): HUD/Schrift/Farben, verschiebbare/vergrößerbare Fenster, Lager als Produktzeilen mit Ressourcen und [+] Bestellen, Auftragstabelle mit Bestandsbezug, Auftrags-Tab in der unteren Leiste, Anlagenerklärungen, Umbenennen, WASD im Baumodus, Personalplan, Liquidität heute, Kundendienst-Board (docs/SCHNITTSTELLEN-0.17-UI.md) |
| 0.18 | Grafik-Angleich an die Vorlage: G1 Szenenanalyse (abstrakt, ohne Code-Übernahme), Hub-Architektur, fließende Pakete auf Förderband/Sortierer, detaillierte Fahrzeuge und Personen · G2 Umgebung/Verkehr, Netzkarte im Vorbild-Stil, Licht/Labels |
| 1.0 | Abnahme: Langzeit-Balancing, Last 8 Standorte, 60-FPS-Nachweis auf Referenzgerät (i5-1335U, Iris Xe), Barrierefreiheit, Spielname, Paket |

Voraussetzung für 0.17: Messung des Nutzers mit `?perf=1` (Tag und Nacht).
Offen aus Prüfungen: Doppelstrafe Luftexport/penaltyOpen (A02/A08 prüfen), Glocke Container gebündelt, Lagergeld-Bündelung im Hauptbuch.
