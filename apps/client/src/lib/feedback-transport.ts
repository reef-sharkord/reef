/**
 * Feedback transport — collects diagnostics and delivers a report.
 *
 * Delivery uses Web3Forms (a form-to-email service): we POST the report and it
 * emails FEEDBACK_TARGET_EMAIL. The access key only permits delivery to that
 * fixed address, so it is safe to ship in the client. If no key is configured
 * the submit degrades to a mailto: link so the feature still works.
 */

import { getDesktopApi } from '@/helpers/desktop';
import { isStandalone } from '@/helpers/standalone';
import { getRailServers } from '@/lib/connections';
import {
  buildFeedbackPayload,
  buildMailtoUrl,
  type FeedbackDiagnostics,
  type FeedbackInput
} from '@/lib/feedback';

const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';

// Baked-in Web3Forms access key (delivers only to reefsharkordlobby@gmail.com,
// so it's safe to ship); overridable at build time via VITE_FEEDBACK_ACCESS_KEY.
const BAKED_ACCESS_KEY = '9e90e497-cc83-4a04-9934-b6b9ac531d2a';

const getAccessKey = (): string => {
  const fromEnv = (
    import.meta.env.VITE_FEEDBACK_ACCESS_KEY as string | undefined
  )?.trim();

  return fromEnv || BAKED_ACCESS_KEY;
};

const detectPlatform = (): FeedbackDiagnostics['platform'] => {
  if (getDesktopApi()) {
    return 'desktop';
  }

  // Native but not desktop = the Capacitor mobile shell.
  if (isStandalone()) {
    return 'mobile';
  }

  return 'web';
};

export const collectDiagnostics = (): FeedbackDiagnostics => ({
  appVersion: typeof VITE_APP_VERSION === 'string' ? VITE_APP_VERSION : 'dev',
  platform: detectPlatform(),
  os: getDesktopApi()?.platform ?? navigator.platform ?? 'unknown',
  serversConnected: getRailServers().filter((s) => s.status === 'open').length,
  locale: navigator.language,
  userAgent: navigator.userAgent
});

export type FeedbackResult =
  | { ok: true; via: 'email' | 'mailto' }
  | { ok: false; error: string };

const openMailto = (input: FeedbackInput, diagnostics: FeedbackDiagnostics) => {
  window.location.href = buildMailtoUrl(input, diagnostics);
};

/** Open the mailto: fallback for the given report (used after a failed send). */
export const openFeedbackMailto = (input: FeedbackInput): void => {
  openMailto(input, collectDiagnostics());
};

export const submitFeedback = async (
  input: FeedbackInput
): Promise<FeedbackResult> => {
  const diagnostics = collectDiagnostics();
  const accessKey = getAccessKey();

  // No service key configured yet — hand off to the user's mail client so a
  // report is still delivered.
  if (!accessKey) {
    openMailto(input, diagnostics);
    return { ok: true, via: 'mailto' };
  }

  try {
    const response = await fetch(WEB3FORMS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(buildFeedbackPayload(input, diagnostics, accessKey)),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const json = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
    };

    if (json.success === false) {
      return { ok: false, error: json.message ?? 'Submission rejected' };
    }

    return { ok: true, via: 'email' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network error'
    };
  }
};
