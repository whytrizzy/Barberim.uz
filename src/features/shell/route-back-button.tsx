'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { useBackButton } from '@/telegram/use-back-button';
import { isRootPath, parentPath } from './routes';

/**
 * Drives the Back button from the current route. Back steps through in-app history while there is
 * some; when the app was opened straight on a deep page (a shop link) there is none, so Back goes
 * to the page's parent instead of leaving the app.
 */
export function RouteBackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const depth = useRef(0); // in-app history entries behind the current one
  const popped = useRef(false);
  // Comparing paths (not a "first run" flag) keeps the count right when React runs effects twice.
  const lastPath = useRef(pathname);

  useEffect(() => {
    const onPop = () => {
      popped.current = true;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    depth.current = popped.current ? Math.max(0, depth.current - 1) : depth.current + 1;
    popped.current = false;
  }, [pathname]);

  const goBack = useCallback(() => {
    if (depth.current > 0) router.back();
    else router.replace(parentPath(pathname) as never);
  }, [router, pathname]);

  useBackButton(isRootPath(pathname) ? null : goBack);
  return null;
}
