import { describe, expect, it } from 'bun:test';
import {
  buildFeedbackPayload,
  buildMailtoUrl,
  buildMessage,
  buildSubject,
  FEEDBACK_TARGET_EMAIL,
  type FeedbackDiagnostics,
  type FeedbackInput
} from './feedback';

const diagnostics: FeedbackDiagnostics = {
  appVersion: '1.2.3',
  platform: 'desktop',
  os: 'win32',
  serversConnected: 2,
  locale: 'en-US',
  userAgent: 'REEF/test'
};

const bug: FeedbackInput = {
  type: 'bug',
  title: '  Voice cuts out  ',
  description: 'Audio drops after a minute.',
  steps: 'Join voice, wait 60s',
  contactEmail: ' me@example.com '
};

describe('feedback core', () => {
  it('tags the subject by type and trims the title', () => {
    expect(buildSubject(bug)).toBe('[REEF Bug] Voice cuts out');
    expect(buildSubject({ ...bug, type: 'feature' })).toBe(
      '[REEF Feature] Voice cuts out'
    );
  });

  it('includes steps for bugs and always appends diagnostics', () => {
    const message = buildMessage(bug, diagnostics);

    expect(message).toContain('Audio drops after a minute.');
    expect(message).toContain('Steps to reproduce:');
    expect(message).toContain('App version: 1.2.3');
    expect(message).toContain('Servers connected: 2');
  });

  it('omits the steps section for feature requests', () => {
    const message = buildMessage({ ...bug, type: 'feature' }, diagnostics);

    expect(message).not.toContain('Steps to reproduce:');
  });

  it('builds a payload with a trimmed reply-to and empty honeypot', () => {
    const payload = buildFeedbackPayload(bug, diagnostics, 'key-123');

    expect(payload.access_key).toBe('key-123');
    expect(payload.subject).toBe('[REEF Bug] Voice cuts out');
    expect(payload.replyto).toBe('me@example.com');
    expect(payload.botcheck).toBe('');
  });

  it('leaves reply-to undefined when no contact email is given', () => {
    const payload = buildFeedbackPayload(
      { ...bug, contactEmail: '   ' },
      diagnostics,
      'k'
    );

    expect(payload.replyto).toBeUndefined();
  });

  it('never leaks sensitive context into the message', () => {
    const message = buildMessage(bug, diagnostics).toLowerCase();

    expect(message).not.toContain('token');
    expect(message).not.toContain('password');
    // Server hosts are never part of the diagnostics shape.
    expect(message).not.toContain('http://');
    expect(message).not.toContain('https://');
  });

  it('targets the REEF inbox in the mailto fallback', () => {
    const url = buildMailtoUrl(bug, diagnostics);

    expect(url.startsWith(`mailto:${FEEDBACK_TARGET_EMAIL}?`)).toBe(true);
    expect(url).toContain(encodeURIComponent('[REEF Bug] Voice cuts out'));
  });
});
