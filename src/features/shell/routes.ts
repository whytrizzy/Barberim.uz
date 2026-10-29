/** Top-level screens: no Back button there (the app's entry screens and the staff tabs). */
const rootPaths = new Set([
  '/',
  '/discover',
  '/bookings',
  '/staff/today',
  '/staff/calendar',
  '/staff/clients',
  '/staff/more',
]);

/** Parents that aren't simply "drop the last segment" (e.g. /booking/123 has no /booking page). */
const parentOverrides: Record<string, string> = {
  '/booking': '/bookings',
  '/shop': '/discover',
  '/staff': '/staff/today',
};

export function isRootPath(pathname: string): boolean {
  return rootPaths.has(pathname);
}

/** Where Back goes when there is no in-app history: the logical parent screen. */
export function parentPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  const parent = trimmed.slice(0, trimmed.lastIndexOf('/')) || '/';
  return parentOverrides[parent] ?? parent;
}
