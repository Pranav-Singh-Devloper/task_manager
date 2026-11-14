import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../server/env';

describe('loadEnv', () => {
  it('starts in mock mode with no setup in development', () => {
    const env = loadEnv({ NODE_ENV: 'development' });
    expect(env.googleMode).toBe('mock');
    expect(env.port).toBe(3000);
    expect(env.defaultTimezone).toBe('Asia/Kolkata');
    expect(env.allowedEmails).toContain(env.ownerEmail);
  });

  it('treats empty .env values as unset', () => {
    const env = loadEnv({ GOOGLE_CLIENT_ID: '', SPREADSHEET_ID: '', MOCK_FAIL: '' });
    expect(env.googleClientId).toBeUndefined();
    expect(env.spreadsheetId).toBeUndefined();
  });

  it('defaults to live in production and then requires the Google settings', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40) })).toThrow(
      /GOOGLE_CLIENT_ID.*OWNER_EMAIL/,
    );
  });

  it('requires a session secret in production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', GOOGLE_MODE: 'mock' })).toThrow(
      /SESSION_SECRET/,
    );
  });

  it('rejects a short session secret', () => {
    expect(() => loadEnv({ SESSION_SECRET: 'short' })).toThrow(/32 characters/);
  });

  it('adds the owner to the allow-list and lowercases emails', () => {
    const env = loadEnv({ OWNER_EMAIL: 'Dad@Example.com', ALLOWED_EMAILS: 'son@example.com' });
    expect(env.ownerEmail).toBe('dad@example.com');
    expect(env.allowedEmails).toEqual(['dad@example.com', 'son@example.com']);
  });

  it('reports bad values in plain words', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
