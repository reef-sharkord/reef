/**
 * Feedback (bug report / feature request) core — pure formatting only.
 *
 * Kept free of app imports so it can be unit-tested in isolation. The I/O side
 * (collecting diagnostics, POSTing to the form-to-email service, the mailto
 * fallback) lives in feedback-transport.ts.
 */

export type FeedbackType = 'bug' | 'feature';

export type FeedbackInput = {
  type: FeedbackType;
  title: string;
  description: string;
  steps?: string; // bug only
  contactEmail?: string; // optional, used as reply-to
};

// Basic, non-sensitive context attached to every report. Deliberately excludes
// server hosts, tokens, passwords, and message content.
export type FeedbackDiagnostics = {
  appVersion: string;
  platform: 'desktop' | 'mobile' | 'web';
  os: string;
  serversConnected: number;
  locale: string;
  userAgent: string;
};

export type FeedbackPayload = {
  access_key: string;
  subject: string;
  from_name: string;
  replyto?: string;
  message: string;
  botcheck: string;
};

export const FEEDBACK_TARGET_EMAIL = 'reefsharkordlobby@gmail.com';

const typeLabel = (type: FeedbackType): string =>
  type === 'bug' ? 'Bug' : 'Feature';

export const buildSubject = (input: FeedbackInput): string =>
  `[REEF ${typeLabel(input.type)}] ${input.title.trim()}`;

export const buildDiagnosticsText = (d: FeedbackDiagnostics): string =>
  [
    `App version: ${d.appVersion}`,
    `Platform: ${d.platform}`,
    `OS: ${d.os}`,
    `Servers connected: ${d.serversConnected}`,
    `Locale: ${d.locale}`,
    `User agent: ${d.userAgent}`
  ].join('\n');

export const buildMessage = (
  input: FeedbackInput,
  diagnostics: FeedbackDiagnostics
): string => {
  const parts: string[] = [input.description.trim()];

  if (input.type === 'bug' && input.steps?.trim()) {
    parts.push('', 'Steps to reproduce:', input.steps.trim());
  }

  parts.push('', '— Diagnostics —', buildDiagnosticsText(diagnostics));

  return parts.join('\n');
};

export const buildFeedbackPayload = (
  input: FeedbackInput,
  diagnostics: FeedbackDiagnostics,
  accessKey: string
): FeedbackPayload => {
  const email = input.contactEmail?.trim();

  return {
    access_key: accessKey,
    subject: buildSubject(input),
    from_name: 'REEF Feedback',
    replyto: email ? email : undefined,
    message: buildMessage(input, diagnostics),
    // Honeypot: real submissions leave this empty; bots that fill it are dropped.
    botcheck: ''
  };
};

export const buildMailtoUrl = (
  input: FeedbackInput,
  diagnostics: FeedbackDiagnostics
): string => {
  const subject = encodeURIComponent(buildSubject(input));
  const body = encodeURIComponent(buildMessage(input, diagnostics));

  return `mailto:${FEEDBACK_TARGET_EMAIL}?subject=${subject}&body=${body}`;
};
