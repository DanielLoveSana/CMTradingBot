const {
  DEFAULT_CONFIG_PATH,
  extractMarketSymbolId,
  getSymbolAliasRecord,
  isFullMarketSymbol,
  normalizeAliasKey,
  setSymbolAliasRecord,
} = require('./marketSymbolCache');

function normalizeText(value = '') {
  return String(value)
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeLooseText(value = '') {
  return normalizeText(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

function toAliasRecord(market, alias) {
  return {
    id: market.id,
    exchange: market.exchange,
    fullExchange: market.fullExchange,
    symbol: market.symbol,
    description: market.description,
    type: market.type,
    alias: normalizeAliasKey(alias),
    updatedAt: new Date().toISOString(),
  };
}

function formatCandidate(market) {
  const parts = [market.id];
  if (market.description) parts.push(market.description);
  if (market.type) parts.push(`type=${market.type}`);
  return parts.join(' | ');
}

function scoreSearchResult(search, market) {
  const normalizedSearch = normalizeText(search);
  const looseSearch = normalizeLooseText(search);

  if (!normalizedSearch) return 0;

  const normalizedId = normalizeText(market.id);
  const looseId = normalizeLooseText(market.id);
  const normalizedSymbol = normalizeText(market.symbol);
  const looseSymbol = normalizeLooseText(market.symbol);
  const normalizedDescription = normalizeText(market.description);
  const looseDescription = normalizeLooseText(market.description);

  let score = 0;

  if (normalizedId === normalizedSearch) score = Math.max(score, 1000);
  if (looseId === looseSearch) score = Math.max(score, 980);
  if (normalizedSymbol === normalizedSearch) score = Math.max(score, 960);
  if (looseSymbol === looseSearch) score = Math.max(score, 940);
  if (normalizedDescription === normalizedSearch) score = Math.max(score, 920);
  if (looseDescription === looseSearch) score = Math.max(score, 900);

  if (normalizedSymbol.startsWith(normalizedSearch)) score = Math.max(score, 780);
  if (looseSymbol.startsWith(looseSearch)) score = Math.max(score, 760);
  if (normalizedDescription.includes(normalizedSearch)) score = Math.max(score, 720);
  if (looseDescription.includes(looseSearch)) score = Math.max(score, 700);
  if (normalizedId.includes(normalizedSearch)) score = Math.max(score, 680);
  if (looseId.includes(looseSearch)) score = Math.max(score, 660);

  return score;
}

function selectSearchResult(search, markets = []) {
  if (!markets.length) return null;

  const ranked = markets
    .map((market, index) => ({
      market,
      index,
      score: scoreSearchResult(search, market),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    });

  const [best, second] = ranked;

  if (!best || best.score <= 0) {
    const preview = markets.slice(0, 5).map((market) => `- ${formatCandidate(market)}`).join('\n');
    throw new Error(`Unable to confidently resolve "${search}". Top candidates:\n${preview}`);
  }

  if (
    best.score >= 900
    || ranked.length === 1
    || best.score - (second ? second.score : 0) >= 80
    || best.score >= 700
  ) {
    return best.market;
  }

  const preview = ranked
    .slice(0, 5)
    .map(({ market }) => `- ${formatCandidate(market)}`)
    .join('\n');

  throw new Error(`Ambiguous TradingView symbol for "${search}". Please use a more specific keyword or full symbol.\n${preview}`);
}

async function resolveMarketSymbol(input, options = {}) {
  const {
    configPath = DEFAULT_CONFIG_PATH,
    filter = '',
    persist = true,
    searchMarket,
  } = options;

  const search = String(input || '').trim();
  if (!search) {
    throw new Error('symbol is required');
  }

  const cachedRecord = getSymbolAliasRecord(search, configPath);
  const cachedId = extractMarketSymbolId(cachedRecord);

  if (cachedId) {
    return {
      input: search,
      id: cachedId,
      source: 'cache',
      cached: true,
      ...(typeof cachedRecord === 'object' ? cachedRecord : {}),
    };
  }

  if (isFullMarketSymbol(search)) {
    const [exchange, ...symbolParts] = search.split(':');
    return {
      input: search,
      id: search,
      exchange,
      symbol: symbolParts.join(':'),
      source: 'direct',
      cached: false,
    };
  }

  if (typeof searchMarket !== 'function') {
    throw new Error('searchMarket function is required');
  }

  const markets = await searchMarket(search, filter);
  if (!Array.isArray(markets) || markets.length === 0) {
    throw new Error(`Unable to find a TradingView symbol for "${search}"`);
  }

  const selected = selectSearchResult(search, markets);
  const resolved = {
    input: search,
    id: selected.id,
    exchange: selected.exchange,
    fullExchange: selected.fullExchange,
    symbol: selected.symbol,
    description: selected.description,
    type: selected.type,
    source: 'search',
    cached: false,
  };

  if (persist) {
    setSymbolAliasRecord(search, toAliasRecord(selected, search), configPath);
  }

  return resolved;
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  formatCandidate,
  resolveMarketSymbol,
  scoreSearchResult,
  selectSearchResult,
  toAliasRecord,
};
