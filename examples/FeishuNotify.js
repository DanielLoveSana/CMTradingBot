const {
  DEFAULT_NOTIFICATION_MESSAGE,
  receiveNotificationMessage,
  sendFeishuNotification,
} = require('../src/notificationService');
const { formatErrorMessage } = require('../src/utils');

const DEFAULTS = {
  webhookUrl: process.env.FEISHU_WEBHOOK_URL || '',
  secret: process.env.FEISHU_SECRET || '',
  timeoutMs: 15000,
  title: process.env.NOTIFICATION_TITLE || DEFAULT_NOTIFICATION_MESSAGE.title,
  message: process.env.NOTIFICATION_MESSAGE || '',
  level: process.env.NOTIFICATION_LEVEL || DEFAULT_NOTIFICATION_MESSAGE.level,
  source: process.env.NOTIFICATION_SOURCE || DEFAULT_NOTIFICATION_MESSAGE.source,
  data: process.env.NOTIFICATION_DATA || '',
};

function printHelp() {
  console.log(`
Send a Feishu notification.

Usage:
  node examples/FeishuNotify.js [options]

Options:
  --webhook-url=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
  --secret=xxxx
  --timeout-ms=15000
  --title=TradingView Alert
  --message=Hello
  --level=info
  --source=CMTradingBot
  --data={"symbol":"BTCUSDT"}
  --help

Examples:
  node examples/FeishuNotify.js --webhook-url=https://... --message="Price hit target"
  node examples/FeishuNotify.js --message="Dry message" --data='{"foo":"bar"}'
`);
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

    if (key === 'webhook-url') options.webhookUrl = value;
    else if (key === 'secret') options.secret = value;
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

  const feishuConfig = {
    webhookUrl: parsedOptions.webhookUrl,
    secret: parsedOptions.secret,
    timeoutMs: parsedOptions.timeoutMs,
  };

  const result = await receiveNotificationMessage(message, {
    onMessage: (payload) => sendFeishuNotification(payload, feishuConfig),
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Fatal error:', formatErrorMessage(err));
  process.exit(1);
});
