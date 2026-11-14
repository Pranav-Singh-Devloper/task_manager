import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Reads TOKEN_ENCRYPTION_KEY (32 bytes, base64). Throws with a plain explanation when it is wrong. */
export function parseKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64 (got ${key.length}). Create one with: openssl rand -base64 32`,
    );
  }
  return key;
}

/** AES-256-GCM. Output is "v1:" + base64(iv | auth tag | ciphertext). */
export function encrypt(plain: string, keyBase64: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', parseKey(keyBase64), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
}

/** Throws if the key is wrong or the data was changed (the auth tag will not match). */
export function decrypt(payload: string, keyBase64: string): string {
  const [version, data] = payload.split(':');
  if (version !== VERSION || !data) throw new Error('Unknown encrypted value format');
  const raw = Buffer.from(data, 'base64');
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', parseKey(keyBase64), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
