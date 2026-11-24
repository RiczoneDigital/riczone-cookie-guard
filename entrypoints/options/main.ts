import {
  createWhitelistExportPayload,
  parseWhitelistImportJson,
} from '../../src/shared/storage';
import type {
  ActionLogEntry,
  ExtensionSettings,
  ExtensionStats,
  WhitelistMode,
} from '../../src/shared/types';

interface OptionsStateResponse {
  settings: ExtensionSettings;
  stats: ExtensionStats;
  log: ActionLogEntry[];
}

const els = {
  toast: document.getElementById('status-toast') as HTMLElement,
  statRejected: document.getElementById('opt-stat-rejected') as HTMLElement,
  statAccepted: document.getElementById('opt-stat-accepted') as HTMLElement,
  wlForm: document.getElementById('whitelist-form') as HTMLFormElement,
  patternInput: document.getElementById('pattern-input') as HTMLInputElement,
  modeSelect: document.getElementById('mode-select') as HTMLSelectElement,
  noteInput: document.getElementById('note-input') as HTMLInputElement,
  wlSearch: document.getElementById('wl-search') as HTMLInputElement,
  wlCount: document.getElementById('wl-count') as HTMLElement,
  wlEmpty: document.getElementById('wl-empty') as HTMLElement,
  wlList: document.getElementById('wl-list') as HTMLUListElement,
  exportBtn: document.getElementById('export-btn') as HTMLButtonElement,
  importInput: document.getElementById('import-input') as HTMLInputElement,
  setEnabled: document.getElementById('set-enabled') as HTMLInputElement,
  setHeuristic: document.getElementById('set-heuristic') as HTMLInputElement,
  setUnavoidable: document.getElementById('set-unavoidable') as HTMLInputElement,
  setGpc: document.getElementById('set-gpc') as HTMLInputElement,
  clearLogBtn: document.getElementById('clear-log-btn') as HTMLButtonElement,
  logEmpty: document.getElementById('log-empty') as HTMLElement,
  logTableWrap: document.getElementById('log-table-wrap') as HTMLElement,
  logTable: document.getElementById('log-table') as HTMLTableElement,
  logBody: document.getElementById('log-body') as HTMLTableSectionElement,
};

let currentState: OptionsStateResponse | null = null;
let toastTimer: number | null = null;

function showToast(message: string, kind: 'info' | 'error' = 'info'): void {
  els.toast.textContent = message;
  els.toast.dataset.kind = kind;
  els.toast.hidden = false;
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 4000);
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderWhitelist(): void {
  if (!currentState) {
    return;
  }
  const query = els.wlSearch.value.trim().toLowerCase();
  const entries = currentState.settings.whitelist.filter((item) => {
    if (!query) {
      return true;
    }
    return (
      item.pattern.toLowerCase().includes(query) ||
      (item.note || '').toLowerCase().includes(query)
    );
  });

  els.wlCount.textContent = `${entries.length} ${entries.length === 1 ? 'Eintrag' : 'Einträge'}`;
  els.wlList.textContent = '';

  if (entries.length === 0) {
    els.wlEmpty.hidden = false;
    return;
  }
  els.wlEmpty.hidden = true;

  for (const entry of entries) {
    const li = document.createElement('li');
    li.className = 'wl-item';

    const info = document.createElement('div');
    info.className = 'wl-item-info';

    const patternEl = document.createElement('span');
    patternEl.className = 'wl-pattern';
    patternEl.textContent = entry.pattern;
    info.appendChild(patternEl);

    if (entry.note) {
      const noteEl = document.createElement('span');
      noteEl.className = 'wl-note';
      noteEl.textContent = entry.note;
      info.appendChild(noteEl);
    }

    const controls = document.createElement('div');
    controls.className = 'wl-item-controls';

    const modeSel = document.createElement('select');
    modeSel.setAttribute('aria-label', `Verhalten für ${entry.pattern}`);

    const optAccept = document.createElement('option');
    optAccept.value = 'accept';
    optAccept.textContent = 'Automatisch akzeptieren';
    const optIgnore = document.createElement('option');
    optIgnore.value = 'ignore';
    optIgnore.textContent = 'Nicht eingreifen';
    modeSel.append(optAccept, optIgnore);
    modeSel.value = entry.mode;

    modeSel.addEventListener('change', async () => {
      const nextMode = (modeSel.value === 'ignore' ? 'ignore' : 'accept') as WhitelistMode;
      await browser.runtime.sendMessage({
        type: 'rcg:upsert-whitelist',
        pattern: entry.pattern,
        mode: nextMode,
        note: entry.note,
      });
      showToast(`Verhalten für ${entry.pattern} aktualisiert.`);
      await loadOptions();
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-danger btn-sm';
    delBtn.textContent = 'Entfernen';
    delBtn.addEventListener('click', async () => {
      await browser.runtime.sendMessage({
        type: 'rcg:remove-whitelist',
        idOrPattern: entry.id,
      });
      showToast(`${entry.pattern} entfernt.`);
      await loadOptions();
    });

    controls.append(modeSel, delBtn);
    li.append(info, controls);
    els.wlList.appendChild(li);
  }
}

function renderLog(): void {
  if (!currentState) {
    return;
  }
  const { log } = currentState;
  els.logBody.textContent = '';

  if (log.length === 0) {
    els.logEmpty.hidden = false;
    els.logTableWrap.hidden = true;
    return;
  }

  els.logEmpty.hidden = true;
  els.logTableWrap.hidden = false;

  for (const item of log) {
    const tr = document.createElement('tr');

    const tdTime = document.createElement('td');
    tdTime.textContent = formatTime(item.timestamp);

    const tdDomain = document.createElement('td');
    tdDomain.textContent = item.domain;

    const tdAction = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge-action';
    badge.dataset.action = item.action;
    badge.textContent =
      item.action === 'accepted'
        ? 'Whitelist akzeptiert'
        : item.action === 'accepted-unavoidable'
          ? 'Unvermeidbar akzeptiert'
          : item.action === 'rejected'
            ? 'Abgelehnt'
            : item.action;
    tdAction.appendChild(badge);

    const tdCmp = document.createElement('td');
    tdCmp.textContent = item.cmp;

    const tdBtn = document.createElement('td');
    const wlBtn = document.createElement('button');
    wlBtn.type = 'button';
    wlBtn.className = 'btn btn-secondary btn-sm';
    wlBtn.textContent = 'Auf Whitelist';
    wlBtn.addEventListener('click', async () => {
      await browser.runtime.sendMessage({
        type: 'rcg:upsert-whitelist',
        pattern: item.domain,
        mode: 'accept',
      });
      showToast(`${item.domain} zur Whitelist (Auto-Akzeptieren) hinzugefügt.`);
      await loadOptions();
    });
    tdBtn.appendChild(wlBtn);

    tr.append(tdTime, tdDomain, tdAction, tdCmp, tdBtn);
    els.logBody.appendChild(tr);
  }
}

function render(state: OptionsStateResponse): void {
  currentState = state;
  els.statRejected.textContent = String(state.stats.totalRejected);
  els.statAccepted.textContent = String(state.stats.totalAccepted);
  els.setEnabled.checked = state.settings.enabled;
  els.setHeuristic.checked = state.settings.heuristicFallback;
  els.setUnavoidable.checked = state.settings.acceptUnavoidableBanners;
  els.setGpc.checked = state.settings.sendGpc;
  renderWhitelist();
  renderLog();
}

async function loadOptions(): Promise<void> {
  const state = (await browser.runtime.sendMessage({
    type: 'rcg:get-options-state',
  })) as OptionsStateResponse;
  render(state);
}

els.wlForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const pattern = els.patternInput.value;
  const mode = (els.modeSelect.value === 'ignore' ? 'ignore' : 'accept') as WhitelistMode;
  const note = els.noteInput.value;

  const resp = (await browser.runtime.sendMessage({
    type: 'rcg:upsert-whitelist',
    pattern,
    mode,
    note,
  })) as { ok: boolean; error?: string };

  if (!resp.ok) {
    showToast(resp.error || 'Ungültige Eingabe.', 'error');
    return;
  }

  els.patternInput.value = '';
  els.noteInput.value = '';
  showToast('Whitelist-Eintrag gespeichert.');
  await loadOptions();
});

els.wlSearch.addEventListener('input', renderWhitelist);

els.exportBtn.addEventListener('click', () => {
  if (!currentState) {
    return;
  }
  const payload = createWhitelistExportPayload(currentState.settings.whitelist);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'riczone-cookie-guard-whitelist.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Whitelist als JSON exportiert.');
});

els.importInput.addEventListener('change', async () => {
  const file = els.importInput.files?.[0];
  els.importInput.value = '';
  if (!file || !currentState) {
    return;
  }
  const text = await file.text();
  const parsed = parseWhitelistImportJson(text, currentState.settings.whitelist);
  if (!parsed.ok || !parsed.entries) {
    showToast(parsed.error || 'Import fehlgeschlagen.', 'error');
    return;
  }
  await browser.runtime.sendMessage({
    type: 'rcg:update-settings',
    patch: { whitelist: parsed.entries },
  });
  showToast(`Import erfolgreich (${parsed.addedCount ?? 0} neue Einträge).`);
  await loadOptions();
});

const syncToggleSettings = async () => {
  await browser.runtime.sendMessage({
    type: 'rcg:update-settings',
    patch: {
      enabled: els.setEnabled.checked,
      heuristicFallback: els.setHeuristic.checked,
      acceptUnavoidableBanners: els.setUnavoidable.checked,
      sendGpc: els.setGpc.checked,
    },
  });
  showToast('Einstellungen gespeichert.');
  await loadOptions();
};

els.setEnabled.addEventListener('change', syncToggleSettings);
els.setHeuristic.addEventListener('change', syncToggleSettings);
els.setUnavoidable.addEventListener('change', syncToggleSettings);
els.setGpc.addEventListener('change', syncToggleSettings);

els.clearLogBtn.addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: 'rcg:clear-log' });
  showToast('Protokoll geleert.');
  await loadOptions();
});

void loadOptions();
