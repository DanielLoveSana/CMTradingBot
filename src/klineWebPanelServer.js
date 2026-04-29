const fs = require('fs');
const http = require('http');
const path = require('path');

const {
  DEFAULT_HISTORICAL_OPTIONS,
  DEFAULT_REALTIME_OPTIONS,
  SUPPORTED_PROXY_PROTOCOLS,
  SUPPORTED_SEARCH_TYPES,
  SUPPORTED_SERVERS,
  exportHistoricalKlines,
  normalizeHistoricalOptions,
  normalizeRealtimeOptions,
  startRealtimeListener,
} = require('./klineService');
const { formatErrorMessage, genSessionID } = require('./utils');

const DEFAULT_PANEL_OPTIONS = Object.freeze({
  host: '127.0.0.1',
  port: 3210,
  title: 'TradingView K-Line Control Room',
  publicDir: path.join(__dirname, '..', 'web', 'kline-panel'),
});

const JSON_LIMIT_BYTES = 1024 * 1024;
const EVENT_HISTORY_LIMIT = 200;

function normalizePanelOptions(input = {}) {
  const raw = { ...DEFAULT_PANEL_OPTIONS, ...input };
  const port = Number.parseInt(raw.port, 10);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${raw.port}`);
  }

  const host = String(raw.host || DEFAULT_PANEL_OPTIONS.host).trim()
    || DEFAULT_PANEL_OPTIONS.host;
  const title = String(raw.title || DEFAULT_PANEL_OPTIONS.title).trim()
    || DEFAULT_PANEL_OPTIONS.title;
  const publicDir = path.isAbsolute(raw.publicDir)
    ? raw.publicDir
    : path.resolve(process.cwd(), raw.publicDir);

  return {
    host,
    port,
    title,
    publicDir,
  };
}

function buildContentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function sendError(res, statusCode, error) {
  sendJson(res, statusCode, {
    ok: false,
    error: formatErrorMessage(error),
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > JSON_LIMIT_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${formatErrorMessage(error)}`));
      }
    });

    req.on('error', reject);
  });
}

function sortListeners(left, right) {
  const rightTime = Date.parse(right.lastEventAt || right.startedAt || 0);
  const leftTime = Date.parse(left.lastEventAt || left.startedAt || 0);
  return rightTime - leftTime;
}

function createPendingListenerState(listenerId, options = {}) {
  const now = new Date().toISOString();

  return {
    id: listenerId,
    mode: 'realtime',
    status: 'starting',
    inputSymbol: options.symbol || '',
    resolvedSymbol: '',
    resolution: null,
    timeframe: options.timeframe || '',
    range: options.range ?? '',
    server: options.server || 'auto',
    proxy: options.proxy || '',
    outputPath: '',
    connected: false,
    symbolLoaded: false,
    initialized: false,
    startedAt: now,
    stoppedAt: null,
    stopReason: null,
    error: null,
    periodCount: 0,
    latestPeriod: null,
    symbolInfo: null,
    options,
    lastEventAt: now,
  };
}

function loadStaticAssets(publicDir) {
  const files = ['index.html', 'styles.css', 'app.js'];

  return files.reduce((assets, name) => {
    const filePath = path.join(publicDir, name);
    assets[name] = {
      body: fs.readFileSync(filePath),
      contentType: buildContentType(filePath),
    };
    return assets;
  }, {});
}

async function startKlineWebPanel(input = {}) {
  const options = normalizePanelOptions(input);
  const assets = loadStaticAssets(options.publicDir);
  const eventClients = new Set();
  const eventHistory = [];
  const listenerStates = new Map();
  const activeControllers = new Map();

  let closing = false;
  let server;

  const broadcast = (payload) => {
    const enriched = {
      timestamp: payload.timestamp || new Date().toISOString(),
      ...payload,
    };

    eventHistory.push(enriched);
    if (eventHistory.length > EVENT_HISTORY_LIMIT) {
      eventHistory.splice(0, eventHistory.length - EVENT_HISTORY_LIMIT);
    }

    const data = `data: ${JSON.stringify(enriched)}\n\n`;
    eventClients.forEach((res) => {
      res.write(data);
    });
  };

  const getState = () => ({
    ok: true,
    panel: {
      host: options.host,
      port: options.port,
      title: options.title,
      url: `http://${options.host}:${options.port}`,
    },
    constants: {
      supportedServers: SUPPORTED_SERVERS,
      supportedProxyProtocols: SUPPORTED_PROXY_PROTOCOLS,
      supportedSearchTypes: SUPPORTED_SEARCH_TYPES,
    },
    defaults: {
      historical: normalizeHistoricalOptions(DEFAULT_HISTORICAL_OPTIONS),
      realtime: normalizeRealtimeOptions(DEFAULT_REALTIME_OPTIONS),
    },
    listeners: [...listenerStates.values()].sort(sortListeners),
    recentEvents: [...eventHistory],
  });

  const createHistoricalHooks = (jobId) => ({
    onLog(entry) {
      broadcast({
        type: 'log',
        scope: 'export',
        jobId,
        level: entry.level,
        message: entry.message,
        timestamp: entry.timestamp,
      });
    },
    onEvent(event) {
      broadcast({
        scope: 'export',
        jobId,
        ...event,
      });
    },
  });

  const createRealtimeHooks = (listenerId) => ({
    listenerId,
    onLog(entry) {
      broadcast({
        type: 'log',
        scope: 'listener',
        listenerId,
        level: entry.level,
        message: entry.message,
        timestamp: entry.timestamp,
      });
    },
    onStateChange(state) {
      listenerStates.set(listenerId, state);
      if (state.status === 'stopped' || state.status === 'error') {
        activeControllers.delete(listenerId);
      }

      broadcast({
        type: 'listener-state',
        scope: 'listener',
        listenerId,
        listener: state,
      });
    },
    onEvent(event) {
      if (event.listener) {
        listenerStates.set(listenerId, event.listener);
      }

      if (event.type === 'listener-stopped' || event.type === 'listener-error') {
        activeControllers.delete(listenerId);
      }

      broadcast({
        scope: 'listener',
        listenerId,
        ...event,
      });
    },
  });

  const serveAsset = (res, name) => {
    const asset = assets[name];
    if (!asset) {
      sendText(res, 404, 'Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': asset.contentType,
      'Cache-Control': 'no-store',
    });
    res.end(asset.body);
  };

  const handleStartExport = async (req, res) => {
    const jobId = genSessionID('exp');
    const payload = await readJsonBody(req);

    broadcast({
      type: 'export-requested',
      scope: 'export',
      jobId,
      options: payload,
    });

    try {
      const result = await exportHistoricalKlines(payload, createHistoricalHooks(jobId));
      sendJson(res, 200, {
        ok: true,
        jobId,
        result,
      });
    } catch (error) {
      const message = formatErrorMessage(error);
      broadcast({
        type: 'export-failed',
        scope: 'export',
        jobId,
        error: message,
      });
      sendJson(res, 500, {
        ok: false,
        jobId,
        error: message,
      });
    }
  };

  const handleStartListener = async (req, res) => {
    const listenerId = genSessionID('rtl');
    const payload = await readJsonBody(req);
    const pendingState = createPendingListenerState(listenerId, payload);

    listenerStates.set(listenerId, pendingState);
    broadcast({
      type: 'listener-queued',
      scope: 'listener',
      listenerId,
      listener: pendingState,
    });

    try {
      const controller = await startRealtimeListener(
        payload,
        createRealtimeHooks(listenerId),
      );

      activeControllers.set(listenerId, controller);
      listenerStates.set(listenerId, controller.getState());

      controller.whenStopped.then((finalState) => {
        listenerStates.set(listenerId, finalState);
        activeControllers.delete(listenerId);
      }).catch(() => {});

      sendJson(res, 201, {
        ok: true,
        listener: controller.getState(),
      });
    } catch (error) {
      const message = formatErrorMessage(error);
      const failedState = {
        ...listenerStates.get(listenerId),
        status: 'error',
        error: message,
        stoppedAt: new Date().toISOString(),
        lastEventAt: new Date().toISOString(),
      };

      listenerStates.set(listenerId, failedState);
      activeControllers.delete(listenerId);

      broadcast({
        type: 'listener-error',
        scope: 'listener',
        listenerId,
        listener: failedState,
        error: message,
      });

      sendJson(res, 500, {
        ok: false,
        listenerId,
        error: message,
      });
    }
  };

  const handleStopListener = async (res, listenerId) => {
    const controller = activeControllers.get(listenerId);

    if (!controller) {
      if (listenerStates.has(listenerId)) {
        sendJson(res, 409, {
          ok: false,
          error: 'Listener is not active',
          listener: listenerStates.get(listenerId),
        });
        return;
      }

      sendJson(res, 404, {
        ok: false,
        error: `Unknown listener: ${listenerId}`,
      });
      return;
    }

    const finalState = await controller.stop('Stopped from web panel');
    listenerStates.set(listenerId, finalState);
    activeControllers.delete(listenerId);

    sendJson(res, 200, {
      ok: true,
      listener: finalState,
    });
  };

  const handleSse = (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });

    res.write(`data: ${JSON.stringify({
      type: 'panel-state',
      state: getState(),
      timestamp: new Date().toISOString(),
    })}\n\n`);

    eventClients.add(res);
    req.on('close', () => {
      eventClients.delete(res);
    });
  };

  const requestHandler = async (req, res) => {
    const baseUrl = `http://${req.headers.host || `${options.host}:${options.port}`}`;
    const url = new URL(req.url || '/', baseUrl);
    const { pathname } = url;
    const method = req.method || 'GET';

    if (method === 'GET' && pathname === '/') {
      serveAsset(res, 'index.html');
      return;
    }

    if (method === 'GET' && pathname === '/styles.css') {
      serveAsset(res, 'styles.css');
      return;
    }

    if (method === 'GET' && pathname === '/app.js') {
      serveAsset(res, 'app.js');
      return;
    }

    if (method === 'GET' && pathname === '/api/state') {
      sendJson(res, 200, getState());
      return;
    }

    if (method === 'GET' && pathname === '/api/events') {
      handleSse(req, res);
      return;
    }

    if (method === 'POST' && pathname === '/api/export') {
      await handleStartExport(req, res);
      return;
    }

    if (method === 'POST' && pathname === '/api/listeners') {
      await handleStartListener(req, res);
      return;
    }

    if (method === 'POST' && pathname.startsWith('/api/listeners/')) {
      const parts = pathname.split('/').filter(Boolean);
      const listenerId = parts[2];
      const action = parts[3];

      if (action === 'stop' && listenerId) {
        await handleStopListener(res, listenerId);
        return;
      }
    }

    sendText(res, 404, 'Not found');
  };

  const handle = await new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      requestHandler(req, res).catch((error) => {
        const statusCode = error.message === 'Request body too large' ? 413 : 500;
        sendError(res, statusCode, error);
      });
    });

    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.removeListener('error', reject);

      resolve({
        options,
        url: `http://${options.host}:${options.port}`,
        getState,
        async close() {
          if (closing) return;
          closing = true;

          const controllers = [...activeControllers.values()];
          await Promise.all(controllers.map((controller) => (
            controller.stop('Panel shutdown').catch(() => {})
          )));

          eventClients.forEach((client) => {
            client.end();
          });
          eventClients.clear();

          await new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          });
        },
      });
    });
  });

  broadcast({
    type: 'panel-started',
    scope: 'panel',
    url: handle.url,
    title: options.title,
  });

  return handle;
}

module.exports = {
  DEFAULT_PANEL_OPTIONS,
  normalizePanelOptions,
  startKlineWebPanel,
};
