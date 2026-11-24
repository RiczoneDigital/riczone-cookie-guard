import { describe, expect, it } from 'vitest';
import enMessages from '../../public/_locales/en/messages.json';
import deMessages from '../../public/_locales/de/messages.json';
import { applyDocumentI18n, t, type MessageKey } from '../../src/shared/i18n';

describe('i18n – Locale Parity & Message Formatting', () => {
  it('keeps identical message keys and non-empty strings across en and de', () => {
    const enKeys = Object.keys(enMessages).sort();
    const deKeys = Object.keys(deMessages).sort();
    expect(deKeys).toEqual(enKeys);

    for (const key of enKeys as MessageKey[]) {
      const enEntry = enMessages[key] as {
        message: string;
        placeholders?: Record<string, { content: string }>;
      };
      const deEntry = deMessages[key] as {
        message: string;
        placeholders?: Record<string, { content: string }>;
      };

      expect(enEntry.message.trim().length).toBeGreaterThan(0);
      expect(deEntry.message.trim().length).toBeGreaterThan(0);

      const enPlaceholders = Object.keys(enEntry.placeholders ?? {}).sort();
      const dePlaceholders = Object.keys(deEntry.placeholders ?? {}).sort();
      expect(dePlaceholders).toEqual(enPlaceholders);
    }
  });

  it('interpolates placeholder substitutions cleanly in fallback mode', () => {
    expect(t('btnAddWhitelist', 'payback.de')).toContain('payback.de');
    expect(t('detailRejected', ['OneTrust', ' · GPC active'])).toContain('OneTrust');
    expect(t('wlCountPlural', '5')).toContain('5');
  });

  it('applies data-i18n attributes across a document', () => {
    document.body.innerHTML = `
      <h1 data-i18n="extName"></h1>
      <input id="inp" data-i18n-placeholder="wlSearchPlaceholder" />
      <button id="btn" data-i18n-aria-label="popupToggleAria"></button>
    `;
    applyDocumentI18n(document);
    expect(document.querySelector('h1')?.textContent).toBe('Riczone Cookie Guard');
    expect((document.getElementById('inp') as HTMLInputElement).placeholder.length).toBeGreaterThan(0);
    expect(document.getElementById('btn')?.getAttribute('aria-label')?.length).toBeGreaterThan(0);
  });
});
