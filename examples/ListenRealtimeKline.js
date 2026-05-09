const path = require('path');

const {
  createConsoleLogHooks,
  startRealtimeListener,
  SUPPORTED_PROXY_PROTOCOLS,
  SUPPORTED_SIGNAL_OUTPUT_MODES,
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
  enableSnapshotCsv: true,
  enableSignalBroadcast: false,
  signalOutputMode: 'none',
  signalStrategyName: 'demo_bollinger_bands_adx',
  signalCsvOutputDir: path.join(__dirname, '..', 'data', 'realtime-signals'),
  notificationTitle: process.env.NOTIFICATION_TITLE || 'TradingView Strategy Signal',
  notificationLevel: process.env.NOTIFICATION_LEVEL || 'warn',
  notificationSource: process.env.NOTIFICATION_SOURCE || 'CMTradingBot',
  telegramEnabled: process.env.TELEGRAM_ENABLED || 'false',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  telegramApiBaseUrl: process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org',
  telegramProxy: process.env.TELEGRAM_PROXY || process.env.ALL_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '',
  telegramParseMode: process.env.TELEGRAM_PARSE_MODE || '',
  telegramDisableWebPagePreview: process.env.TELEGRAM_DISABLE_WEB_PREVIEW || 'true',
  telegramDisableNotification: process.env.TELEGRAM_DISABLE_NOTIFICATION || 'false',
  telegramTimeoutMs: 15000,
  feishuEnabled: process.env.FEISHU_ENABLED || 'false',
  feishuWebhookUrl: process.env.FEISHU_WEBHOOK_URL || '',
  feishuSecret: process.env.FEISHU_SECRET || '',
  feishuTimeoutMs: 15000,
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
  --enable-snapshot-csv=true
  --enable-signal-broadcast=true
  --signal-output-mode=telegram+csv
  --signal-strategy-name=demo_bollinger_bands_adx
  --signal-csv-output-dir=./data/realtime-signals
  --notification-title="TradingView Strategy Signal"
  --notification-level=warn
  --notification-source=CMTradingBot
  --telegram-enabled=true
  --telegram-bot-token=123456:ABCDEF
  --telegram-chat-id=123456789
  --telegram-api-base-url=https://api.telegram.org
  --telegram-proxy=127.0.0.1:10808
  --telegram-parse-mode=HTML
  --telegram-disable-web-preview=true
  --telegram-disable-notification=false
  --telegram-timeout-ms=15000
  --feishu-enabled=true
  --feishu-webhook-url=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
  --feishu-secret=xxxx
  --feishu-timeout-ms=15000
  --help

Examples:
  node examples/ListenRealtimeKline.js --symbol=OKX:SOLUSDT.P --timeframe=15
  node examples/ListenRealtimeKline.js --symbol=BTCUSDT --search-type=crypto
  node examples/ListenRealtimeKline.js --symbol=Apple --search-type=stock
  node examples/ListenRealtimeKline.js --symbol=BINANCE:BTCUSDT --proxy-protocol=socks5
  node examples/ListenRealtimeKline.js --symbol=BINANCE:ETHUSDT --timeframe=1 --range=500
  node --env-file=.env examples/ListenRealtimeKline.js --symbol=BINANCE:BTCUSDT --enable-signal-broadcast=true --signal-output-mode=telegram
`);
}

function parseBoolean(value, name) {
  const text = String(value).trim().toLowerCase();

  if (['true', '1', 'yes', 'y', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(text)) return false;

  throw new Error(`Invalid ${name}: ${value}`);
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
    else if (key === 'enable-snapshot-csv') options.enableSnapshotCsv = parseBoolean(value, 'enable-snapshot-csv');
    else if (key === 'enable-signal-broadcast') options.enableSignalBroadcast = parseBoolean(value, 'enable-signal-broadcast');
    else if (key === 'signal-output-mode') options.signalOutputMode = value;
    else if (key === 'signal-strategy-name') options.signalStrategyName = value;
    else if (key === 'signal-csv-output-dir') options.signalCsvOutputDir = path.resolve(process.cwd(), value);
    else if (key === 'notification-title') options.notificationTitle = value;
    else if (key === 'notification-level') options.notificationLevel = value;
    else if (key === 'notification-source') options.notificationSource = value;
    else if (key === 'telegram-enabled') options.telegramEnabled = parseBoolean(value, 'telegram-enabled');
    else if (key === 'telegram-bot-token') options.telegramBotToken = value;
    else if (key === 'telegram-chat-id') options.telegramChatId = value;
    else if (key === 'telegram-api-base-url') options.telegramApiBaseUrl = value;
    else if (key === 'telegram-proxy') options.telegramProxy = value;
    else if (key === 'telegram-parse-mode') options.telegramParseMode = value;
    else if (key === 'telegram-disable-web-preview') options.telegramDisableWebPagePreview = parseBoolean(value, 'telegram-disable-web-preview');
    else if (key === 'telegram-disable-notification') options.telegramDisableNotification = parseBoolean(value, 'telegram-disable-notification');
    else if (key === 'telegram-timeout-ms') options.telegramTimeoutMs = parseInteger(value, 'telegram-timeout-ms');
    else if (key === 'feishu-enabled') options.feishuEnabled = parseBoolean(value, 'feishu-enabled');
    else if (key === 'feishu-webhook-url') options.feishuWebhookUrl = value;
    else if (key === 'feishu-secret') options.feishuSecret = value;
    else if (key === 'feishu-timeout-ms') options.feishuTimeoutMs = parseInteger(value, 'feishu-timeout-ms');
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
  if (!SUPPORTED_SIGNAL_OUTPUT_MODES.includes(String(options.signalOutputMode))) {
    throw new Error(`signal-output-mode must be one of: ${SUPPORTED_SIGNAL_OUTPUT_MODES.join(', ')}`);
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
