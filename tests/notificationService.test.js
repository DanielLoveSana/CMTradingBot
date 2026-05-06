import { describe, expect, it, vi } from 'vitest';

const {
  buildFeishuRequest,
  buildTelegramRequest,
  createNotificationReceiver,
  formatNotificationText,
  normalizeNotificationMessage,
} = require('../src/notificationService');

describe('notification service', () => {
  it('normalizes notification payloads', () => {
    const payload = normalizeNotificationMessage({
      title: 'Price Alert',
      content: { symbol: 'BTCUSDT', price: 100 },
      level: 'warn',
      source: 'bot',
      timestamp: 1710000000,
      data: '{"foo":"bar"}',
    });

    expect(payload.title).toBe('Price Alert');
    expect(payload.level).toBe('warn');
    expect(payload.source).toBe('bot');
    expect(payload.content).toContain('"symbol": "BTCUSDT"');
    expect(payload.data).toEqual({ foo: 'bar' });
  });

  it('builds readable notification text', () => {
    const text = formatNotificationText({
      title: 'TradingView Alert',
      level: 'info',
      source: 'CMTradingBot',
      timestamp: '2026-05-07T00:00:00.000Z',
      content: 'Hello',
      data: { symbol: 'BTCUSDT' },
    });

    expect(text).toContain('[INFO] TradingView Alert');
    expect(text).toContain('Source: CMTradingBot');
    expect(text).toContain('Message: Hello');
  });

  it('builds telegram requests without sending network traffic', () => {
    const request = buildTelegramRequest(
      { title: 'Ping', content: 'Hello' },
      { botToken: 'abc', chatId: '123' },
    );

    expect(request.url).toContain('/botabc/sendMessage');
    expect(request.payload.chat_id).toBe('123');
    expect(request.payload.text).toContain('Hello');
  });

  it('builds feishu requests with optional signing', () => {
    const request = buildFeishuRequest(
      { title: 'Ping', content: 'Hello' },
      { webhookUrl: 'https://example.com', secret: 'secret' },
    );

    expect(request.url).toBe('https://example.com');
    expect(request.payload.msg_type).toBe('text');
    expect(request.payload.content.text).toContain('Hello');
    expect(request.payload.timestamp).toBeDefined();
    expect(request.payload.sign).toBeDefined();
  });

  it('routes received messages through the provided handler', async () => {
    const handler = vi.fn(async (message) => message.title);
    const receiver = createNotificationReceiver({ onMessage: handler });

    const result = await receiver.receive({ title: 'Ping', content: 'Hello' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toBe('Ping');
  });
});
