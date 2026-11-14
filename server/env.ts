import { z } from 'zod';

/** An empty value in .env (for example `GOOGLE_CLIENT_ID=`) means "not set". */
const optional = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().default('http://localhost:3000'),
  ),
  GOOGLE_MODE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['live', 'mock']).optional()),
  MOCK_FAIL: z.string().default(''),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  GOOGLE_REDIRECT_URI: optional,
  SESSION_SECRET: optional,
  TOKEN_ENCRYPTION_KEY: optional,
  DATA_DIR: z.preprocess((v) => (v === '' ? undefined : v), z.string().default('./data')),
  OWNER_EMAIL: optional,
  ALLOWED_EMAILS: optional,
  SPREADSHEET_ID: optional,
  DEFAULT_TIMEZONE: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().default('Asia/Kolkata'),
  ),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(50),
  LOG_LEVEL: z.preprocess((v) => (v === '' ? undefined : v), z.string().default('info')),
});

export interface Env {
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
  port: number;
  appUrl: string;
  googleMode: 'live' | 'mock';
  mockFail: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri: string;
  sessionSecret: string;
  tokenEncryptionKey?: string;
  dataDir: string;
  ownerEmail: string;
  allowedEmails: string[];
  spreadsheetId?: string;
  defaultTimezone: string;
  maxUploadMb: number;
  logLevel: string;
}

const LIVE_REQUIRED = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SESSION_SECRET',
  'TOKEN_ENCRYPTION_KEY',
  'OWNER_EMAIL',
] as const;

/** Development-only defaults, so the app starts in mock mode with no setup. */
const DEV_SESSION_SECRET = 'dev-only-session-secret-change-me-0123456789';
const DEV_OWNER_EMAIL = 'owner@example.com';

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  const googleMode = e.GOOGLE_MODE ?? (isProduction ? 'live' : 'mock');

  if (googleMode === 'live') {
    const missing = LIVE_REQUIRED.filter((k) => !e[k]);
    if (missing.length > 0) {
      throw new Error(`Invalid environment: GOOGLE_MODE=live needs ${missing.join(', ')}`);
    }
  }
  if (isProduction && !e.SESSION_SECRET) {
    throw new Error('Invalid environment: SESSION_SECRET is required in production');
  }
  if (e.SESSION_SECRET && e.SESSION_SECRET.length < 32) {
    throw new Error('Invalid environment: SESSION_SECRET must be at least 32 characters');
  }

  const ownerEmail = (e.OWNER_EMAIL ?? DEV_OWNER_EMAIL).toLowerCase();
  const allowed = (e.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(ownerEmail)) allowed.unshift(ownerEmail);

  return {
    nodeEnv: e.NODE_ENV,
    isProduction,
    port: e.PORT,
    appUrl: e.APP_URL.replace(/\/$/, ''),
    googleMode,
    mockFail: e.MOCK_FAIL,
    googleClientId: e.GOOGLE_CLIENT_ID,
    googleClientSecret: e.GOOGLE_CLIENT_SECRET,
    googleRedirectUri:
      e.GOOGLE_REDIRECT_URI ?? `${e.APP_URL.replace(/\/$/, '')}/api/auth/google/callback`,
    sessionSecret: e.SESSION_SECRET ?? DEV_SESSION_SECRET,
    tokenEncryptionKey: e.TOKEN_ENCRYPTION_KEY,
    dataDir: e.DATA_DIR,
    ownerEmail,
    allowedEmails: allowed,
    spreadsheetId: e.SPREADSHEET_ID,
    defaultTimezone: e.DEFAULT_TIMEZONE,
    maxUploadMb: e.MAX_UPLOAD_MB,
    logLevel: e.LOG_LEVEL,
  };
}
