import { getWebApp, safely } from './webapp';

/** Telegram's "send to a chat" sheet with this link; a new tab outside Telegram. */
export function shareViaTelegram(link: string, text: string): void {
  const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  const webApp = getWebApp();
  if (webApp) safely(() => webApp.openTelegramLink(url));
  else window.open(url, '_blank', 'noopener');
}

/** Opens a link outside the Mini App, so a maps app or browser can take it. */
export function openExternal(url: string): void {
  const webApp = getWebApp();
  if (webApp) safely(() => webApp.openLink(url));
  else window.open(url, '_blank', 'noopener');
}
