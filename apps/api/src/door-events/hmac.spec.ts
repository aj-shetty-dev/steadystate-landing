import { describe, expect, it } from 'vitest';
import { signPayload, verifySignature } from './hmac';

describe('hmac', () => {
  const secret = 'super-secret-key';
  const body = JSON.stringify({ direction: 'IN', externalRef: 'abc' });

  it('signs and verifies a payload', () => {
    const sig = signPayload(secret, body);
    expect(verifySignature(secret, body, sig)).toBe(true);
  });

  it('rejects tampered body', () => {
    const sig = signPayload(secret, body);
    expect(verifySignature(secret, body + 'x', sig)).toBe(false);
  });

  it('rejects wrong secret', () => {
    const sig = signPayload(secret, body);
    expect(verifySignature('other-secret', body, sig)).toBe(false);
  });

  it('rejects malformed signature', () => {
    expect(verifySignature(secret, body, 'not-hex')).toBe(false);
  });
});
