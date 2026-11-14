/**
 * Sidebar items. Only pages that have been built are listed (Rule Zero: no "coming soon" items).
 * Tasks and Cases are added when their phases ship.
 */
export const NAV_ITEMS = [
  { href: '/', key: 'dashboard' },
  { href: '/admin', key: 'admin' },
  { href: '/settings', key: 'settings' },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]['key'];

export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Pages with a sticky Save bar. The floating "+ New meeting" button would sit on top of it, so it is hidden there. */
export function isFormPage(pathname: string): boolean {
  return (
    pathname === '/meetings/new' ||
    pathname === '/categories/new' ||
    /^\/meetings\/[^/]+\/(edit|reschedule|done)$/.test(pathname)
  );
}
