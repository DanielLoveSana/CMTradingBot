import { describe, expect, it } from 'vitest';

const https = require('https');
const {
  __private,
  createProxyAgent,
  getAxiosProxyConfig,
  getProxyProtocol,
  normalizeProxyUrl,
} = require('../src/proxy');

describe('proxy helpers', () => {
  it('normalizes proxy URLs and keeps explicit protocols', () => {
    expect(normalizeProxyUrl('127.0.0.1:10808')).toBe('socks5://127.0.0.1:10808');
    expect(normalizeProxyUrl('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
    expect(getProxyProtocol('socks5://127.0.0.1:10808')).toBe('socks5');
  });

  it('creates a proxy agent without loading ESM-only modules', () => {
    const agent = createProxyAgent('http://127.0.0.1:8080');

    expect(agent).toBeInstanceOf(https.Agent);
    expect(agent.constructor.name).toBe('ProxyAgent');
  });

  it('builds axios proxy config with shared agents', () => {
    const config = getAxiosProxyConfig('socks5://127.0.0.1:10808');

    expect(config.proxy).toBe(false);
    expect(config.httpAgent).toBe(config.httpsAgent);
    expect(config.httpsAgent).toBeInstanceOf(https.Agent);
  });

  it('omits undefined TLS callbacks before opening tunneled sockets', () => {
    const tlsOptions = __private.pickTlsOptions(
      {
        checkServerIdentity: undefined,
        rejectUnauthorized: false,
      },
      'example.com',
      443,
      { fake: true },
    );

    expect(Object.prototype.hasOwnProperty.call(tlsOptions, 'checkServerIdentity')).toBe(false);
    expect(tlsOptions.servername).toBe('example.com');
    expect(tlsOptions.rejectUnauthorized).toBe(false);
  });
});
