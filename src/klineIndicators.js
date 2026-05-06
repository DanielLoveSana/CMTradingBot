function roundIndicator(value, digits = 8) {
  return Number(value.toFixed(digits));
}

function roundOrNull(value, digits = 8) {
  if (!Number.isFinite(value)) return null;
  return roundIndicator(value, digits);
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

function getNumericValue(period, key) {
  const value = Number(period?.[key]);
  return Number.isFinite(value) ? value : null;
}

function getWindowValues(periods, index, length, sourceKey) {
  if (index + 1 < length) return null;

  const start = index - length + 1;
  const values = [];

  for (let cursor = start; cursor <= index; cursor += 1) {
    const value = getNumericValue(periods[cursor], sourceKey);
    if (!Number.isFinite(value)) return null;
    values.push(value);
  }

  return values;
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

function calculateSMA(periods, length = 20, sourceKey = 'close') {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error(`SMA length must be a positive integer: ${length}`);
  }

  const sortedPeriods = sortPeriods(periods, 'asc');
  const values = new Map();

  sortedPeriods.forEach((period, index) => {
    const window = getWindowValues(sortedPeriods, index, length, sourceKey);

    if (!window) {
      values.set(period.time, null);
      return;
    }

    const sum = window.reduce((total, value) => total + value, 0);
    values.set(period.time, roundIndicator(sum / length));
  });

  return values;
}

function calculateRMA(periods, length = 20, sourceKey = 'close') {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error(`RMA length must be a positive integer: ${length}`);
  }

  const sortedPeriods = sortPeriods(periods, 'asc');
  const values = new Map();

  let rma = null;

  sortedPeriods.forEach((period, index) => {
    const value = getNumericValue(period, sourceKey);
    const window = getWindowValues(sortedPeriods, index, length, sourceKey);

    if (!Number.isFinite(value)) {
      values.set(period.time, null);
      return;
    }

    if (window && index === length - 1) {
      const sum = window.reduce((total, entry) => total + entry, 0);
      rma = sum / length;
      values.set(period.time, roundIndicator(rma));
      return;
    }

    if (index < length - 1 || !Number.isFinite(rma)) {
      values.set(period.time, null);
      return;
    }

    rma = ((rma * (length - 1)) + value) / length;
    values.set(period.time, roundIndicator(rma));
  });

  return values;
}

function calculateWMA(periods, length = 20, sourceKey = 'close') {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error(`WMA length must be a positive integer: ${length}`);
  }

  const sortedPeriods = sortPeriods(periods, 'asc');
  const values = new Map();
  const weightTotal = (length * (length + 1)) / 2;

  sortedPeriods.forEach((period, index) => {
    const window = getWindowValues(sortedPeriods, index, length, sourceKey);

    if (!window) {
      values.set(period.time, null);
      return;
    }

    const weightedSum = window.reduce(
      (total, value, windowIndex) => total + (value * (windowIndex + 1)),
      0,
    );

    values.set(period.time, roundIndicator(weightedSum / weightTotal));
  });

  return values;
}

function calculateVWMA(periods, length = 20, sourceKey = 'close', volumeKey = 'volume') {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error(`VWMA length must be a positive integer: ${length}`);
  }

  const sortedPeriods = sortPeriods(periods, 'asc');
  const values = new Map();

  sortedPeriods.forEach((period, index) => {
    if (index + 1 < length) {
      values.set(period.time, null);
      return;
    }

    const start = index - length + 1;
    let weightedTotal = 0;
    let volumeTotal = 0;

    for (let cursor = start; cursor <= index; cursor += 1) {
      const source = getNumericValue(sortedPeriods[cursor], sourceKey);
      const volume = getNumericValue(sortedPeriods[cursor], volumeKey);

      if (!Number.isFinite(source) || !Number.isFinite(volume)) {
        weightedTotal = null;
        break;
      }

      weightedTotal += source * volume;
      volumeTotal += volume;
    }

    if (!Number.isFinite(weightedTotal) || volumeTotal === 0) {
      values.set(period.time, null);
      return;
    }

    values.set(period.time, roundIndicator(weightedTotal / volumeTotal));
  });

  return values;
}

function calculateStdDev(periods, length = 20, sourceKey = 'close') {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error(`StdDev length must be a positive integer: ${length}`);
  }

  const sortedPeriods = sortPeriods(periods, 'asc');
  const values = new Map();

  sortedPeriods.forEach((period, index) => {
    const window = getWindowValues(sortedPeriods, index, length, sourceKey);

    if (!window) {
      values.set(period.time, null);
      return;
    }

    const mean = window.reduce((total, value) => total + value, 0) / length;
    const variance = window.reduce(
      (total, value) => total + ((value - mean) ** 2),
      0,
    ) / length;

    values.set(period.time, roundIndicator(Math.sqrt(variance)));
  });

  return values;
}

function calculateLLT(periods, alpha = 0.1, sourceKey = 'close') {
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) {
    throw new Error(`LLT alpha must be a number between 0 and 1: ${alpha}`);
  }

  const sortedPeriods = sortPeriods(periods, 'asc');
  const values = new Map();
  const cache = [];

  sortedPeriods.forEach((period, index) => {
    const source = getNumericValue(period, sourceKey);

    if (!Number.isFinite(source)) {
      values.set(period.time, null);
      cache.push(null);
      return;
    }

    let llt = null;

    if (index === 1) {
      llt = getNumericValue(sortedPeriods[0], sourceKey);
    } else if (index === 2) {
      llt = getNumericValue(sortedPeriods[0], sourceKey);
    } else if (index > 2) {
      const prev1 = cache[index - 1];
      const prev2 = cache[index - 2];

      if (Number.isFinite(prev1) && Number.isFinite(prev2)) {
        llt = (
          (alpha - (alpha * alpha / 4)) * source
          + ((alpha * alpha) / 2) * getNumericValue(sortedPeriods[index - 1], sourceKey)
          - (alpha - (3 * alpha * alpha / 4)) * getNumericValue(sortedPeriods[index - 2], sourceKey)
          + 2 * (1 - alpha) * prev1
          - ((1 - alpha) * (1 - alpha)) * prev2
        );
      }
    }

    cache.push(llt);
    values.set(period.time, roundOrNull(llt));
  });

  return values;
}

function normalizeMovingAverageType(type) {
  const normalized = String(type || 'SMA').trim().toUpperCase();

  if (normalized === 'SMMA (RMA)' || normalized === 'SMMA' || normalized === 'RMA') {
    return 'RMA';
  }

  return normalized;
}

function calculateMovingAverage(
  periods,
  length = 20,
  type = 'SMA',
  sourceKey = 'close',
  options = {},
) {
  switch (normalizeMovingAverageType(type)) {
    case 'SMA':
      return calculateSMA(periods, length, sourceKey);
    case 'EMA':
      return calculateEMA(periods, length, sourceKey);
    case 'RMA':
      return calculateRMA(periods, length, sourceKey);
    case 'WMA':
      return calculateWMA(periods, length, sourceKey);
    case 'VWMA':
      return calculateVWMA(periods, length, sourceKey, options.volumeKey || 'volume');
    case 'LLT':
      return calculateLLT(periods, options.alpha ?? 0.1, sourceKey);
    default:
      throw new Error(`Unsupported moving average type: ${type}`);
  }
}

function calculateBollingerBands(periods, options = {}) {
  const {
    length = 20,
    mult = 2,
    maType = 'SMA',
    sourceKey = 'close',
    volumeKey = 'volume',
    alpha = 0.1,
  } = options;

  const sortedPeriods = sortPeriods(periods, 'asc');
  const basis = calculateMovingAverage(sortedPeriods, length, maType, sourceKey, {
    alpha,
    volumeKey,
  });
  const stdDev = calculateStdDev(sortedPeriods, length, sourceKey);
  const values = new Map();

  sortedPeriods.forEach((period) => {
    const basisValue = basis.get(period.time);
    const stdDevValue = stdDev.get(period.time);

    if (!Number.isFinite(basisValue) || !Number.isFinite(stdDevValue)) {
      values.set(period.time, null);
      return;
    }

    const deviation = mult * stdDevValue;
    values.set(period.time, {
      basis: roundIndicator(basisValue),
      upper: roundIndicator(basisValue + deviation),
      lower: roundIndicator(basisValue - deviation),
      stdDev: roundIndicator(stdDevValue),
      deviation: roundIndicator(deviation),
    });
  });

  return values;
}

function calculateDirectionalMovement(periods, options = {}) {
  const {
    highKey = 'max',
    lowKey = 'min',
    closeKey = 'close',
    diLength = 14,
    adxLength = 14,
  } = options;

  if (!Number.isInteger(diLength) || diLength <= 0) {
    throw new Error(`DI length must be a positive integer: ${diLength}`);
  }

  if (!Number.isInteger(adxLength) || adxLength <= 0) {
    throw new Error(`ADX length must be a positive integer: ${adxLength}`);
  }

  const sortedPeriods = sortPeriods(periods, 'asc');
  const derivedPeriods = sortedPeriods.map((period, index) => {
    const high = getNumericValue(period, highKey);
    const low = getNumericValue(period, lowKey);
    const close = getNumericValue(period, closeKey);

    if (!Number.isFinite(high) || !Number.isFinite(low)) {
      return {
        ...period,
        __plusDM: null,
        __minusDM: null,
        __tr: null,
      };
    }

    if (index === 0 || !Number.isFinite(close)) {
      return {
        ...period,
        __plusDM: 0,
        __minusDM: 0,
        __tr: roundIndicator(high - low),
      };
    }

    const previous = sortedPeriods[index - 1];
    const previousHigh = getNumericValue(previous, highKey);
    const previousLow = getNumericValue(previous, lowKey);
    const previousClose = getNumericValue(previous, closeKey);

    if (!Number.isFinite(previousHigh) || !Number.isFinite(previousLow) || !Number.isFinite(previousClose)) {
      return {
        ...period,
        __plusDM: null,
        __minusDM: null,
        __tr: null,
      };
    }

    const up = high - previousHigh;
    const down = previousLow - low;
    const plusDM = up > down && up > 0 ? up : 0;
    const minusDM = down > up && down > 0 ? down : 0;
    const trueRange = Math.max(
      high - low,
      Math.abs(high - previousClose),
      Math.abs(low - previousClose),
    );

    return {
      ...period,
      __plusDM: plusDM,
      __minusDM: minusDM,
      __tr: trueRange,
    };
  });

  const plusDMRma = calculateRMA(derivedPeriods, diLength, '__plusDM');
  const minusDMRma = calculateRMA(derivedPeriods, diLength, '__minusDM');
  const trRma = calculateRMA(derivedPeriods, diLength, '__tr');

  const dxPeriods = sortedPeriods.map((period) => {
    const plusValue = plusDMRma.get(period.time);
    const minusValue = minusDMRma.get(period.time);
    const trValue = trRma.get(period.time);

    if (
      !Number.isFinite(plusValue)
      || !Number.isFinite(minusValue)
      || !Number.isFinite(trValue)
      || trValue === 0
    ) {
      return {
        ...period,
        __dx: null,
      };
    }

    const plusDI = (100 * plusValue) / trValue;
    const minusDI = (100 * minusValue) / trValue;
    const sum = plusDI + minusDI;
    const dx = 100 * (Math.abs(plusDI - minusDI) / (sum === 0 ? 1 : sum));

    return {
      ...period,
      __dx: dx,
      __plusDI: plusDI,
      __minusDI: minusDI,
    };
  });

  const adx = calculateRMA(dxPeriods, adxLength, '__dx');
  const dxByTime = new Map(dxPeriods.map((period) => [period.time, period]));
  const values = new Map();

  sortedPeriods.forEach((period) => {
    const dxPeriod = dxByTime.get(period.time) || {};

    values.set(period.time, {
      plusDI: roundOrNull(dxPeriod.__plusDI),
      minusDI: roundOrNull(dxPeriod.__minusDI),
      dx: roundOrNull(dxPeriod.__dx),
      adx: adx.get(period.time),
      trueRange: roundOrNull(trRma.get(period.time)),
    });
  });

  return values;
}

function calculateADX(periods, options = {}) {
  const directionalMovement = calculateDirectionalMovement(periods, options);
  const values = new Map();

  directionalMovement.forEach((entry, time) => {
    values.set(time, entry.adx);
  });

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
  calculateADX,
  calculateBollingerBands,
  calculateBarType,
  calculateCandleDirection,
  calculateEMA,
  calculateDirectionalMovement,
  calculateLLT,
  calculateMovingAverage,
  calculateRMA,
  calculateSMA,
  calculateStdDev,
  calculateVWMA,
  calculateWMA,
};
