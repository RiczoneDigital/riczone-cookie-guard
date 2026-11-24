import { applyDocumentI18n, t } from '../../src/shared/i18n';
import { normalizeDisplayDomain } from '../../src/shared/matcher';
import type {
  ExtensionSettings,
  ExtensionStats,
  ResolvedPolicy,
  TabStatus,
  WhitelistMode,
} from '../../src/shared/types';

interface PopupStateResponse {
  settings: ExtensionSettings;
  stats: ExtensionStats;
  tabId?: number;
  resolved: ResolvedPolicy;
  tabStatus?: TabStatus;
}

const els = {
  globalToggle: document.getElementById('global-toggle') as HTMLInputElement,
  permissionBanner: document.getElementById('permission-banner') as HTMLElement,
  grantPermissionBtn: document.getElementById('grant-permission-btn') as HTMLButtonElement,
  currentDomain: document.getElementById('current-domain') as HTMLElement,
  policyBadge: document.getElementById('policy-badge') as HTMLElement,
  siteDetail: document.getElementById('site-detail') as HTMLElement,
  siteActions: document.getElementById('site-actions') as HTMLElement,
  whitelistToggleBtn: document.getElementById('whitelist-toggle-btn') as HTMLButtonElement,
  whitelistModeRow: document.getElementById('whitelist-mode-row') as HTMLElement,
  whitelistModeSelect: document.getElementById('whitelist-mode-select') as HTMLSelectElement,
  statRejected: document.getElementById('stat-rejected') as HTMLElement,
  statAccepted: document.getElementById('stat-accepted') as HTMLElement,
  feedback: document.getElementById('feedback') as HTMLElement,
  openOptionsBtn: document.getElementById('open-options-btn') as HTMLButtonElement,
};

let currentState: PopupStateResponse | null = null;

function showFeedback(text: string, kind: 'info' | 'error' = 'info'): void {
  els.feedback.textContent = text;
  els.feedback.dataset.kind = kind;
  els.feedback.hidden = false;
}

function describePolicy(state: PopupStateResponse): { badge: string; detail: string } {
  const { resolved, tabStatus } = state;

  if (!resolved.domain) {
    return {
      badge: t('badgeSystemPage'),
      detail: t('detailSystemPage'),
    };
  }

  switch (resolved.reason) {
    case 'globally-disabled':
      return {
        badge: t('badgeDisabled'),
        detail: t('detailDisabled'),
      };
    case 'whitelist-accept': {
      const extra =
        tabStatus?.lastAction === 'accepted' && tabStatus.lastCmp
          ? t('detailLastAccepted', tabStatus.lastCmp)
          : '';
      return {
        badge: t('badgeWhitelistAccept'),
        detail: `${t('detailWhitelistAccept', resolved.matchedEntry?.pattern ?? '')}${extra}`,
      };
    }
    case 'whitelist-ignore':
      return {
        badge: t('badgeWhitelistIgnore'),
        detail: t('detailWhitelistIgnore', resolved.matchedEntry?.pattern ?? ''),
      };
    default: {
      const gpcNote = resolved.sendGpc ? t('gpcActiveSuffix') : '';
      if (tabStatus?.lastAction === 'rejected' && tabStatus.lastCmp) {
        return {
          badge: t('badgeRejected'),
          detail: t('detailRejected', [tabStatus.lastCmp, gpcNote]),
        };
      }
      if (tabStatus?.lastAction === 'accepted-unavoidable' && tabStatus.lastCmp) {
        return {
          badge: t('badgeUnavoidable'),
          detail: t('detailUnavoidable', tabStatus.lastCmp),
        };
      }
      return {
        badge: t('badgeRejectActive'),
        detail: t('detailRejectActive', gpcNote),
      };
    }
  }
}

function render(state: PopupStateResponse): void {
  currentState = state;
  const { settings, stats, resolved } = state;

  els.globalToggle.checked = settings.enabled;
  els.statRejected.textContent = String(stats.totalRejected);
  els.statAccepted.textContent = String(stats.totalAccepted);

  const domain = resolved.domain;
  els.currentDomain.textContent = domain ? normalizeDisplayDomain(domain) : t('popupUnsupported');

  const { badge, detail } = describePolicy(state);
  els.policyBadge.textContent = badge;
  els.policyBadge.dataset.policy = resolved.policy;
  els.siteDetail.textContent = detail;

  if (!domain) {
    els.siteActions.hidden = true;
  } else {
    els.siteActions.hidden = false;
    const matched = resolved.matchedEntry;
    if (matched) {
      els.whitelistToggleBtn.textContent = t('btnRemoveWhitelist', matched.pattern);
      els.whitelistToggleBtn.className = 'btn btn-remove btn-full';
      els.whitelistModeRow.hidden = false;
      els.whitelistModeSelect.value = matched.mode;
    } else {
      const displayDomain = normalizeDisplayDomain(domain);
      els.whitelistToggleBtn.textContent = t('btnAddWhitelist', displayDomain);
      els.whitelistToggleBtn.className = 'btn btn-mint btn-full';
      els.whitelistModeRow.hidden = true;
    }
  }
}

async function checkHostPermissions(): Promise<void> {
  if (!browser.permissions?.contains) {
    els.permissionBanner.hidden = true;
    return;
  }
  try {
    const granted = await browser.permissions.contains({ origins: ['<all_urls>'] });
    els.permissionBanner.hidden = granted;
  } catch {
    els.permissionBanner.hidden = true;
  }
}

async function reloadActiveTabIfPossible(): Promise<void> {
  if (typeof currentState?.tabId === 'number' && currentState.resolved.domain) {
    try {
      await browser.tabs.reload(currentState.tabId);
    } catch {
      // Ignore reload errors
    }
  }
}

async function loadPopup(): Promise<void> {
  await checkHostPermissions();
  const state = (await browser.runtime.sendMessage({
    type: 'rcg:get-popup-state',
  })) as PopupStateResponse;
  render(state);
}

els.grantPermissionBtn.addEventListener('click', async () => {
  try {
    const granted = await browser.permissions.request({ origins: ['<all_urls>'] });
    els.permissionBanner.hidden = granted;
    if (granted) {
      showFeedback(t('fbPermissionGranted'));
      await reloadActiveTabIfPossible();
    }
  } catch {
    showFeedback(t('fbPermissionFailed'), 'error');
  }
});

els.globalToggle.addEventListener('change', async () => {
  await browser.runtime.sendMessage({
    type: 'rcg:set-enabled',
    enabled: els.globalToggle.checked,
  });
  showFeedback(els.globalToggle.checked ? t('fbEnabled') : t('fbDisabled'));
  await loadPopup();
});

els.whitelistToggleBtn.addEventListener('click', async () => {
  if (!currentState?.resolved.domain) {
    return;
  }
  const matched = currentState.resolved.matchedEntry;
  if (matched) {
    await browser.runtime.sendMessage({
      type: 'rcg:remove-whitelist',
      idOrPattern: matched.id,
    });
    showFeedback(t('fbWhitelistRemoved', matched.pattern));
  } else {
    const pattern = normalizeDisplayDomain(currentState.resolved.domain);
    await browser.runtime.sendMessage({
      type: 'rcg:upsert-whitelist',
      pattern,
      mode: 'accept',
    });
    showFeedback(t('fbWhitelistAdded', pattern));
  }
  await loadPopup();
  await reloadActiveTabIfPossible();
});

els.whitelistModeSelect.addEventListener('change', async () => {
  const matched = currentState?.resolved.matchedEntry;
  if (!matched) {
    return;
  }
  const mode = (els.whitelistModeSelect.value === 'ignore' ? 'ignore' : 'accept') as WhitelistMode;
  await browser.runtime.sendMessage({
    type: 'rcg:upsert-whitelist',
    pattern: matched.pattern,
    mode,
    note: matched.note,
  });
  showFeedback(mode === 'accept' ? t('fbModeAccept', matched.pattern) : t('fbModeIgnore', matched.pattern));
  await loadPopup();
});

els.openOptionsBtn.addEventListener('click', async () => {
  await browser.runtime.openOptionsPage();
  window.close();
});

applyDocumentI18n(document);
void loadPopup();
