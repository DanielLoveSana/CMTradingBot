const path = require('path');

const {
  createConsoleLogHooks,
  exportHistoricalKlines,
  SUPPORTED_PROXY_PROTOCOLS,
  SUPPORTED_SERVERS,
} = require('../src/klineService');
const {
  DEFAULT_DEMO_BOLLINGER_ADX_OPTIONS,
  buildDemoBollingerAdxSignalContext,
  buildDemoBollingerAdxSignalOutputPath,
  createDemoBollingerAdxStrategy,
} = require('../src/klineStrategySignals');
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
  outputDir: path.join(__dirname, '..', 'data', 'strategy-signals'),
  timeoutMs: 30000,
  ...DEFAULT_DEMO_BOLLINGER_ADX_OPTIONS,
};

function printHelp() {
  console.log(`
Export signal-only CSV for the demo Bollinger Bands + ADX Pine strategy.
This script does not place orders. It only tags candles that trigger the strategy signal.

Usage:
  node examples/ExportDemoBollingerAdxSignalCsv.js [options]

Market options:
  --symbol=BINANCE:BTCUSDT
  --timeframe=15
  --range=200
  --to=1714176000
  --to=2026-04-27T00:00:00Z
  --search-type=crypto
  --proxy=127.0.0.1:10808
  --proxy-protocol=auto
  --server=auto
  --output-dir=./data/strategy-signals
  --timeout-ms=30000

Strategy options:
  --length=20
  --ma-type=SMA
  --mult=2
  --alpha=0.1
  --adx-threshold=25
  --adx-length=14
  --di-length=14
  --start-date=2024-11-10T00:00:00Z
  --end-date=2069-12-31T23:59:59Z
  --help
`);
}

function parseInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return parsed;
}

function parseFloatValue(value, name) {
  const parsed = Number.parseFloat(value);
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
    else if (key === 'length') options.length = parseInteger(value, 'length');
    else if (key === 'ma-type') options.maType = value;
    else if (key === 'mult') options.mult = parseFloatValue(value, 'mult');
    else if (key === 'alpha') options.alpha = parseFloatValue(value, 'alpha');
    else if (key === 'adx-threshold') options.adxThreshold = parseFloatValue(value, 'adx-threshold');
    else if (key === 'adx-length') options.adxLength = parseInteger(value, 'adx-length');
    else if (key === 'di-length') options.diLength = parseInteger(value, 'di-length');
    else if (key === 'start-date') options.startDate = value;
    else if (key === 'end-date') options.endDate = value;
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

  const strategy = createDemoBollingerAdxStrategy();

  await exportHistoricalKlines(
    parsedOptions,
    createConsoleLogHooks(),
    {
      columns: strategy.columns,
      buildContext: (periods) => buildDemoBollingerAdxSignalContext(periods, parsedOptions),
      outputPathBuilder: buildDemoBollingerAdxSignalOutputPath,
    },
  );
}

main().catch((err) => {
  console.error('Fatal error:', formatErrorMessage(err));
  process.exit(1);
});
