# Projekt-Regeln: Riczone Cookie Guard

## Versionierung (Semantic Versioning)

Bei jeder Änderung, die sich auf die gebaute Browser-Erweiterung auswirkt (Bugfixes, neue Funktionen, UI-/Textänderungen, Manifest- oder Berechtigungsänderungen), muss vor dem Commit/Push bzw. vor dem Erstellen neuer Release-Pakete ein sinnvoller Versions-Bump nach Semantic Versioning (`MAJOR.MINOR.PATCH`) erfolgen:

- **Patch (`x.y.Z`)**: Bugfixes, kleine UI- oder Textkorrekturen, Feintuning der Heuristik oder kleine Abhängigkeits-Updates.
- **Minor (`x.Y.0`)**: Neue abwärtskompatible Funktionen, neue Einstellungen, zusätzliche Sprachen oder neue Zielplattformen.
- **Major (`X.0.0`)**: Breaking Changes (z. B. inkompatibles Storage-/Export-Format oder grundlegende Verhaltensänderungen).

Bei reinen Dokumentations-, Test- oder Regel-Änderungen ohne Auswirkung auf die Erweiterung selbst ist kein Versions-Bump erforderlich.

### Synchronisation der Versionsnummer
- Die Version wird in `package.json` und `package-lock.json` aktualisiert.
- `wxt.config.ts` liest die Manifest-Version automatisch aus `package.json`, sodass Chrome- und Firefox-Builds immer synchron bleiben.
- Nach einem Versions-Bump immer `npm run typecheck`, `npm test` und `npm run build:all` ausführen, bevor committed oder gepackt wird.
