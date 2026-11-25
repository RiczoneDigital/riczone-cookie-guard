import { afterEach, describe, expect, it } from 'vitest';
import {
  createWhitelistExportPayload,
  loadSettings,
  parseWhitelistImportJson,
  sanitizeSettings,
  saveSettings,
} from '../../src/shared/storage';
import { DEFAULT_SETTINGS, type WhitelistEntry } from '../../src/shared/types';

describe('storage – Settings Sanitization & Whitelist Export/Import', () => {
  const originalBrowser = (globalThis as Record<string, unknown>).browser;
  const originalChrome = (globalThis as Record<string, unknown>).chrome;

  afterEach(() => {
    if (originalBrowser === undefined) {
      delete (globalThis as Record<string, unknown>).browser;
    } else {
      (globalThis as Record<string, unknown>).browser = originalBrowser;
    }
    if (originalChrome === undefined) {
      delete (globalThis as Record<string, unknown>).chrome;
    } else {
      (globalThis as Record<string, unknown>).chrome = originalChrome;
    }
  });

  it('defaults acceptUnavoidableBanners to false', () => {
    expect(DEFAULT_SETTINGS.acceptUnavoidableBanners).toBe(false);
    expect(sanitizeSettings(undefined).acceptUnavoidableBanners).toBe(false);
  });

  it('keeps newer local settings when storage.sync.set fails and sync still holds stale data', async () => {
    const syncStore: Record<string, unknown> = {
      rcg_settings_v1: { ...DEFAULT_SETTINGS, acceptUnavoidableBanners: false },
    };
    const localStore: Record<string, unknown> = {};

    (globalThis as Record<string, unknown>).browser = {
      storage: {
        sync: {
          get: async (key: string) => ({ [key]: syncStore[key] }),
          set: async () => {
            throw new Error('Sync quota exceeded');
          },
        },
        local: {
          get: async (key: string) => ({ [key]: localStore[key] }),
          set: async (items: Record<string, unknown>) => {
            Object.assign(localStore, items);
          },
        },
      },
    };

    await saveSettings({ ...DEFAULT_SETTINGS, acceptUnavoidableBanners: true });
    const loaded = await loadSettings();
    expect(loaded.acceptUnavoidableBanners).toBe(true);
  });
  it('sanitizes malformed settings, deduplicates whitelist, and defaults mode to accept', () => {
    const sanitized = sanitizeSettings({
      enabled: true,
      heuristicFallback: false,
      sendGpc: true,
      whitelist: [
        { pattern: 'https://www.payback.de/aktionen', mode: 'accept' },
        { pattern: 'payback.de', mode: 'ignore' }, // duplicate normalized pattern
        { pattern: 'bad*pattern', mode: 'accept' }, // invalid
        { pattern: 'shoop.de' }, // missing mode -> defaults to accept
      ],
    });

    expect(sanitized.heuristicFallback).toBe(false);
    expect(sanitized.whitelist).toHaveLength(2);
    expect(sanitized.whitelist[0]).toMatchObject({ pattern: 'payback.de', mode: 'accept' });
    expect(sanitized.whitelist[1]).toMatchObject({ pattern: 'shoop.de', mode: 'accept' });
  });

  it('exports and merges imported whitelist JSON cleanly', () => {
    const existing: WhitelistEntry[] = [
      { id: '1', pattern: 'payback.de', mode: 'accept', createdAt: 1000 },
    ];
    const payload = createWhitelistExportPayload([
      { id: '2', pattern: 'payback.de', mode: 'ignore', note: 'Manuell', createdAt: 2000 },
      { id: '3', pattern: 'shoop.de', mode: 'accept', note: 'Tracking', createdAt: 3000 },
    ]);

    const res = parseWhitelistImportJson(JSON.stringify(payload), existing);
    expect(res.ok).toBe(true);
    expect(res.addedCount).toBe(1);
    expect(res.entries).toHaveLength(2);
    const pb = res.entries?.find((e) => e.pattern === 'payback.de');
    expect(pb?.mode).toBe('ignore');
    expect(pb?.note).toBe('Manuell');
  });

  it('rejects broken JSON imports with a German error message', () => {
    const res = parseWhitelistImportJson('{kaputt', []);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('JSON');
  });
});
