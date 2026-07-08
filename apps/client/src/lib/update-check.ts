import { setUpdateState } from '@/lib/update-state';

/**
 * Release check for shells that can't self-update (portable desktop exe,
 * Android APK): ask the GitHub API for the latest release and compare its tag
 * against the version this build shipped with. On a newer release, the update
 * cue points at the release page. Plain GitHub API — no Google services, no
 * account, ~2 requests/day against a 60/hour anonymous limit.
 */

const LATEST_RELEASE_API =
  'https://api.github.com/repos/reef-sharkord/reef/releases/latest';

export const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

type LatestRelease = {
  tag_name?: string;
  html_url?: string;
};

/** "v0.1.5" / "0.1.5-WIP" → [0, 1, 5]; invalid → null. */
const parseVersion = (raw: string): number[] | null => {
  const match = raw.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);

  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

const isNewer = (candidate: string, current: string): boolean => {
  const a = parseVersion(candidate);
  const b = parseVersion(current);

  if (!a || !b) {
    return false;
  }

  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) {
      return a[i] > b[i];
    }
  }

  return false;
};

/** One check; safe to call repeatedly. Failures are silent (offline, API limit). */
export const checkLatestRelease = async (): Promise<void> => {
  try {
    const response = await fetch(LATEST_RELEASE_API, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/vnd.github+json' }
    });

    if (!response.ok) {
      return;
    }

    const release = (await response.json()) as LatestRelease;

    if (!release.tag_name || !release.html_url) {
      return;
    }

    if (isNewer(release.tag_name, VITE_REEF_VERSION)) {
      setUpdateState({
        status: 'available',
        version: release.tag_name.replace(/^v/, ''),
        url: release.html_url
      });
    }
  } catch {
    // offline / rate-limited — next tick tries again
  }
};
