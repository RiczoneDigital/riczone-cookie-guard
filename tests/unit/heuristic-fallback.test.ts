import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runHeuristicOnce, runUnavoidableAcceptOnce } from '../../src/engine/heuristic-fallback';

describe('heuristic-fallback – Reject & Accept Cookie Banners', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('clicks "Alle ablehnen" in a German cookie dialog in reject mode', () => {
    const onReject = vi.fn();
    const onAccept = vi.fn();

    document.body.innerHTML = `
      <div role="dialog" aria-modal="true" class="cookie-modal">
        <h2>Wir verwenden Cookies</h2>
        <p>Wir nutzen Cookies für Statistik und Datenschutz-Analyse.</p>
        <button id="accept-btn">Alle akzeptieren</button>
        <button id="reject-btn">Alle ablehnen</button>
      </div>
    `;
    document.getElementById('reject-btn')!.addEventListener('click', onReject);
    document.getElementById('accept-btn')!.addEventListener('click', onAccept);

    const res = runHeuristicOnce(document, 'reject');
    expect(res.clicked).toBe(true);
    expect(res.label).toBe('Alle ablehnen');
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();

    // Idempotent: second scan does not click again
    const second = runHeuristicOnce(document, 'reject');
    expect(second.clicked).toBe(false);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('clicks "Nur notwendige" when no explicit reject-all button exists', () => {
    const onEssential = vi.fn();
    document.body.innerHTML = `
      <div id="cookie-banner" style="position: fixed; bottom: 0;">
        <p>Diese Webseite verwendet Cookies und Tracking-Technologien.</p>
        <button id="essential">Nur notwendige</button>
        <button id="all">Alle zulassen</button>
      </div>
    `;
    document.getElementById('essential')!.addEventListener('click', onEssential);

    const res = runHeuristicOnce(document, 'reject');
    expect(res.clicked).toBe(true);
    expect(onEssential).toHaveBeenCalledTimes(1);
  });

  it('handles cookie banners mounted inside an open Shadow DOM', () => {
    const onReject = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <div role="dialog" class="cmp-dialog">
        <p>We use cookies to improve privacy and analytics.</p>
        <button id="shadow-reject">Reject all</button>
        <button id="shadow-accept">Accept all</button>
      </div>
    `;
    shadow.getElementById('shadow-reject')!.addEventListener('click', onReject);

    const res = runHeuristicOnce(document, 'reject');
    expect(res.clicked).toBe(true);
    expect(res.label).toBe('Reject all');
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('refuses to click inside a PUR-Abo paywall consent banner', () => {
    const onPaywall = vi.fn();
    document.body.innerHTML = `
      <div role="dialog" aria-modal="true" class="consent-dialog">
        <p>Entscheiden Sie sich für Cookies mit Werbung oder unser PUR-Abo für 4,99 € pro Monat.</p>
        <button id="abo">PUR-Abo abschließen</button>
        <button id="reject-fake">Ablehnen</button>
      </div>
    `;
    document.getElementById('reject-fake')!.addEventListener('click', onPaywall);

    const res = runHeuristicOnce(document, 'reject');
    expect(res.clicked).toBe(false);
    expect(onPaywall).not.toHaveBeenCalled();
  });

  it('ignores normal non-cookie dialogs', () => {
    const onDecline = vi.fn();
    document.body.innerHTML = `
      <div role="dialog" aria-modal="true">
        <h2>Einladung zum Termin</h2>
        <p>Möchten Sie diese Besprechung annehmen?</p>
        <button id="decline-meeting">Ablehnen</button>
      </div>
    `;
    document.getElementById('decline-meeting')!.addEventListener('click', onDecline);

    const res = runHeuristicOnce(document, 'reject');
    expect(res.clicked).toBe(false);
    expect(onDecline).not.toHaveBeenCalled();
  });

  it('clicks "Alle akzeptieren" in accept mode (Payback / Whitelist)', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();

    document.body.innerHTML = `
      <div role="dialog" aria-modal="true" id="payback-consent">
        <h2>Cookie-Einstellungen</h2>
        <p>Damit wir deine Punkte richtig zuordnen können, benötigen wir deine Einwilligung zu Cookies.</p>
        <button id="pb-reject">Nur notwendige</button>
        <button id="pb-accept">Alle akzeptieren</button>
      </div>
    `;
    document.getElementById('pb-accept')!.addEventListener('click', onAccept);
    document.getElementById('pb-reject')!.addEventListener('click', onReject);

    const res = runHeuristicOnce(document, 'accept');
    expect(res.clicked).toBe(true);
    expect(res.label).toBe('Alle akzeptieren');
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).not.toHaveBeenCalled();
  });

  it('accepts unavoidable PUR-Abo paywall (Augsburger Allgemeine pattern) without clicking paid offer', () => {
    const onAccept = vi.fn();
    const onAbo = vi.fn();

    document.body.innerHTML = `
      <div id="pur_layer" class="pgwl_purGatewayLayer" style="position: fixed; z-index: 999999;">
        <div class="pgwl_purGatewayLayer-content" role="alertdialog">
          <div class="pgwl_purGatewayLayer-body">
            <div id="pgwl_pur-option-accept-content" class="pgwl_purGatewayLayer-body-option">
              <div id="pgwl_pur-option-accept-headline-text" class="pgwl_purGatewayLayer-body-option-headline">Weiter mit Tracking durch Dritte</div>
              <p>Details zu Cookies finden Sie in der Datenschutzerklärung und in den Privatsphäre-Einstellungen.</p>
              <a href="#">Privatsphäre-Einstellungen</a>
            </div>
            <div class="pgwl_purGatewayLayer-body-action">
              <button id="pgwl_pur-option-accept-button">AKZEPTIEREN UND WEITER</button>
            </div>
            <div id="pgwl_pur-option-abo-content" class="pgwl_purGatewayLayer-body-option">
              <div class="pgwl_purGatewayLayer-body-option-headline">Weiter mit dem PUR-Abo</div>
              <p>Nutzen Sie unser Angebot ohne Werbetracking durch Dritte zu einem Vorzugspreis.</p>
            </div>
            <div class="pgwl_purGatewayLayer-body-action">
              <button id="pgwl_pur-option-abo-button">ZUM ANGEBOT</button>
            </div>
            <div id="pgwl_pur-legal-information" class="pgwl_purGatewayLayer-body-legal-information">
              Datenschutzinformationen und Cookies
            </div>
          </div>
        </div>
      </div>
    `;
    document.getElementById('pgwl_pur-option-accept-button')!.addEventListener('click', onAccept);
    document.getElementById('pgwl_pur-option-abo-button')!.addEventListener('click', onAbo);

    // Reject pass does NOT touch paywall
    expect(runHeuristicOnce(document, 'reject').clicked).toBe(false);

    // Unavoidable fallback clicks AKZEPTIEREN UND WEITER and NEVER clicks ZUM ANGEBOT
    const res = runUnavoidableAcceptOnce(document);
    expect(res.clicked).toBe(true);
    expect(res.action).toBe('accepted-unavoidable');
    expect(res.label).toBe('AKZEPTIEREN UND WEITER');
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAbo).not.toHaveBeenCalled();
  });

  it('accepts pure accept-only notice banners without reject or settings buttons', () => {
    const onOk = vi.fn();
    document.body.innerHTML = `
      <div role="dialog" class="cookie-notice">
        <p>Diese Webseite verwendet technisch notwendige Cookies.</p>
        <button id="ok-btn">Einverstanden</button>
      </div>
    `;
    document.getElementById('ok-btn')!.addEventListener('click', onOk);

    const res = runUnavoidableAcceptOnce(document);
    expect(res.clicked).toBe(true);
    expect(res.action).toBe('accepted-unavoidable');
    expect(onOk).toHaveBeenCalledTimes(1);
  });

  it('never triggers unavoidable accept if a Reject or Settings button exists on a normal banner', () => {
    const onAccept = vi.fn();
    document.body.innerHTML = `
      <div role="dialog" class="cookie-modal">
        <p>Wir verwenden Cookies für Analyse.</p>
        <button id="settings">Einstellungen</button>
        <button id="accept">Alle akzeptieren</button>
      </div>
    `;
    document.getElementById('accept')!.addEventListener('click', onAccept);

    const res = runUnavoidableAcceptOnce(document);
    expect(res.clicked).toBe(false);
    expect(onAccept).not.toHaveBeenCalled();
  });
});
