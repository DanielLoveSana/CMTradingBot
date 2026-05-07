const CATEGORY_ORDER = [
  'crypto',
  'stock',
  'futures',
  'forex',
  'cfd',
  'index',
  'economic',
  'other',
];

const CATEGORY_LABELS = {
  crypto: '加密货币',
  stock: '股票',
  futures: '期货',
  forex: '外汇',
  cfd: '差价合约',
  index: '指数',
  economic: '经济指标',
  other: '其他',
};

const SEARCH_TYPE_LABELS = {
  stock: '股票',
  futures: '期货',
  forex: '外汇',
  cfd: '差价合约',
  crypto: '加密货币',
  index: '指数',
  economic: '经济指标',
};

const SERVER_LABELS = {
  auto: '自动轮询',
  data: 'data',
  widgetdata: 'widgetdata',
  prodata: 'prodata',
};

const PROXY_PROTOCOL_LABELS = {
  auto: '自动识别',
  socks5: 'SOCKS5',
  http: 'HTTP',
  https: 'HTTPS',
  socks4: 'SOCKS4',
  none: '直连',
};

const STATUS_LABELS = {
  running: '运行中',
  starting: '启动中',
  connecting: '连接中',
  stopped: '已停止',
  error: '错误',
};

const SCOPE_LABELS = {
  export: '导出',
  listener: '监听',
  panel: '面板',
  system: '系统',
};

const appState = {
  defaults: null,
  constants: null,
  listeners: new Map(),
  lastExport: null,
  symbolCatalog: [],
  symbolCatalogTree: [],
  activeTab: 'overview',
};

const elements = {
  panelTitle: document.querySelector('#panel-title'),
  panelUrl: document.querySelector('#panel-url'),
  streamStatus: document.querySelector('#stream-status'),
  historicalForm: document.querySelector('#historical-form'),
  strategyForm: document.querySelector('#strategy-form'),
  realtimeForm: document.querySelector('#realtime-form'),
  historicalSubmit: document.querySelector('#historical-submit'),
  strategySubmit: document.querySelector('#strategy-submit'),
  realtimeSubmit: document.querySelector('#realtime-submit'),
  historicalReset: document.querySelector('#historical-reset'),
  strategyReset: document.querySelector('#strategy-reset'),
  realtimeReset: document.querySelector('#realtime-reset'),
  exportSummaries: [...document.querySelectorAll('[data-export-summary]')],
  exportPreviews: [...document.querySelectorAll('[data-export-preview]')],
  listenerList: document.querySelector('#listener-list'),
  listenerTemplate: document.querySelector('#listener-template'),
  logStream: document.querySelector('#log-stream'),
  metricRunning: document.querySelector('#metric-running'),
  metricStopped: document.querySelector('#metric-stopped'),
  metricErrors: document.querySelector('#metric-errors'),
  metricSymbols: document.querySelector('#metric-symbols'),
  metricExport: document.querySelector('#metric-export'),
  catalogCount: document.querySelector('#catalog-count'),
  catalogSummary: document.querySelector('#catalog-summary'),
  tabButtons: [...document.querySelectorAll('[data-tab-trigger]')],
  tabPanels: [...document.querySelectorAll('[data-tab-panel]')],
  jumpButtons: [...document.querySelectorAll('[data-jump-tab]')],
  overviewPulse: document.querySelector('#overview-pulse'),
  realtimeStatusSummary: document.querySelector('#realtime-status-summary'),
  listenersOverviewText: document.querySelector('#listeners-overview-text'),
  consoleStatusText: document.querySelector('#console-status-text'),
};

const symbolPickers = [...document.querySelectorAll('[data-symbol-picker]')].map((root) => ({
  root,
  input: root.querySelector('input[name="symbol"]'),
  toggle: root.querySelector('[data-picker-toggle]'),
  popover: root.querySelector('[data-picker]'),
  selection: root.querySelector('[data-picker-selection]'),
  categoryList: root.querySelector('[data-picker-level="category"]'),
  exchangeList: root.querySelector('[data-picker-level="exchange"]'),
  symbolList: root.querySelector('[data-picker-level="symbol"]'),
  meta: root.parentElement.querySelector('[data-picker-meta]'),
  activeCategoryKey: '',
  activeExchangeKey: '',
}));

function formatIso(value) {
  if (!value) return 'N/A';

  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
  } catch (error) {
    return value;
  }
}

function normalizeText(value) {
  return String(value || '').trim();
}

function formatCountLabel(count, unit) {
  return `${count} ${unit}`;
}

function summarizeListenerState() {
  const listeners = [...appState.listeners.values()];
  const running = listeners.filter((item) => (
    item.status === 'running' || item.status === 'starting' || item.status === 'connecting'
  )).length;
  const stopped = listeners.filter((item) => item.status === 'stopped').length;
  const errors = listeners.filter((item) => item.status === 'error').length;

  return {
    listeners,
    running,
    stopped,
    errors,
  };
}

function clampLogLines(max = 300) {
  while (elements.logStream.children.length > max) {
    elements.logStream.removeChild(elements.logStream.firstChild);
  }
}

function appendLog(entry) {
  const line = document.createElement('div');
  line.className = `log-line level-${entry.level || 'info'}`;

  const timestamp = document.createElement('time');
  timestamp.textContent = formatIso(entry.timestamp);

  const scope = document.createElement('span');
  scope.className = 'log-scope';
  scope.textContent = SCOPE_LABELS[entry.scope] || entry.scope || '系统';

  const message = document.createElement('span');
  message.className = 'log-message';
  message.textContent = entry.message || '';

  line.append(timestamp, scope, message);
  elements.logStream.appendChild(line);
  elements.logStream.scrollTop = elements.logStream.scrollHeight;
  clampLogLines();
}

function buildSelectOptions(select, values, options = {}) {
  const {
    includeBlank = false,
    blankLabel = '自动识别',
    labels = {},
  } = options;

  select.innerHTML = '';

  if (includeBlank) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = blankLabel;
    select.appendChild(option);
  }

  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labels[value] || value;
    select.appendChild(option);
  });
}

function applyFormValues(form, values) {
  Object.entries(values).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (!field) return;

    field.value = value === null || value === undefined ? '' : String(value);
  });
}

function serializeBaseExportForm(form) {
  return {
    symbol: form.symbol.value.trim(),
    timeframe: form.timeframe.value.trim(),
    range: Number(form.range.value),
    to: form.to.value.trim() || null,
    searchType: form.searchType.value,
    proxy: form.proxy.value.trim(),
    proxyProtocol: form.proxyProtocol.value,
    server: form.server.value,
    outputDir: form.outputDir.value.trim(),
    timeoutMs: Number(form.timeoutMs.value),
  };
}

function serializeHistoricalForm() {
  return serializeBaseExportForm(elements.historicalForm);
}

function serializeStrategyForm() {
  const form = elements.strategyForm;
  return {
    ...serializeBaseExportForm(form),
    length: Number(form.length.value),
    maType: form.maType.value,
    mult: Number(form.mult.value),
    alpha: Number(form.alpha.value),
    adxThreshold: Number(form.adxThreshold.value),
    adxLength: Number(form.adxLength.value),
    diLength: Number(form.diLength.value),
    startDate: form.startDate.value.trim(),
    endDate: form.endDate.value.trim(),
  };
}

function serializeRealtimeForm() {
  const form = elements.realtimeForm;
  return {
    symbol: form.symbol.value.trim(),
    timeframe: form.timeframe.value.trim(),
    range: Number(form.range.value),
    searchType: form.searchType.value,
    proxy: form.proxy.value.trim(),
    proxyProtocol: form.proxyProtocol.value,
    server: form.server.value,
    outputDir: form.outputDir.value.trim(),
    connectTimeoutMs: Number(form.connectTimeoutMs.value),
    exitAfterMs: Number(form.exitAfterMs.value || 0),
  };
}

function resolveCategoryKey(entry) {
  const type = normalizeText(entry.type).toLowerCase();
  const exchangeText = [
    entry.exchange,
    entry.fullExchange,
    entry.id,
  ].map((value) => normalizeText(value).toLowerCase()).join(' ');

  if (['crypto', 'spot', 'swap', 'perpetual', 'perp'].includes(type)) return 'crypto';
  if (['stock', 'fund', 'etf', 'dr', 'unit', 'right'].includes(type)) return 'stock';
  if (['futures', 'future'].includes(type)) return 'futures';
  if (type === 'forex') return 'forex';
  if (type === 'cfd') return 'cfd';
  if (type === 'index') return 'index';
  if (type === 'economic') return 'economic';

  if (/(binance|okx|bybit|kucoin|gate|kraken|coinbase|bitget)/.test(exchangeText)) {
    return 'crypto';
  }

  return 'other';
}

function inferSearchType(entry) {
  const categoryKey = resolveCategoryKey(entry);
  if (categoryKey === 'other') return '';
  return categoryKey;
}

function buildCatalogEntry(rawEntry) {
  return {
    ...rawEntry,
    alias: normalizeText(rawEntry.alias),
    id: normalizeText(rawEntry.id),
    exchange: normalizeText(rawEntry.exchange),
    fullExchange: normalizeText(rawEntry.fullExchange),
    symbol: normalizeText(rawEntry.symbol),
    description: normalizeText(rawEntry.description),
    type: normalizeText(rawEntry.type),
  };
}

function sortCatalogEntries(left, right) {
  const leftLabel = left.alias || left.symbol || left.id;
  const rightLabel = right.alias || right.symbol || right.id;
  return leftLabel.localeCompare(rightLabel);
}

function buildSymbolCatalogTree(catalog) {
  const categoryMap = new Map();

  (catalog || []).map(buildCatalogEntry).forEach((entry) => {
    if (!entry.id) return;

    const categoryKey = resolveCategoryKey(entry);
    if (!categoryMap.has(categoryKey)) {
      categoryMap.set(categoryKey, {
        key: categoryKey,
        label: CATEGORY_LABELS[categoryKey] || CATEGORY_LABELS.other,
        entries: [],
        directEntries: [],
        exchanges: new Map(),
      });
    }

    const category = categoryMap.get(categoryKey);
    category.entries.push(entry);

    const exchangeLabel = entry.exchange || entry.fullExchange;
    if (!exchangeLabel) {
      category.directEntries.push(entry);
      return;
    }

    const exchangeKey = exchangeLabel.toUpperCase();
    if (!category.exchanges.has(exchangeKey)) {
      category.exchanges.set(exchangeKey, {
        key: exchangeKey,
        label: exchangeLabel,
        entries: [],
      });
    }

    category.exchanges.get(exchangeKey).entries.push(entry);
  });

  return CATEGORY_ORDER
    .map((key) => categoryMap.get(key))
    .filter(Boolean)
    .map((category) => ({
      ...category,
      entries: [...category.entries].sort(sortCatalogEntries),
      directEntries: [...category.directEntries].sort(sortCatalogEntries),
      exchanges: [...category.exchanges.values()]
        .map((exchange) => ({
          ...exchange,
          entries: [...exchange.entries].sort(sortCatalogEntries),
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    }));
}

function setStreamStatus(mode = 'connecting') {
  const stateMap = {
    connecting: {
      text: '连接中',
      className: 'status-chip is-pending',
      consoleText: '事件流连接中，日志会在建立连接后自动刷新。',
    },
    live: {
      text: '已连接',
      className: 'status-chip is-live',
      consoleText: '事件流已连接，新的导出和监听日志会实时写入。',
    },
    offline: {
      text: '已断开',
      className: 'status-chip is-offline',
      consoleText: '事件流暂时断开，请稍后观察连接恢复情况。',
    },
  };
  const state = stateMap[mode] || stateMap.connecting;

  elements.streamStatus.textContent = state.text;
  elements.streamStatus.className = state.className;

  if (elements.consoleStatusText) {
    elements.consoleStatusText.textContent = state.consoleText;
  }
}

function renderOperationalNarrative() {
  const { listeners, running, errors } = summarizeListenerState();

  if (elements.overviewPulse) {
    if (errors > 0) {
      elements.overviewPulse.textContent = `当前有 ${errors} 个异常任务，建议优先打开事件控制台查看报错详情。`;
    } else if (running > 0) {
      elements.overviewPulse.textContent = `当前有 ${running} 个监听正在运行，可以直接前往监听列表查看最新快照。`;
    } else if (appState.lastExport) {
      elements.overviewPulse.textContent = '当前没有活跃监听，最近一次导出结果已保留在结果区，适合继续发起新任务。';
    } else {
      elements.overviewPulse.textContent = '当前系统空闲，可以从历史导出、策略信号或实时监听开始。';
    }
  }

  if (elements.realtimeStatusSummary) {
    elements.realtimeStatusSummary.textContent = running > 0
      ? `当前有 ${running} 个监听正在运行，新任务启动后会自动加入列表。`
      : '当前没有运行中的监听，适合启动新的实时任务。';
  }

  if (elements.listenersOverviewText) {
    elements.listenersOverviewText.textContent = listeners.length
      ? `共 ${listeners.length} 个监听任务，按最近活动时间倒序展示，便于优先检查最新变化。`
      : '当前还没有监听任务，启动成功后会自动出现在这里。';
  }
}

function setButtonBusy(button, busy, busyLabel) {
  if (!button) return;

  if (!button.dataset.idleLabel) {
    button.dataset.idleLabel = button.textContent.trim();
  }

  button.disabled = busy;
  button.classList.toggle('is-busy', busy);
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
  button.textContent = busy ? busyLabel : button.dataset.idleLabel;
}

function renderMetrics() {
  const {
    running,
    stopped,
    errors,
  } = summarizeListenerState();
  const lastExportLabel = appState.lastExport
    ? [appState.lastExport.metricLabel || '导出', appState.lastExport.resolvedSymbol]
      .filter(Boolean)
      .join(' · ')
    : '暂无';

  elements.metricRunning.textContent = String(running);
  elements.metricStopped.textContent = String(stopped);
  elements.metricErrors.textContent = String(errors);
  elements.metricSymbols.textContent = String(appState.symbolCatalog.length);
  elements.metricExport.textContent = lastExportLabel;
  renderOperationalNarrative();
}

function renderExportResult() {
  if (!appState.lastExport) {
    elements.exportSummaries.forEach((element) => {
      element.textContent = '暂无导出记录。';
    });
    elements.exportPreviews.forEach((element) => {
      element.textContent = '导出预览会显示在这里。';
    });
    return;
  }

  const result = appState.lastExport;
  const summary = [
    result.summaryLabel || result.exportLabel || result.resolvedSymbol || '导出结果',
    `${result.periodCount} 根K线`,
    result.outputPath,
  ].filter(Boolean).join(' | ');
  const preview = result.preview || '暂无预览。';

  elements.exportSummaries.forEach((element) => {
    element.textContent = summary;
  });
  elements.exportPreviews.forEach((element) => {
    element.textContent = preview;
  });
}

function createCatalogTag(text) {
  const tag = document.createElement('span');
  tag.className = 'catalog-tag';
  tag.textContent = text;
  return tag;
}

function renderCatalogSummary() {
  const categories = appState.symbolCatalogTree;
  elements.catalogCount.textContent = formatCountLabel(appState.symbolCatalog.length, '个');
  elements.catalogSummary.innerHTML = '';

  if (!categories.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '当前还没有缓存标的。';
    elements.catalogSummary.appendChild(empty);
    return;
  }

  categories.forEach((category) => {
    const card = document.createElement('article');
    card.className = 'catalog-card';

    const head = document.createElement('div');
    head.className = 'catalog-card-head';

    const title = document.createElement('strong');
    title.textContent = category.label;

    const meta = document.createElement('span');
    meta.textContent = [
      formatCountLabel(category.entries.length, '个标的'),
      category.exchanges.length ? formatCountLabel(category.exchanges.length, '个交易所') : '可直接选择',
    ].join(' · ');

    head.append(title, meta);

    const tags = document.createElement('div');
    tags.className = 'catalog-tags';

    if (category.exchanges.length) {
      category.exchanges.slice(0, 8).forEach((exchange) => {
        tags.appendChild(createCatalogTag(`${exchange.label} (${exchange.entries.length})`));
      });
    } else {
      category.entries.slice(0, 8).forEach((entry) => {
        tags.appendChild(createCatalogTag(entry.alias || entry.symbol || entry.id));
      });
    }

    card.append(head, tags);
    elements.catalogSummary.appendChild(card);
  });
}

function createPickerEmpty(message) {
  const empty = document.createElement('div');
  empty.className = 'picker-empty';
  empty.textContent = message;
  return empty;
}

function findCatalogEntryByInput(value) {
  const target = normalizeText(value).toUpperCase();
  if (!target) return null;

  return appState.symbolCatalog.find((entry) => (
    normalizeText(entry.id).toUpperCase() === target
    || normalizeText(entry.alias).toUpperCase() === target
    || normalizeText(entry.symbol).toUpperCase() === target
  )) || null;
}

function syncPickerMeta(picker) {
  if (picker.meta) {
    picker.meta.textContent = `已缓存 ${appState.symbolCatalog.length} 个标的，你也可以继续手动输入。`;
  }

  const currentEntry = findCatalogEntryByInput(picker.input.value);
  if (currentEntry) {
    picker.selection.textContent = [
      `当前选择：${currentEntry.id}`,
      currentEntry.description || currentEntry.alias,
    ].filter(Boolean).join(' | ');
    return;
  }

  const rawValue = normalizeText(picker.input.value);
  picker.selection.textContent = rawValue
    ? `当前输入：${rawValue}`
    : '当前未选择缓存标的。';
}

function closeSymbolPicker(picker) {
  picker.popover.hidden = true;
  picker.root.classList.remove('is-open');
  picker.toggle.setAttribute('aria-expanded', 'false');
}

function closeAllSymbolPickers(except = null) {
  symbolPickers.forEach((picker) => {
    if (picker !== except) closeSymbolPicker(picker);
  });
}

function buildPickerButton(content, options = {}) {
  const {
    active = false,
    onEnter = null,
    onClick = null,
  } = options;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `picker-item ${active ? 'is-active' : ''}`.trim();
  button.appendChild(content);

  if (typeof onEnter === 'function') {
    button.addEventListener('mouseenter', onEnter);
    button.addEventListener('focus', onEnter);
  }

  if (typeof onClick === 'function') {
    button.addEventListener('click', onClick);
  }

  return button;
}

function createPickerContent(titleText, metaText) {
  const content = document.createElement('div');

  const title = document.createElement('strong');
  title.textContent = titleText;

  content.appendChild(title);

  if (metaText) {
    const meta = document.createElement('small');
    meta.textContent = metaText;
    content.appendChild(meta);
  }

  return content;
}

function selectSymbolFromPicker(picker, entry) {
  picker.input.value = entry.id;

  const form = picker.root.closest('form');
  const inferredSearchType = inferSearchType(entry);
  if (
    form
    && form.searchType
    && inferredSearchType
    && appState.constants
    && appState.constants.supportedSearchTypes.includes(inferredSearchType)
  ) {
    form.searchType.value = inferredSearchType;
  }

  picker.input.dispatchEvent(new Event('input', { bubbles: true }));
  picker.input.dispatchEvent(new Event('change', { bubbles: true }));
  syncPickerMeta(picker);
  closeSymbolPicker(picker);
}

function renderPickerColumns(picker) {
  const categories = appState.symbolCatalogTree;
  picker.categoryList.innerHTML = '';
  picker.exchangeList.innerHTML = '';
  picker.symbolList.innerHTML = '';

  if (!categories.length) {
    picker.categoryList.appendChild(createPickerEmpty('还没有缓存主类型'));
    picker.exchangeList.appendChild(createPickerEmpty('暂无交易所或标的'));
    picker.symbolList.appendChild(createPickerEmpty('暂无可选标的'));
    syncPickerMeta(picker);
    return;
  }

  if (!categories.some((category) => category.key === picker.activeCategoryKey)) {
    picker.activeCategoryKey = categories[0].key;
  }

  const activeCategory = categories.find((category) => category.key === picker.activeCategoryKey)
    || categories[0];

  categories.forEach((category) => {
    picker.categoryList.appendChild(buildPickerButton(
      createPickerContent(
        category.label,
        `${category.entries.length} 个标的`,
      ),
      {
        active: category.key === activeCategory.key,
        onEnter() {
          picker.activeCategoryKey = category.key;
          picker.activeExchangeKey = '';
          renderPickerColumns(picker);
        },
      },
    ));
  });

  if (!activeCategory.exchanges.length) {
    activeCategory.entries.forEach((entry) => {
      picker.exchangeList.appendChild(buildPickerButton(
        createPickerContent(
          entry.alias || entry.symbol || entry.id,
          [entry.id, entry.description].filter(Boolean).join(' | '),
        ),
        {
          onClick() {
            selectSymbolFromPicker(picker, entry);
          },
        },
      ));
    });

    if (!activeCategory.entries.length) {
      picker.exchangeList.appendChild(createPickerEmpty('该类型下暂无缓存标的'));
    }

    picker.symbolList.appendChild(
      createPickerEmpty('当前类型没有交易所分层，请直接在上一列点击标的。'),
    );
    syncPickerMeta(picker);
    return;
  }

  if (!activeCategory.exchanges.some((exchange) => exchange.key === picker.activeExchangeKey)) {
    picker.activeExchangeKey = activeCategory.exchanges[0].key;
  }

  activeCategory.exchanges.forEach((exchange) => {
    picker.exchangeList.appendChild(buildPickerButton(
      createPickerContent(
        exchange.label,
        `${exchange.entries.length} 个标的`,
      ),
      {
        active: exchange.key === picker.activeExchangeKey,
        onEnter() {
          picker.activeExchangeKey = exchange.key;
          renderPickerColumns(picker);
        },
      },
    ));
  });

  activeCategory.directEntries.forEach((entry) => {
    picker.exchangeList.appendChild(buildPickerButton(
      createPickerContent(
        entry.alias || entry.symbol || entry.id,
        [entry.id, entry.description].filter(Boolean).join(' | '),
      ),
      {
        onClick() {
          selectSymbolFromPicker(picker, entry);
        },
      },
    ));
  });

  const activeExchange = activeCategory.exchanges.find(
    (exchange) => exchange.key === picker.activeExchangeKey,
  );

  if (!activeExchange) {
    picker.symbolList.appendChild(createPickerEmpty('请选择左侧交易所'));
    syncPickerMeta(picker);
    return;
  }

  activeExchange.entries.forEach((entry) => {
    picker.symbolList.appendChild(buildPickerButton(
      createPickerContent(
        entry.alias || entry.symbol || entry.id,
        [entry.id, entry.description].filter(Boolean).join(' | '),
      ),
      {
        onClick() {
          selectSymbolFromPicker(picker, entry);
        },
      },
    ));
  });

  syncPickerMeta(picker);
}

function openSymbolPicker(picker) {
  closeAllSymbolPickers(picker);
  renderPickerColumns(picker);
  picker.popover.hidden = false;
  picker.root.classList.add('is-open');
  picker.toggle.setAttribute('aria-expanded', 'true');
}

function toggleSymbolPicker(picker) {
  if (picker.popover.hidden) {
    openSymbolPicker(picker);
    return;
  }

  closeSymbolPicker(picker);
}

function refreshSymbolPickers() {
  symbolPickers.forEach((picker) => {
    syncPickerMeta(picker);
    if (!picker.popover.hidden) {
      renderPickerColumns(picker);
    }
  });
}

function renderListeners() {
  const listeners = [...appState.listeners.values()].sort((left, right) => (
    Date.parse(right.lastEventAt || right.startedAt || 0)
    - Date.parse(left.lastEventAt || left.startedAt || 0)
  ));

  elements.listenerList.innerHTML = '';

  if (!listeners.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '暂时还没有启动任何监听任务。';
    elements.listenerList.appendChild(empty);
    renderMetrics();
    return;
  }

  listeners.forEach((listener) => {
    const fragment = elements.listenerTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.listener-card');
    const symbol = fragment.querySelector('.listener-symbol');
    const meta = fragment.querySelector('.listener-meta');
    const chip = fragment.querySelector('.status-chip');
    const stopButton = fragment.querySelector('.listener-stop');
    const output = fragment.querySelector('.listener-output');
    const server = fragment.querySelector('.listener-server');
    const periods = fragment.querySelector('.listener-periods');
    const updated = fragment.querySelector('.listener-updated');
    const candle = fragment.querySelector('.listener-candle-body');
    const error = fragment.querySelector('.listener-error');

    card.dataset.listenerId = listener.id;
    card.dataset.status = listener.status;
    symbol.textContent = listener.resolvedSymbol || listener.inputSymbol || listener.id;
    meta.textContent = [
      listener.timeframe ? `周期 ${listener.timeframe}` : '',
      listener.range !== undefined && listener.range !== null ? `初始 ${listener.range}` : '',
      listener.startedAt ? `启动于 ${formatIso(listener.startedAt)}` : '',
    ].filter(Boolean).join(' | ');
    chip.textContent = STATUS_LABELS[listener.status] || listener.status || '未知';
    chip.className = `status-chip ${listener.status === 'running'
      ? 'is-live'
      : listener.status === 'starting' || listener.status === 'connecting'
        ? 'is-pending'
        : ''}`.trim();

    output.textContent = listener.outputPath || '等待中';
    server.textContent = listener.proxy
      ? `${SERVER_LABELS[listener.server] || listener.server || '自动轮询'} | ${listener.proxy}`
      : SERVER_LABELS[listener.server] || listener.server || '等待中';
    periods.textContent = String(listener.periodCount ?? 0);
    updated.textContent = formatIso(listener.lastEventAt || listener.startedAt);
    error.textContent = listener.error || '';

    if (listener.latestPeriod) {
      const latest = listener.latestPeriod;
      candle.textContent = [
        `time=${latest.datetimeUtc}`,
        `open=${latest.open}`,
        `high=${latest.high}`,
        `low=${latest.low}`,
        `close=${latest.close}`,
        `volume=${latest.volume}`,
      ].join('\n');
    } else {
      candle.textContent = '等待数据中...';
    }

    const isActive = listener.status === 'running' || listener.status === 'starting'
      || listener.status === 'connecting';
    stopButton.disabled = !isActive;

    elements.listenerList.appendChild(fragment);
  });

  renderMetrics();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || `Request failed with ${response.status}`);
  }

  return result;
}

function hydrateSelects(constants) {
  buildSelectOptions(elements.historicalForm.searchType, constants.supportedSearchTypes, {
    includeBlank: true,
    blankLabel: '自动识别',
    labels: SEARCH_TYPE_LABELS,
  });
  buildSelectOptions(elements.strategyForm.searchType, constants.supportedSearchTypes, {
    includeBlank: true,
    blankLabel: '自动识别',
    labels: SEARCH_TYPE_LABELS,
  });
  buildSelectOptions(elements.realtimeForm.searchType, constants.supportedSearchTypes, {
    includeBlank: true,
    blankLabel: '自动识别',
    labels: SEARCH_TYPE_LABELS,
  });

  const servers = ['auto', ...constants.supportedServers];
  buildSelectOptions(elements.historicalForm.server, servers, { labels: SERVER_LABELS });
  buildSelectOptions(elements.strategyForm.server, servers, { labels: SERVER_LABELS });
  buildSelectOptions(elements.realtimeForm.server, servers, { labels: SERVER_LABELS });

  buildSelectOptions(elements.historicalForm.proxyProtocol, constants.supportedProxyProtocols, {
    labels: PROXY_PROTOCOL_LABELS,
  });
  buildSelectOptions(elements.strategyForm.proxyProtocol, constants.supportedProxyProtocols, {
    labels: PROXY_PROTOCOL_LABELS,
  });
  buildSelectOptions(elements.realtimeForm.proxyProtocol, constants.supportedProxyProtocols, {
    labels: PROXY_PROTOCOL_LABELS,
  });
}

function applySymbolCatalog(symbolCatalog) {
  appState.symbolCatalog = (symbolCatalog || []).map(buildCatalogEntry);
  appState.symbolCatalogTree = buildSymbolCatalogTree(appState.symbolCatalog);
  renderCatalogSummary();
  renderMetrics();
  refreshSymbolPickers();
}

function switchTab(tabId) {
  appState.activeTab = tabId;
  closeAllSymbolPickers();

  elements.tabButtons.forEach((button) => {
    const active = button.dataset.tabTrigger === tabId;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.setAttribute('tabindex', active ? '0' : '-1');
  });

  elements.tabPanels.forEach((panel) => {
    const active = panel.dataset.tabPanel === tabId;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
    panel.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
}

function hydrateState(payload) {
  appState.defaults = payload.defaults;
  appState.constants = payload.constants;
  appState.listeners = new Map(
    (payload.listeners || []).map((listener) => [listener.id, listener]),
  );
  appState.lastExport = (payload.recentEvents || [])
    .filter((event) => event.type === 'export-completed')
    .slice(-1)[0] || null;

  document.title = payload.panel.title;
  elements.panelTitle.textContent = payload.panel.title;
  elements.panelUrl.textContent = payload.panel.url;

  hydrateSelects(payload.constants);
  applyFormValues(elements.historicalForm, payload.defaults.historical);
  applyFormValues(elements.strategyForm, payload.defaults.strategyExport);
  applyFormValues(elements.realtimeForm, payload.defaults.realtime);
  applySymbolCatalog(payload.symbolCatalog || []);

  (payload.recentEvents || [])
    .filter((event) => event.type === 'log')
    .forEach((event) => appendLog(event));

  renderExportResult();
  renderListeners();
  switchTab(appState.activeTab);
}

function handleEvent(event) {
  if (!event || !event.type) return;

  if (event.type === 'log') {
    appendLog(event);
    return;
  }

  if (event.type === 'panel-state' && event.state) {
    if (!appState.defaults) {
      hydrateState(event.state);
    }
    return;
  }

  if (event.type === 'symbol-catalog-updated') {
    applySymbolCatalog(event.symbolCatalog || []);
    return;
  }

  if (event.type === 'listener-state' && event.listener) {
    appState.listeners.set(event.listener.id, event.listener);
    renderListeners();
    return;
  }

  if (
    (event.type === 'listener-started'
      || event.type === 'listener-update'
      || event.type === 'listener-stopped'
      || event.type === 'listener-error'
      || event.type === 'listener-queued')
    && event.listener
  ) {
    appState.listeners.set(event.listener.id, event.listener);
    renderListeners();
    return;
  }

  if (event.type === 'export-completed') {
    appState.lastExport = event;
    renderExportResult();
    renderMetrics();
  }
}

async function submitExportRequest(url, payload, button) {
  setButtonBusy(button, true, '导出中...');

  try {
    const result = await postJson(url, payload);
    appState.lastExport = result.result;
    renderExportResult();
    renderMetrics();
  } catch (error) {
    appendLog({
      timestamp: new Date().toISOString(),
      scope: 'export',
      level: 'error',
      message: error.message,
    });
  } finally {
    setButtonBusy(button, false, '导出中...');
  }
}

function initializeTabs() {
  elements.tabButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      switchTab(button.dataset.tabTrigger);
    });

    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const nextIndex = (index + direction + elements.tabButtons.length)
        % elements.tabButtons.length;
      const nextButton = elements.tabButtons[nextIndex];

      nextButton.focus();
      switchTab(nextButton.dataset.tabTrigger);
    });
  });

  switchTab(appState.activeTab);
}

function initializeJumpButtons() {
  elements.jumpButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.jumpTab;
      if (!tabId) return;

      switchTab(tabId);
      const targetPanel = elements.tabPanels.find((panel) => panel.dataset.tabPanel === tabId);
      if (targetPanel) {
        targetPanel.scrollIntoView({ block: 'start' });
      }
    });
  });
}

function initializeSymbolPickers() {
  symbolPickers.forEach((picker) => {
    closeSymbolPicker(picker);
    syncPickerMeta(picker);

    picker.toggle.addEventListener('click', () => {
      toggleSymbolPicker(picker);
    });

    picker.input.addEventListener('input', () => {
      syncPickerMeta(picker);
    });

    picker.input.addEventListener('focus', () => {
      syncPickerMeta(picker);
    });
  });

  document.addEventListener('click', (event) => {
    const insidePicker = event.target.closest('[data-symbol-picker]');
    if (!insidePicker) {
      closeAllSymbolPickers();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAllSymbolPickers();
    }
  });

  window.addEventListener('resize', () => {
    closeAllSymbolPickers();
  });
}

async function initialize() {
  initializeTabs();
  initializeJumpButtons();
  initializeSymbolPickers();
  setStreamStatus('connecting');

  const response = await fetch('/api/state');
  const payload = await response.json();
  hydrateState(payload);

  const eventSource = new EventSource('/api/events');
  eventSource.addEventListener('open', () => {
    setStreamStatus('live');
  });
  eventSource.addEventListener('error', () => {
    setStreamStatus('offline');
  });
  eventSource.onmessage = (message) => {
    try {
      handleEvent(JSON.parse(message.data));
    } catch (error) {
      appendLog({
        timestamp: new Date().toISOString(),
        scope: 'panel',
        level: 'error',
        message: `事件解析失败: ${error.message}`,
      });
    }
  };

  elements.historicalForm.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    await submitExportRequest(
      '/api/export',
      serializeHistoricalForm(),
      elements.historicalSubmit,
    );
  });

  elements.strategyForm.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    await submitExportRequest(
      '/api/strategy-export',
      serializeStrategyForm(),
      elements.strategySubmit,
    );
  });

  elements.realtimeForm.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    setButtonBusy(elements.realtimeSubmit, true, '启动中...');

    try {
      const result = await postJson('/api/listeners', serializeRealtimeForm());
      appState.listeners.set(result.listener.id, result.listener);
      renderListeners();
      switchTab('listeners');
    } catch (error) {
      appendLog({
        timestamp: new Date().toISOString(),
        scope: 'listener',
        level: 'error',
        message: error.message,
      });
    } finally {
      setButtonBusy(elements.realtimeSubmit, false, '启动中...');
    }
  });

  elements.historicalReset.addEventListener('click', () => {
    if (!appState.defaults) return;
    applyFormValues(elements.historicalForm, appState.defaults.historical);
    refreshSymbolPickers();
  });

  elements.strategyReset.addEventListener('click', () => {
    if (!appState.defaults) return;
    applyFormValues(elements.strategyForm, appState.defaults.strategyExport);
    refreshSymbolPickers();
  });

  elements.realtimeReset.addEventListener('click', () => {
    if (!appState.defaults) return;
    applyFormValues(elements.realtimeForm, appState.defaults.realtime);
    refreshSymbolPickers();
  });

  elements.listenerList.addEventListener('click', async (clickEvent) => {
    const button = clickEvent.target.closest('.listener-stop');
    if (!button) return;

    const card = clickEvent.target.closest('.listener-card');
    const listenerId = card && card.dataset.listenerId;
    if (!listenerId) return;

    setButtonBusy(button, true, '停止中...');

    try {
      const result = await postJson(`/api/listeners/${listenerId}/stop`, {});
      appState.listeners.set(result.listener.id, result.listener);
      renderListeners();
    } catch (error) {
      appendLog({
        timestamp: new Date().toISOString(),
        scope: 'listener',
        level: 'error',
        message: error.message,
      });
      setButtonBusy(button, false, '停止中...');
    }
  });
}

initialize().catch((error) => {
  appendLog({
    timestamp: new Date().toISOString(),
    scope: 'panel',
    level: 'error',
    message: error.message,
  });
});
