import { startAutoConsentRunner } from '../src/engine/autoconsent-runner';
import { startHeuristicWatcher } from '../src/engine/heuristic-fallback';
import { t } from '../src/shared/i18n';
import type { ResolvedPolicy } from '../src/shared/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  async main() {
    if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') {
      return;
    }

    let resolved: ResolvedPolicy;
    try {
      resolved = (await browser.runtime.sendMessage({
        type: 'rcg:get-policy',
        url: window.location.href,
      })) as ResolvedPolicy;
    } catch {
      return;
    }

    if (!resolved || resolved.policy === 'disabled' || resolved.policy === 'ignore') {
      return;
    }

    const domain = resolved.domain || window.location.hostname;
    const mode = resolved.policy === 'accept' ? 'optIn' : 'optOut';
    const actionLabel = resolved.policy === 'accept' ? 'accepted' : 'rejected';

    let alreadyReported = false;

    const reportAction = (
      cmp: string,
      source: 'autoconsent' | 'heuristic',
      overrideAction?: 'rejected' | 'accepted' | 'accepted-unavoidable',
    ) => {
      if (alreadyReported) {
        return;
      }
      alreadyReported = true;
      void browser.runtime
        .sendMessage({
          type: 'rcg:report-action',
          domain,
          cmp,
          action: overrideAction ?? actionLabel,
          source,
        })
        .catch(() => undefined);
    };

    const runner = startAutoConsentRunner({
      mode,
      sendEvalSnippet: async (snippetId) => {
        try {
          const resp = (await browser.runtime.sendMessage({
            type: 'rcg:eval-snippet',
            snippetId,
          })) as { result?: boolean } | undefined;
          return Boolean(resp?.result);
        } catch {
          return false;
        }
      },
      onActionResult: ({ cmp, success }) => {
        if (success) {
          reportAction(cmp, 'autoconsent');
        }
      },
    });

    if (resolved.heuristicFallback || (resolved.policy === 'reject' && resolved.acceptUnavoidableBanners)) {
      startHeuristicWatcher({
        mode: resolved.policy === 'accept' ? 'accept' : 'reject',
        acceptUnavoidable: resolved.policy === 'reject' && resolved.acceptUnavoidableBanners,
        initialDelayMs: 900,
        unavoidableDelayMs: 2200,
        maxDurationMs: 10_000,
        shouldSkip: () => alreadyReported || runner.isHandled(),
        onSuccess: (match) => {
          const prefix =
            match.action === 'accepted-unavoidable'
              ? t('sourceUnavoidable')
              : t('sourceHeuristic');
          const label = match.label ? `${prefix} (${match.label})` : prefix;
          reportAction(label, 'heuristic', match.action);
        },
      });
    }
  },
});
