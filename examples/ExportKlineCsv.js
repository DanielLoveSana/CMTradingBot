const path = require('path');

const {
  createConsoleLogHooks,
  exportHistoricalKlines,
  SUPPORTED_PROXY_PROTOCOLS,
  SUPPORTED_SERVERS,
} = require('../src/klineService');
const { formatErrorMessage } = require('../src/utils');

const DEFAULTS = {
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
};

function printHelp() {
  console.log(`
Export TradingView candles to CSV.
Public mode only: no login required, SESSION/SIGNATURE are ignored.

Usage:
  node examples/ExportKlineCsv.js [options]

Options:
  --symbol=BINANCE:BTCUSDT
  --symbol=BTCUSDT
  --symbol=Apple
  --timeframe=15
  --range=200
  --to=1714176000
  --to=2026-04-27T00:00:00Z
  --search-type=stock
  --proxy=127.0.0.1:10808
  --proxy-protocol=auto
  --server=auto
  --output-dir=./data/klines
  --timeout-ms=30000
  --help

Examples:
  node examples/ExportKlineCsv.js --symbol=OKX:ETHUSDT.P --timeframe=15 --range=100
  node examples/ExportKlineCsv.js --symbol=BTCUSDT --search-type=crypto
  node examples/ExportKlineCsv.js --symbol=Apple --search-type=stock
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
    else if (key === 'search-type') options.searchType = value.toLowerCase();
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

  await exportHistoricalKlines(parsedOptions, createConsoleLogHooks());
}

main().catch((err) => {
  console.error('Fatal error:', formatErrorMessage(err));
  process.exit(1);
});
