# Schreibschutz paralleler Tabs

`SaveGuard` in `dist/save-guard.js` hält einen exklusiven Web Lock pro Speicherpräfix und Spielmodus. `createSaveGuard(options)` ist die äquivalente Factory. Produktionsaufruf: `new SaveGuard({prefix: STORE, onLost})`. Storage und Web Locks werden intern sicher ermittelt.

1. Vor Spielbeginn `await guard.acquire(mode)` aufrufen.
2. Erst bei Erfolg den aktuell gespeicherten Spielstand laden. Ein bereits vorher geladener Stand könnte veraltet sein.
3. Vor jedem synchronen Speicherblock `guard.owns(mode)` prüfen. Zwischen Prüfung und Speicherung kein `await` verwenden.
4. Bei negativem Ergebnis lokale Schreibzugriffe verweigern, Simulation pausieren und Lesezugriff anzeigen. Export darf weiterhin angeboten werden.
5. Beim Moduswechsel zuerst eigenen Stand sichern, dann neuen Modus erwerben und dessen Stand laden. Beim Verlassen `release()`; bei endgültiger Entsorgung `dispose()`.

`onLost(mode, reason)` meldet Eigentumsverlust und Speicherfehler. Eigentum wird niemals automatisch neu erworben. Zur Wiederaufnahme muss die Anwendung erneut erwerben und den aktuellen gespeicherten Stand neu laden.

LocalStorage enthält ergänzend eine erneuerte Eigentumsmarkierung mit Ablaufzeit. Diese Markierung allein ist keine atomare Sperre. Ausschließlich Web Locks autorisieren Schreiben. Ein pausierter Browser bleibt Eigentümer, solange sein Web Lock besteht; Ablauf der Markierung erlaubt keinem zweiten Tab eine Übernahme. Ein abgestürzter/geschlossener Tab verliert seinen Web Lock durch den Browser. Der nächste Eigentümer ersetzt dann seine veraltete Markierung.

Ohne Web Locks (`unsupported`) oder zugänglichen lokalen Speicher (`storage-error`) bleibt persistenter Schreibzugriff gesperrt. Ab 0.7 kann nach ausdrücklicher Bestätigung temporär ohne lokale Speicherung gespielt werden; dauerhafte Warnung und JSON-Export bleiben sichtbar. „Speicher erneut prüfen“ versucht sicheren Zugriff erneut. Ein vorhandener anderer Stand wird nicht ungefragt überschrieben. Keine unsichere Lease-Ausweichlösung. Alte bereits geöffnete App-Versionen ohne Schreibschutz und fremder Code, der den Sperrvertrag ignoriert, werden nicht kontrolliert. Browserprofile, Privatfenster und verschiedene Ursprünge besitzen ohnehin getrennten lokalen Speicher.

Test-Injektionen: `locks`, `storage`, `now`, `setInterval`, `clearInterval`, `owner`, `leaseMs`. Stand der Selbstprüfung: neun Node-Verhaltensprüfungen, einschließlich zweier Tabs, getrennter Modi, Übernahme, Speicherfehler und verspäteter Lock-Anfrage. Tatsächliche Browserprüfung bleibt Aufgabe der Integration.
