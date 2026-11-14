import '@fontsource-variable/noto-sans';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { PreferencesProvider } from '@/components/preferences';
import { ToastProvider } from '@/components/ui/toast';
import { QueryProvider } from '@/lib/queries';
import { PREF_COOKIE, parseContrast, parseTextSize } from '@/shared/preferences';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  return { title: t('appName') };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const textSize = parseTextSize(jar.get(PREF_COOKIE.textSize)?.value);
  const contrast = parseContrast(jar.get(PREF_COOKIE.contrast)?.value);
  const messages = await getMessages();
  const t = await getTranslations('common');

  return (
    <html lang="en" data-text-size={textSize} data-contrast={contrast}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <PreferencesProvider initialTextSize={textSize} initialContrast={contrast}>
            <ToastProvider>
              <QueryProvider>
                <a
                  href="#main"
                  className="sr-only z-50 rounded-lg bg-accent px-4 py-3 font-semibold text-accent-ink focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
                >
                  {t('skipToContent')}
                </a>
                {children}
              </QueryProvider>
            </ToastProvider>
          </PreferencesProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
