import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { verifySignature } from '../src/webhook.js';

describe('verifySignature', () => {
  const secret = randomBytes(32).toString('hex');

  it('올바른 시그니처는 통과', () => {
    const payload = '{"test": true}';
    const crypto = require('node:crypto');
    const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

    expect(verifySignature(payload, sig, secret)).toBe(true);
  });

  it('잘못된 시그니처는 거부', () => {
    expect(verifySignature('payload', 'sha256=wrong', secret)).toBe(false);
  });

  it('빈 시그니처는 거부', () => {
    expect(verifySignature('payload', '', secret)).toBe(false);
  });
});
