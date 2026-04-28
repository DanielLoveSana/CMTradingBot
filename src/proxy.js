const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const HTTP_PROTOCOLS = new Set(['http', 'https']);
const SOCKS_PROTOCOLS = new Set(['socks', 'socks4', 'socks4a', 'socks5', 'socks5h']);

function normalizeProxyUrl(proxy = '') {
  if (!proxy) return '';

  const value = String(proxy).trim();
  if (!value) return '';

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;

  // Local development proxies often expose SOCKS on ports like 1080/10808.
  return `socks5://${value}`;
}

function getProxyProtocol(proxyUrl = '') {
  if (!proxyUrl) return '';
  return new URL(proxyUrl).protocol.replace(':', '').toLowerCase();
}

function createProxyAgent(proxy = '') {
  const proxyUrl = normalizeProxyUrl(proxy);
  if (!proxyUrl) return null;

  const protocol = getProxyProtocol(proxyUrl);

  if (SOCKS_PROTOCOLS.has(protocol)) {
    return new SocksProxyAgent(proxyUrl);
  }

  if (HTTP_PROTOCOLS.has(protocol)) {
    return new HttpsProxyAgent(proxyUrl);
  }

  throw new Error(`Unsupported proxy protocol: ${protocol}`);
}

function getAxiosProxyConfig(proxy = '') {
  const agent = createProxyAgent(proxy);
  if (!agent) return {};

  return {
    httpAgent: agent,
    httpsAgent: agent,
    proxy: false,
  };
}

module.exports = {
  normalizeProxyUrl,
  getProxyProtocol,
  createProxyAgent,
  getAxiosProxyConfig,
};
