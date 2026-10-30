import { getWebApp, supports } from './webapp';

/**
 * Asks a yes/no question: Telegram's native dialog inside Telegram (6.2+), the browser's
 * confirm() elsewhere. Resolves false if the dialog can't be shown.
 */
export function confirmAction(message: string): Promise<boolean> {
  const webApp = getWebApp();
  if (webApp && supports(webApp, '6.2')) {
    return new Promise((resolve) => {
      try {
        webApp.showConfirm(message, resolve);
      } catch {
        resolve(false);
      }
    });
  }
  return Promise.resolve(window.confirm(message));
}
