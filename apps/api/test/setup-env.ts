process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT ?? '4001';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://steadystate:steadystate@localhost:5432/steady_state_test?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-test-access-secret-32chars+';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-test-refresh-secret-32chars';
process.env.TWILIO_MODE = 'mock';
process.env.CRM_MODE = 'fake';
