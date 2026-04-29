const path = require('path');

const {
  createConsoleLogHooks,
  startRealtimeListener,
  SUPPORTED_PROXY_PROTOCOLS,
  SUPPORTED_SERVERS,
} = require('../src/klineService');
const { formatErrorMessage } = require('../src/utils');

const DEFAULTS = {
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
};

function printHelp() {
  console.log(`
Listen to TradingView chart updates in realtime and persist the latest candle snapshot to CSV.

Usage:
  node examples/ListenRealtimeKline.js [options]

Options:
  --symbol=BINANCE:BTCUSDT
  --symbol=BTCUSDT
  --symbol=Apple
  --timeframe=15
  --range=200
  --search-type=stock
  --proxy=127.0.0.1:10808
  --proxy-protocol=auto
  --server=auto
  --output-dir=./data/realtime
  --connect-timeout-ms=15000
  --exit-after-ms=0
  --help

Examples:
  node examples/ListenRealtimeKline.js --symbol=OKX:SOLUSDT.P --timeframe=15
  node examples/ListenRealtimeKline.js --symbol=BTCUSDT --search-type=crypto
  node examples/ListenRealtimeKline.js --symbol=Apple --search-type=stock
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
    else if (key === 'search-type') options.searchType = value.toLowerCase();
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
  if (
    options.searchType
    && !['stock', 'futures', 'forex', 'cfd', 'crypto', 'index', 'economic'].includes(options.searchType)
  ) {
    throw new Error('search-type must be one of: stock, futures, forex, cfd, crypto, index, economic');
  }
  if (options.server !== 'auto' && !SUPPORTED_SERVERS.includes(options.server)) {
    throw new Error(`server must be one of: auto, ${SUPPORTED_SERVERS.join(', ')}`);
  }
  if (!SUPPORTED_PROXY_PROTOCOLS.includes(options.proxyProtocol)) {
    throw new Error(`proxy-protocol must be one of: ${SUPPORTED_PROXY_PROTOCOLS.join(', ')}`);
  }

  return options;
}

async function main() {
  const parsedOptions = parseArgs(process.argv.slice(2));

  if (parsedOptions.help) {
    printHelp();
    return;
  }

  const controller = await startRealtimeListener(
    parsedOptions,
    createConsoleLogHooks(),
  );

  let shuttingDown = false;

  const shutdown = async (reason) => {
    if (shuttingDown) return;
    shuttingDown = true;

    try {
      await controller.stop(reason);
      process.exit(0);
    } catch (error) {
      console.error('Shutdown error:', formatErrorMessage(error));
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    shutdown('Received SIGINT, listener stopped');
  });

  process.once('SIGTERM', () => {
    shutdown('Received SIGTERM, listener stopped');
  });

  const finalState = await controller.whenStopped;
  process.exit(finalState.status === 'error' ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', formatErrorMessage(err));
  process.exit(1);
});
