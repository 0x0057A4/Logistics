# Unabhängige Qualitätssicherung 0.8

Prüfstand: Backend 409d4e2 und d2c6eee; Oberfläche 8ce77a7. Eigener QS-Worktree, getrennt von Implementierung. 15. Oktober 2026.

## Ergebnis

192 automatisierte Tests bestanden, 0 fehlgeschlagen. Enthalten: sieben zusätzliche unabhängige Integrationsprüfungen in `tests/qa-service08.test.js`, bisherige Fachtests und UI-Harness. Offline-HTML vor Gesamtprüfung neu gebündelt.

## Unabhängig geprüfte Risiken

- Ohne Kundendienstpersonal, außerhalb Schicht und während Pause bleibt Bearbeitungszeit stehen. Frist ändert sich erst nach Arbeitsende.
- Fehlendes Kapital blockiert Abschluss bei verbleibender Arbeit von null; JSON-Wiederladen, Kapitalzufuhr und erneutes Laden führen zu exakt einer Kostenbuchung.
- Während Bearbeitung erfüllter Auftrag macht Friständerung gegenstandslos: keine Gebühr und keine neue Frist.
- Verspätung erzeugt höchstens eine automatische Beschwerde je Auftrag. Friständerung hebt eingetretenen Rufverlust nicht auf.
- Echte Teilzustellung mit Rückholung: Retourenprüfung und Ticket beanspruchen dieselbe einzelne Serviceperson; keine gleichzeitige Bearbeitung bei belegter Person.
- Laufende Tickets überstehen JSON sowie eingebettete HTML-Spielstände unverändert. Retoure bleibt genau einmal erstattet.
- Altstände ohne Ticketfeld laden mit leerer Ticketliste. Fehlerhafte Auftragsreferenzen, doppelte Anliegen und wiedergeöffnete bereits gebuchte Vorgänge werden abgewiesen.
- Fristgebühr beträgt zwei Prozent des Restwerts bei Antwortwahl. Kulanz beträgt fünf Prozent des bereits bezahlten Betrags, gedeckelt auf 50 Euro; erneutes Laden verursacht keine Doppelbuchung.

## Grenzen

Keine echte Browserprüfung erfolgt. UI-Harness, Syntaxprüfung und Offline-Bundle-Test ersetzen keine visuelle oder interaktive Prüfung im Browser. Live-Deployment und GitHub-Veröffentlichung liegen bei Projektleitung. Gebühren-/Kulanzwerte werden bei Antwortwahl festgehalten; spätere Zahlungseingänge ändern diesen Betrag nicht.

Technische QS-Freigabe für geprüften Umfang. Nach weiteren Produktänderungen gezielte Nachprüfung erforderlich.

## Abschließende Nachprüfung

Antworttext-Erweiterungen 4f8cff9 und c3315d7 gezielt geprüft: 23 Fach-, Integrations- und UI-Tests bestanden. `reply` bleibt vor Abschluss null, ist nach Abschluss verpflichtender begrenzter Klartext und hält den tatsächlichen Auftragsstand bei Abschluss fest. Oberfläche maskiert HTML-Zeichen; eingefügtes `<img>` erscheint als Text. Keine offene Beanstandung. Technische Freigabe umfasst diese Erweiterungen. Projektleitung meldet für den zusammengeführten Stand d10d14f insgesamt 194 bestandene Tests; diese Gesamtzahl ist ihre Prüfung, die unabhängige Nachprüfung umfasste die genannten 23 Tests. Browserprüfung bleibt offen.
