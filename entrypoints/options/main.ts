import { applyDocumentI18n, getUiLanguage, t } from '../../src/shared/i18n';
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
  logBody: document.getElementById('log-body') as HTMLTableSectionElement,
};

let currentState: OptionsStateResponse | null = null;
let toastTimer: number | null = null;
let stateVersion = 0;
let toggleSaveQueue: Promise<void> = Promise.resolve();

const toggleInputs = [els.setEnabled, els.setHeuristic, els.setUnavoidable, els.setGpc];
for (const input of toggleInputs) {
  input.disabled = true;
}

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
  const locale = getUiLanguage().toLowerCase().startsWith('de') ? 'de-DE' : 'en-US';
  return new Date(timestamp).toLocaleString(locale, {
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

  els.wlCount.textContent =
    entries.length === 1 ? t('wlCountSingular') : t('wlCountPlural', String(entries.length));
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
    modeSel.setAttribute('aria-label', t('wlBehaviorAria', entry.pattern));

    const optAccept = document.createElement('option');
    optAccept.value = 'accept';
    optAccept.textContent = t('modeAccept');
    const optIgnore = document.createElement('option');
    optIgnore.value = 'ignore';
    optIgnore.textContent = t('modeIgnore');
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
      showToast(t('toastBehaviorUpdated', entry.pattern));
      await loadOptions();
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-danger btn-sm';
    delBtn.textContent = t('btnRemove');
    delBtn.addEventListener('click', async () => {
      await browser.runtime.sendMessage({
        type: 'rcg:remove-whitelist',
        idOrPattern: entry.id,
      });
      showToast(t('toastEntryRemoved', entry.pattern));
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
        ? t('statWhitelistAccepted')
        : item.action === 'accepted-unavoidable'
          ? t('badgeUnavoidable')
          : item.action === 'rejected'
            ? t('statRejected')
            : item.action;
    tdAction.appendChild(badge);

    const tdCmp = document.createElement('td');
    tdCmp.textContent = item.cmp;

    const tdBtn = document.createElement('td');
    const wlBtn = document.createElement('button');
    wlBtn.type = 'button';
    wlBtn.className = 'btn btn-secondary btn-sm';
    wlBtn.textContent = t('btnWhitelistShort');
    wlBtn.addEventListener('click', async () => {
      await browser.runtime.sendMessage({
        type: 'rcg:upsert-whitelist',
        pattern: item.domain,
        mode: 'accept',
      });
      showToast(t('toastLogWhitelisted', item.domain));
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
  for (const input of toggleInputs) {
    input.disabled = false;
  }
  renderWhitelist();
  renderLog();
}

async function loadOptions(): Promise<void> {
  const version = ++stateVersion;
  const state = (await browser.runtime.sendMessage({
    type: 'rcg:get-options-state',
  })) as OptionsStateResponse;
  if (version !== stateVersion) {
    return;
  }
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
    showToast(resp.error || t('toastInvalidInput'), 'error');
    return;
  }

  els.patternInput.value = '';
  els.noteInput.value = '';
  showToast(t('toastEntrySaved'));
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
  showToast(t('toastExported'));
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
    showToast(parsed.error || t('toastImportFailed'), 'error');
    return;
  }
  await browser.runtime.sendMessage({
    type: 'rcg:update-settings',
    patch: { whitelist: parsed.entries },
  });
  showToast(t('toastImported', String(parsed.addedCount ?? 0)));
  await loadOptions();
});

type BooleanSettingKey =
  | 'enabled'
  | 'heuristicFallback'
  | 'acceptUnavoidableBanners'
  | 'sendGpc';

function bindToggleSetting(input: HTMLInputElement, key: BooleanSettingKey): void {
  input.addEventListener('change', () => {
    const nextValue = input.checked;
    const version = ++stateVersion;
    toggleSaveQueue = toggleSaveQueue.then(async () => {
      try {
        const resp = (await browser.runtime.sendMessage({
          type: 'rcg:update-settings',
          patch: { [key]: nextValue },
        })) as { ok?: boolean; settings?: ExtensionSettings; error?: string } | undefined;

        if (!resp?.ok || !resp.settings) {
          throw new Error(resp?.error || t('toastInvalidInput'));
        }

        if (currentState) {
          currentState = { ...currentState, settings: resp.settings };
          if (version === stateVersion) {
            render(currentState);
          }
        }
        showToast(t('toastSettingsSaved'));
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('toastInvalidInput'), 'error');
        await loadOptions();
      }
    });
  });
}

bindToggleSetting(els.setEnabled, 'enabled');
bindToggleSetting(els.setHeuristic, 'heuristicFallback');
bindToggleSetting(els.setUnavoidable, 'acceptUnavoidableBanners');
bindToggleSetting(els.setGpc, 'sendGpc');

els.clearLogBtn.addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: 'rcg:clear-log' });
  showToast(t('toastLogCleared'));
  await loadOptions();
});

applyDocumentI18n(document);
void loadOptions();
