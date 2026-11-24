import { evalSnippets } from '@duckduckgo/autoconsent';
import {
  extractHostFromUrl,
  getGpcExcludedDomains,
  resolvePolicyForUrl,
  validateAndNormalizePattern,
} from '../src/shared/matcher';
import {
  clearActionLog,
  generateId,
  loadActionLog,
  loadSettings,
  loadStats,
  recordAction,
  saveSettings,
} from '../src/shared/storage';
import type {
  ExtensionSettings,
  RuntimeMessage,
  TabStatus,
  WhitelistMode,
} from '../src/shared/types';

const GPC_RULE_ID = 1001;

const tabStatusMap = new Map<number, TabStatus>();

function setGlobalPrivacyControlMainWorld(): void {
  try {
    if ((navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true) {
      return;
    }
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', {
      value: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    // Ignore if frozen or unsupported
  }
}

async function syncGpcHeaderRule(settings: ExtensionSettings): Promise<void> {
  if (!browser.declarativeNetRequest?.updateDynamicRules) {
    return;
  }

  const shouldEnableGpc = settings.enabled && settings.sendGpc;

  if (!shouldEnableGpc) {
    try {
      await browser.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [GPC_RULE_ID],
      });
    } catch {
      // Ignore if rule does not exist
    }
    return;
  }

  const excludedDomains = getGpcExcludedDomains(settings.whitelist);

  type DnrAddRule = NonNullable<
    Parameters<typeof browser.declarativeNetRequest.updateDynamicRules>[0]['addRules']
  >[number];

  const condition: DnrAddRule['condition'] = {
    urlFilter: '|http',
    resourceTypes: [
      'main_frame',
      'sub_frame',
      'xmlhttprequest',
      'script',
      'image',
      'stylesheet',
      'font',
      'media',
      'other',
    ],
  };

  if (excludedDomains.length > 0) {
    condition.excludedRequestDomains = excludedDomains;
    condition.excludedInitiatorDomains = excludedDomains;
  }

  try {
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [GPC_RULE_ID],
      addRules: [
        {
          id: GPC_RULE_ID,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              {
                header: 'Sec-GPC',
                operation: 'set',
                value: '1',
              },
            ],
          },
          condition,
        },
      ],
    });
  } catch {
    try {
      delete condition.excludedInitiatorDomains;
      await browser.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [GPC_RULE_ID],
        addRules: [
          {
            id: GPC_RULE_ID,
            priority: 1,
            action: {
              type: 'modifyHeaders',
              requestHeaders: [
                {
                  header: 'Sec-GPC',
                  operation: 'set',
                  value: '1',
                },
              ],
            },
            condition,
          },
        ],
      });
    } catch {
      // Non-fatal: navigator.globalPrivacyControl still applies
    }
  }
}

async function updateBadgeForTab(tabId: number, status?: TabStatus): Promise<void> {
  if (!browser.action?.setBadgeText) {
    return;
  }

  const settings = await loadSettings();

  let text = '';
  let bg = '#0b0d14';
  let fg = '#44ffca';

  if (!settings.enabled) {
    text = 'AUS';
    bg = '#4c596b';
    fg = '#f0f4f8';
  } else if (status?.reason === 'whitelist-accept') {
    text = status.actionCount > 0 ? 'OK' : 'WL';
    bg = '#44ffca';
    fg = '#0b0d14';
  } else if (status?.reason === 'whitelist-ignore') {
    text = 'WL';
    bg = '#35404f';
    fg = '#f0f4f8';
  } else if (status && status.actionCount > 0) {
    text = status.actionCount > 9 ? '9+' : String(status.actionCount);
    bg = '#0b0d14';
    fg = '#44ffca';
  }

  try {
    await browser.action.setBadgeText({ tabId, text });
    await browser.action.setBadgeBackgroundColor({ tabId, color: bg });
    if (browser.action.setBadgeTextColor) {
      await browser.action.setBadgeTextColor({ tabId, color: fg });
    }
  } catch {
    // Tab might already be closed
  }
}

async function refreshAllTabBadges(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({});
    const settings = await loadSettings();
    for (const tab of tabs) {
      if (typeof tab.id !== 'number') {
        continue;
      }
      const existing = tabStatusMap.get(tab.id);
      const resolved = resolvePolicyForUrl(tab.url, settings);
      const updated: TabStatus = {
        tabId: tab.id,
        domain: resolved.domain ?? existing?.domain ?? '',
        policy: resolved.policy,
        reason: resolved.reason,
        matchedEntry: resolved.matchedEntry,
        lastAction: existing?.lastAction,
        lastCmp: existing?.lastCmp,
        lastSource: existing?.lastSource,
        actionCount: existing?.actionCount ?? 0,
        updatedAt: Date.now(),
      };
      tabStatusMap.set(tab.id, updated);
      await updateBadgeForTab(tab.id, updated);
    }
  } catch {
    // Ignore if tabs cannot be queried
  }
}

async function handleSettingsChanged(settings: ExtensionSettings): Promise<ExtensionSettings> {
  const saved = await saveSettings(settings);
  await syncGpcHeaderRule(saved);
  await refreshAllTabBadges();
  return saved;
}

async function executeSnippetInMainWorld(
  tabId: number,
  frameId: number,
  snippetId: string,
): Promise<boolean> {
  const snippetFn = (evalSnippets as Record<string, (() => unknown) | undefined>)[snippetId];
  if (typeof snippetFn !== 'function' || !browser.scripting?.executeScript) {
    return false;
  }

  try {
    const results = await browser.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      world: 'MAIN',
      func: snippetFn,
    });
    return Boolean(results?.[0]?.result);
  } catch {
    return false;
  }
}

function resolveTopUrlFromSender(
  sender: { url?: string; frameId?: number; tab?: { url?: string; pendingUrl?: string } },
  frameUrl?: string,
): string | undefined {
  const isMainFrame = (sender.frameId ?? 0) === 0;
  if (isMainFrame) {
    // At document_start, sender.tab.url can still reflect the previous page (e.g. about:blank).
    if (extractHostFromUrl(frameUrl)) return frameUrl;
    if (extractHostFromUrl(sender.url)) return sender.url;
  }
  if (extractHostFromUrl(sender.tab?.pendingUrl)) return sender.tab?.pendingUrl;
  if (extractHostFromUrl(sender.tab?.url)) return sender.tab?.url;
  if (extractHostFromUrl(frameUrl)) return frameUrl;
  return sender.url;
}

export default defineBackground(() => {
  const init = async () => {
    const settings = await loadSettings();
    await syncGpcHeaderRule(settings);
  };

  void init();

  browser.runtime.onInstalled.addListener(() => {
    void init();
  });

  browser.runtime.onStartup?.addListener(() => {
    void init();
  });

  browser.tabs?.onRemoved.addListener((tabId) => {
    tabStatusMap.delete(tabId);
  });

  browser.tabs?.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && changeInfo.url) {
      const host = extractHostFromUrl(changeInfo.url);
      if (host) {
        tabStatusMap.delete(tabId);
      }
    }
    if (changeInfo.status === 'complete' && tab.url) {
      void (async () => {
        const settings = await loadSettings();
        const resolved = resolvePolicyForUrl(tab.url, settings);
        const existing = tabStatusMap.get(tabId);
        const status: TabStatus = {
          tabId,
          domain: resolved.domain ?? '',
          policy: resolved.policy,
          reason: resolved.reason,
          matchedEntry: resolved.matchedEntry,
          lastAction: existing?.lastAction,
          lastCmp: existing?.lastCmp,
          lastSource: existing?.lastSource,
          actionCount: existing?.actionCount ?? 0,
          updatedAt: Date.now(),
        };
        tabStatusMap.set(tabId, status);
        await updateBadgeForTab(tabId, status);
      })();
    }
  });

  browser.runtime.onMessage.addListener((rawMessage: unknown, sender, sendResponse) => {
    const message = rawMessage as RuntimeMessage | undefined;
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      return undefined;
    }

    if (!message.type.startsWith('rcg:')) {
      return undefined;
    }

    const handleMessage = async () => {
      switch (message.type) {
        case 'rcg:get-policy': {
          const settings = await loadSettings();
          const topUrl = resolveTopUrlFromSender(sender, message.url);
          const resolved = resolvePolicyForUrl(topUrl, settings);
          const tabId = sender.tab?.id;
          const frameId = sender.frameId ?? 0;

          if (typeof tabId === 'number' && frameId === 0) {
            const existing = tabStatusMap.get(tabId);
            const sameDomain = existing && existing.domain === (resolved.domain ?? '');
            const status: TabStatus = {
              tabId,
              domain: resolved.domain ?? '',
              policy: resolved.policy,
              reason: resolved.reason,
              matchedEntry: resolved.matchedEntry,
              lastAction: sameDomain ? existing.lastAction : undefined,
              lastCmp: sameDomain ? existing.lastCmp : undefined,
              lastSource: sameDomain ? existing.lastSource : undefined,
              actionCount: sameDomain ? existing.actionCount : 0,
              updatedAt: Date.now(),
            };
            tabStatusMap.set(tabId, status);
            void updateBadgeForTab(tabId, status);
          }

          if (resolved.sendGpc && typeof tabId === 'number' && browser.scripting?.executeScript) {
            void browser.scripting
              .executeScript({
                target: { tabId, frameIds: [frameId] },
                world: 'MAIN',
                func: setGlobalPrivacyControlMainWorld,
              })
              .catch(() => undefined);
          }

          return resolved;
        }

        case 'rcg:eval-snippet': {
          const tabId = sender.tab?.id;
          const frameId = sender.frameId ?? 0;
          if (typeof tabId !== 'number') {
            return { result: false };
          }
          const result = await executeSnippetInMainWorld(tabId, frameId, message.snippetId);
          return { result };
        }

        case 'rcg:report-action': {
          const topHost = extractHostFromUrl(resolveTopUrlFromSender(sender)) || message.domain;
          const { stats } = await recordAction(
            topHost,
            message.cmp,
            message.action,
            message.source,
          );

          const tabId = sender.tab?.id;
          if (typeof tabId === 'number') {
            const settings = await loadSettings();
            const resolved = resolvePolicyForUrl(resolveTopUrlFromSender(sender), settings);
            const prev = tabStatusMap.get(tabId);
            const nextStatus: TabStatus = {
              tabId,
              domain: topHost,
              policy: resolved.policy,
              reason: resolved.reason,
              matchedEntry: resolved.matchedEntry,
              lastAction: message.action,
              lastCmp: message.cmp,
              lastSource: message.source,
              actionCount: (prev?.actionCount ?? 0) + 1,
              updatedAt: Date.now(),
            };
            tabStatusMap.set(tabId, nextStatus);
            await updateBadgeForTab(tabId, nextStatus);
          }

          return { ok: true, stats };
        }

        case 'rcg:get-popup-state': {
          const [settings, stats] = await Promise.all([loadSettings(), loadStats()]);
          let targetUrl = message.url;
          let tabId = message.tabId;

          if (tabId === undefined) {
            const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
            tabId = activeTab?.id;
            targetUrl = targetUrl ?? activeTab?.url;
          }

          const resolved = resolvePolicyForUrl(targetUrl, settings);
          const tabStatus = typeof tabId === 'number' ? tabStatusMap.get(tabId) : undefined;

          return {
            settings,
            stats,
            tabId,
            resolved,
            tabStatus:
              tabStatus && tabStatus.domain === (resolved.domain ?? '') ? tabStatus : undefined,
          };
        }

        case 'rcg:set-enabled': {
          const settings = await loadSettings();
          settings.enabled = message.enabled;
          const saved = await handleSettingsChanged(settings);
          return { ok: true, settings: saved };
        }

        case 'rcg:upsert-whitelist': {
          const validated = validateAndNormalizePattern(message.pattern);
          if (!validated.valid || !validated.normalized) {
            return { ok: false, error: validated.error };
          }
          const settings = await loadSettings();
          const mode: WhitelistMode = message.mode === 'ignore' ? 'ignore' : 'accept';
          const existingIdx = settings.whitelist.findIndex(
            (item) => item.pattern === validated.normalized,
          );
          const note = message.note?.trim() ? message.note.trim().slice(0, 120) : undefined;

          const existingEntry = existingIdx >= 0 ? settings.whitelist[existingIdx] : undefined;
          if (existingEntry) {
            settings.whitelist[existingIdx] = {
              ...existingEntry,
              mode,
              note: note !== undefined ? note : existingEntry.note,
            };
          } else {
            settings.whitelist.unshift({
              id: generateId(),
              pattern: validated.normalized,
              mode,
              note,
              createdAt: Date.now(),
            });
          }

          const saved = await handleSettingsChanged(settings);
          return { ok: true, settings: saved };
        }

        case 'rcg:remove-whitelist': {
          const settings = await loadSettings();
          settings.whitelist = settings.whitelist.filter(
            (item) => item.id !== message.idOrPattern && item.pattern !== message.idOrPattern,
          );
          const saved = await handleSettingsChanged(settings);
          return { ok: true, settings: saved };
        }

        case 'rcg:update-settings': {
          const settings = await loadSettings();
          const merged: ExtensionSettings = {
            ...settings,
            ...message.patch,
            whitelist: message.patch.whitelist ?? settings.whitelist,
          };
          const saved = await handleSettingsChanged(merged);
          return { ok: true, settings: saved };
        }

        case 'rcg:clear-log': {
          await clearActionLog();
          return { ok: true };
        }

        case 'rcg:get-options-state': {
          const [settings, stats, log] = await Promise.all([
            loadSettings(),
            loadStats(),
            loadActionLog(),
          ]);
          return { settings, stats, log };
        }

        default:
          return undefined;
      }
    };

    void handleMessage()
      .then((result) => sendResponse(result))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });

    return true;
  });
});
