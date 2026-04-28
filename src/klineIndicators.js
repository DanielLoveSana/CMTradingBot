function roundIndicator(value, digits = 8) {
  return Number(value.toFixed(digits));
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

// Calculate EMA from a selected price source.
function calculateEMA(periods, length = 20, sourceKey = 'close') {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error(`EMA length must be a positive integer: ${length}`);
  }

  const sortedPeriods = sortPeriods(periods, 'asc');
  const values = new Map();

  if (sortedPeriods.length < length) {
    sortedPeriods.forEach((period) => values.set(period.time, null));
    return values;
  }

  const multiplier = 2 / (length + 1);
  let ema = 0;

  for (let index = 0; index < sortedPeriods.length; index += 1) {
    const period = sortedPeriods[index];
    const price = Number(period[sourceKey]);

    if (!Number.isFinite(price)) {
      values.set(period.time, null);
      continue;
    }

    if (index < length - 1) {
      values.set(period.time, null);
      ema += price;
      continue;
    }

    if (index === length - 1) {
      ema = (ema + price) / length;
      values.set(period.time, roundIndicator(ema));
      continue;
    }

    ema = (price - ema) * multiplier + ema;
    values.set(period.time, roundIndicator(ema));
  }

  return values;
}

// Classify the candle by comparing close vs open.
function calculateCandleDirection(periods, openKey = 'open', closeKey = 'close') {
  const sortedPeriods = sortPeriods(periods, 'asc');
  const values = new Map();

  sortedPeriods.forEach((period) => {
    const open = Number(period[openKey]);
    const close = Number(period[closeKey]);

    if (!Number.isFinite(open) || !Number.isFinite(close)) {
      values.set(period.time, null);
      return;
    }

    if (close > open) {
      values.set(period.time, '🟢');
    } else if (close < open) {
      values.set(period.time, '🔴');
    } else {
      values.set(period.time, '🟰');
    }
  });

  return values;
}

// Classify the bar structure relative to the previous bar.
function calculateBarType(periods, highKey = 'max', lowKey = 'min') {
  const sortedPeriods = sortPeriods(periods, 'asc');
  const values = new Map();

  let previousHigh = null;
  let previousLow = null;

  for (let index = 0; index < sortedPeriods.length; index += 1) {
    const period = sortedPeriods[index];
    const currentHigh = Number(period[highKey]);
    const currentLow = Number(period[lowKey]);

    if (!Number.isFinite(currentHigh) || !Number.isFinite(currentLow)) {
      values.set(period.time, null);
      continue;
    }

    if (index === 0 || previousHigh === null || previousLow === null) {
      values.set(period.time, null);
      previousHigh = currentHigh;
      previousLow = currentLow;
      continue;
    }

    if (currentHigh > previousHigh && currentLow > previousLow) {
      values.set(period.time, 'UpBar');
    } else if (
      currentHigh >= previousHigh
      && currentLow <= previousLow
      && (currentHigh > previousHigh || currentLow < previousLow)
    ) {
      values.set(period.time, 'OutsideBar');
    } else if (currentHigh < previousHigh && currentLow < previousLow) {
      values.set(period.time, 'DownBar');
    } else if (currentHigh < previousHigh && currentLow > previousLow) {
      values.set(period.time, 'InsideBar');
    } else {
      values.set(period.time, null);
    }

    previousHigh = currentHigh;
    previousLow = currentLow;
  }

  return values;
}

module.exports = {
  calculateBarType,
  calculateCandleDirection,
  calculateEMA,
};
