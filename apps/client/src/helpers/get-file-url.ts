import type { TFile } from '@sharkord/shared';
import { isLocalHost, isStandalone } from './standalone';

const getHostFromServer = () => {
  if (import.meta.env.MODE === 'development') {
    return 'localhost:4991';
  }

  return window.location.host;
};

const getUrlFromServer = () => {
  if (import.meta.env.MODE === 'development') {
    return 'http://localhost:4991';
  }

  const host = window.location.host;
  const currentProtocol = window.location.protocol;

  const finalUrl = `${currentProtocol}//${host}`;

  return finalUrl;
};

/**
 * Build the HTTP(S) base URL for an arbitrary server host (used by the
 * multi-server add-server flow). Mirrors the page protocol, so a dev client on
 * http reaches http hosts and a deployed https client reaches https hosts.
 */
const getUrlForHost = (host: string) => {
  if (/^https?:\/\//.test(host)) {
    return host.replace(/\/+$/, '');
  }

  // In native shells the page protocol is file:// / capacitor://, so it can't
  // tell us whether a bare remote host is TLS. Default remote hosts to https
  // there (keep localhost on http); in the browser, mirror the page protocol.
  const secure = isStandalone()
    ? !isLocalHost(host)
    : window.location.protocol === 'https:';

  return `${secure ? 'https:' : 'http:'}//${host.replace(/\/+$/, '')}`;
};

const buildFileUrl = (baseUrl: string, file: TFile) => {
  let url = `${baseUrl}/public/${file.name}`;

  if (file._accessToken) {
    url += `?accessToken=${file._accessToken}`;

    if (file._accessTokenExpiresAt) {
      url += `&expires=${file._accessTokenExpiresAt}`;
    }
  }

  return encodeURI(url);
};

const getFileUrl = (file: TFile | undefined | null) => {
  if (!file) return '';

  return buildFileUrl(getUrlFromServer(), file);
};

/**
 * Resolve a file URL against a specific server host rather than the active one.
 * Used for cross-server assets (e.g. a notification avatar from a backgrounded
 * server, which must resolve against that server's host). (UNCORD_PLAN.md §3.5)
 */
const getFileUrlForHost = (host: string, file: TFile | undefined | null) => {
  if (!file) return '';

  return buildFileUrl(getUrlForHost(host), file);
};

export {
  getFileUrl,
  getFileUrlForHost,
  getHostFromServer,
  getUrlForHost,
  getUrlFromServer
};
