import { describe, expect, it } from 'vitest';

const { formatErrorMessage } = require('../src/utils');

describe('formatErrorMessage', () => {
  it('formats aggregate network errors with empty top-level messages', () => {
    const error = Object.assign(new Error(''), {
      name: 'AggregateError',
      code: 'ETIMEDOUT',
      cause: {
        code: 'ETIMEDOUT',
        errors: [
          {
            code: 'ETIMEDOUT',
            message: 'connect ETIMEDOUT 31.13.69.169:443',
            address: '31.13.69.169',
            port: 443,
          },
        ],
      },
    });

    const message = formatErrorMessage(error);

    expect(message).toContain('AggregateError');
    expect(message).toContain('code=ETIMEDOUT');
    expect(message).toContain('31.13.69.169:443');
  });
});
