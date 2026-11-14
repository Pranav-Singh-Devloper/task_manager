import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, parseKey } from '../../server/lib/crypto';

const key = randomBytes(32).toString('base64');

describe('token encryption', () => {
  it('round-trips and never contains the plain text', () => {
    const secret = '1//0g-refresh-token-value';
    const sealed = encrypt(secret, key);
    expect(sealed).not.toContain(secret);
    expect(decrypt(sealed, key)).toBe(secret);
  });

  it('uses a fresh random IV every time', () => {
    expect(encrypt('same', key)).not.toBe(encrypt('same', key));
  });

  it('refuses the wrong key', () => {
    expect(() => decrypt(encrypt('x', key), randomBytes(32).toString('base64'))).toThrow();
  });

  it('detects tampering', () => {
    const sealed = encrypt('x', key);
    const raw = Buffer.from(sealed.slice(3), 'base64');
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 1;
    expect(() => decrypt(`v1:${raw.toString('base64')}`, key)).toThrow();
  });

  it('explains a bad key in plain words', () => {
    expect(() => parseKey('short')).toThrow(/32 bytes/);
  });

  it('rejects unknown formats', () => {
    expect(() => decrypt('v9:abcd', key)).toThrow(/format/);
  });
});
