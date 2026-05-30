import { describe, expect, it } from 'vitest';
import { e164PhoneSchema, whatsappSendRequestSchema } from './whatsapp.schemas';

describe('e164PhoneSchema', () => {
  it.each(['+971501234567', '+14155238886', '+447911123456'])('accepts %s', (val) => {
    expect(() => e164PhoneSchema.parse(val)).not.toThrow();
  });

  it.each(['0501234567', '971501234567', '+0501234567', ''])('rejects %s', (val) => {
    expect(() => e164PhoneSchema.parse(val)).toThrow();
  });
});

describe('whatsappSendRequestSchema', () => {
  it('defaults locale to en', () => {
    const parsed = whatsappSendRequestSchema.parse({
      to: '+971501234567',
      body: 'hello',
    });
    expect(parsed.locale).toBe('en');
  });

  it('rejects empty body', () => {
    expect(() =>
      whatsappSendRequestSchema.parse({ to: '+971501234567', body: '' }),
    ).toThrow();
  });
});
