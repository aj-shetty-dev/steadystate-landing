import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.config';

const baseValidEnv = {
  NODE_ENV: 'test',
  PORT: '4000',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('loadEnv', () => {
  it('returns parsed env with defaults applied', () => {
    const env = loadEnv(baseValidEnv as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(4000);
    expect(env.TWILIO_MODE).toBe('mock');
    expect(env.CRM_MODE).toBe('fake');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('throws when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _omit, ...rest } = baseValidEnv;
    expect(() => loadEnv(rest as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });

  it('throws when JWT secret is shorter than 32 chars', () => {
    expect(() =>
      loadEnv({ ...baseValidEnv, JWT_ACCESS_SECRET: 'short' } as NodeJS.ProcessEnv),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('throws when TWILIO_MODE=live but credentials are missing', () => {
    expect(() =>
      loadEnv({ ...baseValidEnv, TWILIO_MODE: 'live' } as NodeJS.ProcessEnv),
    ).toThrow(/TWILIO_ACCOUNT_SID/);
  });

  it('accepts TWILIO_MODE=live with credentials', () => {
    const env = loadEnv({
      ...baseValidEnv,
      TWILIO_MODE: 'live',
      TWILIO_ACCOUNT_SID: 'ACxxx',
      TWILIO_AUTH_TOKEN: 'token',
    } as NodeJS.ProcessEnv);
    expect(env.TWILIO_MODE).toBe('live');
  });
});
