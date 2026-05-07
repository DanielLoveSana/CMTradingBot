const axios = require('axios');
const crypto = require('crypto');

const { formatErrorMessage } = require('./utils');

const DEFAULT_NOTIFICATION_MESSAGE = Object.freeze({
  title: 'TradingView Alert',
  content: '',
  level: 'info',
  source: 'CMTradingBot',
  timestamp: null,
  data: null,
});

const DEFAULT_TELEGRAM_CONFIG = Object.freeze({
  botToken: '',
  chatId: '',
  apiBaseUrl: 'https://api.telegram.org',
  parseMode: '',
  disableWebPagePreview: true,
  disableNotification: false,
  timeoutMs: 15000,
});

const DEFAULT_FEISHU_CONFIG = Object.freeze({
  webhookUrl: '',
  secret: '',
  timeoutMs: 15000,
});

function normalizeString(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function normalizeBoolean(value, fallback = false) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;

  const text = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(text)) return false;
  return fallback;
}

function normalizeInteger(value, fallback, name = 'value') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return parsed;
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === '') {
    return new Date().toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value < 1e12 ? value * 1000 : value;
    return new Date(millis).toISOString();
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const numeric = Number.parseInt(value, 10);
    const millis = numeric < 1e12 ? numeric * 1000 : numeric;
    return new Date(millis).toISOString();
  }

  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid timestamp: ${value}`);
  }

  return new Date(parsed).toISOString();
}

function normalizeMessageData(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return value;
}

function normalizeContent(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeNotificationMessage(input = {}) {
  const raw = { ...DEFAULT_NOTIFICATION_MESSAGE, ...input };

  return {
    title: normalizeString(raw.title, DEFAULT_NOTIFICATION_MESSAGE.title),
    content: normalizeContent(raw.content ?? raw.message),
    level: normalizeString(raw.level, DEFAULT_NOTIFICATION_MESSAGE.level).toLowerCase(),
    source: normalizeString(raw.source, DEFAULT_NOTIFICATION_MESSAGE.source),
    timestamp: normalizeTimestamp(raw.timestamp),
    data: normalizeMessageData(raw.data),
  };
}

function formatNotificationText(message) {
  const lines = [
    `[${String(message.level || 'info').toUpperCase()}] ${message.title}`,
  ];

  if (message.source) lines.push(`Source: ${message.source}`);
  if (message.timestamp) lines.push(`Time: ${message.timestamp}`);
  if (message.content) lines.push(`Message: ${message.content}`);

  if (message.data !== null && message.data !== undefined) {
    const dataText = typeof message.data === 'string'
      ? message.data
      : JSON.stringify(message.data, null, 2);

    if (dataText) lines.push(`Data: ${dataText}`);
  }

  return lines.join('\n');
}

function normalizeTelegramConfig(input = {}) {
  const raw = { ...DEFAULT_TELEGRAM_CONFIG, ...input };

  return {
    botToken: normalizeString(raw.botToken, DEFAULT_TELEGRAM_CONFIG.botToken),
    chatId: normalizeString(raw.chatId, DEFAULT_TELEGRAM_CONFIG.chatId),
    apiBaseUrl: normalizeString(raw.apiBaseUrl, DEFAULT_TELEGRAM_CONFIG.apiBaseUrl).replace(/\/+$/, ''),
    parseMode: normalizeString(raw.parseMode, DEFAULT_TELEGRAM_CONFIG.parseMode),
    disableWebPagePreview: normalizeBoolean(
      raw.disableWebPagePreview,
      DEFAULT_TELEGRAM_CONFIG.disableWebPagePreview,
    ),
    disableNotification: normalizeBoolean(
      raw.disableNotification,
      DEFAULT_TELEGRAM_CONFIG.disableNotification,
    ),
    timeoutMs: normalizeInteger(raw.timeoutMs, DEFAULT_TELEGRAM_CONFIG.timeoutMs, 'timeout-ms'),
  };
}

function normalizeFeishuConfig(input = {}) {
  const raw = { ...DEFAULT_FEISHU_CONFIG, ...input };

  return {
    webhookUrl: normalizeString(raw.webhookUrl, DEFAULT_FEISHU_CONFIG.webhookUrl),
    secret: normalizeString(raw.secret, DEFAULT_FEISHU_CONFIG.secret),
    timeoutMs: normalizeInteger(raw.timeoutMs, DEFAULT_FEISHU_CONFIG.timeoutMs, 'timeout-ms'),
  };
}

function assertTelegramConfig(config) {
  if (!config.botToken || !config.chatId) {
    throw new Error('Telegram config is incomplete: botToken and chatId are required');
  }
}

function assertFeishuConfig(config) {
  if (!config.webhookUrl) {
    throw new Error('Feishu config is incomplete: webhookUrl is required');
  }
}

function buildTelegramRequest(messageInput, configInput = {}) {
  const message = normalizeNotificationMessage(messageInput);
  const config = normalizeTelegramConfig(configInput);
  assertTelegramConfig(config);

  const payload = {
    chat_id: config.chatId,
    text: formatNotificationText(message),
  };

  if (config.parseMode) payload.parse_mode = config.parseMode;
  if (config.disableWebPagePreview) payload.disable_web_page_preview = true;
  if (config.disableNotification) payload.disable_notification = true;

  return {
    message,
    config,
    url: `${config.apiBaseUrl}/bot${config.botToken}/sendMessage`,
    payload,
  };
}

function buildFeishuRequest(messageInput, configInput = {}) {
  const message = normalizeNotificationMessage(messageInput);
  const config = normalizeFeishuConfig(configInput);
  assertFeishuConfig(config);

  const payload = {
    msg_type: 'text',
    content: {
      text: formatNotificationText(message),
    },
  };

  if (config.secret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sign = crypto
      .createHmac('sha256', config.secret)
      .update(`${timestamp}\n${config.secret}`)
      .digest('base64');

    payload.timestamp = timestamp;
    payload.sign = sign;
  }

  return {
    message,
    config,
    url: config.webhookUrl,
    payload,
  };
}

function receiveNotificationMessage(message, handler = {}) {
  const normalizedMessage = normalizeNotificationMessage(message);
  if (typeof handler.onMessage !== 'function') return normalizedMessage;
  return handler.onMessage(normalizedMessage);
}

function createNotificationReceiver(handler = {}) {
  return {
    receive(message) {
      return receiveNotificationMessage(message, handler);
    },
  };
}

async function sendTelegramNotification(messageInput, configInput = {}) {
  const request = buildTelegramRequest(messageInput, configInput);

  try {
    const response = await axios.post(request.url, request.payload, {
      timeout: request.config.timeoutMs,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });

    const body = response.data || {};
    if (body.ok === false) {
      throw new Error(body.description || 'Telegram request failed');
    }

    return {
      provider: 'telegram',
      ok: true,
      message: request.message,
      response: body,
    };
  } catch (error) {
    throw new Error(`Telegram notification failed: ${formatErrorMessage(error)}`);
  }
}

async function sendFeishuNotification(messageInput, configInput = {}) {
  const request = buildFeishuRequest(messageInput, configInput);

  try {
    const response = await axios.post(request.url, request.payload, {
      timeout: request.config.timeoutMs,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });

    const body = response.data || {};
    const statusCode = body.StatusCode !== undefined ? body.StatusCode : body.code;
    if (statusCode !== undefined && Number(statusCode) !== 0) {
      throw new Error(body.StatusMessage || body.message || 'Feishu request failed');
    }

    return {
      provider: 'feishu',
      ok: true,
      message: request.message,
      response: body,
    };
  } catch (error) {
    throw new Error(`Feishu notification failed: ${formatErrorMessage(error)}`);
  }
}

module.exports = {
  DEFAULT_FEISHU_CONFIG,
  DEFAULT_NOTIFICATION_MESSAGE,
  DEFAULT_TELEGRAM_CONFIG,
  buildFeishuRequest,
  buildTelegramRequest,
  createNotificationReceiver,
  formatNotificationText,
  normalizeBoolean,
  normalizeContent,
  normalizeFeishuConfig,
  normalizeInteger,
  normalizeMessageData,
  normalizeNotificationMessage,
  normalizeTelegramConfig,
  normalizeTimestamp,
  receiveNotificationMessage,
  sendFeishuNotification,
  sendTelegramNotification,
};
