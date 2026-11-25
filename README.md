# Riczone Cookie Guard

**English** · [Deutsch](./README.de.md)

Privacy-friendly browser extension (**Manifest V3**) for **Google Chrome**, **Mozilla Firefox**, and **Firefox for Android** that automatically rejects cookie banners, with a flexible whitelist, bilingual UI (English & German), and Global Privacy Control (`Sec-GPC: 1`).

## Features

- **Automatic Cookie Rejection:** Combines 1,500+ CMP rules (`@duckduckgo/autoconsent`) with a German/English fallback heuristic (including open Shadow DOMs) to reject cookie banners automatically.
- **Flexible Whitelist:** Allow domains such as `payback.de` (automatically matching subdomains, plus optional exact `=host` or wildcard `*.domain.com` rules) with one click in the popup or via the settings page. Entries default to *Accept automatically*, or optionally *Do not intervene*.
- **Unavoidable Banners (off by default):** Optional setting to automatically continue on pay-or-OK / PUR-subscription walls that offer no free reject option, without ever clicking paid subscription offers.
- **Global Privacy Control (`Sec-GPC: 1`):** Sends the standardized privacy signal via HTTP header and `navigator.globalPrivacyControl`. Automatically disabled on whitelisted domains.
- **Bilingual UI (EN / DE):** Automatically adapts to your browser language (`_locales/en` and `_locales/de`).
- **Privacy & Storage:** Cookie banners are processed directly in the browser. Riczone Cookie Guard uses no own server and collects no telemetry (`data_collection_permissions: ["none"]`). Statistics and the activity log (last 50 entries) remain strictly local (`browser.storage.local`). Settings and the whitelist are stored via `browser.storage.sync` (with a local fallback) so they can sync across devices using your browser's built-in sync.

## Development & Build

Requirements: Node.js 22+ (recommended 24.x) and Python 3 (for ZIP packaging).

```bash
npm install           # Install dependencies
npm run typecheck     # TypeScript check
npm test              # Unit tests (Vitest)
npm run build:chrome  # Chrome MV3 build (.output/chrome-mv3)
npm run build:firefox # Firefox MV3 build (.output/firefox-mv3, Desktop & Android)
npm run build:all     # Build both targets
npm run package       # Build & create release ZIP archives in dist-packages/
npm run test:e2e      # Browser E2E tests (Playwright)
```

## Local Installation

- **Google Chrome:** Open `chrome://extensions` → enable *Developer mode* → **Load unpacked** → select `.output/chrome-mv3`.
- **Mozilla Firefox (temporary):** Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → select `.output/firefox-mv3/manifest.json`.
- **Mozilla Firefox Desktop & Android (signed via AMO):** See [AMO-SIGNING.md](./AMO-SIGNING.md).

## License & Contact

- **Own code (Riczone Cookie Guard):** Licensed under the [MIT License](./LICENSE).
- **Third-party library (`@duckduckgo/autoconsent` v18.10.0):** Licensed under the **Mozilla Public License 2.0 (MPL-2.0)**. The complete third-party license notice including upstream source links for `v18.10.0` is stored in [public/THIRD-PARTY-LICENSES.txt](./public/THIRD-PARTY-LICENSES.txt) and bundled into both browser packages ([upstream source v18.10.0](https://github.com/duckduckgo/autoconsent/tree/v18.10.0)).

Contact: [riczone.digital@gmail.com](mailto:riczone.digital@gmail.com) · [riczone.de](https://riczone.de)
