import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test, expect, chromium, type BrowserContext } from '@playwright/test';

const EXTENSION_PATH = path.resolve(process.cwd(), '.output', 'chrome-mv3');
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'test-results', 'screenshots');

function findChromiumExecutable(): string | undefined {
  const defaultExec = chromium.executablePath();
  if (defaultExec && fs.existsSync(defaultExec)) {
    return defaultExec;
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const pwDir = path.join(localAppData, 'ms-playwright');
    if (fs.existsSync(pwDir)) {
      const dirs = fs
        .readdirSync(pwDir)
        .filter((d) => /^chromium-\d+$/.test(d))
        .sort()
        .reverse();
      for (const dir of dirs) {
        for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe']) {
          const candidate = path.join(pwDir, dir, rel);
          if (fs.existsSync(candidate)) {
            return candidate;
          }
        }
      }
    }
  }

  return undefined;
}

interface ServerHandle {
  port: number;
  lastHeaders: Record<string, string | string[] | undefined>;
  close: () => Promise<void>;
}

function startFixtureServer(): Promise<ServerHandle> {
  let lastHeaders: Record<string, string | string[] | undefined> = {};

  const server = http.createServer((req, res) => {
    if (req.url === '/banner') {
      lastHeaders = req.headers;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><title>Cookie Testseite</title></head>
<body>
  <h1>Testseite</h1>
  <div id="result">pending</div>
  <div role="dialog" aria-modal="true" id="custom-cookie-dialog" style="position:fixed;bottom:0;left:0;right:0;padding:24px;background:#fff;border-top:2px solid #000;">
    <h2>Datenschutz &amp; Cookies</h2>
    <p>Wir verwenden Cookies für Analyse und Marketing. Bitte treffen Sie eine Auswahl.</p>
    <button id="btn-reject" type="button">Alle ablehnen</button>
    <button id="btn-accept" type="button">Alle akzeptieren</button>
  </div>
  <script>
    document.getElementById('btn-reject').addEventListener('click', () => {
      document.getElementById('result').textContent = 'rejected';
      document.getElementById('custom-cookie-dialog').style.display = 'none';
    });
    document.getElementById('btn-accept').addEventListener('click', () => {
      document.getElementById('result').textContent = 'accepted';
      document.getElementById('custom-cookie-dialog').style.display = 'none';
    });
  </script>
</body>
</html>`);
      return;
    }

    if (req.url === '/onetrust') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><title>OneTrust CMP Testseite</title></head>
<body>
  <h1>OneTrust CMP Testseite</h1>
  <div id="result">pending</div>
  <div id="onetrust-consent-sdk">
    <div id="onetrust-banner-sdk" role="alertdialog" style="position:fixed;bottom:0;left:0;right:0;padding:20px;background:#fff;border-top:2px solid #111;">
      <p>Wir nutzen Cookies (OneTrust CMP).</p>
      <button id="onetrust-reject-all-handler" type="button">Alle ablehnen</button>
      <button id="onetrust-accept-btn-handler" type="button">Alle akzeptieren</button>
    </div>
  </div>
  <script>
    document.getElementById('onetrust-reject-all-handler').addEventListener('click', () => {
      document.getElementById('result').textContent = 'rejected';
      document.getElementById('onetrust-banner-sdk').style.display = 'none';
    });
    document.getElementById('onetrust-accept-btn-handler').addEventListener('click', () => {
      document.getElementById('result').textContent = 'accepted';
      document.getElementById('onetrust-banner-sdk').style.display = 'none';
    });
  </script>
</body>
</html>`);
      return;
    }

    if (req.url === '/pur-paywall') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><title>PUR-Abo Paywall Testseite</title></head>
<body>
  <h1>Zeitungsartikel</h1>
  <div id="result">pending</div>
  <div id="pur_layer" class="pgwl_purGatewayLayer" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;">
    <div class="pgwl_purGatewayLayer-content" role="alertdialog" style="background:#fff;padding:24px;max-width:520px;">
      <h2>Weiter mit Tracking durch Dritte</h2>
      <p>Details zu Cookies finden Sie in der Datenschutzerklärung und in den Privatsphäre-Einstellungen.</p>
      <a href="#">Privatsphäre-Einstellungen</a>
      <button id="pgwl_pur-option-accept-button" type="button">AKZEPTIEREN UND WEITER</button>
      <h2>Weiter mit dem PUR-Abo</h2>
      <p>Nutzen Sie unser Angebot ohne Werbetracking durch Dritte zu einem Vorzugspreis.</p>
      <button id="pgwl_pur-option-abo-button" type="button">ZUM ANGEBOT</button>
    </div>
  </div>
  <script>
    document.getElementById('pgwl_pur-option-accept-button').addEventListener('click', () => {
      document.getElementById('result').textContent = 'accepted-pur';
      document.getElementById('pur_layer').style.display = 'none';
    });
    document.getElementById('pgwl_pur-option-abo-button').addEventListener('click', () => {
      document.getElementById('result').textContent = 'wrong-abo-click';
    });
  </script>
</body>
</html>`);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><body>ok</body></html>');
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        port,
        get lastHeaders() {
          return lastHeaders;
        },
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

test.describe('Riczone Cookie Guard – End-to-End', () => {
  let server: ServerHandle;
  let context: BrowserContext;
  let userDataDir: string;
  let extensionId: string;

  test.beforeAll(async () => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    server = await startFixtureServer();
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcg-e2e-'));

    const executablePath = findChromiumExecutable();

    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      executablePath,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });

    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
    }
    extensionId = new URL(serviceWorker.url()).host;

    // Wait for async startup DNR rule registration (Sec-GPC) so cold-start doesn't race the first request
    await expect
      .poll(
        async () =>
          serviceWorker.evaluate(async () => {
            const ext = (
              globalThis as unknown as {
                chrome: { declarativeNetRequest: { getDynamicRules: () => Promise<unknown[]> } };
              }
            ).chrome;
            const rules = await ext.declarativeNetRequest.getDynamicRules();
            return rules.length;
          }),
        { timeout: 5_000 },
      )
      .toBeGreaterThan(0);
  });

  test.afterAll(async () => {
    await context?.close();
    await server?.close();
    if (userDataDir && fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('auto-rejects by default, auto-accepts unavoidable PUR-Abo paywalls, sends GPC, auto-accepts on whitelist, and shows 2-counter popup', async () => {
    const page = await context.newPage();
    page.on('pageerror', (err) => console.error('[pageerror]', err));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[console.error]', msg.text());
    });

    // 1a. Default mode on German fallback banner: auto-reject + GPC active
    await page.goto(`http://127.0.0.1:${server.port}/banner`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#result')).toHaveText('rejected', { timeout: 8_000 });
    expect(server.lastHeaders['sec-gpc']).toBe('1');
    const gpcDefault = await page.evaluate(
      () => (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl,
    );
    expect(gpcDefault).toBe(true);

    // 1b. Default mode on OneTrust CMP banner: auto-reject via @duckduckgo/autoconsent
    await page.goto(`http://127.0.0.1:${server.port}/onetrust`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#result')).toHaveText('rejected', { timeout: 8_000 });

    // 1c. Default mode on unavoidable PUR-Abo paywall: auto-accepts AKZEPTIEREN UND WEITER
    await page.goto(`http://127.0.0.1:${server.port}/pur-paywall`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('#result')).toHaveText('accepted-pur', { timeout: 8_000 });

    // 2. Open Options page, verify stats & add 127.0.0.1 to Whitelist (default: accept)
    const optionsPage = await context.newPage();
    await optionsPage.setViewportSize({ width: 1080, height: 950 });
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(optionsPage.locator('#opt-stat-rejected')).toHaveText('2', { timeout: 5_000 });

    await optionsPage.fill('#pattern-input', '127.0.0.1');
    await optionsPage.fill('#note-input', 'Payback-Test');
    await optionsPage.click('#whitelist-form button[type="submit"]');
    await expect(optionsPage.locator('.wl-pattern')).toContainText('127.0.0.1');

    await optionsPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'options.png'),
      fullPage: true,
    });

    // 3a. Reload custom banner page -> must AUTO-ACCEPT and suppress Sec-GPC!
    await page.goto(`http://127.0.0.1:${server.port}/banner`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#result')).toHaveText('accepted', { timeout: 8_000 });
    expect(server.lastHeaders['sec-gpc']).toBeUndefined();
    const gpcWhitelisted = await page.evaluate(
      () => (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl,
    );
    expect(gpcWhitelisted).not.toBe(true);

    // 3b. Reload OneTrust CMP page -> must AUTO-ACCEPT via optIn!
    await page.goto(`http://127.0.0.1:${server.port}/onetrust`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#result')).toHaveText('accepted', { timeout: 8_000 });

    // 4. Switch Whitelist mode to "ignore" -> banner must remain pending!
    await optionsPage.selectOption('.wl-item-controls select', 'ignore');
    await page.goto(`http://127.0.0.1:${server.port}/banner`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await expect(page.locator('#result')).toHaveText('pending');

    // 5. Verify Settings toggle for unavoidable banners: turning it OFF leaves /pur-paywall untouched
    await optionsPage.click('.wl-item-controls .btn-danger');
    await expect(optionsPage.locator('#set-unavoidable')).toBeChecked();
    await optionsPage.uncheck('#set-unavoidable');
    await expect(optionsPage.locator('#set-unavoidable')).not.toBeChecked();

    await page.goto(`http://127.0.0.1:${server.port}/pur-paywall`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(2600);
    await expect(page.locator('#result')).toHaveText('pending');

    // Re-enable unavoidable accept toggle
    await optionsPage.check('#set-unavoidable');

    // 6. Verify streamlined Popup: exactly 2 stat counters and no Payback/Cashback session block
    const popupPage = await context.newPage();
    await popupPage.setViewportSize({ width: 360, height: 420 });
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(popupPage.locator('.stat-box')).toHaveCount(2);
    await expect(popupPage.locator('#stat-rejected')).toHaveText('2', { timeout: 5_000 });
    await expect(popupPage.locator('#stat-accepted')).toHaveText('2', { timeout: 5_000 });
    await expect(popupPage.locator('#cashback-15-btn')).toHaveCount(0);

    await popupPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'popup.png'),
      fullPage: true,
    });

    // 7. Verify Firefox-for-Android mobile viewports (360px & 320px): zero horizontal overflow
    await popupPage.setViewportSize({ width: 320, height: 640 });
    await popupPage.waitForTimeout(100);
    const popupOverflow = await popupPage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(popupOverflow).toBeLessThanOrEqual(0);
    await popupPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'popup-mobile.png'),
      fullPage: true,
    });

    await optionsPage.setViewportSize({ width: 360, height: 780 });
    await optionsPage.waitForTimeout(100);
    const optionsOverflow = await optionsPage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(optionsOverflow).toBeLessThanOrEqual(0);
    await optionsPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'options-mobile.png'),
      fullPage: true,
    });
  });
});
