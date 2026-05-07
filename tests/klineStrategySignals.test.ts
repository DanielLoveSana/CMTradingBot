import * as path from 'path';
import { describe, expect, it } from 'vitest';

const {
  DEFAULT_DEMO_BOLLINGER_ADX_EXPORT_OPTIONS,
  normalizeDemoBollingerAdxOptions,
} = require('../src/klineStrategySignals');

describe('klineStrategySignals', () => {
  it('normalizes demo Bollinger + ADX strategy options from form-like input', () => {
    const options = normalizeDemoBollingerAdxOptions({
      length: '21',
      maType: 'EMA',
      mult: '2.5',
      alpha: '0.2',
      adxThreshold: '30.5',
      adxLength: '12',
      diLength: '13',
      startDate: ' 2025-01-01T00:00:00Z ',
      endDate: ' 2025-12-31T23:59:59Z ',
    });

    expect(options).toMatchObject({
      length: 21,
      maType: 'EMA',
      mult: 2.5,
      alpha: 0.2,
      adxThreshold: 30.5,
      adxLength: 12,
      diLength: 13,
      startDate: '2025-01-01T00:00:00Z',
      endDate: '2025-12-31T23:59:59Z',
    });
  });

  it('exposes dedicated defaults for strategy signal CSV exports', () => {
    expect(DEFAULT_DEMO_BOLLINGER_ADX_EXPORT_OPTIONS).toMatchObject({
      symbol: 'BINANCE:BTCUSDT',
      timeframe: '15',
      range: 200,
      timeoutMs: 30000,
      length: 20,
      maType: 'SMA',
      outputDir: path.resolve(process.cwd(), 'data', 'strategy-signals'),
    });
  });
});
