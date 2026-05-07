const path = require('path');

const Client = require('./client');
const {
  getMarketSymbolConfigPath,
  resolveMarketSymbol,
} = require('./miscRequests');
const {
  buildHistoricalOutputPath,
  buildRealtimeOutputPath,
  formatDateTime,
  previewCsv,
  writePeriodsCsv,
} = require('./klineCsv');
const { formatErrorMessage, genSessionID } = require('./utils');

const SUPPORTED_SEARCH_TYPES = Object.freeze([
  'stock',
  'futures',
  'forex',
  'cfd',
  'crypto',
  'index',
  'economic',
]);
const SUPPORTED_SERVERS = Object.freeze(['data', 'widgetdata', 'prodata']);
const SUPPORTED_PROXY_PROTOCOLS = Object.freeze([
  'auto',
  'socks5',
  'http',
  'https',
  'socks4',
  'none',
]);

const DEFAULT_HISTORICAL_OPTIONS = Object.freeze({
  symbol: 'BINANCE:BTCUSDT',
  timeframe: '15',
  range: 200,
  to: null,
  searchType: '',
  proxy: '127.0.0.1:10808',
  proxyProtocol: 'auto',
  server: 'auto',
  outputDir: path.join(__dirname, '..', 'data', 'klines'),
  timeoutMs: 30000,
});

const DEFAULT_REALTIME_OPTIONS = Object.freeze({
  symbol: 'BINANCE:BTCUSDT',
  timeframe: '15',
  range: 200,
  searchType: '',
  proxy: '127.0.0.1:10808',
  proxyProtocol: 'auto',
  server: 'auto',
  outputDir: path.join(__dirname, '..', 'data', 'realtime'),
  connectTimeoutMs: 15000,
  exitAfterMs: 0,
});

function createConsoleLogHooks() {
  return {
    onLog(entry) {
      const writer = entry.level === 'error'
        ? console.error
        : entry.level === 'warn'
          ? console.warn
          : console.log;
      writer(entry.message);
    },
  };
}

function emitLog(hooks, level, message, extra = {}) {
  if (typeof hooks.onLog !== 'function') return;

  hooks.onLog({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...extra,
  });
}

function emitEvent(hooks, type, payload = {}) {
  if (typeof hooks.onEvent !== 'function') return;

  hooks.onEvent({
    type,
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

function emitStateChange(hooks, state) {
  if (typeof hooks.onStateChange !== 'function') return;
  hooks.onStateChange(state);
}

function parseInteger(value, name) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return parsed;
}

function parseToTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return parseInteger(value, 'to');
  }

  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid to timestamp: ${value}`);
  }

  return Math.floor(parsed / 1000);
}

function normalizeString(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function resolveOutputDir(value, fallback) {
  const target = normalizeString(value, fallback);
  if (!target) return fallback;
  if (path.isAbsolute(target)) return target;
  return path.resolve(process.cwd(), target);
}

function validateCommonOptions(options) {
  if (!options.symbol) throw new Error('symbol is required');
  if (!options.timeframe) throw new Error('timeframe is required');

  if (!Number.isInteger(options.range) || options.range === 0) {
    throw new Error('range must be a non-zero integer');
  }

  if (
    options.searchType
    && !SUPPORTED_SEARCH_TYPES.includes(options.searchType)
  ) {
    throw new Error(
      `search-type must be one of: ${SUPPORTED_SEARCH_TYPES.join(', ')}`,
    );
  }

  if (
    options.server !== 'auto'
    && !SUPPORTED_SERVERS.includes(options.server)
  ) {
    throw new Error(`server must be one of: auto, ${SUPPORTED_SERVERS.join(', ')}`);
  }

  if (!SUPPORTED_PROXY_PROTOCOLS.includes(options.proxyProtocol)) {
    throw new Error(
      `proxy-protocol must be one of: ${SUPPORTED_PROXY_PROTOCOLS.join(', ')}`,
    );
  }
}

function normalizeHistoricalOptions(input = {}) {
  const raw = { ...DEFAULT_HISTORICAL_OPTIONS, ...input };
  const options = {
    symbol: normalizeString(raw.symbol, DEFAULT_HISTORICAL_OPTIONS.symbol),
    timeframe: normalizeString(raw.timeframe, DEFAULT_HISTORICAL_OPTIONS.timeframe),
    range: parseInteger(raw.range, 'range'),
    to: parseToTimestamp(raw.to),
    searchType: normalizeString(raw.searchType).toLowerCase(),
    proxy: normalizeString(raw.proxy, DEFAULT_HISTORICAL_OPTIONS.proxy),
    proxyProtocol: normalizeString(
      raw.proxyProtocol,
      DEFAULT_HISTORICAL_OPTIONS.proxyProtocol,
    ).toLowerCase(),
    server: normalizeString(raw.server, DEFAULT_HISTORICAL_OPTIONS.server).toLowerCase(),
    outputDir: resolveOutputDir(raw.outputDir, DEFAULT_HISTORICAL_OPTIONS.outputDir),
    timeoutMs: parseInteger(raw.timeoutMs, 'timeout-ms'),
  };

  validateCommonOptions(options);

  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('timeout-ms must be a positive integer');
  }

  return {
    ...raw,
    ...options,
  };
}

function normalizeRealtimeOptions(input = {}) {
  const raw = { ...DEFAULT_REALTIME_OPTIONS, ...input };
  const options = {
    symbol: normalizeString(raw.symbol, DEFAULT_REALTIME_OPTIONS.symbol),
    timeframe: normalizeString(raw.timeframe, DEFAULT_REALTIME_OPTIONS.timeframe),
    range: parseInteger(raw.range, 'range'),
    searchType: normalizeString(raw.searchType).toLowerCase(),
    proxy: normalizeString(raw.proxy, DEFAULT_REALTIME_OPTIONS.proxy),
    proxyProtocol: normalizeString(
      raw.proxyProtocol,
      DEFAULT_REALTIME_OPTIONS.proxyProtocol,
    ).toLowerCase(),
    server: normalizeString(raw.server, DEFAULT_REALTIME_OPTIONS.server).toLowerCase(),
    outputDir: resolveOutputDir(raw.outputDir, DEFAULT_REALTIME_OPTIONS.outputDir),
    connectTimeoutMs: parseInteger(raw.connectTimeoutMs, 'connect-timeout-ms'),
    exitAfterMs: parseInteger(raw.exitAfterMs, 'exit-after-ms'),
  };

  validateCommonOptions(options);

  if (
    !Number.isInteger(options.connectTimeoutMs)
    || options.connectTimeoutMs <= 0
  ) {
    throw new Error('connect-timeout-ms must be a positive integer');
  }

  if (!Number.isInteger(options.exitAfterMs) || options.exitAfterMs < 0) {
    throw new Error('exit-after-ms must be a non-negative integer');
  }

  return options;
}

function buildProxyCandidates(options) {
  if (!options.proxy || options.proxyProtocol === 'none') return [null];

  const proxy = String(options.proxy).trim();
  if (!proxy) return [null];

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(proxy)) return [proxy];

  if (options.proxyProtocol === 'auto') {
    return [
      `socks5://${proxy}`,
      `http://${proxy}`,
    ];
  }

  return [`${options.proxyProtocol}://${proxy}`];
}

function cloneSymbolInfo(infos = {}) {
  return { ...infos };
}

function serializePeriod(period) {
  if (!period) return null;

  return {
    time: period.time,
    datetimeUtc: formatDateTime(period.time),
    open: period.open,
    high: period.max,
    low: period.min,
    close: period.close,
    volume: period.volume,
  };
}

function formatPeriod(period) {
  const serialized = serializePeriod(period);
  if (!serialized) return 'no candle data';

  return [
    `time=${serialized.datetimeUtc}`,
    `open=${serialized.open}`,
    `high=${serialized.high}`,
    `low=${serialized.low}`,
    `close=${serialized.close}`,
    `volume=${serialized.volume}`,
  ].join(' ');
}

function buildPeriodSignature(period) {
  if (!period) return '';

  return [
    period.time,
    period.open,
    period.max,
    period.min,
    period.close,
    period.volume,
  ].join('|');
}

function cloneResolution(resolution = {}) {
  return {
    input: resolution.input,
    id: resolution.id,
    alias: resolution.alias,
    exchange: resolution.exchange,
    fullExchange: resolution.fullExchange,
    symbol: resolution.symbol,
    description: resolution.description,
    type: resolution.type,
    source: resolution.source,
    cached: resolution.cached,
    persisted: resolution.persisted,
  };
}

async function resolveInputSymbol(options, hooks = {}) {
  const originalInput = options.symbol;
  const proxies = buildProxyCandidates(options);
  const errors = [];

  emitLog(
    hooks,
    'info',
    `Resolving symbol "${originalInput}"...`,
  );

  // eslint-disable-next-line no-restricted-syntax
  for (const proxy of proxies) {
    try {
      const resolution = await resolveMarketSymbol(originalInput, {
        filter: options.searchType,
        proxy,
      });

      if (resolution.source === 'cache') {
        emitLog(hooks, 'info', `Resolved "${originalInput}" from config: ${resolution.id}`);
      } else if (resolution.source === 'search') {
        emitLog(hooks, 'info', `Resolved "${originalInput}" via search: ${resolution.id}`);
        if (resolution.persisted) {
          emitLog(
            hooks,
            'info',
            `Saved symbol mapping to: ${getMarketSymbolConfigPath()}`,
          );
        }
        emitLog(hooks, 'info', `Search proxy: ${proxy || 'direct'}`);
      } else {
        emitLog(hooks, 'info', `Using full symbol: ${resolution.id}`);
        if (resolution.persisted) {
          emitLog(
            hooks,
            'info',
            `Saved direct symbol mapping to: ${getMarketSymbolConfigPath()}`,
          );
        }
      }

      if (resolution.description) {
        emitLog(hooks, 'info', `Resolved description: ${resolution.description}`);
      }

      return {
        ...options,
        inputSymbol: originalInput,
        symbol: resolution.id,
        resolution: cloneResolution(resolution),
      };
    } catch (error) {
      const message = formatErrorMessage(error);
      errors.push(`[${proxy || 'direct'}] ${message}`);

      if (proxy !== proxies[proxies.length - 1]) {
        emitLog(
          hooks,
          'warn',
          `Symbol lookup failed via ${proxy || 'direct'}: ${message}`,
        );
        emitLog(hooks, 'info', 'Retrying symbol lookup with next proxy mode...');
      } else {
        throw new Error(errors.join('\n'));
      }
    }
  }

  throw new Error(`Unable to resolve symbol "${originalInput}"`);
}

async function runHistoricalExportOnce(options, server, proxy, hooks = {}, exportOptions = {}) {
  return new Promise((resolve, reject) => {
    const client = new Client({ server, proxy });
    const chart = new client.Session.Chart();
    const expectedCount = Math.abs(options.range);

    let finishing = false;
    let finished = false;
    let cleanedUp = false;
    let settled = false;
    let settleTimer = null;
    let connected = false;
    let symbolLoaded = false;

    const resolveOnce = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const cleanup = async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearTimeout(settleTimer);
      chart.delete();
      await client.end();
    };

    const fail = async (message) => {
      if (finished || settled) return;
      clearTimeout(timeout);
      try {
        await cleanup();
      } finally {
        rejectOnce(new Error(message));
      }
    };

    const finish = async () => {
      if (finishing || finished || settled) return;
      if (!chart.periods.length) return;

      finishing = true;
      clearTimeout(timeout);

      const outputPathBuilder = typeof exportOptions.outputPathBuilder === 'function'
        ? exportOptions.outputPathBuilder
        : buildHistoricalOutputPath;
      const outputPath = outputPathBuilder(options);
      const csvContext = typeof exportOptions.buildContext === 'function'
        ? exportOptions.buildContext(chart.periods, options)
        : undefined;
      const { csv, periods } = writePeriodsCsv({
        periods: chart.periods,
        outputPath,
        order: exportOptions.order || 'asc',
        columns: exportOptions.columns,
        context: csvContext,
      });

      emitLog(hooks, 'info', `[${server}] Loaded ${periods.length} candles for ${options.symbol}`);
      emitLog(hooks, 'info', `[${server}] Timeframe: ${options.timeframe}`);
      emitLog(hooks, 'info', `[${server}] Saved CSV to: ${outputPath}`);
      emitLog(hooks, 'info', `[${server}] Preview:`);
      emitLog(hooks, 'info', previewCsv(csv, 6));

      finished = true;

      try {
        await cleanup();
      } catch (error) {
        emitLog(
          hooks,
          'warn',
          `[${server}] Cleanup warning: ${formatErrorMessage(error)}`,
        );
      }

      resolveOnce({
        mode: 'historical',
        server,
        proxy,
        outputPath,
        periodCount: periods.length,
        preview: previewCsv(csv, 6),
        resolvedSymbol: options.symbol,
        inputSymbol: options.inputSymbol,
        timeframe: options.timeframe,
        range: options.range,
        to: options.to,
        resolution: options.resolution,
        symbolInfo: cloneSymbolInfo(chart.infos),
      });
    };

    const timeout = setTimeout(() => {
      const state = [
        `connected=${connected}`,
        `symbolLoaded=${symbolLoaded}`,
        `periods=${chart.periods.length}`,
      ].join(', ');
      fail(`[${server}] Timed out after ${options.timeoutMs}ms (${state})`);
    }, options.timeoutMs);

    client.onConnected(() => {
      connected = true;
      emitLog(
        hooks,
        'info',
        `[${server}] WebSocket connected${proxy ? ` via ${proxy}` : ''}`,
      );
    });

    client.onDisconnected(() => {
      if (!finished && !cleanedUp) {
        fail(`[${server}] WebSocket disconnected before data arrived`);
      }
    });

    client.onError((...err) => {
      if (finished || cleanedUp) return;
      const details = err.filter(Boolean).join(' ') || 'unknown client error';
      fail(`[${server}] ${details}`);
    });

    chart.onError((...err) => {
      if (finished || cleanedUp) return;
      const details = err.filter(Boolean).join(' ') || 'unknown chart error';
      fail(`[${server}] Chart error: ${details}`);
    });

    chart.onSymbolLoaded(() => {
      symbolLoaded = true;
      emitLog(hooks, 'info', `[${server}] Symbol loaded: ${chart.infos.full_name}`);
    });

    chart.onUpdate(() => {
      if (!chart.periods.length || finishing || finished || settled) return;

      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        finish().catch((error) => {
          fail(`[${server}] Export error: ${formatErrorMessage(error)}`);
        });
      }, chart.periods.length >= expectedCount ? 250 : 1200);
    });

    emitLog(hooks, 'info', `Requesting ${options.symbol} (${options.timeframe}) candles...`);
    emitLog(
      hooks,
      'info',
      `Range: ${options.range}${options.to ? `, to: ${options.to}` : ''}`,
    );
    emitLog(
      hooks,
      'info',
      `Mode: public, server=${server}, proxy=${proxy || 'direct'}`,
    );

    chart.setMarket(options.symbol, {
      timeframe: options.timeframe,
      range: options.range,
      to: options.to,
    });
  });
}

async function exportHistoricalKlines(rawOptions, hooks = {}, exportOptions = {}) {
  const normalized = normalizeHistoricalOptions(rawOptions);
  const options = await resolveInputSymbol(normalized, hooks);
  const servers = options.server === 'auto'
    ? SUPPORTED_SERVERS
    : [options.server];
  const proxies = buildProxyCandidates(options);
  const errors = [];

  emitEvent(hooks, 'export-started', {
    options,
  });

  // eslint-disable-next-line no-restricted-syntax
  for (const proxy of proxies) {
    // eslint-disable-next-line no-restricted-syntax
    for (const server of servers) {
      try {
        const result = await runHistoricalExportOnce(options, server, proxy, hooks, exportOptions);
        emitEvent(hooks, 'export-completed', result);
        return result;
      } catch (error) {
        const message = formatErrorMessage(error);
        errors.push(message);
        emitLog(hooks, 'error', message);

        if (server !== servers[servers.length - 1]) {
          emitLog(hooks, 'info', 'Retrying with next server...');
        } else if (proxy !== proxies[proxies.length - 1]) {
          emitLog(hooks, 'info', 'Retrying with next proxy mode...');
        }
      }
    }
  }

  const finalError = new Error(`All servers failed:\n${errors.join('\n')}`);
  emitEvent(hooks, 'export-failed', {
    error: finalError.message,
    options,
  });
  throw finalError;
}

function buildListenerState(state) {
  return {
    id: state.id,
    mode: 'realtime',
    status: state.status,
    inputSymbol: state.inputSymbol,
    resolvedSymbol: state.resolvedSymbol,
    resolution: state.resolution,
    timeframe: state.timeframe,
    range: state.range,
    server: state.server,
    proxy: state.proxy,
    outputPath: state.outputPath,
    connected: state.connected,
    symbolLoaded: state.symbolLoaded,
    initialized: state.initialized,
    startedAt: state.startedAt,
    stoppedAt: state.stoppedAt,
    stopReason: state.stopReason,
    error: state.error,
    periodCount: state.periodCount,
    latestPeriod: state.latestPeriod,
    symbolInfo: state.symbolInfo,
    options: state.options,
    lastEventAt: state.lastEventAt,
  };
}

async function connectRealtimeListenerOnce(options, server, proxy, hooks = {}) {
  return new Promise((resolve, reject) => {
    const client = new Client({ server, proxy });
    const chart = new client.Session.Chart();
    const outputPath = buildRealtimeOutputPath(options);

    let cleanedUp = false;
    let finalized = false;
    let readySettled = false;
    let lastPeriodTime = null;
    let lastSignature = '';
    let connectTimeout = null;
    let exitTimer = null;

    let resolveStopped;
    const whenStopped = new Promise((cb) => {
      resolveStopped = cb;
    });

    const state = {
      id: hooks.listenerId || genSessionID('kl'),
      status: 'connecting',
      inputSymbol: options.inputSymbol,
      resolvedSymbol: options.symbol,
      resolution: options.resolution,
      timeframe: options.timeframe,
      range: options.range,
      server,
      proxy,
      outputPath,
      connected: false,
      symbolLoaded: false,
      initialized: false,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      stopReason: null,
      error: null,
      periodCount: 0,
      latestPeriod: null,
      symbolInfo: null,
      options: {
        ...options,
        resolution: options.resolution,
      },
      lastEventAt: new Date().toISOString(),
    };

    const getState = () => buildListenerState(state);
    const publishState = () => {
      const snapshot = getState();
      emitStateChange(hooks, snapshot);
      return snapshot;
    };

    const cleanup = async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearTimeout(connectTimeout);
      clearTimeout(exitTimer);
      chart.delete();
      await client.end();
    };

    const finalize = async (
      status,
      {
        errorMessage = null,
        reason = null,
        explicitStop = false,
      } = {},
    ) => {
      if (finalized) return getState();
      finalized = true;

      try {
        await cleanup();
      } catch (error) {
        if (!errorMessage) {
          errorMessage = formatErrorMessage(error);
        }
      }

      const now = new Date().toISOString();
      state.status = status;
      state.stoppedAt = now;
      state.stopReason = reason;
      state.error = errorMessage;
      state.lastEventAt = now;

      const snapshot = publishState();

      if (readySettled || explicitStop) {
        if (errorMessage) {
          emitLog(hooks, 'error', errorMessage, { listenerId: state.id });
        } else if (reason) {
          emitLog(hooks, 'info', reason, { listenerId: state.id });
        }
      }

      emitEvent(
        hooks,
        status === 'error' ? 'listener-error' : 'listener-stopped',
        {
          listener: snapshot,
          explicitStop,
        },
      );

      if (!readySettled) {
        readySettled = true;
        reject(new Error(errorMessage || reason || 'Listener stopped before initialization'));
      }

      resolveStopped(snapshot);
      return snapshot;
    };

    const controller = {
      id: state.id,
      outputPath,
      getState,
      whenStopped,
      async stop(reason = 'Listener stopped') {
        return finalize('stopped', { reason, explicitStop: true });
      },
    };

    connectTimeout = setTimeout(() => {
      const snapshot = [
        `connected=${state.connected}`,
        `symbolLoaded=${state.symbolLoaded}`,
        `periods=${chart.periods.length}`,
      ].join(', ');

      finalize('error', {
        errorMessage: `[${server}] Timed out after ${options.connectTimeoutMs}ms (${snapshot})`,
      }).catch(() => {});
    }, options.connectTimeoutMs);

    client.onConnected(() => {
      state.connected = true;
      state.lastEventAt = new Date().toISOString();
      publishState();
      emitLog(
        hooks,
        'info',
        `[${server}] WebSocket connected${proxy ? ` via ${proxy}` : ''}`,
        { listenerId: state.id },
      );
    });

    client.onDisconnected(() => {
      if (!cleanedUp && !finalized) {
        finalize('error', {
          errorMessage: `[${server}] WebSocket disconnected`,
        }).catch(() => {});
      }
    });

    client.onError((...err) => {
      const details = err.filter(Boolean).join(' ') || 'unknown client error';
      finalize('error', {
        errorMessage: `[${server}] ${details}`,
      }).catch(() => {});
    });

    chart.onError((...err) => {
      const details = err.filter(Boolean).join(' ') || 'unknown chart error';
      finalize('error', {
        errorMessage: `[${server}] Chart error: ${details}`,
      }).catch(() => {});
    });

    chart.onSymbolLoaded(() => {
      state.symbolLoaded = true;
      state.symbolInfo = cloneSymbolInfo(chart.infos);
      state.lastEventAt = new Date().toISOString();
      publishState();
      emitLog(hooks, 'info', `[${server}] Symbol loaded: ${chart.infos.full_name}`, {
        listenerId: state.id,
      });
    });

    chart.onUpdate(() => {
      const latest = chart.periods[0];
      if (!latest || finalized) return;

      const signature = buildPeriodSignature(latest);
      if (signature === lastSignature && state.initialized) return;

      try {
        writePeriodsCsv({
          periods: chart.periods,
          outputPath,
          order: 'asc',
        });
      } catch (error) {
        finalize('error', {
          errorMessage: `[${server}] Realtime snapshot write failed: ${formatErrorMessage(error)}`,
        }).catch(() => {});
        return;
      }

      clearTimeout(connectTimeout);

      state.periodCount = chart.periods.length;
      state.latestPeriod = serializePeriod(latest);
      state.symbolInfo = cloneSymbolInfo(chart.infos);
      state.lastEventAt = new Date().toISOString();

      if (!state.initialized) {
        state.initialized = true;
        state.status = 'running';
        lastPeriodTime = latest.time;
        lastSignature = signature;

        if (options.exitAfterMs > 0) {
          exitTimer = setTimeout(() => {
            controller.stop(`Exit after ${options.exitAfterMs}ms`).catch(() => {});
          }, options.exitAfterMs);
        }

        const snapshot = publishState();

        emitLog(
          hooks,
          'info',
          `[${server}] Initial snapshot loaded (${chart.periods.length} candles)`,
          { listenerId: state.id },
        );
        emitLog(hooks, 'info', `[${server}] Output file: ${outputPath}`, {
          listenerId: state.id,
        });
        emitLog(hooks, 'info', `[${server}] Latest candle: ${formatPeriod(latest)}`, {
          listenerId: state.id,
        });

        emitEvent(hooks, 'listener-started', {
          listener: snapshot,
        });

        if (!readySettled) {
          readySettled = true;
          resolve(controller);
        }

        return;
      }

      const updateKind = latest.time !== lastPeriodTime
        ? 'new-candle'
        : 'candle-update';

      if (updateKind === 'new-candle') {
        emitLog(hooks, 'info', `[${server}] New candle opened: ${formatPeriod(latest)}`, {
          listenerId: state.id,
        });
      } else {
        emitLog(hooks, 'info', `[${server}] Candle updated: ${formatPeriod(latest)}`, {
          listenerId: state.id,
        });
      }

      lastPeriodTime = latest.time;
      lastSignature = signature;

      const snapshot = publishState();
      emitEvent(hooks, 'listener-update', {
        listener: snapshot,
        updateKind,
      });
    });

    emitLog(hooks, 'info', `Listening ${options.symbol} (${options.timeframe})...`, {
      listenerId: state.id,
    });
    emitLog(hooks, 'info', `Initial range: ${options.range}`, {
      listenerId: state.id,
    });
    emitLog(
      hooks,
      'info',
      `Mode: public, server=${server}, proxy=${proxy || 'direct'}`,
      { listenerId: state.id },
    );

    publishState();

    chart.setMarket(options.symbol, {
      timeframe: options.timeframe,
      range: options.range,
    });
  });
}

async function startRealtimeListener(rawOptions, hooks = {}) {
  const normalized = normalizeRealtimeOptions(rawOptions);
  const options = await resolveInputSymbol(normalized, hooks);
  const servers = options.server === 'auto'
    ? SUPPORTED_SERVERS
    : [options.server];
  const proxies = buildProxyCandidates(options);
  const errors = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const proxy of proxies) {
    // eslint-disable-next-line no-restricted-syntax
    for (const server of servers) {
      try {
        return await connectRealtimeListenerOnce(options, server, proxy, hooks);
      } catch (error) {
        const message = formatErrorMessage(error);
        errors.push(message);
        emitLog(hooks, 'error', message, { listenerId: hooks.listenerId });

        if (server !== servers[servers.length - 1]) {
          emitLog(hooks, 'info', 'Retrying with next server...', {
            listenerId: hooks.listenerId,
          });
        } else if (proxy !== proxies[proxies.length - 1]) {
          emitLog(hooks, 'info', 'Retrying with next proxy mode...', {
            listenerId: hooks.listenerId,
          });
        }
      }
    }
  }

  throw new Error(`All realtime listener attempts failed:\n${errors.join('\n')}`);
}

module.exports = {
  DEFAULT_HISTORICAL_OPTIONS,
  DEFAULT_REALTIME_OPTIONS,
  SUPPORTED_PROXY_PROTOCOLS,
  SUPPORTED_SEARCH_TYPES,
  SUPPORTED_SERVERS,
  buildListenerState,
  buildPeriodSignature,
  buildProxyCandidates,
  createConsoleLogHooks,
  exportHistoricalKlines,
  formatPeriod,
  normalizeHistoricalOptions,
  normalizeRealtimeOptions,
  parseInteger,
  parseToTimestamp,
  resolveInputSymbol,
  serializePeriod,
  startRealtimeListener,
};
