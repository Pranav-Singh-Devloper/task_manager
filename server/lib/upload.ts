/** File types that may be attached to a meeting (§5.7): PDF, Office documents, images, text, CSV and zip. */
export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_TYPES.has(mime.toLowerCase().split(';')[0]?.trim() ?? '');
}

/** Keeps a name readable but removes path pieces, control characters and anything Drive or a shell could mind. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 150);
  return cleaned || 'file';
}

/** The name the file gets in Drive: "2026-11-17 — Topic — original.pdf" (§5.7). */
export function driveFileName(date: string, title: string, original: string): string {
  return `${date} — ${safeFileName(title).slice(0, 60)} — ${safeFileName(original)}`;
}
