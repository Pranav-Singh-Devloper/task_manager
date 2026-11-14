import pino, { type Logger } from 'pino';

/** Structured JSON logs. Tokens, cookies and secrets are always redacted. */
export function createLogger(level = 'info', pretty = false): Logger {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.refresh_token',
        '*.access_token',
        '*.refreshToken',
        '*.accessToken',
        '*.client_secret',
        '*.token',
      ],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  });
}
