const path = require('path');

const TradingView = require('../main');
const {
  buildHistoricalOutputPath,
  previewCsv,
  writePeriodsCsv,
} = require('../src/klineCsv');

const DEFAULTS = {
  symbol: 'BINANCE:BTCUSDT',
  timeframe: '15',
  range: 200,
  to: null,
  proxy: '127.0.0.1:10808',
  proxyProtocol: 'auto',
  server: 'auto',
  outputDir: path.join(__dirname, '..', 'data', 'klines'),
  timeoutMs: 30000,
};

const SUPPORTED_SERVERS = ['data', 'widgetdata', 'prodata'];
const SUPPORTED_PROXY_PROTOCOLS = ['auto', 'socks5', 'http', 'https', 'socks4', 'none'];

function printHelp() {
  console.log(`
Export TradingView candles to CSV.
Public mode only: no login required, SESSION/SIGNATURE are ignored.

Usage:
  node examples/ExportKlineCsv.js [options]

Options:
  --symbol=BINANCE:BTCUSDT
  --timeframe=15
  --range=200
  --to=1714176000
  --to=2026-04-27T00:00:00Z
  --proxy=127.0.0.1:10808
  --proxy-protocol=auto
  --server=auto
  --output-dir=./data/klines
  --timeout-ms=30000
  --help

Examples:
  node examples/ExportKlineCsv.js --symbol=OKX:ETHUSDT.P --timeframe=15 --range=200
  node examples/ExportKlineCsv.js --proxy=127.0.0.1:10808 --proxy-protocol=socks5
  node examples/ExportKlineCsv.js --symbol=BINANCE:BTCUSDT --server=widgetdata
  node examples/ExportKlineCsv.js --symbol=BINANCE:BTCUSDT --timeframe=240 --range=300 --to=2026-04-27T00:00:00Z
`);
}

function parseInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return parsed;
}

function parseToTimestamp(value) {
  if (!value) return null;

  if (/^\d+$/.test(value)) return parseInteger(value, 'to');

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid to timestamp: ${value}`);
  }

  return Math.floor(parsed / 1000);
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
    else if (key === 'to') options.to = parseToTimestamp(value);
    else if (key === 'proxy') options.proxy = value;
    else if (key === 'proxy-protocol') options.proxyProtocol = value;
    else if (key === 'server') options.server = value;
    else if (key === 'output-dir') options.outputDir = path.resolve(process.cwd(), value);
    else if (key === 'timeout-ms') options.timeoutMs = parseInteger(value, 'timeout-ms');
    else throw new Error(`Unknown option: --${key}`);
  });

  if (!options.symbol) throw new Error('symbol is required');
  if (!options.timeframe) throw new Error('timeframe is required');
  if (!Number.isInteger(options.range) || options.range === 0) {
    throw new Error('range must be a non-zero integer');
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('timeout-ms must be a positive integer');
  }
  if (options.server !== 'auto' && !SUPPORTED_SERVERS.includes(options.server)) {
    throw new Error(`server must be one of: auto, ${SUPPORTED_SERVERS.join(', ')}`);
  }
  if (!SUPPORTED_PROXY_PROTOCOLS.includes(options.proxyProtocol)) {
    throw new Error(`proxy-protocol must be one of: ${SUPPORTED_PROXY_PROTOCOLS.join(', ')}`);
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

async function runExport(options, server, proxy) {
  return new Promise((resolve, reject) => {
    const client = new TradingView.Client({ server, proxy });
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

      const outputPath = buildHistoricalOutputPath(options);
      const { csv, periods } = writePeriodsCsv({
        periods: chart.periods,
        outputPath,
        order: 'asc',
      });

      console.log(`[${server}] Loaded ${periods.length} candles for ${options.symbol}`);
      console.log(`[${server}] Timeframe: ${options.timeframe}`);
      console.log(`[${server}] Saved CSV to: ${outputPath}`);
      console.log(`[${server}] Preview:`);
      console.log(previewCsv(csv, 6));

      finished = true;

      try {
        await cleanup();
      } catch (err) {
        console.warn(`[${server}] Cleanup warning: ${err.message}`);
      }

      resolveOnce({ server, outputPath, periods: periods.length });
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
      console.log(`[${server}] WebSocket connected${proxy ? ` via ${proxy}` : ''}`);
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
      console.log(`[${server}] Symbol loaded: ${chart.infos.full_name}`);
    });

    chart.onUpdate(() => {
      if (!chart.periods.length || finishing || finished || settled) return;

      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        finish().catch((err) => {
          fail(`[${server}] Export error: ${err.message}`);
        });
      }, chart.periods.length >= expectedCount ? 250 : 1200);
    });

    console.log(`Requesting ${options.symbol} (${options.timeframe}) candles...`);
    console.log(`Range: ${options.range}${options.to ? `, to: ${options.to}` : ''}`);
    console.log(`Mode: public, server=${server}, proxy=${proxy || 'direct'}`);

    chart.setMarket(options.symbol, {
      timeframe: options.timeframe,
      range: options.range,
      to: options.to,
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
        await runExport(options, server, proxy);
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

  throw new Error(`All servers failed:\n${errors.join('\n')}`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
