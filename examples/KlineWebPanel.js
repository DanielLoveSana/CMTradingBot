const {
  normalizePanelOptions,
  startKlineWebPanel,
} = require('../src/klineWebPanelServer');
const { formatErrorMessage } = require('../src/utils');

const DEFAULTS = {
  host: '127.0.0.1',
  port: 3210,
};

function printHelp() {
  console.log(`
Start the local TradingView K-line web panel.

Usage:
  node examples/KlineWebPanel.js [options]

Options:
  --host=127.0.0.1
  --port=3210
  --help

Example:
  node examples/KlineWebPanel.js --port=3300
`);
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
    const key = rawKey.trim();
    const value = rest.join('=');

    if (!value) throw new Error(`Missing value for --${key}`);

    if (key === 'host') options.host = value;
    else if (key === 'port') options.port = value;
    else throw new Error(`Unknown option: --${key}`);
  });

  if (options.help) return options;
  return normalizePanelOptions(options);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const panel = await startKlineWebPanel(options);
  console.log(`K-line web panel started at ${panel.url}`);

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;

    console.log(`Received ${signal}, shutting down panel...`);

    try {
      await panel.close();
      process.exit(0);
    } catch (error) {
      console.error(`Panel shutdown failed: ${formatErrorMessage(error)}`);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    shutdown('SIGTERM');
  });
}

main().catch((error) => {
  console.error('Fatal error:', formatErrorMessage(error));
  process.exit(1);
});
