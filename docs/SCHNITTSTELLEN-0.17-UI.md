# Schnittstellen 0.17 – Bedienbarkeit und Informationsdarstellung (A01)

Stand 18.10.2026. Grundlage: Nutzerauftrag vom 18.10.2026 („Nach Abschluss der 0.16 …“, Abschnitte 1–14, Playtest-Befunde). Der Grafik-Angleich rückt dadurch auf 0.18; 1.0 bleibt die Abnahme.

## Verbindliche Rahmenbedingungen (Nutzer)

- Bestehende Mechaniken, Speicherfunktionen und Spielstände bleiben erhalten. Kein Frameworkwechsel, kein Neuaufbau.
- Nur echte Simulationsdaten. Keine erfundenen Bestände, Prognosen oder Platzhalter.
- Deutsch. **Assistent bleibt unverändert.** **Keine Zeitsprünge/Daily Jumps.** Keine neue Forschungsgestaltung.
- Prüfauflösungen 1366 × 768 und 1920 × 1080 (Skalierung 100 %).
- Darstellung bucht weder Ware noch Geld; Änderungen nur über vorhandene oder neue geprüfte Befehle.

## Architekturentscheidungen (A01)

- **Ein Fensterobjekt bleibt** (`#panel`), wird aber ein frei schwebendes Fenster: verschieben (Titelleiste), Größe ändern (Ränder/Ecken), maximieren/wiederherstellen, Mindestgröße, Klemmen in den sichtbaren Bereich bei Größenänderung. Geometrie je Fensterart in den vorhandenen Einstellungen (`prefs`, localStorage) unter `prefs.windows[panel]={x,y,w,h,max}`. Pointer-Ereignisse am Fenster werden nicht an die Szene durchgereicht.
- **Neue Ansichtslogik in eigene Module**, damit parallele Arbeit wenig in `app.js` kollidiert. `app.js` erhält nur kurze Einhängepunkte.
  - `dist/ui-window.js` – Fenstersystem.
  - `dist/stock-view.js` – **gemeinsame, reine Bestandsberechnung** (keine DOM-Zugriffe) für Lager, Aufträge, Ressourcen und Auftragsleiste.
  - `dist/ui-stock.js`, `dist/ui-orders.js` – Lager- und Auftragstabellen.
  - `dist/ui-explain.js` – Anlagenerklärungen (Zweck, Voraussetzungen, Ablauf, Zustand, nächster Schritt).
  - `dist/ui-schedule.js` – Personal- und Belegungsplan.
  - `dist/ui-board.js` – Kundendienst-/Rücklauf-Board.
- Tabellen: Kopfzeile `position:sticky`, nur **ein** Scrollbereich je Fenster (der Fensterinhalt), Filterleiste sticky.
- Gemeinsame Berechnungen werden einmal je HUD-Takt (4 Hz) bzw. bei Zustandswechsel neu aufgebaut und gecacht (Schlüssel `s.t` + Panel), nicht je Frame.

## S1 Bestandsrechnung (`dist/stock-view.js`, A05)

```
productRows(s, {site?}) → [{item, name, unit, variant, total, reserved, free, blocked, inProduction, incoming,
                             locations:[{site, location, qty}], batches:[…], recipe:{inputs:[{item, perUnit}]}|null}]
orderCoverage(s, order) → {need, delivered, open, reservedForThis, onHand, freeOther, missing}
resourceNeeds(s, item, qty=1, {orderId?}) → [{item, name, unit, perUnit, need, free, incoming, missing}]
```

- Mengen aus Chargen `s.batches` (`qty`, `reserved`, `owner`, `location`, `site`, `quality`, `blocked`, `locked`, Temperatur/Sperre), Einkäufe aus `s.purchases` (`status` ≠ eingelagert → „Im Zulauf“), laufende Fertigung aus `s.jobs`.
- **Varianten:** Gruppierung nach `item` und Eigentümer-Klasse (eigen / Fremdware je Auftrag) und, falls vorhanden, Qualitätsstufe (Bänder statt Mischung) – nie irreführend zusammenfassen.
- **frei** = physisch vorhanden, eigen, nicht reserviert, nicht gesperrt/blockiert/in Quarantäne.
- **orderCoverage-Regel** (Prüffall 3): `open = qty − delivered`; `reservedForThis` = Chargen mit `owner===order.id` bzw. Reservierungen für diesen Auftrag; `freeOther` = frei verfügbarer Bestand ohne Doppelabzug; `missing = max(0, open − reservedForThis − freeOther)`. Anzeige ist **keine Zusage**; verbindlich bleibt die vorhandene Reservierung.
- Rezepte aus `RECIPES` (Katalog), mehrstufig nur so weit hinterlegt; ohne Rezept `recipe:null` → Hinweis.

## S2 Umbenennen (A01 in core.js)

- Neuer Befehl `{type:'rename', target:'building'|'site', id, name}`. Name getrimmt, 1–40 Zeichen; leer → eigener Name entfernt (Standardname). Gebäude: optionales Feld `b.label`; Standort: `site.name` (Startname bleibt bei leerem Namen erhalten über `site.defaultName`).
- `displayName(s, building)` (Export in `stock-view.js` oder `ui-explain.js`) liefert `label` oder bisherigen Typnamen mit Nummer; alle Ansichten nutzen ihn. Typ bleibt sichtbar („Typ: Prüfstation“).

## Weitere Abschnitte

| Nutzerabschnitt | Umsetzung | Agent |
|---|---|---|
| 2 HUD, Farben, Schrift 14–16 px, Navigation mit Symbol + Kurztext, Tooltips, Gruppen ohne Scrollleiste | `styles.css` Token-Überarbeitung, `index.html` Rail | A10-W |
| 3 Fenster | `ui-window.js` | A10-W |
| 9 WASD im Baumodus, Kontextmenü im ganzen Spielbereich, Rechtsklick-Ziehen, Fokusverlust | `app.js` Tastatur, `scene3d.js` nur falls nötig | A10-W |
| 4 Lager, 5 Aufträge, 6 Auftrags-Tab in der unteren Leiste, [+] Bestellen mit Vorbelegung | `stock-view.js`, `ui-stock.js`, `ui-orders.js` | A05/A10-S |
| 7 Anlagenerklärung, 8 Umbenennen (UI) | `ui-explain.js` | A04/A10-E |
| 10 Personalplan, 11 Liquidität heute, 12 Board | `ui-schedule.js`, Finanzfenster, `ui-board.js` | A06/A08/A10-P |

## Dateibereiche

| Agent | Darf ändern | Nicht |
|---|---|---|
| A10-W Fenster/HUD/Steuerung | `dist/ui-window.js` (neu), `dist/styles.css` (Tokens, Rail, Panel, Tabellen-Grundstil), `dist/index.html` (Rail, Panel-Kopf), `app.js` nur openPanel/closePanel/Tastatur/Kontextmenü | Fachmodule, andere ui-*.js |
| A05/A10-S Lager/Aufträge | `dist/stock-view.js`, `dist/ui-stock.js`, `dist/ui-orders.js` (neu), `app.js` nur Einhängen der Panels `inventory`/`orders`/untere Leiste, Bestellformular-Vorbelegung; CSS nur als Block am Dateiende | Fachmodule |
| A04/A10-E Anlagen | `dist/ui-explain.js` (neu), `app.js` nur Gebäudeakte/Baumenü-Beschreibung/Namensanzeige; CSS-Block am Ende | Fachmodule (Befehl `rename` legt A01 an) |
| A06/A08/A10-P Plan/Finanzen/Board | `dist/ui-schedule.js`, `dist/ui-board.js` (neu), `app.js` nur Panels staff/finance/service/returns; CSS-Block am Ende | Fachmodule |

Jeder Agent schreibt Tests `tests/ui-017-<kürzel>*.test.js` und einen Browsertest `tests/browser/ui-017-<kürzel>.mjs` mit 1366 × 768 und 1920 × 1080. A11 prüft danach die 17 Prüfszenarien des Nutzers.
