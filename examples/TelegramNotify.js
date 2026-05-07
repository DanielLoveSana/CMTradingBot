const {
  DEFAULT_NOTIFICATION_MESSAGE,
  receiveNotificationMessage,
  sendTelegramNotification,
} = require('../src/notificationService');
const { formatErrorMessage } = require('../src/utils');

const DEFAULTS = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.TELEGRAM_CHAT_ID || '',
  apiBaseUrl: process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org',
  parseMode: process.env.TELEGRAM_PARSE_MODE || '',
  disableWebPagePreview: process.env.TELEGRAM_DISABLE_WEB_PREVIEW || 'true',
  disableNotification: process.env.TELEGRAM_DISABLE_NOTIFICATION || 'false',
  timeoutMs: 15000,
  title: process.env.NOTIFICATION_TITLE || DEFAULT_NOTIFICATION_MESSAGE.title,
  message: process.env.NOTIFICATION_MESSAGE || '',
  level: process.env.NOTIFICATION_LEVEL || DEFAULT_NOTIFICATION_MESSAGE.level,
  source: process.env.NOTIFICATION_SOURCE || DEFAULT_NOTIFICATION_MESSAGE.source,
  data: process.env.NOTIFICATION_DATA || '',
};

function printHelp() {
  console.log(`
Send a Telegram notification.

Usage:
  node examples/TelegramNotify.js [options]

Options:
  --bot-token=123456:ABCDEF
  --chat-id=123456789
  --api-base-url=https://api.telegram.org
  --parse-mode=HTML
  --disable-web-preview=true
  --disable-notification=false
  --timeout-ms=15000
  --title=TradingView Alert
  --message=Hello
  --level=info
  --source=CMTradingBot
  --data={"symbol":"BTCUSDT"}
  --help

Examples:
  node examples/TelegramNotify.js --bot-token=xxx --chat-id=123456 --message="Price hit target"
  node examples/TelegramNotify.js --message="Dry message" --data='{"foo":"bar"}'
`);
}

function parseBoolean(value, name) {
  if (value === undefined) return undefined;
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

function parseJson(value, name) {
  if (!value) return undefined;

  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid ${name}: ${value}`);
  }
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

    if (key === 'bot-token') options.botToken = value;
    else if (key === 'chat-id') options.chatId = value;
    else if (key === 'api-base-url') options.apiBaseUrl = value;
    else if (key === 'parse-mode') options.parseMode = value;
    else if (key === 'disable-web-preview') options.disableWebPagePreview = parseBoolean(value, 'disable-web-preview');
    else if (key === 'disable-notification') options.disableNotification = parseBoolean(value, 'disable-notification');
    else if (key === 'timeout-ms') options.timeoutMs = parseInteger(value, 'timeout-ms');
    else if (key === 'title') options.title = value;
    else if (key === 'message' || key === 'content') options.message = value;
    else if (key === 'level') options.level = value;
    else if (key === 'source') options.source = value;
    else if (key === 'data') options.data = parseJson(value, 'data');
    else throw new Error(`Unknown option: --${key}`);
  });

  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('timeout-ms must be a positive integer');
  }

  return options;
}

async function main() {
  const parsedOptions = parseArgs(process.argv.slice(2));

  if (parsedOptions.help) {
    printHelp();
    return;
  }

  const message = {
    title: parsedOptions.title,
    content: parsedOptions.message,
    level: parsedOptions.level,
    source: parsedOptions.source,
    data: parsedOptions.data,
  };

  const telegramConfig = {
    botToken: parsedOptions.botToken,
    chatId: parsedOptions.chatId,
    apiBaseUrl: parsedOptions.apiBaseUrl,
    parseMode: parsedOptions.parseMode,
    disableWebPagePreview: parsedOptions.disableWebPagePreview,
    disableNotification: parsedOptions.disableNotification,
    timeoutMs: parsedOptions.timeoutMs,
  };

  const result = await receiveNotificationMessage(message, {
    onMessage: (payload) => sendTelegramNotification(payload, telegramConfig),
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Fatal error:', formatErrorMessage(err));
  process.exit(1);
});
