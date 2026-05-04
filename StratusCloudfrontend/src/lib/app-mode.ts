export const LITE_ROUTE_PREFIX = '/lv';

export function isLiteRoutePath(pathname: string): boolean {
  return pathname === LITE_ROUTE_PREFIX || pathname.startsWith(`${LITE_ROUTE_PREFIX}/`);
}

export function getAppHomePath(pathname: string): string {
  return isLiteRoutePath(pathname) ? LITE_ROUTE_PREFIX : '/';
}

export function getVaultRoutePath(pathname: string): string {
  return isLiteRoutePath(pathname) ? `${LITE_ROUTE_PREFIX}/vault` : '/vault';
}

export function getStatusRoutePath(pathname: string): string {
  return isLiteRoutePath(pathname) ? `${LITE_ROUTE_PREFIX}/status` : '/status';
}
