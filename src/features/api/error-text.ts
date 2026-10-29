import type { Messages } from '@/i18n/messages';
import { ApiError } from './client';

/** A user-facing sentence for any failed request, in the current language. */
export function errorText(t: Messages, error: unknown): string {
  if (!(error instanceof ApiError)) {
    // fetch() itself failed: offline, DNS, the tunnel went away…
    return error instanceof TypeError ? t.errors.network : t.common.somethingWrong;
  }
  switch (error.code) {
    case 'session_expired':
      return t.errors.sessionExpired;
    case 'rate_limited':
      return t.errors.rateLimited;
    default:
      return t.common.somethingWrong;
  }
}
