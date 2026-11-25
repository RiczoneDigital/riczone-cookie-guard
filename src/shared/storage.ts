import {
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  type ActionLogEntry,
  type ActionOutcome,
  type ActionSource,
  type ExtensionSettings,
  type ExtensionStats,
  type WhitelistEntry,
  type WhitelistExportPayload,
  type WhitelistMode,
} from './types';
import { t } from './i18n';
import { validateAndNormalizePattern } from './matcher';

const SETTINGS_KEY = 'rcg_settings_v1';
const STATS_KEY = 'rcg_stats_v1';
const LOG_KEY = 'rcg_log_v1';
const MAX_LOG_ENTRIES = 50;

interface StorageAreaLike {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface ExtensionGlobalLike {
  browser?: { storage?: { sync?: StorageAreaLike; local?: StorageAreaLike } };
  chrome?: { storage?: { sync?: StorageAreaLike; local?: StorageAreaLike } };
}

function getExtensionStorage(): { sync?: StorageAreaLike; local?: StorageAreaLike } | undefined {
  const g = globalThis as unknown as ExtensionGlobalLike;
  return g.browser?.storage ?? g.chrome?.storage;
}

function getSyncStorage(): StorageAreaLike {
  const storage = getExtensionStorage();
  if (storage?.sync) {
    return storage.sync;
  }
  if (storage?.local) {
    return storage.local;
  }
  throw new Error('Keine Browser-Storage-API verfügbar.');
}

function getLocalStorage(): StorageAreaLike {
  const storage = getExtensionStorage();
  if (storage?.local) {
    return storage.local;
  }
  throw new Error('Keine lokale Browser-Storage-API verfügbar.');
}

export function getTodayIsoDate(now: number = Date.now()): string {
  const d = new Date(now);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rcg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeWhitelist(raw: unknown): WhitelistEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const result: WhitelistEntry[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Partial<WhitelistEntry>;
    if (typeof record.pattern !== 'string') {
      continue;
    }
    const validated = validateAndNormalizePattern(record.pattern);
    if (!validated.valid || !validated.normalized || seen.has(validated.normalized)) {
      continue;
    }

    const mode: WhitelistMode = record.mode === 'ignore' ? 'ignore' : 'accept';
    seen.add(validated.normalized);
    const cleanNote =
      typeof record.note === 'string' && record.note.trim()
        ? record.note.trim().slice(0, 120)
        : undefined;
    const entry: WhitelistEntry = {
      id: typeof record.id === 'string' && record.id ? record.id : generateId(),
      pattern: validated.normalized,
      mode,
      createdAt:
        typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
          ? record.createdAt
          : Date.now(),
    };
    if (cleanNote !== undefined) {
      entry.note = cleanNote;
    }
    result.push(entry);
  }

  return result;
}

export function sanitizeSettings(raw: unknown): ExtensionSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS, whitelist: [] };
  }

  const record = raw as Partial<ExtensionSettings>;

  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : DEFAULT_SETTINGS.enabled,
    heuristicFallback:
      typeof record.heuristicFallback === 'boolean'
        ? record.heuristicFallback
        : DEFAULT_SETTINGS.heuristicFallback,
    acceptUnavoidableBanners:
      typeof record.acceptUnavoidableBanners === 'boolean'
        ? record.acceptUnavoidableBanners
        : DEFAULT_SETTINGS.acceptUnavoidableBanners,
    sendGpc: typeof record.sendGpc === 'boolean' ? record.sendGpc : DEFAULT_SETTINGS.sendGpc,
    whitelist: sanitizeWhitelist(record.whitelist),
  };
}

interface StoredSettingsRecord extends ExtensionSettings {
  _updatedAt?: number;
}

let lastSettingsWriteTs = 0;

function nextSettingsTimestamp(): number {
  const now = Date.now();
  lastSettingsWriteTs = now > lastSettingsWriteTs ? now : lastSettingsWriteTs + 1;
  return lastSettingsWriteTs;
}

function extractUpdatedAt(raw: unknown): number {
  if (!raw || typeof raw !== 'object') {
    return 0;
  }
  const value = (raw as { _updatedAt?: unknown })._updatedAt;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const storage = getExtensionStorage();

  let syncRaw: unknown;
  let localRaw: unknown;

  if (storage?.sync) {
    try {
      const data = await storage.sync.get(SETTINGS_KEY);
      syncRaw = data[SETTINGS_KEY];
    } catch {
      // Ignore sync read error and fall back to local storage
    }
  }

  if (storage?.local) {
    try {
      const localData = await storage.local.get(SETTINGS_KEY);
      localRaw = localData[SETTINGS_KEY];
    } catch {
      // Ignore local read error
    }
  }

  if (syncRaw && localRaw) {
    const syncTs = extractUpdatedAt(syncRaw);
    const localTs = extractUpdatedAt(localRaw);
    // Prefer local when local is strictly newer (e.g. a previous sync.set failed due to quota/rate limit)
    return sanitizeSettings(localTs > syncTs ? localRaw : syncRaw);
  }

  if (syncRaw) {
    return sanitizeSettings(syncRaw);
  }

  if (localRaw) {
    return sanitizeSettings(localRaw);
  }

  return { ...DEFAULT_SETTINGS, whitelist: [] };
}

export async function saveSettings(settings: ExtensionSettings): Promise<ExtensionSettings> {
  const clean = sanitizeSettings(settings);
  const record: StoredSettingsRecord = {
    ...clean,
    _updatedAt: nextSettingsTimestamp(),
  };

  try {
    await getLocalStorage().set({ [SETTINGS_KEY]: record });
  } catch {
    // Ignore if local storage unavailable in mock environments
  }

  try {
    await getSyncStorage().set({ [SETTINGS_KEY]: record });
  } catch {
    // Quota or sync disabled: local storage already has the newer timestamp
  }

  return clean;
}

export async function loadStats(now: number = Date.now()): Promise<ExtensionStats> {
  const today = getTodayIsoDate(now);
  try {
    const data = await getLocalStorage().get(STATS_KEY);
    const raw = data[STATS_KEY] as Partial<ExtensionStats> | undefined;
    if (!raw || typeof raw !== 'object') {
      return { ...DEFAULT_STATS, todayDate: today };
    }
    const isSameDay = raw.todayDate === today;
    return {
      totalRejected: typeof raw.totalRejected === 'number' ? raw.totalRejected : 0,
      totalAccepted: typeof raw.totalAccepted === 'number' ? raw.totalAccepted : 0,
      todayDate: today,
      todayRejected: isSameDay && typeof raw.todayRejected === 'number' ? raw.todayRejected : 0,
      todayAccepted: isSameDay && typeof raw.todayAccepted === 'number' ? raw.todayAccepted : 0,
    };
  } catch {
    return { ...DEFAULT_STATS, todayDate: today };
  }
}

export async function loadActionLog(): Promise<ActionLogEntry[]> {
  try {
    const data = await getLocalStorage().get(LOG_KEY);
    const raw = data[LOG_KEY];
    return Array.isArray(raw) ? (raw as ActionLogEntry[]) : [];
  } catch {
    return [];
  }
}

export async function recordAction(
  domain: string,
  cmp: string,
  action: ActionOutcome,
  source: ActionSource,
  now: number = Date.now(),
): Promise<{ stats: ExtensionStats; log: ActionLogEntry[] }> {
  const [stats, log] = await Promise.all([loadStats(now), loadActionLog()]);

  if (action === 'rejected') {
    stats.totalRejected += 1;
    stats.todayRejected += 1;
  } else if (action === 'accepted') {
    stats.totalAccepted += 1;
    stats.todayAccepted += 1;
  }

  const entry: ActionLogEntry = {
    id: generateId(),
    timestamp: now,
    domain,
    cmp,
    action,
    source,
  };

  const nextLog = [entry, ...log].slice(0, MAX_LOG_ENTRIES);

  await getLocalStorage().set({
    [STATS_KEY]: stats,
    [LOG_KEY]: nextLog,
  });

  return { stats, log: nextLog };
}

export async function clearActionLog(): Promise<void> {
  await getLocalStorage().set({ [LOG_KEY]: [] });
}

export function createWhitelistExportPayload(whitelist: WhitelistEntry[]): WhitelistExportPayload {
  return {
    app: 'Riczone Cookie Guard',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    whitelist,
  };
}

export interface WhitelistImportResult {
  ok: boolean;
  entries?: WhitelistEntry[];
  addedCount?: number;
  error?: string;
}

export function parseWhitelistImportJson(
  jsonText: string,
  existing: WhitelistEntry[],
): WhitelistImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: t('errImportJson') };
  }

  const rawList = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { whitelist?: unknown }).whitelist)
      ? (parsed as { whitelist: unknown[] }).whitelist
      : null;

  if (!rawList) {
    return {
      ok: false,
      error: t('errImportFormat'),
    };
  }

  const imported = sanitizeWhitelist(rawList);
  const byPattern = new Map<string, WhitelistEntry>();
  for (const item of existing) {
    byPattern.set(item.pattern, item);
  }

  let addedCount = 0;
  for (const item of imported) {
    if (!byPattern.has(item.pattern)) {
      addedCount += 1;
    }
    byPattern.set(item.pattern, item);
  }

  return {
    ok: true,
    entries: Array.from(byPattern.values()),
    addedCount,
  };
}
