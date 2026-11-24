import type {
  ExtensionSettings,
  ResolvedPolicy,
  WhitelistEntry,
} from './types';

const DOMAIN_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface PatternValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Extracts and normalizes a lowercase hostname from a URL or raw host string.
 * Returns null for unsupported protocols (chrome:, about:, moz-extension:, file:, etc.).
 */
export function extractHostFromUrl(rawUrl: string | undefined | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

/**
 * Normalizes a host for display or default whitelist creation (strips leading "www.").
 */
export function normalizeDisplayDomain(host: string): string {
  const clean = host.trim().toLowerCase().replace(/\.$/, '');
  if (clean.startsWith('www.') && clean.split('.').length >= 3) {
    return clean.slice(4);
  }
  return clean;
}

function isValidHostStructure(host: string): boolean {
  if (!host || host.length > 253) {
    return false;
  }
  if (host === 'localhost') {
    return true;
  }
  // Allow IPv4 addresses for local dev/testing (e.g. 127.0.0.1)
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    return host.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
  }

  const labels = host.split('.');
  if (labels.length < 2) {
    return false;
  }
  return labels.every((label) => DOMAIN_LABEL_REGEX.test(label));
}

/**
 * Validates and normalizes user-entered whitelist patterns.
 * Supported formats:
 * - "payback.de" or "https://www.payback.de/punkte" -> "payback.de" (matches root + all subdomains)
 * - "*.payback.de" -> "*.payback.de" (matches root + all subdomains)
 * - "=www.payback.de" -> "=www.payback.de" (exact hostname match only)
 */
export function validateAndNormalizePattern(rawInput: string): PatternValidationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { valid: false, error: 'Bitte gib eine Domain ein (z. B. payback.de).' };
  }

  let prefix = '';
  let candidate = trimmed;

  if (candidate.startsWith('=')) {
    prefix = '=';
    candidate = candidate.slice(1).trim();
  } else if (candidate.startsWith('*.')) {
    prefix = '*.';
    candidate = candidate.slice(2).trim();
  }

  if (!candidate || candidate === '*' || candidate.includes('*')) {
    return {
      valid: false,
      error: 'Ungültiges Muster. Nutze z. B. payback.de, *.payback.de oder =www.payback.de.',
    };
  }

  // Allow pasting a full URL like https://www.payback.de/aktionen
  if (/^https?:\/\//i.test(candidate)) {
    const extracted = extractHostFromUrl(candidate);
    if (!extracted) {
      return { valid: false, error: 'Die eingefügte URL enthält keine gültige Web-Domain.' };
    }
    candidate = extracted;
  } else {
    // Strip path/query/hash/port if pasted without scheme (e.g. "www.payback.de/shop")
    candidate = (candidate.split(/[/?#]/)[0] ?? '').replace(/:\d+$/, '');
  }

  candidate = candidate.toLowerCase().replace(/\.$/, '');

  // For standard (non-exact) rules, normalize "www.payback.de" -> "payback.de"
  if (prefix === '' && candidate.startsWith('www.') && candidate.split('.').length >= 3) {
    candidate = candidate.slice(4);
  }

  if (!isValidHostStructure(candidate)) {
    return {
      valid: false,
      error: 'Bitte gib eine gültige Domain an (z. B. payback.de).',
    };
  }

  return {
    valid: true,
    normalized: `${prefix}${candidate}`,
  };
}

/**
 * Checks whether a normalized whitelist pattern matches a given hostname.
 */
export function matchesWhitelistPattern(pattern: string, hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  const cleanPattern = pattern.trim().toLowerCase().replace(/\.$/, '');
  if (!host || !cleanPattern) {
    return false;
  }

  if (cleanPattern.startsWith('=')) {
    return host === cleanPattern.slice(1);
  }

  const baseDomain = cleanPattern.startsWith('*.') ? cleanPattern.slice(2) : cleanPattern;
  return host === baseDomain || host.endsWith(`.${baseDomain}`);
}

/**
 * Finds the most specific matching whitelist entry for a hostname.
 * Exact matches (=host) take precedence, followed by longest domain suffix.
 */
export function findMatchingWhitelistEntry(
  hostname: string,
  whitelist: WhitelistEntry[],
): WhitelistEntry | undefined {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host || whitelist.length === 0) {
    return undefined;
  }

  const matches = whitelist.filter((entry) => matchesWhitelistPattern(entry.pattern, host));
  if (matches.length === 0) {
    return undefined;
  }

  matches.sort((a, b) => {
    const aExact = a.pattern.startsWith('=') ? 1 : 0;
    const bExact = b.pattern.startsWith('=') ? 1 : 0;
    if (aExact !== bExact) {
      return bExact - aExact;
    }
    const aLen = a.pattern.replace(/^(=|\*\.)/, '').length;
    const bLen = b.pattern.replace(/^(=|\*\.)/, '').length;
    return bLen - aLen;
  });

  return matches[0];
}

/**
 * Computes the effective policy for a given URL and current settings.
 * Precedence:
 * 1. Unsupported URL -> disabled
 * 2. Globally disabled -> disabled
 * 3. Matching whitelist entry -> entry.mode (default 'accept' or 'ignore')
 * 4. Default -> reject
 */
export function resolvePolicyForUrl(
  url: string | undefined | null,
  settings: ExtensionSettings,
): ResolvedPolicy {
  const host = extractHostFromUrl(url);

  if (!host) {
    return {
      domain: null,
      policy: 'disabled',
      reason: 'unsupported-url',
      sendGpc: false,
      heuristicFallback: false,
      acceptUnavoidableBanners: false,
    };
  }

  if (!settings.enabled) {
    return {
      domain: host,
      policy: 'disabled',
      reason: 'globally-disabled',
      sendGpc: false,
      heuristicFallback: false,
      acceptUnavoidableBanners: false,
    };
  }

  const matchedEntry = findMatchingWhitelistEntry(host, settings.whitelist);
  if (matchedEntry) {
    return {
      domain: host,
      policy: matchedEntry.mode,
      reason: matchedEntry.mode === 'accept' ? 'whitelist-accept' : 'whitelist-ignore',
      matchedEntry,
      sendGpc: false,
      heuristicFallback: matchedEntry.mode === 'accept' ? settings.heuristicFallback : false,
      acceptUnavoidableBanners: false,
    };
  }

  return {
    domain: host,
    policy: 'reject',
    reason: 'default-reject',
    sendGpc: settings.sendGpc,
    heuristicFallback: settings.heuristicFallback,
    acceptUnavoidableBanners: settings.acceptUnavoidableBanners,
  };
}

/**
 * Extracts raw domain exclusions suitable for declarativeNetRequest excludedRequestDomains.
 */
export function getGpcExcludedDomains(whitelist: WhitelistEntry[]): string[] {
  const domains = new Set<string>();
  for (const entry of whitelist) {
    const clean = entry.pattern.replace(/^(=|\*\.)/, '').trim().toLowerCase();
    if (clean) {
      domains.add(clean);
    }
  }
  return Array.from(domains);
}
