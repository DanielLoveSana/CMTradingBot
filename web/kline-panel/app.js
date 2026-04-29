const appState = {
  defaults: null,
  constants: null,
  listeners: new Map(),
  lastExport: null,
};

const elements = {
  panelTitle: document.querySelector('#panel-title'),
  panelUrl: document.querySelector('#panel-url'),
  streamStatus: document.querySelector('#stream-status'),
  historicalForm: document.querySelector('#historical-form'),
  realtimeForm: document.querySelector('#realtime-form'),
  historicalSubmit: document.querySelector('#historical-submit'),
  realtimeSubmit: document.querySelector('#realtime-submit'),
  historicalReset: document.querySelector('#historical-reset'),
  realtimeReset: document.querySelector('#realtime-reset'),
  exportSummary: document.querySelector('#export-summary'),
  exportPreview: document.querySelector('#export-preview'),
  listenerList: document.querySelector('#listener-list'),
  listenerTemplate: document.querySelector('#listener-template'),
  logStream: document.querySelector('#log-stream'),
  metricRunning: document.querySelector('#metric-running'),
  metricStopped: document.querySelector('#metric-stopped'),
  metricErrors: document.querySelector('#metric-errors'),
  metricExport: document.querySelector('#metric-export'),
};

function formatIso(value) {
  if (!value) return 'N/A';

  try {
    return new Date(value).toLocaleString();
  } catch (error) {
    return value;
  }
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
  scope.textContent = entry.scope || 'system';

  const message = document.createElement('span');
  message.className = 'log-message';
  message.textContent = entry.message || '';

  line.append(timestamp, scope, message);
  elements.logStream.appendChild(line);
  elements.logStream.scrollTop = elements.logStream.scrollHeight;
  clampLogLines();
}

function buildSelectOptions(select, values, includeBlank = false) {
  select.innerHTML = '';

  if (includeBlank) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Any';
    select.appendChild(option);
  }

  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
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

function serializeHistoricalForm() {
  const form = elements.historicalForm;
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

function renderMetrics() {
  const listeners = [...appState.listeners.values()];
  const running = listeners.filter((item) => (
    item.status === 'running' || item.status === 'starting' || item.status === 'connecting'
  )).length;
  const stopped = listeners.filter((item) => item.status === 'stopped').length;
  const errors = listeners.filter((item) => item.status === 'error').length;

  elements.metricRunning.textContent = String(running);
  elements.metricStopped.textContent = String(stopped);
  elements.metricErrors.textContent = String(errors);
  elements.metricExport.textContent = appState.lastExport
    ? appState.lastExport.resolvedSymbol
    : 'None';
}

function renderExportResult() {
  if (!appState.lastExport) {
    elements.exportSummary.textContent = 'No export yet.';
    elements.exportPreview.textContent = 'Preview will appear here.';
    return;
  }

  const result = appState.lastExport;
  elements.exportSummary.textContent = [
    `${result.resolvedSymbol}`,
    `${result.periodCount} candles`,
    result.outputPath,
  ].join(' • ');
  elements.exportPreview.textContent = result.preview || 'No preview available.';
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
    empty.textContent = 'No listeners have been started yet.';
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
      `${listener.timeframe || '?'}`,
      `range ${listener.range ?? '?'}`,
      listener.startedAt ? `started ${formatIso(listener.startedAt)}` : '',
    ].filter(Boolean).join(' • ');
    chip.textContent = listener.status || 'unknown';
    chip.className = `status-chip ${listener.status === 'running'
      ? 'is-live'
      : listener.status === 'starting' || listener.status === 'connecting'
        ? 'is-pending'
        : ''}`.trim();

    output.textContent = listener.outputPath || 'Pending';
    server.textContent = listener.proxy
      ? `${listener.server} via ${listener.proxy}`
      : listener.server || 'Pending';
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

function setStreamStatus(isLive) {
  elements.streamStatus.textContent = isLive ? 'Live' : 'Disconnected';
  elements.streamStatus.className = `status-chip ${isLive ? 'is-live' : 'is-pending'}`;
}

function hydrateSelects(constants) {
  buildSelectOptions(elements.historicalForm.searchType, constants.supportedSearchTypes, true);
  buildSelectOptions(elements.realtimeForm.searchType, constants.supportedSearchTypes, true);

  const servers = ['auto', ...constants.supportedServers];
  buildSelectOptions(elements.historicalForm.server, servers, false);
  buildSelectOptions(elements.realtimeForm.server, servers, false);

  buildSelectOptions(elements.historicalForm.proxyProtocol, constants.supportedProxyProtocols, false);
  buildSelectOptions(elements.realtimeForm.proxyProtocol, constants.supportedProxyProtocols, false);
}

function hydrateState(payload) {
  appState.defaults = payload.defaults;
  appState.constants = payload.constants;
  appState.listeners = new Map(
    (payload.listeners || []).map((listener) => [listener.id, listener]),
  );

  elements.panelTitle.textContent = payload.panel.title;
  elements.panelUrl.textContent = payload.panel.url;

  hydrateSelects(payload.constants);
  applyFormValues(elements.historicalForm, payload.defaults.historical);
  applyFormValues(elements.realtimeForm, payload.defaults.realtime);

  (payload.recentEvents || [])
    .filter((event) => event.type === 'log')
    .forEach((event) => appendLog(event));

  renderExportResult();
  renderListeners();
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

async function initialize() {
  const response = await fetch('/api/state');
  const payload = await response.json();
  hydrateState(payload);
  setStreamStatus(false);

  const eventSource = new EventSource('/api/events');
  eventSource.addEventListener('open', () => {
    setStreamStatus(true);
  });
  eventSource.addEventListener('error', () => {
    setStreamStatus(false);
  });
  eventSource.onmessage = (message) => {
    try {
      handleEvent(JSON.parse(message.data));
    } catch (error) {
      appendLog({
        timestamp: new Date().toISOString(),
        scope: 'panel',
        level: 'error',
        message: `Failed to parse event payload: ${error.message}`,
      });
    }
  };

  elements.historicalForm.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    elements.historicalSubmit.disabled = true;

    try {
      const result = await postJson('/api/export', serializeHistoricalForm());
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
      elements.historicalSubmit.disabled = false;
    }
  });

  elements.realtimeForm.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    elements.realtimeSubmit.disabled = true;

    try {
      const result = await postJson('/api/listeners', serializeRealtimeForm());
      appState.listeners.set(result.listener.id, result.listener);
      renderListeners();
    } catch (error) {
      appendLog({
        timestamp: new Date().toISOString(),
        scope: 'listener',
        level: 'error',
        message: error.message,
      });
    } finally {
      elements.realtimeSubmit.disabled = false;
    }
  });

  elements.historicalReset.addEventListener('click', () => {
    if (!appState.defaults) return;
    applyFormValues(elements.historicalForm, appState.defaults.historical);
  });

  elements.realtimeReset.addEventListener('click', () => {
    if (!appState.defaults) return;
    applyFormValues(elements.realtimeForm, appState.defaults.realtime);
  });

  elements.listenerList.addEventListener('click', async (clickEvent) => {
    const button = clickEvent.target.closest('.listener-stop');
    if (!button) return;

    const card = clickEvent.target.closest('.listener-card');
    const listenerId = card && card.dataset.listenerId;
    if (!listenerId) return;

    button.disabled = true;

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
