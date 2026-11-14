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
