# Firefox-Signierung über Mozilla AMO (Selbstverteilung)

Damit Firefox die Erweiterung dauerhaft (nicht nur temporär über `about:debugging`) installiert, muss das Firefox-Paket einmal von Mozilla signiert werden – genau wie bei **Riczone YouTube Download**.

## 1. Pakete erzeugen

```bash
npm run package
```

Danach liegen im Ordner `dist-packages/` drei Dateien bereit:

- `Riczone-Cookie-Guard-Chrome.zip` – für Google Chrome
- `Riczone-Cookie-Guard-Firefox-unsigned.zip` – das unsignierte Firefox-Add-on (Manifest V3, `gecko.id: cookie-guard@riczone.de`, Desktop & Firefox für Android ab `strict_min_version: 142.0`, `data_collection_permissions: ["none"]`)
- `Riczone-Cookie-Guard-Firefox-sources.zip` – der komplette Quellcode ohne `node_modules` / Build-Artefakte für die AMO-Quellcodeprüfung

## 2. Auf addons.mozilla.org signieren lassen

1. Melde dich im [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/) an.
2. Klicke auf **Neues Add-on einreichen** → wähle **Selbst gehostet** (*On your own*), damit das Add-on nicht öffentlich gelistet wird, aber eine offizielle Signatur erhält.
3. Lade `dist-packages/Riczone-Cookie-Guard-Firefox-unsigned.zip` hoch.
4. Wenn AMO nach dem Quellcode fragt (da TypeScript/WXT gebundelt wird):
   - Wähle **Ja** und lade `dist-packages/Riczone-Cookie-Guard-Firefox-sources.zip` hoch.
   - Build-Hinweis für AMO-Reviewer:
     ```
     Node.js 24.x / npm 11.x
     npm ci
     npm run build:firefox
     Output: .output/firefox-mv3
     ```
5. Nach der automatischen Prüfung lädst du die signierte `.xpi`-Datei herunter und ziehst sie einfach per Drag & Drop in Firefox.
6. Falls Firefox beim ersten Öffnen des Popups nach der Webseiten-Berechtigung fragt, einmal im Popup auf **„Webseiten-Zugriff freigeben“** klicken.
