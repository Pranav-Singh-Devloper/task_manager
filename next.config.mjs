import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The development badge sits in the bottom-left corner, over the phone's sticky Save bar. The live site never
  // shows it; turning it off in development keeps local use and the browser tests the same as the real thing.
  devIndicators: false,
};

export default withNextIntl(nextConfig);
