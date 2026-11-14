import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { needsRefresh, signSession, verifySession } from '../../shared/session';

const secret = 'a'.repeat(40);
const user = { sub: 'u1', email: 'dad@example.com', name: 'Dad', role: 'owner' as const };

describe('session cookie', () => {
  it('round-trips', async () => {
    const token = await signSession(user, secret);
    expect(await verifySession(token, secret)).toMatchObject(user);
  });

  it('rejects a token signed with another secret', async () => {
    expect(await verifySession(await signSession(user, secret), 'b'.repeat(40))).toBeNull();
  });

  it('rejects garbage and missing tokens', async () => {
    expect(await verifySession('nope', secret)).toBeNull();
    expect(await verifySession(undefined, secret)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const old = await new SignJWT({ email: user.email, role: 'owner' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 100)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(secret));
    expect(await verifySession(old, secret)).toBeNull();
  });

  it('rejects a role it does not know', async () => {
    const bad = await new SignJWT({ email: user.email, role: 'root' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setIssuedAt()
      .setExpirationTime('1d')
      .sign(new TextEncoder().encode(secret));
    expect(await verifySession(bad, secret)).toBeNull();
  });

  it('slides the 30 days forward once the cookie is a day old', async () => {
    const s = (await verifySession(await signSession(user, secret), secret))!;
    expect(needsRefresh(s, s.iat + 60)).toBe(false);
    expect(needsRefresh(s, s.iat + 2 * 24 * 3600)).toBe(true);
  });
});
