import type { MetadataRoute } from 'next';

/** Lets the phone offer "Add to Home Screen" and open the app like an app (§7.12). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Meetings Manager',
    short_name: 'Meetings',
    description: 'Your meetings, reminders, documents and next dates in one place.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f7f9',
    theme_color: '#1e40af',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
