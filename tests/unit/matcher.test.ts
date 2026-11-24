import { describe, expect, it } from 'vitest';
import {
  extractHostFromUrl,
  findMatchingWhitelistEntry,
  getGpcExcludedDomains,
  matchesWhitelistPattern,
  normalizeDisplayDomain,
  resolvePolicyForUrl,
  validateAndNormalizePattern,
} from '../../src/shared/matcher';
import { DEFAULT_SETTINGS, type ExtensionSettings, type WhitelistEntry } from '../../src/shared/types';

describe('matcher – URL & Pattern Validation', () => {
  it('extracts lowercase hostnames from http/https URLs and ignores browser internal URLs', () => {
    expect(extractHostFromUrl('https://WWW.PAYBACK.DE/aktionen?id=1')).toBe('www.payback.de');
    expect(extractHostFromUrl('http://localhost:3000/test')).toBe('localhost');
    expect(extractHostFromUrl('chrome://extensions')).toBeNull();
    expect(extractHostFromUrl('about:debugging')).toBeNull();
    expect(extractHostFromUrl('moz-extension://abc/popup.html')).toBeNull();
    expect(extractHostFromUrl('')).toBeNull();
  });

  it('normalizes display domains by removing leading www.', () => {
    expect(normalizeDisplayDomain('www.payback.de')).toBe('payback.de');
    expect(normalizeDisplayDomain('coupon.payback.de')).toBe('coupon.payback.de');
    expect(normalizeDisplayDomain('localhost')).toBe('localhost');
  });

  it('validates and normalizes standard, wildcard, exact, and full-URL inputs', () => {
    expect(validateAndNormalizePattern('https://www.payback.de/punkte')).toEqual({
      valid: true,
      normalized: 'payback.de',
    });
    expect(validateAndNormalizePattern('www.Payback.de/shop')).toEqual({
      valid: true,
      normalized: 'payback.de',
    });
    expect(validateAndNormalizePattern('*.payback.de')).toEqual({
      valid: true,
      normalized: '*.payback.de',
    });
    expect(validateAndNormalizePattern('=www.payback.de')).toEqual({
      valid: true,
      normalized: '=www.payback.de',
    });
    expect(validateAndNormalizePattern('127.0.0.1')).toEqual({
      valid: true,
      normalized: '127.0.0.1',
    });
  });

  it('rejects empty, wildcard-only, and malformed patterns', () => {
    expect(validateAndNormalizePattern('').valid).toBe(false);
    expect(validateAndNormalizePattern('*').valid).toBe(false);
    expect(validateAndNormalizePattern('pay*back.de').valid).toBe(false);
    expect(validateAndNormalizePattern('not a domain').valid).toBe(false);
    expect(validateAndNormalizePattern('justword').valid).toBe(false);
  });
});

describe('matcher – Whitelist Matching & Policy Resolution', () => {
  const paybackAccept: WhitelistEntry = {
    id: '1',
    pattern: 'payback.de',
    mode: 'accept',
    createdAt: 1000,
  };
  const exactIgnore: WhitelistEntry = {
    id: '2',
    pattern: '=coupon.payback.de',
    mode: 'ignore',
    createdAt: 2000,
  };

  it('matches root and subdomains for standard/wildcard patterns and only exact host for =', () => {
    expect(matchesWhitelistPattern('payback.de', 'payback.de')).toBe(true);
    expect(matchesWhitelistPattern('payback.de', 'www.payback.de')).toBe(true);
    expect(matchesWhitelistPattern('payback.de', 'coupon.payback.de')).toBe(true);
    expect(matchesWhitelistPattern('payback.de', 'fakepayback.de')).toBe(false);
    expect(matchesWhitelistPattern('=www.payback.de', 'www.payback.de')).toBe(true);
    expect(matchesWhitelistPattern('=www.payback.de', 'payback.de')).toBe(false);
  });

  it('prioritizes exact matches over broader domain matches', () => {
    const match = findMatchingWhitelistEntry('coupon.payback.de', [paybackAccept, exactIgnore]);
    expect(match?.id).toBe('2');
    expect(match?.mode).toBe('ignore');
  });

  it('resolves default reject with GPC enabled on non-whitelisted domains', () => {
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      whitelist: [paybackAccept],
    };
    const res = resolvePolicyForUrl('https://www.spiegel.de/politik', settings);
    expect(res.policy).toBe('reject');
    expect(res.reason).toBe('default-reject');
    expect(res.sendGpc).toBe(true);
  });

  it('resolves whitelist accept and disables GPC on payback.de and subdomains', () => {
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      whitelist: [paybackAccept],
    };
    const res = resolvePolicyForUrl('https://www.payback.de/aktionen', settings);
    expect(res.policy).toBe('accept');
    expect(res.reason).toBe('whitelist-accept');
    expect(res.sendGpc).toBe(false);
    expect(res.matchedEntry?.pattern).toBe('payback.de');
  });

  it('resolves disabled policy when globally turned off', () => {
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      enabled: false,
    };
    const res = resolvePolicyForUrl('https://www.spiegel.de/', settings);
    expect(res.policy).toBe('disabled');
    expect(res.reason).toBe('globally-disabled');
    expect(res.sendGpc).toBe(false);
  });

  it('extracts clean GPC exclusion domains from whitelist entries', () => {
    expect(getGpcExcludedDomains([paybackAccept, exactIgnore])).toEqual([
      'payback.de',
      'coupon.payback.de',
    ]);
  });
});
