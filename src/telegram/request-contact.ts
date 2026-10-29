import { getWebApp, supports } from './webapp';

export type ContactRequestResult =
  /** Shared; `signed` is Telegram's signed response for the server (may be missing on a slow client). */
  | { status: 'shared'; signed: string | null }
  | { status: 'declined' }
  /** Outside Telegram or on a client older than 6.9. */
  | { status: 'unavailable' };

type ContactEvent = { status?: string; response?: string };
type WebAppWithContact = {
  requestContact(cb: (shared: boolean, event: ContactEvent) => void): void;
};

export function canRequestContact(): boolean {
  const webApp = getWebApp();
  return Boolean(webApp && supports(webApp, '6.9'));
}

/** Opens Telegram's native "Share your phone number?" dialog. */
export function requestContact(): Promise<ContactRequestResult> {
  const webApp = getWebApp();
  if (!webApp || !supports(webApp, '6.9')) return Promise.resolve({ status: 'unavailable' });
  return new Promise((resolve) => {
    try {
      (webApp as unknown as WebAppWithContact).requestContact((shared, event) => {
        resolve(
          shared ? { status: 'shared', signed: event?.response || null } : { status: 'declined' },
        );
      });
    } catch {
      // Throws if a request is already open, or on clients that misreport their version.
      resolve({ status: 'unavailable' });
    }
  });
}
