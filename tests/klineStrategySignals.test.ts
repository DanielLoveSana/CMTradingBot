import * as path from 'path';
import * as fs from 'fs';
import { describe, expect, it } from 'vitest';

const {
  DEFAULT_DEMO_BOLLINGER_ADX_EXPORT_OPTIONS,
  appendStrategySignalCsv,
  buildStrategySignalContext,
  buildRealtimeStrategySignalOutputPath,
  createDemoBollingerAdxStrategy,
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

  it('appends realtime triggered rows into a signal csv file', () => {
    const strategy = createDemoBollingerAdxStrategy();
    const periods = [
      { time: 1777247100, open: 100, max: 102, min: 99, close: 100, volume: 10 },
      { time: 1777248000, open: 100, max: 111, min: 99, close: 110, volume: 12 },
    ];
    const context = buildStrategySignalContext(periods, strategy, {
      startDate: '2020-01-01T00:00:00Z',
      endDate: '2069-12-31T23:59:59Z',
      length: 2,
      mult: 1,
      diLength: 2,
      adxLength: 2,
      adxThreshold: 0,
    });
    const outputPath = buildRealtimeStrategySignalOutputPath({
      outputDir: path.resolve(process.cwd(), 'data', 'test-realtime-signals'),
      symbol: 'BINANCE:BTCUSDT',
      timeframe: '15',
      strategyName: strategy.name,
    });

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    appendStrategySignalCsv({
      period: periods[1],
      outputPath,
      strategy,
      context,
    });

    const csv = fs.readFileSync(outputPath, 'utf8');
    expect(csv).toContain('signal_triggered');
    expect(csv).toContain('TREND_BREAKOUT_LONG');
  });
});
