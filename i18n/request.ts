import { getRequestConfig } from 'next-intl/server';

/** English only until Phase 3. Adding Hindi means adding messages/hi.json and choosing the locale here. */
export default getRequestConfig(async () => ({
  locale: 'en',
  messages: (await import('../messages/en.json')).default,
  timeZone: 'Asia/Kolkata',
}));
