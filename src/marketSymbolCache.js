const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG_PATH = path.join(__dirname, 'klineSymbolConfig.js');

function normalizeAliasKey(alias) {
  return String(alias || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function isFullMarketSymbol(value) {
  const input = String(value || '').trim();
  return /^[^:\s]+:[^:\s].*$/.test(input);
}

function sortAliasEntries(aliases = {}) {
  return Object.fromEntries(
    Object.entries(aliases).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function renderConfigFile(aliases = {}) {
  const sortedAliases = sortAliasEntries(aliases);
  const aliasLines = JSON.stringify(sortedAliases, null, 2).split('\n');
  const [firstLine, ...restLines] = aliasLines;
  const remaining = restLines.map((line) => `  ${line}`).join('\n');
  const body = remaining
    ? `  aliases: ${firstLine}\n${remaining},`
    : `  aliases: ${firstLine},`;

  return `'use strict';\n\nmodule.exports = {\n${body}\n};\n`;
}

function ensureConfigFile(configPath = DEFAULT_CONFIG_PATH) {
  const resolvedPath = path.resolve(configPath);

  if (fs.existsSync(resolvedPath)) {
    return resolvedPath;
  }

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, renderConfigFile({}), 'utf8');

  return resolvedPath;
}

function loadSymbolConfig(configPath = DEFAULT_CONFIG_PATH) {
  const resolvedPath = ensureConfigFile(configPath);

  delete require.cache[resolvedPath];

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const loaded = require(resolvedPath);
  const aliases = loaded && typeof loaded.aliases === 'object' && loaded.aliases !== null
    ? loaded.aliases
    : {};

  return {
    ...loaded,
    aliases,
  };
}

function saveSymbolConfig(config = {}, configPath = DEFAULT_CONFIG_PATH) {
  const resolvedPath = ensureConfigFile(configPath);
  const normalized = {
    ...config,
    aliases: sortAliasEntries(config.aliases || {}),
  };

  fs.writeFileSync(resolvedPath, renderConfigFile(normalized.aliases), 'utf8');
  delete require.cache[resolvedPath];

  return normalized;
}

function extractMarketSymbolId(record) {
  if (!record) return '';
  if (typeof record === 'string') return record;
  if (typeof record === 'object' && typeof record.id === 'string') return record.id;
  return '';
}

function getSymbolAliasRecord(alias, configPath = DEFAULT_CONFIG_PATH) {
  const key = normalizeAliasKey(alias);
  if (!key) return null;

  const config = loadSymbolConfig(configPath);
  return config.aliases[key] || null;
}

function setSymbolAliasRecord(alias, record, configPath = DEFAULT_CONFIG_PATH) {
  const key = normalizeAliasKey(alias);
  if (!key) {
    throw new Error('alias is required');
  }

  const id = extractMarketSymbolId(record);
  if (!id) {
    throw new Error('record.id is required');
  }

  const config = loadSymbolConfig(configPath);
  const nextAliases = {
    ...config.aliases,
    [key]: record,
  };

  return saveSymbolConfig({
    ...config,
    aliases: nextAliases,
  }, configPath);
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  ensureConfigFile,
  extractMarketSymbolId,
  getSymbolAliasRecord,
  isFullMarketSymbol,
  loadSymbolConfig,
  normalizeAliasKey,
  saveSymbolConfig,
  setSymbolAliasRecord,
};
