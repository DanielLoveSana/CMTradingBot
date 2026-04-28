const path = require('path');

const TradingView = require('../main');
const {
  buildRealtimeOutputPath,
  formatDateTime,
  writePeriodsCsv,
} = require('../src/klineCsv');

const DEFAULTS = {
  symbol: 'BINANCE:BTCUSDT',
  timeframe: '15',
  range: 200,
  proxy: '127.0.0.1:10808',
  proxyProtocol: 'auto',
  server: 'auto',
  outputDir: path.join(__dirname, '..', 'data', 'realtime'),
  connectTimeoutMs: 15000,
  exitAfterMs: 0,
};

const SUPPORTED_SERVERS = ['data', 'widgetdata', 'prodata'];
const SUPPORTED_PROXY_PROTOCOLS = ['auto', 'socks5', 'http', 'https', 'socks4', 'none'];

function printHelp() {
  console.log(`
Listen to TradingView chart updates in realtime and persist the latest candle snapshot to CSV.

Usage:
  node examples/ListenRealtimeKline.js [options]

Options:
  --symbol=BINANCE:BTCUSDT
  --timeframe=15
  --range=200
  --proxy=127.0.0.1:10808
  --proxy-protocol=auto
  --server=auto
  --output-dir=./data/realtime
  --connect-timeout-ms=15000
  --exit-after-ms=0
  --help

Examples:
  node examples/ListenRealtimeKline.js --symbol=OKX:SOLUSDT.P --timeframe=15
  node examples/ListenRealtimeKline.js --symbol=BINANCE:BTCUSDT --proxy-protocol=socks5
  node examples/ListenRealtimeKline.js --symbol=BINANCE:ETHUSDT --timeframe=1 --range=500
`);
}

function parseInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return parsed;
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  argv.forEach((arg) => {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      return;
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unsupported argument: ${arg}`);
    }

    const [rawKey, ...rest] = arg.slice(2).split('=');
    const value = rest.join('=');
    const key = rawKey.trim();

    if (!value) throw new Error(`Missing value for --${key}`);

    if (key === 'symbol') options.symbol = value;
    else if (key === 'timeframe') options.timeframe = value;
    else if (key === 'range') options.range = parseInteger(value, 'range');
    else if (key === 'proxy') options.proxy = value;
    else if (key === 'proxy-protocol') options.proxyProtocol = value;
    else if (key === 'server') options.server = value;
    else if (key === 'output-dir') options.outputDir = path.resolve(process.cwd(), value);
    else if (key === 'connect-timeout-ms') options.connectTimeoutMs = parseInteger(value, 'connect-timeout-ms');
    else if (key === 'exit-after-ms') options.exitAfterMs = parseInteger(value, 'exit-after-ms');
    else throw new Error(`Unknown option: --${key}`);
  });

  if (!options.symbol) throw new Error('symbol is required');
  if (!options.timeframe) throw new Error('timeframe is required');
  if (!Number.isInteger(options.range) || options.range === 0) {
    throw new Error('range must be a non-zero integer');
  }
  if (!Number.isInteger(options.connectTimeoutMs) || options.connectTimeoutMs <= 0) {
    throw new Error('connect-timeout-ms must be a positive integer');
  }
  if (!Number.isInteger(options.exitAfterMs) || options.exitAfterMs < 0) {
    throw new Error('exit-after-ms must be a non-negative integer');
  }
  if (options.server !== 'auto' && !SUPPORTED_SERVERS.includes(options.server)) {
    throw new Error(`server must be one of: auto, ${SUPPORTED_SERVERS.join(', ')}`);
  }
  if (!SUPPORTED_PROXY_PROTOCOLS.includes(options.proxyProtocol)) {
    throw new Error(`proxy-protocol must be one of: ${SUPPORTED_PROXY_PROTOCOLS.join(', ')}`);
  }

  return options;
}

function formatPeriod(period) {
  return [
    `time=${formatDateTime(period.time)}`,
    `open=${period.open}`,
    `high=${period.max}`,
    `low=${period.min}`,
    `close=${period.close}`,
    `volume=${period.volume}`,
  ].join(' ');
}

function buildPeriodSignature(period) {
  return [
    period.time,
    period.open,
    period.max,
    period.min,
    period.close,
    period.volume,
  ].join('|');
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

async function connectListener(options, server, proxy) {
  return new Promise((resolve, reject) => {
    const client = new TradingView.Client({ server, proxy });
    const chart = new client.Session.Chart();
    const outputPath = buildRealtimeOutputPath(options);

    let cleanedUp = false;
    let connected = false;
    let symbolLoaded = false;
    let initialized = false;
    let lastPeriodTime = null;
    let lastSignature = '';
    let connectTimeout = null;
    let exitTimer = null;

    const cleanup = async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearTimeout(connectTimeout);
      clearTimeout(exitTimer);
      chart.delete();
      await client.end();
    };

    const fail = async (message) => {
      try {
        await cleanup();
      } finally {
        reject(new Error(message));
      }
    };

    const persistSnapshot = () => {
      writePeriodsCsv({
        periods: chart.periods,
        outputPath,
        order: 'asc',
      });
    };

    const shutdown = async (reason = 'Stopping listener') => {
      console.log(reason);
      await cleanup();
      process.exit(0);
    };

    connectTimeout = setTimeout(() => {
      fail(`[${server}] Timed out after ${options.connectTimeoutMs}ms (connected=${connected}, symbolLoaded=${symbolLoaded}, periods=${chart.periods.length})`);
    }, options.connectTimeoutMs);

    if (options.exitAfterMs > 0) {
      exitTimer = setTimeout(() => {
        shutdown(`Exit after ${options.exitAfterMs}ms`).catch((err) => {
          console.error('Shutdown error:', err.message);
          process.exit(1);
        });
      }, options.exitAfterMs);
    }

    process.once('SIGINT', () => {
      shutdown('Received SIGINT, listener stopped').catch((err) => {
        console.error('Shutdown error:', err.message);
        process.exit(1);
      });
    });

    process.once('SIGTERM', () => {
      shutdown('Received SIGTERM, listener stopped').catch((err) => {
        console.error('Shutdown error:', err.message);
        process.exit(1);
      });
    });

    client.onConnected(() => {
      connected = true;
      console.log(`[${server}] WebSocket connected${proxy ? ` via ${proxy}` : ''}`);
    });

    client.onDisconnected(() => {
      if (!cleanedUp) {
        fail(`[${server}] WebSocket disconnected`);
      }
    });

    client.onError((...err) => {
      const details = err.filter(Boolean).join(' ') || 'unknown client error';
      fail(`[${server}] ${details}`);
    });

    chart.onError((...err) => {
      const details = err.filter(Boolean).join(' ') || 'unknown chart error';
      fail(`[${server}] Chart error: ${details}`);
    });

    chart.onSymbolLoaded(() => {
      symbolLoaded = true;
      console.log(`[${server}] Symbol loaded: ${chart.infos.full_name}`);
    });

    chart.onUpdate(() => {
      const latest = chart.periods[0];
      if (!latest) return;

      const signature = buildPeriodSignature(latest);
      if (signature === lastSignature && initialized) return;

      persistSnapshot();
      clearTimeout(connectTimeout);

      if (!initialized) {
        initialized = true;
        lastPeriodTime = latest.time;
        lastSignature = signature;

        console.log(`[${server}] Initial snapshot loaded (${chart.periods.length} candles)`);
        console.log(`[${server}] Output file: ${outputPath}`);
        console.log(`[${server}] Latest candle: ${formatPeriod(latest)}`);

        resolve({ client, chart, server, proxy, outputPath });
        return;
      }

      if (latest.time !== lastPeriodTime) {
        console.log(`[${server}] New candle opened: ${formatPeriod(latest)}`);
      } else {
        console.log(`[${server}] Candle updated: ${formatPeriod(latest)}`);
      }

      lastPeriodTime = latest.time;
      lastSignature = signature;
    });

    console.log(`Listening ${options.symbol} (${options.timeframe})...`);
    console.log(`Initial range: ${options.range}`);
    console.log(`Mode: public, server=${server}, proxy=${proxy || 'direct'}`);

    chart.setMarket(options.symbol, {
      timeframe: options.timeframe,
      range: options.range,
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

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
        await connectListener(options, server, proxy);
        return;
      } catch (err) {
        errors.push(err.message);
        console.error(err.message);

        if (server !== servers[servers.length - 1]) {
          console.log('Retrying with next server...');
        } else if (proxy !== proxies[proxies.length - 1]) {
          console.log('Retrying with next proxy mode...');
        }
      }
    }
  }

  throw new Error(`All realtime listener attempts failed:\n${errors.join('\n')}`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
