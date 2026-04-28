const fs = require('fs');
const path = require('path');
const { calculateBarType, calculateCandleDirection, calculateEMA } = require('./klineIndicators');

// Add new derived series here when you want more indicators in all CSV outputs.
const DEFAULT_KLINE_DERIVATIONS = Object.freeze({
  barType: (periods) => calculateBarType(periods, 'max', 'min'),
  candleDirection: (periods) => calculateCandleDirection(periods, 'open', 'close'),
  ema20: (periods) => calculateEMA(periods, 20, 'close'),
});

// Update this list if you want to change the CSV fields for all K-line scripts.
const DEFAULT_KLINE_COLUMNS = Object.freeze([
  { header: 'timestamp', value: (period) => period.time },
  { header: 'datetime_utc', value: (period) => formatDateTime(period.time) },
  { header: 'open', value: (period) => period.open },
  { header: 'high', value: (period) => period.max },
  { header: 'low', value: (period) => period.min },
  { header: 'close', value: (period) => period.close },
  { header: 'volume', value: (period) => period.volume },
  { header: 'candle_direction', value: (period, context) => context.derivations.candleDirection.get(period.time) ?? '' },
  { header: 'ema20', value: (period, context) => context.derivations.ema20.get(period.time) ?? '' },
  { header: 'bar_type', value: (period, context) => context.derivations.barType.get(period.time) ?? '' },
]);

function sanitizeFileSegment(value = '') {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
}

function formatDateTime(timestamp) {
  return new Date(timestamp * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';

  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;

  return `"${text.replace(/"/g, '""')}"`;
}

function sortPeriods(periods, order = 'asc') {
  const normalized = [...periods];

  normalized.sort((left, right) => (
    order === 'desc'
      ? right.time - left.time
      : left.time - right.time
  ));

  return normalized;
}

function buildDerivations(periods, derivationBuilders = DEFAULT_KLINE_DERIVATIONS) {
  return Object.fromEntries(
    Object.entries(derivationBuilders).map(([key, build]) => [key, build(periods)]),
  );
}

function buildCsvContext(periods, derivationBuilders = DEFAULT_KLINE_DERIVATIONS) {
  return {
    derivations: buildDerivations(periods, derivationBuilders),
  };
}

function periodsToCsv(
  periods,
  columns = DEFAULT_KLINE_COLUMNS,
  context = buildCsvContext(periods),
) {
  const rows = [
    columns.map((column) => escapeCsvValue(column.header)).join(','),
  ];

  periods.forEach((period) => {
    rows.push(
      columns.map((column) => escapeCsvValue(column.value(period, context))).join(','),
    );
  });

  return `${rows.join('\n')}\n`;
}

function previewCsv(csv, lineCount = 6) {
  return csv.split('\n').slice(0, lineCount).join('\n');
}

function writePeriodsCsv({
  periods,
  outputPath,
  columns = DEFAULT_KLINE_COLUMNS,
  order = 'asc',
  context,
}) {
  const normalizedPeriods = sortPeriods(periods, order);
  const resolvedContext = context || buildCsvContext(normalizedPeriods);
  const csv = periodsToCsv(normalizedPeriods, columns, resolvedContext);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, csv, 'utf8');

  return {
    csv,
    context: resolvedContext,
    periods: normalizedPeriods,
    outputPath,
  };
}

function buildHistoricalOutputPath({
  outputDir,
  symbol,
  timeframe,
  range,
  to,
  now = Date.now(),
}) {
  const safeSymbol = sanitizeFileSegment(symbol);
  const safeTimeframe = sanitizeFileSegment(timeframe);
  const safeRange = String(range).replace('-', 'after_');
  const suffix = to ? `to_${to}` : `at_${Math.floor(now / 1000)}`;

  return path.join(
    outputDir,
    `${safeSymbol}_${safeTimeframe}_${safeRange}_${suffix}.csv`,
  );
}

function buildRealtimeOutputPath({
  outputDir,
  symbol,
  timeframe,
}) {
  const safeSymbol = sanitizeFileSegment(symbol);
  const safeTimeframe = sanitizeFileSegment(timeframe);

  return path.join(
    outputDir,
    `${safeSymbol}_${safeTimeframe}_realtime.csv`,
  );
}

module.exports = {
  DEFAULT_KLINE_COLUMNS,
  DEFAULT_KLINE_DERIVATIONS,
  buildHistoricalOutputPath,
  buildRealtimeOutputPath,
  buildCsvContext,
  buildDerivations,
  formatDateTime,
  periodsToCsv,
  previewCsv,
  sanitizeFileSegment,
  sortPeriods,
  writePeriodsCsv,
};
