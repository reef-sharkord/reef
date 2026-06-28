import type { TFile } from '@sharkord/shared';

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

  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';

  return `${protocol}//${host}`;
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
