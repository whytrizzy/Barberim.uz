import { getWebApp, safely, supports } from './webapp';
import { clientEnv } from '@/env/client';

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

/**
 * Saves a file from this app's own address: Telegram's download sheet where the client has it
 * (8.0+), otherwise the browser. Telegram can't save a file a page made itself, only one at a URL.
 */
export function downloadFile(path: string, fileName: string): void {
  const url = new URL(path, window.location.origin).toString();
  const webApp = getWebApp();
  if (webApp && supports(webApp, '8.0')) {
    safely(() => webApp.downloadFile({ url, file_name: fileName }));
    return;
  }
  if (webApp) {
    // Older Telegram: open it outside, where it can be long-pressed and saved.
    safely(() => webApp.openLink(url));
    return;
  }
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
}

/** A shop's link: the bot, opening straight on that shop (the server's share kit uses the same). */
export function shopBotLink(slug: string): string {
  const bot = clientEnv.NEXT_PUBLIC_BOT_USERNAME ?? 'barberim_bot';
  return `https://t.me/${bot}?start=shop_${slug}`;
}
