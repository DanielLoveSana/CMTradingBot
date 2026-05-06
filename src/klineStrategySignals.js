const fs = require('fs');
const path = require('path');

const {
  formatDateTime,
  periodsToCsv,
  sanitizeFileSegment,
  sortPeriods,
} = require('./klineCsv');
const {
  calculateBollingerBands,
  calculateDirectionalMovement,
} = require('./klineIndicators');

const DEFAULT_SIGNAL_COLUMNS = Object.freeze([
  { header: 'timestamp', value: (period) => period.time },
  { header: 'datetime_utc', value: (period) => formatDateTime(period.time) },
  { header: 'open', value: (period) => period.open },
  { header: 'high', value: (period) => period.max },
  { header: 'low', value: (period) => period.min },
  { header: 'close', value: (period) => period.close },
  { header: 'volume', value: (period) => period.volume },
  { header: 'signal_triggered', value: (period, context) => (
    context.signals.get(period.time)?.triggered ? 1 : 0
  ) },
  { header: 'signal_name', value: (period, context) => context.signals.get(period.time)?.name || '' },
  { header: 'signal_side', value: (period, context) => context.signals.get(period.time)?.side || '' },
  { header: 'signal_regime', value: (period, context) => context.signals.get(period.time)?.regime || '' },
  { header: 'signal_code', value: (period, context) => context.signals.get(period.time)?.code || '' },
  { header: 'signal_reason', value: (period, context) => context.signals.get(period.time)?.reason || '' },
]);

const DEFAULT_DEMO_BOLLINGER_ADX_OPTIONS = Object.freeze({
  length: 20,
  maType: 'SMA',
  mult: 2,
  alpha: 0.1,
  sourceKey: 'close',
  volumeKey: 'volume',
  diLength: 14,
  adxLength: 14,
  highKey: 'max',
  lowKey: 'min',
  closeKey: 'close',
  adxThreshold: 25,
  startDate: '2024-11-10T00:00:00Z',
  endDate: '2069-12-31T23:59:59Z',
});

function parseStrategyTimestamp(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value, 10);
  }

  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid strategy date: ${value}`);
  }

  return Math.floor(parsed / 1000);
}

function createStrategySignalDefinition(definition) {
  if (!definition || !definition.name) {
    throw new Error('Strategy name is required');
  }

  if (typeof definition.evaluate !== 'function') {
    throw new Error(`Strategy "${definition.name}" must define an evaluate function`);
  }

  return {
    name: String(definition.name),
    description: definition.description ? String(definition.description) : '',
    defaultOptions: { ...(definition.defaultOptions || {}) },
    indicatorBuilders: { ...(definition.indicatorBuilders || {}) },
    evaluate: definition.evaluate,
    columns: Array.isArray(definition.columns) && definition.columns.length
      ? definition.columns
      : DEFAULT_SIGNAL_COLUMNS,
  };
}

function normalizeSignalResult(strategy, result) {
  if (!result) {
    return {
      triggered: false,
      name: strategy.name,
      side: '',
      regime: '',
      code: '',
      reason: '',
    };
  }

  return {
    triggered: Boolean(result.triggered || result.code || result.side),
    name: result.name || strategy.name,
    side: result.side || '',
    regime: result.regime || '',
    code: result.code || '',
    reason: result.reason || '',
    ...result,
  };
}

function buildStrategySignalContext(periods, strategy, inputOptions = {}) {
  const normalizedPeriods = sortPeriods(periods, 'asc');
  const options = {
    ...(strategy.defaultOptions || {}),
    ...inputOptions,
  };

  const indicators = Object.fromEntries(
    Object.entries(strategy.indicatorBuilders || {}).map(([name, builder]) => [
      name,
      builder(normalizedPeriods, options),
    ]),
  );

  const signals = new Map();

  normalizedPeriods.forEach((period, index) => {
    const evaluated = strategy.evaluate({
      period,
      index,
      periods: normalizedPeriods,
      indicators,
      options,
      strategy,
    });

    signals.set(period.time, normalizeSignalResult(strategy, evaluated));
  });

  return {
    strategy,
    options,
    periods: normalizedPeriods,
    indicators,
    signals,
  };
}

function buildStrategySignalOutputPath({
  outputDir,
  symbol,
  timeframe,
  strategyName,
  range,
  to,
  now = Date.now(),
}) {
  const safeStrategyName = sanitizeFileSegment(strategyName || 'strategy');
  const safeSymbol = sanitizeFileSegment(symbol);
  const safeTimeframe = sanitizeFileSegment(timeframe);
  const safeRange = String(range).replace('-', 'after_');
  const suffix = to ? `to_${to}` : `at_${Math.floor(now / 1000)}`;

  return path.join(
    outputDir,
    `${safeStrategyName}_${safeSymbol}_${safeTimeframe}_${safeRange}_${suffix}.csv`,
  );
}

function writeStrategySignalCsv({
  periods,
  outputPath,
  strategy,
  options = {},
  order = 'asc',
}) {
  const normalizedPeriods = sortPeriods(periods, order);
  const context = buildStrategySignalContext(normalizedPeriods, strategy, options);
  const csv = periodsToCsv(normalizedPeriods, strategy.columns, context);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, csv, 'utf8');

  return {
    csv,
    context,
    periods: normalizedPeriods,
    outputPath,
  };
}

function buildDemoBollingerAdxSignalColumns() {
  return [
    ...DEFAULT_SIGNAL_COLUMNS,
    { header: 'bollinger_basis', value: (period, context) => context.indicators.bands.get(period.time)?.basis ?? '' },
    { header: 'bollinger_upper', value: (period, context) => context.indicators.bands.get(period.time)?.upper ?? '' },
    { header: 'bollinger_lower', value: (period, context) => context.indicators.bands.get(period.time)?.lower ?? '' },
    { header: 'bollinger_stddev', value: (period, context) => context.indicators.bands.get(period.time)?.stdDev ?? '' },
    { header: 'adx', value: (period, context) => context.indicators.dmi.get(period.time)?.adx ?? '' },
    { header: 'plus_di', value: (period, context) => context.indicators.dmi.get(period.time)?.plusDI ?? '' },
    { header: 'minus_di', value: (period, context) => context.indicators.dmi.get(period.time)?.minusDI ?? '' },
    { header: 'is_trending', value: (period, context) => {
      const signal = context.signals.get(period.time);
      return signal?.isTrending ? 1 : 0;
    } },
    { header: 'in_date_range', value: (period, context) => {
      const signal = context.signals.get(period.time);
      return signal?.inDateRange ? 1 : 0;
    } },
  ];
}

function createDemoBollingerAdxStrategy() {
  return createStrategySignalDefinition({
    name: 'demo_bollinger_bands_adx',
    description: 'Bollinger Bands breakout/reversal with ADX regime filter',
    defaultOptions: DEFAULT_DEMO_BOLLINGER_ADX_OPTIONS,
    indicatorBuilders: {
      bands(periods, options) {
        return calculateBollingerBands(periods, {
          length: options.length,
          maType: options.maType,
          mult: options.mult,
          sourceKey: options.sourceKey,
          volumeKey: options.volumeKey,
          alpha: options.alpha,
        });
      },
      dmi(periods, options) {
        return calculateDirectionalMovement(periods, {
          diLength: options.diLength,
          adxLength: options.adxLength,
          highKey: options.highKey,
          lowKey: options.lowKey,
          closeKey: options.closeKey,
        });
      },
    },
    evaluate({ period, indicators, options, strategy }) {
      const time = period.time;
      const band = indicators.bands.get(time);
      const dmi = indicators.dmi.get(time);
      const close = Number(period[options.closeKey || 'close']);
      const startTime = parseStrategyTimestamp(options.startDate) ?? Number.NEGATIVE_INFINITY;
      const endTime = parseStrategyTimestamp(options.endDate) ?? Number.POSITIVE_INFINITY;
      const inDateRange = time >= startTime && time <= endTime;
      const isTrending = Number(dmi?.adx) > Number(options.adxThreshold || 0);

      if (!band || !Number.isFinite(close) || !inDateRange) {
        return {
          triggered: false,
          name: strategy.name,
          side: '',
          regime: isTrending ? 'trend' : 'range',
          code: '',
          reason: '',
          isTrending,
          inDateRange,
        };
      }

      if (isTrending) {
        if (close > band.upper) {
          return {
            triggered: true,
            name: strategy.name,
            side: 'long',
            regime: 'trend',
            code: 'TREND_BREAKOUT_LONG',
            reason: 'close above upper band with ADX above threshold',
            isTrending,
            inDateRange,
          };
        }

        if (close < band.lower) {
          return {
            triggered: true,
            name: strategy.name,
            side: 'short',
            regime: 'trend',
            code: 'TREND_BREAKDOWN_SHORT',
            reason: 'close below lower band with ADX above threshold',
            isTrending,
            inDateRange,
          };
        }
      } else {
        if (close < band.lower) {
          return {
            triggered: true,
            name: strategy.name,
            side: 'long',
            regime: 'range',
            code: 'RANGE_REVERSAL_LONG',
            reason: 'close below lower band with ADX below threshold',
            isTrending,
            inDateRange,
          };
        }

        if (close > band.upper) {
          return {
            triggered: true,
            name: strategy.name,
            side: 'short',
            regime: 'range',
            code: 'RANGE_REVERSAL_SHORT',
            reason: 'close above upper band with ADX below threshold',
            isTrending,
            inDateRange,
          };
        }
      }

      return {
        triggered: false,
        name: strategy.name,
        side: '',
        regime: isTrending ? 'trend' : 'range',
        code: '',
        reason: '',
        isTrending,
        inDateRange,
      };
    },
    columns: buildDemoBollingerAdxSignalColumns(),
  });
}

function buildDemoBollingerAdxSignalContext(periods, options = {}) {
  const strategy = createDemoBollingerAdxStrategy();
  return buildStrategySignalContext(periods, strategy, options);
}

function buildDemoBollingerAdxSignalOutputPath(options) {
  return buildStrategySignalOutputPath({
    ...options,
    strategyName: 'demo_bollinger_bands_adx',
  });
}

module.exports = {
  DEFAULT_DEMO_BOLLINGER_ADX_OPTIONS,
  DEFAULT_SIGNAL_COLUMNS,
  buildDemoBollingerAdxSignalColumns,
  buildDemoBollingerAdxSignalContext,
  buildDemoBollingerAdxSignalOutputPath,
  buildStrategySignalContext,
  buildStrategySignalOutputPath,
  createDemoBollingerAdxStrategy,
  createStrategySignalDefinition,
  writeStrategySignalCsv,
};
