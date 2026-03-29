/* global describe, it, expect, beforeEach, afterEach, jest */

import logger from '../src/utils/logger';

describe('logger redaction safeguards', () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    global.__DEV__ = true;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('redacts sensitive keys and string content in info logs', () => {
    logger.info(
      '[logger-test]',
      'Contact alice@example.com or +92 300 1112233',
      {
        email: 'alice@example.com',
        phone: '+92 300 1112233',
        latitude: 33.6844,
        longitude: 73.0479,
        profile: {
          emergencyEmail: 'guardian@example.com',
          token: 'secret-token-123',
        },
      }
    );

    expect(logSpy).toHaveBeenCalledTimes(1);

    const callArgs = logSpy.mock.calls[0];
    const joined = callArgs.map((v) => JSON.stringify(v)).join(' ');

    expect(joined).not.toContain('alice@example.com');
    expect(joined).not.toContain('guardian@example.com');
    expect(joined).not.toContain('secret-token-123');
    expect(joined).not.toContain('33.6844');
    expect(joined).not.toContain('73.0479');
    expect(joined).not.toContain('300 1112233');
    expect(joined).toContain('[REDACTED]');
  });

  it('sanitizes error objects before logging', () => {
    const err = new Error('Failed for bob@example.com and +1-202-555-0191');
    err.code = 'ERR_TEST';

    logger.error('[logger-test]', 'request failed', err);

    expect(errorSpy).toHaveBeenCalledTimes(1);

    const callArgs = errorSpy.mock.calls[0];
    const joined = callArgs.map((v) => JSON.stringify(v)).join(' ');

    expect(joined).not.toContain('bob@example.com');
    expect(joined).not.toContain('202-555-0191');
    expect(joined).toContain('ERR_TEST');
  });
});
