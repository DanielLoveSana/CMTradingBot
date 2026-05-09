import * as path from 'path';
import { describe, expect, it } from 'vitest';

const {
  buildProxyCandidates,
  normalizeHistoricalOptions,
  normalizeRealtimeOptions,
  parseToTimestamp,
  serializePeriod,
} = require('../src/klineService');

describe('klineService', () => {
  it('parses ISO timestamps for historical exports', () => {
    expect(parseToTimestamp('2026-04-27T00:00:00Z')).toBe(1777248000);
  });

  it('normalizes historical options and resolves relative output directories', () => {
    const options = normalizeHistoricalOptions({
      symbol: 'Apple',
      timeframe: 15,
      range: '200',
      to: '2026-04-27T00:00:00Z',
      outputDir: 'data/custom-klines',
      timeoutMs: '45000',
    });

    expect(options).toMatchObject({
      symbol: 'Apple',
      timeframe: '15',
      range: 200,
      to: 1777248000,
      timeoutMs: 45000,
      outputDir: path.resolve(process.cwd(), 'data/custom-klines'),
    });
  });

  it('preserves extra export fields for custom CSV builders', () => {
    const options = normalizeHistoricalOptions({
      symbol: 'Apple',
      timeframe: 15,
      range: '200',
      outputDir: 'data/custom-klines',
      timeoutMs: '45000',
      strategyName: 'demo_bollinger_bands_adx',
      length: 20,
      adxThreshold: 25,
    });

    expect(options.strategyName).toBe('demo_bollinger_bands_adx');
    expect(options.length).toBe(20);
    expect(options.adxThreshold).toBe(25);
  });

  it('builds automatic proxy candidates and disables proxy when requested', () => {
    expect(buildProxyCandidates({
      proxy: '127.0.0.1:10808',
      proxyProtocol: 'auto',
    })).toEqual([
      'socks5://127.0.0.1:10808',
      'http://127.0.0.1:10808',
    ]);

    expect(buildProxyCandidates({
      proxy: '127.0.0.1:10808',
      proxyProtocol: 'none',
    })).toEqual([null]);
  });

  it('normalizes realtime options and serializes candles for the panel', () => {
    const options = normalizeRealtimeOptions({
      range: '500',
      connectTimeoutMs: '15000',
      exitAfterMs: '0',
    });

    expect(options.range).toBe(500);
    expect(options.connectTimeoutMs).toBe(15000);
    expect(options.exitAfterMs).toBe(0);

    expect(serializePeriod({
      time: 1777248000,
      open: 1,
      max: 2,
      min: 0.5,
      close: 1.5,
      volume: 123.45,
    })).toEqual({
      time: 1777248000,
      datetimeUtc: '2026-04-27 00:00:00 UTC',
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 123.45,
    });
  });

  it('normalizes realtime signal broadcast options', () => {
    const options = normalizeRealtimeOptions({
      enableSnapshotCsv: 'false',
      enableSignalBroadcast: 'true',
      signalOutputMode: 'telegram+csv',
      signalCsvOutputDir: 'data/realtime-signals-custom',
      telegramEnabled: 'true',
      telegramBotToken: 'abc',
      telegramChatId: '123',
      telegramProxy: 'socks5://127.0.0.1:10808',
      telegramTimeoutMs: '12000',
    });

    expect(options.enableSnapshotCsv).toBe(false);
    expect(options.enableSignalBroadcast).toBe(true);
    expect(options.signalOutputMode).toBe('telegram+csv');
    expect(options.signalOutputTargets).toEqual({
      csv: true,
      telegram: true,
      feishu: false,
    });
    expect(options.signalCsvOutputDir).toBe(
      path.resolve(process.cwd(), 'data/realtime-signals-custom'),
    );
    expect(options.telegramEnabled).toBe(true);
    expect(options.telegramProxy).toBe('socks5://127.0.0.1:10808');
    expect(options.telegramTimeoutMs).toBe(12000);
  });
});
