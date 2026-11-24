export type HeuristicActionMode = 'reject' | 'accept';

export interface HeuristicMatchResult {
  clicked: boolean;
  action?: 'rejected' | 'accepted' | 'accepted-unavoidable';
  label?: string;
  tier?: number;
}

const COOKIE_CONTEXT_KEYWORDS = [
  'cookie',
  'cookies',
  'datenschutz',
  'einwilligung',
  'privatsphäre',
  'privatsphaere',
  'tracking',
  'werbetracking',
  'consent',
  'privacy',
  'gdpr',
  'dsgvo',
  'zwecke',
  'drittanbieter',
  'partnern',
  'pur-abo',
  'pur abo',
  'contentpass',
];

const COOKIE_CONTAINER_ATTR_REGEX =
  /cookie|consent|cmp|gdpr|dsgvo|privacy|datenschutz|onetrust|usercentrics|didomi|borlabs|klaro|quantcast|sp_message|cookiebot|truste|cc-window|cmplz|rcb-|pur[_-]?layer|purgateway|contentpass/i;

// Guardrail: never click subscription / paywall / login buttons when rejecting
const REJECT_FORBIDDEN_TEXT_REGEX =
  /\b(pur[\s-]?abo|abo\b|abonnieren|zum angebot|angebot|subscribe|subscription|bezahlen|kostenpflichtig|zahlung|pay\b|login|anmelden|einloggen|registrieren|konto erstellen|weiter mit werbung|akzeptieren und weiter|zustimmen und weiter|mit werbung lesen|einstellungen|settings|manage|verwalten|details|mehr infos|datenschutzerklärung|impressum)\b/i;

// Guardrail: never click settings / reject / paid offer / privacy links when accepting
const ACCEPT_FORBIDDEN_TEXT_REGEX =
  /\b(ablehnen|verweigern|reject|decline|deny|nur notwendige|nur erforderliche|nur essenzielle|essential only|necessary only|einstellungen|settings|manage|verwalten|anpassen|customize|details|mehr infos|datenschutzerklärung|datenschutz|impressum|kontakt|login|anmelden|einloggen|registrieren|pur[\s-]?abo|abo\b|abonnieren|zum angebot|angebot|subscribe|bezahlen|partner)\b/i;

const SETTINGS_BUTTON_TEXT_REGEX =
  /\b(einstellungen|privatsphäre-einstellungen|datenschutzeinstellungen|settings|manage|verwalten|anpassen|customize|preferences|optionen|zwecke|auswahl)\b/i;

const REJECT_PATTERNS: Array<{ tier: number; regex: RegExp }> = [
  {
    tier: 1,
    regex:
      /^(alle\s*(cookies\s*)?ablehnen|alles\s*ablehnen|alle\s*verweigern|reject\s*all(\s*cookies)?|decline\s*all(\s*cookies)?|deny\s*all(\s*cookies)?|refuse\s*all|opt[\s-]*out\s*all)$/i,
  },
  {
    tier: 2,
    regex:
      /^(nur\s*(technisch\s*)?(notwendige|erforderliche|essenzielle|unbedingt\s*erforderliche)(\s*cookies)?(\s*(akzeptieren|zulassen|speichern|verwenden))?|mit\s*notwendigen(\s*cookies)?\s*fortfahren|ohne\s*einwilligung\s*fortfahren|continue\s*without\s*accepting|only\s*(essential|necessary|required)(\s*cookies)?|(essential|necessary|required)\s*only|accept\s*(only\s*)?(essential|necessary|required)(\s*cookies)?|save\s*essential\s*only)$/i,
  },
  {
    tier: 3,
    regex: /^(ablehnen|nicht\s*akzeptieren|nicht\s*zustimmen|verweigern|reject|decline|deny|disagree|no\s*thanks)$/i,
  },
];

const ACCEPT_PATTERNS: Array<{ tier: number; regex: RegExp }> = [
  {
    tier: 1,
    regex:
      /^(alle\s*(cookies\s*)?(akzeptieren|zulassen|annehmen)|alles\s*(akzeptieren|zulassen|annehmen)|zustimmen\s*und\s*(weiter|fortfahren)|akzeptieren\s*und\s*(weiter|fortfahren|schließen)|mit\s*werbung\s*(lesen|fortfahren|weiter)|weiter\s*mit\s*(werbung|tracking)|kostenlos\s*mit\s*werbung(\s*(lesen|weiter))?|accept\s*all(\s*cookies)?|allow\s*all(\s*cookies)?|accept\s*and\s*continue|agree\s*(to\s*all|and\s*continue)|continue\s*with\s*ads|i\s*accept\s*all|yes,?\s*i\s*agree)$/i,
  },
  {
    tier: 2,
    regex:
      /^(alle\s*auswählen\s*und\s*speichern|cookies\s*(akzeptieren|zulassen)|accept\s*cookies|allow\s*cookies|einverstanden|ich\s*stimme\s*zu|stimme\s*zu)$/i,
  },
  {
    tier: 3,
    regex: /^(akzeptieren|zustimmen|annehmen|zulassen|accept|agree|allow|ok,?\s*verstanden|verstanden|ok)$/i,
  },
];

const CLICKED_ATTR = 'data-rcg-heuristic-clicked';

function normalizeButtonText(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[✓✔✕✖×•→»«\s]+|[✓✔✕✖×•→»«\s]+$/g, '')
    .trim();
}

function getElementLabel(el: HTMLElement): string {
  const parts = [
    el.innerText || el.textContent || '',
    el.getAttribute('aria-label') || '',
    el.getAttribute('title') || '',
    el instanceof HTMLInputElement ? el.value || '' : '',
  ];
  for (const part of parts) {
    const clean = normalizeButtonText(part);
    if (clean) {
      return clean;
    }
  }
  return '';
}

function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) {
    return false;
  }
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') {
    return false;
  }

  const style = window.getComputedStyle(el);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    Number.parseFloat(style.opacity || '1') === 0
  ) {
    return false;
  }

  const rect = el.getBoundingClientRect();
  const hasRealLayout =
    rect.width > 0 || rect.height > 0 || el.offsetWidth > 0 || el.offsetHeight > 0;
  if (!hasRealLayout && typeof navigator !== 'undefined' && !/jsdom/i.test(navigator.userAgent)) {
    return false;
  }

  return true;
}

function isLikelyCookieContainer(el: HTMLElement): boolean {
  const attrFingerprint = [
    el.id,
    typeof el.className === 'string' ? el.className : '',
    el.getAttribute('aria-label') || '',
    el.getAttribute('data-testid') || '',
    el.getAttribute('data-nosnippet') !== null ? 'nosnippet' : '',
  ].join(' ');

  const text = (el.textContent || '').toLowerCase();
  const hasCookieKeyword = COOKIE_CONTEXT_KEYWORDS.some((kw) => text.includes(kw));

  if (COOKIE_CONTAINER_ATTR_REGEX.test(attrFingerprint) && hasCookieKeyword) {
    return true;
  }

  const role = el.getAttribute('role');
  const isDialog =
    role === 'dialog' ||
    role === 'alertdialog' ||
    el.getAttribute('aria-modal') === 'true' ||
    el.tagName === 'DIALOG';
  if (isDialog && hasCookieKeyword) {
    return true;
  }

  const style = window.getComputedStyle(el);
  const isOverlay = style.position === 'fixed' || style.position === 'sticky';
  if (isOverlay && hasCookieKeyword && text.length >= 25 && text.length <= 6000) {
    return true;
  }

  return false;
}

function collectRoots(
  root: Document | ShadowRoot,
  out: Array<Document | ShadowRoot> = [],
): Array<Document | ShadowRoot> {
  out.push(root);
  const all = root.querySelectorAll('*');
  for (const el of all) {
    if (el.shadowRoot) {
      collectRoots(el.shadowRoot, out);
    }
  }
  return out;
}

function isPageWrapper(el: HTMLElement, doc: Document): boolean {
  if (el === doc.body || el === doc.documentElement) {
    return true;
  }
  const role = el.getAttribute('role');
  const style = window.getComputedStyle(el);
  const isExplicitDialogOrOverlay =
    role === 'dialog' ||
    role === 'alertdialog' ||
    el.getAttribute('aria-modal') === 'true' ||
    el.tagName === 'DIALOG' ||
    style.position === 'fixed';
  if (isExplicitDialogOrOverlay) {
    return false;
  }
  // Avoid selecting full-page layout wrappers that contain the site's main content
  if (el.querySelector('main, article')) {
    return true;
  }
  return (el.textContent || '').length > 8000;
}

function findConsentContainers(doc: Document): HTMLElement[] {
  const roots = collectRoots(doc);
  const candidates: HTMLElement[] = [];

  for (const root of roots) {
    const nodes = root.querySelectorAll<HTMLElement>(
      'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"], aside, section, div, form',
    );
    for (const node of nodes) {
      if (isPageWrapper(node, doc)) {
        continue;
      }
      if (!isElementVisible(node)) {
        continue;
      }
      // Must contain at least one clickable control so pure text divs never match
      const hasActionControl = Boolean(
        node.querySelector('button, [role="button"], input[type="button"], input[type="submit"], a'),
      );
      if (!hasActionControl) {
        continue;
      }
      if (isLikelyCookieContainer(node)) {
        candidates.push(node);
      }
    }
  }

  // Prefer the outermost matching consent container so multi-column banners and BEM child divs
  // are evaluated as one complete dialog (keeping all sibling buttons and paywall context together).
  return candidates.filter(
    (container) => !candidates.some((other) => other !== container && other.contains(container)),
  );
}

function isDangerousAnchor(el: HTMLElement): boolean {
  if (el.tagName !== 'A') {
    return false;
  }
  const href = (el.getAttribute('href') || '').trim().toLowerCase();
  if (!href || href === '#' || href.startsWith('javascript:')) {
    return false;
  }
  if (
    /datenschutz|privacy|impressum|imprint|abo|subscribe|checkout|login|register|pricing/i.test(href)
  ) {
    return true;
  }
  if (/^https?:\/\//i.test(href)) {
    return true;
  }
  return false;
}

export function isInsidePaywallContext(container: HTMLElement): boolean {
  const attrFingerprint = `${container.id} ${typeof container.className === 'string' ? container.className : ''}`;
  if (/pur[_-]?layer|purgateway|contentpass/i.test(attrFingerprint)) {
    return true;
  }

  const text = (container.textContent || '').toLowerCase();
  const hasPurOrSub =
    text.includes('pur-abo') ||
    text.includes('pur abo') ||
    text.includes('contentpass') ||
    text.includes('ohne werbetracking') ||
    text.includes('ohne werbung') ||
    text.includes('kostenpflichtig');
  const hasPayOrAdsAlternative =
    text.includes('mit werbung') ||
    text.includes('mit tracking') ||
    text.includes('werbetracking') ||
    text.includes('vorzugspreis') ||
    text.includes('monat') ||
    text.includes('€') ||
    text.includes('zum angebot');

  return hasPurOrSub && hasPayOrAdsAlternative;
}

function matchButtonTier(label: string, mode: HeuristicActionMode): number | null {
  if (!label || label.length > 64) {
    return null;
  }

  if (mode === 'reject') {
    if (REJECT_FORBIDDEN_TEXT_REGEX.test(label)) {
      return null;
    }
    for (const entry of REJECT_PATTERNS) {
      if (entry.regex.test(label)) {
        return entry.tier;
      }
    }
    return null;
  }

  if (ACCEPT_FORBIDDEN_TEXT_REGEX.test(label)) {
    return null;
  }
  for (const entry of ACCEPT_PATTERNS) {
    if (entry.regex.test(label)) {
      return entry.tier;
    }
  }
  return null;
}

function containerHasButtonMatching(container: HTMLElement, predicate: (label: string) => boolean): boolean {
  const clickables = container.querySelectorAll<HTMLElement>(
    'button, [role="button"], input[type="button"], input[type="submit"], a',
  );
  for (const el of clickables) {
    if (!isElementVisible(el) || isDangerousAnchor(el)) {
      continue;
    }
    const label = getElementLabel(el);
    if (label && predicate(label)) {
      return true;
    }
  }
  return false;
}

/**
 * Performs a single synchronous heuristic scan across the document and open shadow roots.
 */
export function runHeuristicOnce(
  doc: Document,
  mode: HeuristicActionMode,
): HeuristicMatchResult {
  const containers = findConsentContainers(doc);
  if (containers.length === 0) {
    return { clicked: false };
  }

  let bestCandidate: { el: HTMLElement; label: string; tier: number } | null = null;

  for (const container of containers) {
    if (container.getAttribute(CLICKED_ATTR)) {
      continue;
    }

    if (mode === 'reject' && isInsidePaywallContext(container)) {
      continue;
    }

    const clickables = container.querySelectorAll<HTMLElement>(
      'button, [role="button"], input[type="button"], input[type="submit"], a',
    );

    for (const el of clickables) {
      if (el.getAttribute(CLICKED_ATTR)) {
        continue;
      }
      if (!isElementVisible(el) || isDangerousAnchor(el)) {
        continue;
      }

      const label = getElementLabel(el);
      const tier = matchButtonTier(label, mode);
      if (tier === null) {
        continue;
      }

      if (!bestCandidate || tier < bestCandidate.tier) {
        bestCandidate = { el, label, tier };
      }
    }

    if (bestCandidate && bestCandidate.tier === 1) {
      break;
    }
  }

  if (!bestCandidate) {
    return { clicked: false };
  }

  bestCandidate.el.setAttribute(CLICKED_ATTR, mode);
  const parentContainer = containers.find((c) => c.contains(bestCandidate!.el));
  if (parentContainer) {
    parentContainer.setAttribute(CLICKED_ATTR, mode);
  }

  bestCandidate.el.click();

  return {
    clicked: true,
    action: mode === 'accept' ? 'accepted' : 'rejected',
    label: bestCandidate.label,
    tier: bestCandidate.tier,
  };
}

/**
 * Fallback specifically for banners where rejecting is genuinely impossible:
 * 1. Pay-or-OK / PUR-Abo paywall layers (only offer "Accept with Ads" vs paid subscription).
 * 2. Pure notice/accept-only cookie banners with neither a Reject button nor a Settings button.
 * NEVER triggers if a Reject/Essential-only button is present.
 */
export function runUnavoidableAcceptOnce(doc: Document): HeuristicMatchResult {
  const containers = findConsentContainers(doc);
  if (containers.length === 0) {
    return { clicked: false };
  }

  let bestCandidate: { el: HTMLElement; label: string; tier: number; container: HTMLElement } | null =
    null;

  for (const container of containers) {
    if (container.getAttribute(CLICKED_ATTR)) {
      continue;
    }

    // Never accept if a genuine reject button exists in this container
    const hasReject = containerHasButtonMatching(
      container,
      (label) => matchButtonTier(label, 'reject') !== null,
    );
    if (hasReject) {
      continue;
    }

    const isPaywall = isInsidePaywallContext(container);
    const hasSettingsButton = containerHasButtonMatching(container, (label) =>
      SETTINGS_BUTTON_TEXT_REGEX.test(label),
    );

    // Only accept automatically if it's either a Pay-or-OK / PUR-Abo wall
    // OR an accept-only notice banner with no Settings button to decline via layer 2
    if (!isPaywall && hasSettingsButton) {
      continue;
    }

    const clickables = container.querySelectorAll<HTMLElement>(
      'button, [role="button"], input[type="button"], input[type="submit"], a',
    );

    for (const el of clickables) {
      if (el.getAttribute(CLICKED_ATTR)) {
        continue;
      }
      if (!isElementVisible(el) || isDangerousAnchor(el)) {
        continue;
      }

      const label = getElementLabel(el);
      const tier = matchButtonTier(label, 'accept');
      if (tier === null) {
        continue;
      }

      if (!bestCandidate || tier < bestCandidate.tier) {
        bestCandidate = { el, label, tier, container };
      }
    }

    if (bestCandidate && bestCandidate.tier === 1) {
      break;
    }
  }

  if (!bestCandidate) {
    return { clicked: false };
  }

  bestCandidate.el.setAttribute(CLICKED_ATTR, 'accepted-unavoidable');
  bestCandidate.container.setAttribute(CLICKED_ATTR, 'accepted-unavoidable');
  bestCandidate.el.click();

  return {
    clicked: true,
    action: 'accepted-unavoidable',
    label: bestCandidate.label,
    tier: bestCandidate.tier,
  };
}

/**
 * Starts a bounded heuristic observer that waits briefly (so primary CMP rules run first)
 * and then checks both immediately and on DOM mutations for up to `maxDurationMs`.
 * In `reject` mode with `acceptUnavoidable: true`, it always tries to reject first and only
 * accepts unavoidable banners (like PUR-Abo paywalls) after `unavoidableDelayMs` if no reject succeeded.
 */
export function startHeuristicWatcher(options: {
  mode: HeuristicActionMode;
  acceptUnavoidable?: boolean;
  initialDelayMs?: number;
  unavoidableDelayMs?: number;
  maxDurationMs?: number;
  shouldSkip?: () => boolean;
  onSuccess: (result: HeuristicMatchResult) => void;
}): () => void {
  const initialDelayMs = options.initialDelayMs ?? 900;
  const unavoidableDelayMs = options.unavoidableDelayMs ?? 2400;
  const maxDurationMs = options.maxDurationMs ?? 10_000;
  const startedAt = Date.now();

  let stopped = false;
  let observer: MutationObserver | null = null;
  let startTimer: number | null = null;
  let unavoidableTimer: number | null = null;
  let stopTimer: number | null = null;
  let debounceTimer: number | null = null;

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (startTimer !== null) window.clearTimeout(startTimer);
    if (unavoidableTimer !== null) window.clearTimeout(unavoidableTimer);
    if (stopTimer !== null) window.clearTimeout(stopTimer);
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  };

  const tryScan = () => {
    if (stopped || options.shouldSkip?.()) {
      stop();
      return;
    }

    const primaryResult = runHeuristicOnce(document, options.mode);
    if (primaryResult.clicked) {
      stop();
      options.onSuccess(primaryResult);
      return;
    }

    if (
      options.mode === 'reject' &&
      options.acceptUnavoidable &&
      Date.now() - startedAt >= unavoidableDelayMs
    ) {
      const fallbackResult = runUnavoidableAcceptOnce(document);
      if (fallbackResult.clicked) {
        stop();
        options.onSuccess(fallbackResult);
      }
    }
  };

  startTimer = window.setTimeout(() => {
    if (stopped || options.shouldSkip?.()) {
      stop();
      return;
    }

    tryScan();
    if (stopped) {
      return;
    }

    if (options.mode === 'reject' && options.acceptUnavoidable) {
      const remaining = Math.max(0, unavoidableDelayMs - (Date.now() - startedAt));
      unavoidableTimer = window.setTimeout(tryScan, remaining + 50);
    }

    const target = document.body || document.documentElement;
    if (target) {
      observer = new MutationObserver(() => {
        if (stopped) {
          return;
        }
        if (debounceTimer !== null) {
          window.clearTimeout(debounceTimer);
        }
        debounceTimer = window.setTimeout(tryScan, 250);
      });
      observer.observe(target, { childList: true, subtree: true });
    }

    stopTimer = window.setTimeout(stop, maxDurationMs);
  }, initialDelayMs);

  return stop;
}
