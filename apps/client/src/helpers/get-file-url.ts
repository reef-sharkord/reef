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

const getFileUrl = (file: TFile | undefined | null) => {
  if (!file) return '';

  const url = getUrlFromServer();

  let baseUrl = `${url}/public/${file.name}`;

  if (file._accessToken) {
    baseUrl += `?accessToken=${file._accessToken}`;

    if (file._accessTokenExpiresAt) {
      baseUrl += `&expires=${file._accessTokenExpiresAt}`;
    }
  }

  return encodeURI(baseUrl);
};

export { getFileUrl, getHostFromServer, getUrlForHost, getUrlFromServer };
