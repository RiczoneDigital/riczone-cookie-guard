import AutoConsent, {
  type AutoConsentCMPRule,
  type Config,
  type ContentScriptMessage,
  type RuleBundle,
} from '@duckduckgo/autoconsent';
import rulesJson from '@duckduckgo/autoconsent/rules/rules.json';

export type AutoConsentMode = 'optOut' | 'optIn';

export interface AutoConsentRunnerCallbacks {
  mode: AutoConsentMode;
  sendEvalSnippet: (snippetId: string) => Promise<boolean>;
  onActionResult: (info: { cmp: string; success: boolean }) => void;
}

export interface AutoConsentHandle {
  isHandled: () => boolean;
  isPopupDetected: () => boolean;
}

const typedRules: RuleBundle = {
  autoconsent: (rulesJson as { autoconsent: AutoConsentCMPRule[] }).autoconsent,
};

export function startAutoConsentRunner(
  callbacks: AutoConsentRunnerCallbacks,
): AutoConsentHandle {
  let handled = false;
  let popupDetected = false;
  let reported = false;
  let consent: AutoConsent | null = null;

  const reportOnce = (cmp: string, success: boolean) => {
    if (reported) {
      return;
    }
    reported = true;
    if (success) {
      handled = true;
    }
    callbacks.onActionResult({ cmp: cmp || 'AutoConsent', success });
  };

  const sendContentMessage = async (message: ContentScriptMessage): Promise<void> => {
    switch (message.type) {
      case 'eval': {
        let evalResult = false;
        if (message.snippetId) {
          try {
            evalResult = await callbacks.sendEvalSnippet(message.snippetId);
          } catch {
            evalResult = false;
          }
        }
        if (consent) {
          await consent.receiveMessageCallback({
            type: 'evalResp',
            id: message.id,
            result: evalResult,
          });
        }
        break;
      }

      case 'popupFound': {
        popupDetected = true;
        break;
      }

      case 'autoconsentDone': {
        handled = true;
        reportOnce(message.cmp, true);
        break;
      }

      case 'optOutResult': {
        if (callbacks.mode === 'optOut' && message.result) {
          handled = true;
          reportOnce(message.cmp, true);
        }
        break;
      }

      case 'optInResult': {
        if (callbacks.mode === 'optIn' && message.result) {
          handled = true;
          reportOnce(message.cmp, true);
        }
        break;
      }

      default:
        break;
    }
  };

  const config: Partial<Config> = {
    enabled: true,
    autoAction: callbacks.mode,
    disabledCmps: [],
    enablePrehide: callbacks.mode === 'optOut',
    enableCosmeticRules: callbacks.mode === 'optOut',
    enableGeneratedRules: true,
    detectRetries: 20,
    isMainWorld: false,
    prehideTimeout: 2000,
    enableHeuristicDetection: callbacks.mode === 'optOut',
    enablePopupMutationObserver: true,
    visualTest: false,
    heuristicMode: callbacks.mode === 'optOut' ? 'reject' : 'off',
    logs: {
      lifecycle: false,
      rulesteps: false,
      detectionsteps: false,
      evals: false,
      errors: false,
      messages: false,
      waits: false,
    },
  };

  // Pass config=null to constructor so AutoConsent creates `this.domActions` before
  // `initialize()` invokes `prehideElements()` (upstream constructor ordering bug in 18.x).
  consent = new AutoConsent(sendContentMessage, null, null);
  consent.initialize(config, typedRules);

  return {
    isHandled: () => handled,
    isPopupDetected: () => popupDetected,
  };
}
