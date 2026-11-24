import enMessages from '../../public/_locales/en/messages.json';
import deMessages from '../../public/_locales/de/messages.json';

export type MessageKey = keyof typeof enMessages;

interface MessageEntry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

interface ExtensionI18nLike {
  getMessage?: (key: string, substitutions?: string | string[]) => string;
  getUILanguage?: () => string;
}

function getBrowserI18n(): ExtensionI18nLike | undefined {
  const g = globalThis as unknown as {
    browser?: { i18n?: ExtensionI18nLike };
    chrome?: { i18n?: ExtensionI18nLike };
  };
  return g.browser?.i18n ?? g.chrome?.i18n;
}

export function getUiLanguage(): string {
  const i18n = getBrowserI18n();
  if (i18n?.getMessage) {
    try {
      const activeLocale = i18n.getMessage('@@ui_locale');
      if (activeLocale) {
        return activeLocale;
      }
    } catch {
      // Fallback below
    }
  }
  if (i18n?.getUILanguage) {
    try {
      return i18n.getUILanguage();
    } catch {
      // Fallback below
    }
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'en';
}

function interpolateFallback(entry: MessageEntry, substitutions?: string[]): string {
  let text = entry.message;
  if (!substitutions || substitutions.length === 0 || !entry.placeholders) {
    return text;
  }

  for (const [placeholderName, spec] of Object.entries(entry.placeholders)) {
    const match = /^\$(\d+)$/.exec(spec.content);
    if (!match) {
      continue;
    }
    const index = Number(match[1]) - 1;
    const replacement = substitutions[index] ?? '';
    text = text.replace(new RegExp(`\\$${placeholderName}\\$`, 'gi'), replacement);
  }
  return text;
}

/**
 * Resolves a localized UI string via WebExtension `i18n.getMessage` with an automatic
 * fallback to bundled EN/DE dictionaries (e.g. in unit tests).
 */
export function t(key: MessageKey, substitutions?: string | string[]): string {
  const subs =
    substitutions === undefined
      ? undefined
      : Array.isArray(substitutions)
        ? substitutions
        : [substitutions];

  const i18n = getBrowserI18n();
  if (i18n?.getMessage) {
    try {
      const value = i18n.getMessage(key, subs);
      if (value) {
        return value;
      }
    } catch {
      // Fall through to bundled dictionary
    }
  }

  const lang = getUiLanguage().toLowerCase();
  const dict = (lang.startsWith('de') ? deMessages : enMessages) as Record<string, MessageEntry>;
  const entry = dict[key] ?? (enMessages as Record<string, MessageEntry>)[key];
  return entry ? interpolateFallback(entry, subs) : key;
}

/**
 * Applies `data-i18n*` attributes across a document and sets `<html lang="...">`.
 */
export function applyDocumentI18n(doc: Document): void {
  const lang = getUiLanguage().toLowerCase().startsWith('de') ? 'de' : 'en';
  doc.documentElement.lang = lang;

  for (const el of doc.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n as MessageKey | undefined;
    if (key) {
      el.textContent = t(key);
    }
  }

  for (const el of doc.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    const key = el.dataset.i18nPlaceholder as MessageKey | undefined;
    if (key) {
      el.placeholder = t(key);
    }
  }

  for (const el of doc.querySelectorAll<HTMLElement>('[data-i18n-aria-label]')) {
    const key = el.dataset.i18nAriaLabel as MessageKey | undefined;
    if (key) {
      el.setAttribute('aria-label', t(key));
    }
  }

  for (const el of doc.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const key = el.dataset.i18nTitle as MessageKey | undefined;
    if (key) {
      el.title = t(key);
    }
  }
}
