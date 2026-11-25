export type WhitelistMode = 'accept' | 'ignore';

export type EffectivePolicy = 'reject' | 'accept' | 'ignore' | 'disabled';

export type PolicyReason =
  | 'default-reject'
  | 'whitelist-accept'
  | 'whitelist-ignore'
  | 'globally-disabled'
  | 'unsupported-url';

export interface WhitelistEntry {
  id: string;
  pattern: string;
  mode: WhitelistMode;
  note?: string;
  createdAt: number;
}

export interface ExtensionSettings {
  enabled: boolean;
  heuristicFallback: boolean;
  acceptUnavoidableBanners: boolean;
  sendGpc: boolean;
  whitelist: WhitelistEntry[];
}

export type ActionOutcome =
  | 'rejected'
  | 'accepted'
  | 'accepted-unavoidable'
  | 'skipped-whitelist'
  | 'failed';

export type ActionSource = 'autoconsent' | 'heuristic' | 'policy';

export interface ActionLogEntry {
  id: string;
  timestamp: number;
  domain: string;
  cmp: string;
  action: ActionOutcome;
  source: ActionSource;
}

export interface ExtensionStats {
  totalRejected: number;
  totalAccepted: number;
  todayDate: string;
  todayRejected: number;
  todayAccepted: number;
}

export interface TabStatus {
  tabId: number;
  domain: string;
  policy: EffectivePolicy;
  reason: PolicyReason;
  matchedEntry?: WhitelistEntry;
  lastAction?: ActionOutcome;
  lastCmp?: string;
  lastSource?: ActionSource;
  actionCount: number;
  updatedAt: number;
}

export interface ResolvedPolicy {
  domain: string | null;
  policy: EffectivePolicy;
  reason: PolicyReason;
  matchedEntry?: WhitelistEntry;
  sendGpc: boolean;
  heuristicFallback: boolean;
  acceptUnavoidableBanners: boolean;
}

export interface WhitelistExportPayload {
  app: 'Riczone Cookie Guard';
  schemaVersion: 1;
  exportedAt: string;
  whitelist: WhitelistEntry[];
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  heuristicFallback: true,
  acceptUnavoidableBanners: false,
  sendGpc: true,
  whitelist: [],
};

export const DEFAULT_STATS: ExtensionStats = {
  totalRejected: 0,
  totalAccepted: 0,
  todayDate: '',
  todayRejected: 0,
  todayAccepted: 0,
};

export type RuntimeMessage =
  | { type: 'rcg:get-policy'; url?: string }
  | { type: 'rcg:eval-snippet'; snippetId: string }
  | {
      type: 'rcg:report-action';
      domain: string;
      cmp: string;
      action: ActionOutcome;
      source: ActionSource;
    }
  | { type: 'rcg:get-popup-state'; tabId?: number; url?: string }
  | { type: 'rcg:set-enabled'; enabled: boolean }
  | { type: 'rcg:upsert-whitelist'; pattern: string; mode: WhitelistMode; note?: string }
  | { type: 'rcg:remove-whitelist'; idOrPattern: string }
  | { type: 'rcg:update-settings'; patch: Partial<ExtensionSettings> }
  | { type: 'rcg:clear-log' }
  | { type: 'rcg:get-options-state' };
