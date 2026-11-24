import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, '.output');
const DIST_PACKAGES = path.join(ROOT, 'dist-packages');

const CHROME_DIR = path.join(OUTPUT_DIR, 'chrome-mv3');
const FIREFOX_DIR = path.join(OUTPUT_DIR, 'firefox-mv3');

const CHROME_ZIP = path.join(DIST_PACKAGES, 'Riczone-Cookie-Guard-Chrome.zip');
const FIREFOX_ZIP = path.join(DIST_PACKAGES, 'Riczone-Cookie-Guard-Firefox-unsigned.zip');
const FIREFOX_SOURCES_ZIP = path.join(DIST_PACKAGES, 'Riczone-Cookie-Guard-Firefox-sources.zip');

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} fehlt unter: ${targetPath}. Bitte zuerst "npm run build:all" ausführen.`);
  }
}

function createZipFromDir(sourceDir, zipPath) {
  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath, { force: true });
  }
  const pyScript = `
import os, sys, zipfile
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(src):
        dirs.sort()
        files.sort()
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, src).replace(os.sep, '/')
            zf.write(full, rel)
`;
  execFileSync('python', ['-c', pyScript, sourceDir, zipPath], { stdio: 'inherit' });
}

function createSourceZip(rootDir, zipPath) {
  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath, { force: true });
  }
  const pyScript = `
import os, sys, zipfile
src, out = sys.argv[1], sys.argv[2]
EXCLUDED_DIRS = {'node_modules', '.wxt', '.output', 'dist-packages', 'playwright-report', 'test-results', '.git'}
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(src):
        dirs[:] = sorted(d for d in dirs if d not in EXCLUDED_DIRS)
        files.sort()
        for f in files:
            if f.endswith('.log'):
                continue
            full = os.path.join(root, f)
            rel = os.path.relpath(full, src).replace(os.sep, '/')
            zf.write(full, rel)
`;
  execFileSync('python', ['-c', pyScript, rootDir, zipPath], { stdio: 'inherit' });
}

function validateManifests() {
  const chromeManifest = JSON.parse(
    fs.readFileSync(path.join(CHROME_DIR, 'manifest.json'), 'utf8'),
  );
  const firefoxManifest = JSON.parse(
    fs.readFileSync(path.join(FIREFOX_DIR, 'manifest.json'), 'utf8'),
  );

  if (chromeManifest.manifest_version !== 3) {
    throw new Error('Chrome-Manifest ist nicht Manifest V3.');
  }
  if (!chromeManifest.background?.service_worker) {
    throw new Error('Chrome-Manifest fehlt background.service_worker.');
  }

  if (firefoxManifest.manifest_version !== 3) {
    throw new Error('Firefox-Manifest ist nicht Manifest V3.');
  }
  const gecko = firefoxManifest.browser_specific_settings?.gecko;
  if (!gecko?.id || !gecko?.strict_min_version) {
    throw new Error('Firefox-Manifest fehlen browser_specific_settings.gecko Angaben.');
  }
  if (!gecko?.data_collection_permissions?.required?.includes('none')) {
    throw new Error('Firefox-Manifest fehlt gecko.data_collection_permissions.required: ["none"].');
  }

  console.log('Manifest-Prüfung erfolgreich:');
  console.log(`  Chrome MV3:  ${chromeManifest.name} v${chromeManifest.version} (SW: ${chromeManifest.background.service_worker})`);
  console.log(`  Firefox MV3: ${firefoxManifest.name} v${firefoxManifest.version} (Gecko ID: ${gecko.id}, min: ${gecko.strict_min_version})`);
}

fs.mkdirSync(DIST_PACKAGES, { recursive: true });
ensureExists(CHROME_DIR, 'Chrome-Build');
ensureExists(FIREFOX_DIR, 'Firefox-Build');
validateManifests();

createZipFromDir(CHROME_DIR, CHROME_ZIP);
createZipFromDir(FIREFOX_DIR, FIREFOX_ZIP);
createSourceZip(ROOT, FIREFOX_SOURCES_ZIP);

console.log('\nPakete erstellt in:', DIST_PACKAGES);
console.log('  -', path.basename(CHROME_ZIP));
console.log('  -', path.basename(FIREFOX_ZIP));
console.log('  -', path.basename(FIREFOX_SOURCES_ZIP));
