import * as fs from 'fs';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const {
  getSymbolAliasRecord,
  loadSymbolConfig,
  setSymbolAliasRecord,
} = require('../src/marketSymbolCache');
const { resolveMarketSymbol } = require('../src/marketSymbolResolver');

const TEST_CONFIG_PATH = path.join(process.cwd(), 'data', 'test-klineSymbolConfig.js');

function cleanupConfig() {
  if (fs.existsSync(TEST_CONFIG_PATH)) {
    fs.unlinkSync(TEST_CONFIG_PATH);
  }
}

afterEach(() => {
  cleanupConfig();
});

describe('market symbol config cache', () => {
  it('persists alias records in the config script', () => {
    setSymbolAliasRecord('Apple', {
      id: 'NASDAQ:AAPL',
      description: 'Apple Inc',
      type: 'stock',
    }, TEST_CONFIG_PATH);

    const config = loadSymbolConfig(TEST_CONFIG_PATH);
    expect(config.aliases.APPLE).toMatchObject({
      id: 'NASDAQ:AAPL',
      description: 'Apple Inc',
      type: 'stock',
    });

    expect(getSymbolAliasRecord(' apple ', TEST_CONFIG_PATH)).toMatchObject({
      id: 'NASDAQ:AAPL',
    });
  });
});

describe('resolveMarketSymbol', () => {
  it('uses the cached symbol before searching', async () => {
    setSymbolAliasRecord('BTCUSDT', {
      id: 'BINANCE:BTCUSDT',
      symbol: 'BTCUSDT',
      exchange: 'BINANCE',
    }, TEST_CONFIG_PATH);

    let searchCalls = 0;

    const resolved = await resolveMarketSymbol('btcusdt', {
      configPath: TEST_CONFIG_PATH,
      searchMarket: async () => {
        searchCalls += 1;
        return [];
      },
    });

    expect(searchCalls).toBe(0);
    expect(resolved).toMatchObject({
      id: 'BINANCE:BTCUSDT',
      source: 'cache',
      cached: true,
    });
  });

  it('searches and stores the resolved full symbol when the cache misses', async () => {
    let searchCalls = 0;

    const resolved = await resolveMarketSymbol('Apple', {
      configPath: TEST_CONFIG_PATH,
      filter: 'stock',
      searchMarket: async (search: string, filter: string) => {
        searchCalls += 1;
        expect(search).toBe('Apple');
        expect(filter).toBe('stock');

        return [{
          id: 'NASDAQ:AAPL',
          exchange: 'NASDAQ',
          fullExchange: 'NASDAQ',
          symbol: 'AAPL',
          description: 'Apple Inc',
          type: 'stock',
        }];
      },
    });

    expect(searchCalls).toBe(1);
    expect(resolved).toMatchObject({
      id: 'NASDAQ:AAPL',
      symbol: 'AAPL',
      source: 'search',
      cached: false,
    });

    const saved = loadSymbolConfig(TEST_CONFIG_PATH);
    expect(saved.aliases.APPLE).toMatchObject({
      id: 'NASDAQ:AAPL',
      symbol: 'AAPL',
      description: 'Apple Inc',
      type: 'stock',
    });
  });

  it('stores a full symbol directly when the config misses', async () => {
    const resolved = await resolveMarketSymbol('NASDAQ:AAPL', {
      configPath: TEST_CONFIG_PATH,
      searchMarket: async () => {
        throw new Error('search should not be called');
      },
    });

    expect(resolved).toMatchObject({
      id: 'NASDAQ:AAPL',
      exchange: 'NASDAQ',
      symbol: 'AAPL',
      alias: 'AAPL',
      source: 'direct',
      cached: false,
      persisted: true,
    });

    expect(loadSymbolConfig(TEST_CONFIG_PATH).aliases.AAPL).toMatchObject({
      id: 'NASDAQ:AAPL',
      exchange: 'NASDAQ',
      symbol: 'AAPL',
      alias: 'AAPL',
    });
  });

  it('reuses an existing config entry for a direct full symbol', async () => {
    setSymbolAliasRecord('Apple', {
      id: 'NASDAQ:AAPL',
      symbol: 'AAPL',
      exchange: 'NASDAQ',
    }, TEST_CONFIG_PATH);

    const resolved = await resolveMarketSymbol('NASDAQ:AAPL', {
      configPath: TEST_CONFIG_PATH,
      searchMarket: async () => {
        throw new Error('search should not be called');
      },
    });

    expect(resolved).toMatchObject({
      id: 'NASDAQ:AAPL',
      symbol: 'AAPL',
      exchange: 'NASDAQ',
      alias: 'APPLE',
      source: 'cache',
      cached: true,
      persisted: false,
    });

    expect(Object.keys(loadSymbolConfig(TEST_CONFIG_PATH).aliases)).toEqual(['APPLE']);
  });

  it('falls back to the full symbol alias when the short symbol is already used', async () => {
    setSymbolAliasRecord('BTCUSDT', {
      id: 'BINANCE:BTCUSDT',
      symbol: 'BTCUSDT',
      exchange: 'BINANCE',
    }, TEST_CONFIG_PATH);

    const resolved = await resolveMarketSymbol('BYBIT:BTCUSDT', {
      configPath: TEST_CONFIG_PATH,
      searchMarket: async () => {
        throw new Error('search should not be called');
      },
    });

    expect(resolved).toMatchObject({
      id: 'BYBIT:BTCUSDT',
      symbol: 'BTCUSDT',
      exchange: 'BYBIT',
      alias: 'BYBIT:BTCUSDT',
      source: 'direct',
      cached: false,
      persisted: true,
    });

    const config = loadSymbolConfig(TEST_CONFIG_PATH);
    expect(config.aliases.BTCUSDT).toMatchObject({
      id: 'BINANCE:BTCUSDT',
    });
    expect(config.aliases['BYBIT:BTCUSDT']).toMatchObject({
      id: 'BYBIT:BTCUSDT',
      symbol: 'BTCUSDT',
      exchange: 'BYBIT',
      alias: 'BYBIT:BTCUSDT',
    });
  });

  it('throws when search results are too vague to auto-resolve', async () => {
    await expect(resolveMarketSymbol('technology', {
      configPath: TEST_CONFIG_PATH,
      searchMarket: async () => ([
        {
          id: 'NASDAQ:AAPL',
          exchange: 'NASDAQ',
          fullExchange: 'NASDAQ',
          symbol: 'AAPL',
          description: 'Apple Inc',
          type: 'stock',
        },
        {
          id: 'NASDAQ:MSFT',
          exchange: 'NASDAQ',
          fullExchange: 'NASDAQ',
          symbol: 'MSFT',
          description: 'Microsoft Corp',
          type: 'stock',
        },
      ]),
    })).rejects.toThrow('Unable to confidently resolve');
  });
});
