const dns = require('dns');
const https = require('https');
const net = require('net');
const tls = require('tls');
const { URL } = require('url');
const { SocksClient } = require('socks');

const HTTP_PROTOCOLS = new Set(['http', 'https']);
const SOCKS_PROTOCOLS = new Set(['socks', 'socks4', 'socks4a', 'socks5', 'socks5h']);
const CONNECT_RESPONSE_LIMIT = 64 * 1024;

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

function stripIpv6Brackets(value = '') {
  return String(value).replace(/^\[|\]$/g, '');
}

function buildBasicAuthHeader(proxyUrl) {
  if (!proxyUrl.username && !proxyUrl.password) return '';

  const auth = `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`;
  return `Basic ${Buffer.from(auth).toString('base64')}`;
}

function getTargetHost(options = {}) {
  const host = options.host || options.hostname || '';
  return stripIpv6Brackets(host);
}

function getTargetPort(options = {}) {
  if (options.port) return Number.parseInt(options.port, 10);
  return isSecureEndpoint(options) ? 443 : 80;
}

function isSecureEndpoint(options = {}) {
  if (typeof options.secureEndpoint === 'boolean') {
    return options.secureEndpoint;
  }

  return options.protocol !== 'http:';
}

function assignIfDefined(target, key, value) {
  if (value !== undefined) {
    target[key] = value;
  }
}

function pickTlsOptions(options = {}, targetHost, targetPort, socket) {
  const tlsOptions = {
    socket,
    host: targetHost,
    port: targetPort,
  };

  assignIfDefined(tlsOptions, 'servername', options.servername);
  assignIfDefined(tlsOptions, 'rejectUnauthorized', options.rejectUnauthorized);
  assignIfDefined(tlsOptions, 'ALPNProtocols', options.ALPNProtocols);
  assignIfDefined(tlsOptions, 'ca', options.ca);
  assignIfDefined(tlsOptions, 'cert', options.cert);
  assignIfDefined(tlsOptions, 'ciphers', options.ciphers);
  assignIfDefined(tlsOptions, 'checkServerIdentity', options.checkServerIdentity);
  assignIfDefined(tlsOptions, 'key', options.key);
  assignIfDefined(tlsOptions, 'maxVersion', options.maxVersion);
  assignIfDefined(tlsOptions, 'minVersion', options.minVersion);
  assignIfDefined(tlsOptions, 'passphrase', options.passphrase);
  assignIfDefined(tlsOptions, 'pfx', options.pfx);
  assignIfDefined(tlsOptions, 'secureContext', options.secureContext);
  assignIfDefined(tlsOptions, 'secureProtocol', options.secureProtocol);

  if (tlsOptions.servername === undefined && targetHost && !net.isIP(targetHost)) {
    tlsOptions.servername = targetHost;
  }

  return tlsOptions;
}

function createTargetSocket(socket, options, targetHost, targetPort) {
  if (!isSecureEndpoint(options)) return socket;
  return tls.connect(pickTlsOptions(options, targetHost, targetPort, socket));
}

function connectSocket(options, secure = false) {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect(Object.fromEntries(
        Object.entries(options).filter(([, value]) => value !== undefined),
      ))
      : net.connect(options);

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onConnect = () => {
      cleanup();
      resolve(socket);
    };

    const cleanup = () => {
      socket.removeListener('error', onError);
      socket.removeListener(secure ? 'secureConnect' : 'connect', onConnect);
    };

    socket.once('error', onError);
    socket.once(secure ? 'secureConnect' : 'connect', onConnect);
  });
}

function waitForConnectResponse(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';

    const onData = (chunk) => {
      buffer += chunk.toString('latin1');

      if (buffer.length > CONNECT_RESPONSE_LIMIT) {
        cleanup();
        socket.destroy();
        reject(new Error('Proxy CONNECT response is too large'));
        return;
      }

      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      cleanup();

      const statusLine = buffer.slice(0, buffer.indexOf('\r\n'));
      const match = /^HTTP\/\d+\.\d+\s+(\d+)/i.exec(statusLine);

      if (!match) {
        socket.destroy();
        reject(new Error(`Invalid proxy CONNECT response: ${statusLine}`));
        return;
      }

      const statusCode = Number.parseInt(match[1], 10);
      if (statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Proxy CONNECT request failed with status ${statusCode}`));
        return;
      }

      resolve();
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      reject(new Error('Proxy socket closed before CONNECT completed'));
    };

    const cleanup = () => {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('close', onClose);
    };

    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);
  });
}

async function connectViaHttpProxy(proxyUrl, options = {}) {
  const targetHost = getTargetHost(options);
  const targetPort = getTargetPort(options);

  if (!targetHost) {
    throw new TypeError('No "host" provided');
  }

  const proxyHost = stripIpv6Brackets(proxyUrl.hostname || proxyUrl.host);
  const proxyPort = proxyUrl.port
    ? Number.parseInt(proxyUrl.port, 10)
    : proxyUrl.protocol === 'https:'
      ? 443
      : 80;
  const proxySocket = await connectSocket({
    host: proxyHost,
    port: proxyPort,
    servername: net.isIP(proxyHost) ? undefined : proxyHost,
  }, proxyUrl.protocol === 'https:');
  const hostHeader = net.isIPv6(targetHost) ? `[${targetHost}]` : targetHost;
  const authHeader = buildBasicAuthHeader(proxyUrl);

  let payload = `CONNECT ${hostHeader}:${targetPort} HTTP/1.1\r\n`;
  payload += `Host: ${hostHeader}:${targetPort}\r\n`;
  payload += 'Proxy-Connection: close\r\n';

  if (authHeader) {
    payload += `Proxy-Authorization: ${authHeader}\r\n`;
  }

  proxySocket.write(`${payload}\r\n`);
  await waitForConnectResponse(proxySocket);

  return createTargetSocket(proxySocket, options, targetHost, targetPort);
}

function getSocksProxyType(protocol) {
  if (protocol === 'socks4' || protocol === 'socks4a') return 4;
  if (protocol === 'socks' || protocol === 'socks5' || protocol === 'socks5h') return 5;
  throw new Error(`Unsupported proxy protocol: ${protocol}`);
}

function shouldResolveSocksHost(protocol) {
  return protocol === 'socks4' || protocol === 'socks5';
}

function lookupHostname(host, lookupFn) {
  return new Promise((resolve, reject) => {
    lookupFn(host, {}, (error, address) => {
      if (error) {
        reject(error);
        return;
      }

      if (typeof address === 'string') {
        resolve(address);
        return;
      }

      resolve(address[0] && address[0].address ? address[0].address : host);
    });
  });
}

async function connectViaSocksProxy(proxyUrl, options = {}) {
  const protocol = getProxyProtocol(proxyUrl.toString());
  const targetHost = getTargetHost(options);
  const targetPort = getTargetPort(options);

  if (!targetHost) {
    throw new TypeError('No "host" provided');
  }

  const lookupFn = typeof options.lookup === 'function' ? options.lookup : dns.lookup;
  const destinationHost = shouldResolveSocksHost(protocol)
    ? await lookupHostname(targetHost, lookupFn)
    : targetHost;
  const proxy = {
    host: stripIpv6Brackets(proxyUrl.hostname || proxyUrl.host),
    port: proxyUrl.port ? Number.parseInt(proxyUrl.port, 10) : 1080,
    type: getSocksProxyType(protocol),
  };

  if (proxyUrl.username) {
    proxy.userId = decodeURIComponent(proxyUrl.username);
  }

  if (proxyUrl.password) {
    proxy.password = decodeURIComponent(proxyUrl.password);
  }

  const result = await SocksClient.createConnection({
    proxy,
    command: 'connect',
    destination: {
      host: destinationHost,
      port: targetPort,
    },
    timeout: options.timeout,
  });

  return createTargetSocket(result.socket, options, targetHost, targetPort);
}

class ProxyAgent extends https.Agent {
  constructor(proxyUrl) {
    super();
    this.proxyUrl = new URL(proxyUrl);
  }

  createConnection(options, callback) {
    const protocol = getProxyProtocol(this.proxyUrl.toString());
    const connectPromise = SOCKS_PROTOCOLS.has(protocol)
      ? connectViaSocksProxy(this.proxyUrl, options)
      : HTTP_PROTOCOLS.has(protocol)
        ? connectViaHttpProxy(this.proxyUrl, options)
        : Promise.reject(new Error(`Unsupported proxy protocol: ${protocol}`));

    connectPromise.then(
      (socket) => callback(null, socket),
      (error) => callback(error),
    );
  }
}

function createProxyAgent(proxy = '') {
  const proxyUrl = normalizeProxyUrl(proxy);
  if (!proxyUrl) return null;

  return new ProxyAgent(proxyUrl);
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
  __private: {
    pickTlsOptions,
  },
};
