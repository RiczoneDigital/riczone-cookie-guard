# Riczone Cookie Guard

Datenschutzfreundliche Browser-Erweiterung (**Manifest V3**) für **Google Chrome** und **Mozilla Firefox**, die Cookie-Banner automatisch ablehnt – mit flexibler Whitelist und Global Privacy Control (`Sec-GPC: 1`).

## Funktionen

- **Automatisches Ablehnen:** Nutzt über 1.500 CMP-Regeln (`@duckduckgo/autoconsent`) plus eine deutsch-/englischsprachige Fallback-Heuristik (inkl. Shadow DOM), um Cookie-Banner automatisch abzulehnen.
- **Flexible Whitelist:** Domains wie `payback.de` (inkl. Subdomains, optional auch Exakt-Matches `=host` oder Wildcards `*.domain.de`) per 1-Klick im Popup oder in den Einstellungen freigeben – standardmäßig mit *Automatisch akzeptieren* oder optional *Nicht eingreifen*.
- **Unvermeidbare Banner (abschaltbar):** Optionale Einstellung, um Pay-or-OK-/PUR-Abo-Paywalls (die keine kostenlose Ablehnen-Option anbieten) automatisch über die kostenlose Weiter-Option zu schließen, ohne jemals kostenpflichtige Abo-Buttons zu klicken.
- **Global Privacy Control (`Sec-GPC: 1`):** Sendet das standardisierte Datenschutz-Signal als HTTP-Header und `navigator.globalPrivacyControl` – auf Whitelist-Domains automatisch deaktiviert.
- **Datenschutz & Speicherung:** Cookie-Banner werden direkt im Browser verarbeitet – Riczone Cookie Guard verwendet keinen eigenen Server und erhebt keine Telemetrie (`data_collection_permissions: ["none"]`). Statistik und Aktionsprotokoll (letzte 50 Einträge) bleiben lokal (`browser.storage.local`). Einstellungen und Whitelist werden über `browser.storage.sync` (mit lokalem Fallback) abgelegt und können dadurch über die eingebaute Browser-Synchronisierung zwischen Geräten synchronisiert werden.

## Entwicklung & Build

Voraussetzung: Node.js 22+ (empfohlen 24.x) und Python 3 (für den ZIP-Export).

```bash
npm install           # Abhängigkeiten installieren
npm run typecheck     # TypeScript-Prüfung
npm test              # Unit-Tests (Vitest)
npm run build:chrome  # Chrome MV3 Build (.output/chrome-mv3)
npm run build:firefox # Firefox MV3 Build (.output/firefox-mv3)
npm run build:all     # Beide Browser bauen
npm run package       # Baut & erstellt ZIP-Archive in dist-packages/
npm run test:e2e      # Browser-E2E-Tests (Playwright)
```

## Lokal installieren

- **Google Chrome:** `chrome://extensions` öffnen → *Entwicklermodus* aktivieren → **Entpackte Erweiterung laden** → `.output/chrome-mv3` auswählen.
- **Mozilla Firefox (temporär):** `about:debugging#/runtime/this-firefox` öffnen → **Temporäres Add-on laden…** → `.output/firefox-mv3/manifest.json` auswählen.
- **Mozilla Firefox (dauerhaft signiert via AMO):** Siehe [AMO-SIGNING.md](./AMO-SIGNING.md).

## Lizenz & Kontakt

- **Eigener Code (Riczone Cookie Guard):** Veröffentlicht unter der [MIT-Lizenz](./LICENSE).
- **Drittanbieter-Bibliothek (`@duckduckgo/autoconsent` v18.10.0):** Lizenz unter der **Mozilla Public License 2.0 (MPL-2.0)**. Der vollständige Lizenzhinweis inkl. Quellen-Links zu dieser Version befindet sich in [public/THIRD-PARTY-LICENSES.txt](./public/THIRD-PARTY-LICENSES.txt) und ist in beiden Browser-Paketen enthalten ([Originalquellen v18.10.0](https://github.com/duckduckgo/autoconsent/tree/v18.10.0)).

Kontakt: [riczone.digital@gmail.com](mailto:riczone.digital@gmail.com) · [riczone.de](https://riczone.de)
