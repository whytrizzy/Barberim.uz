/**
 * Opens the local app inside Telegram, in one command (run `npm run dev` in another terminal):
 *   npm run dev:telegram
 *
 * 1. starts a Cloudflare quick tunnel (free, no account) to http://localhost:3000 — Telegram only
 *    opens Mini Apps over HTTPS;
 * 2. writes the tunnel's https address into .env.local as NEXT_PUBLIC_APP_URL (`next dev` reloads
 *    env files on change);
 * 3. points the dev bot's menu button at it;
 * 4. runs the dev bot with long polling until Ctrl+C.
 * A quick tunnel gets a new address on every start, which is why this is one command.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createBot } from '@/bot/bot';
import { serverEnv } from '@/env/server';
import { savePhoneFromBotContact } from '@/server/services/profile';

const ENV_FILE = '.env.local';
const LOCAL_URL = 'http://localhost:3000';

function cloudflaredCommand(): string {
  const windowsDefault = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
  return process.platform === 'win32' && existsSync(windowsDefault)
    ? windowsDefault
    : 'cloudflared';
}

function startTunnel(): Promise<{ url: string; stop: () => void }> {
  const child = spawn(cloudflaredCommand(), ['tunnel', '--no-autoupdate', '--url', LOCAL_URL], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('cloudflared gave no URL within 60s')), 60_000);
    const onOutput = (chunk: Buffer) => {
      const url = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk.toString())?.[0];
      if (!url) return;
      clearTimeout(timer);
      resolve({ url, stop: () => child.kill() });
    };
    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);
    child.on('error', (error) =>
      reject(new Error(`could not start cloudflared (is it installed?): ${error.message}`)),
    );
    child.on('exit', (code) => reject(new Error(`cloudflared exited with code ${code}`)));
  });
}

function writeAppUrl(url: string) {
  const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
  const line = `NEXT_PUBLIC_APP_URL=${url}`;
  const next = /^NEXT_PUBLIC_APP_URL=.*$/m.test(current)
    ? current.replace(/^NEXT_PUBLIC_APP_URL=.*$/m, line)
    : `${current.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_FILE, next);
}

async function main() {
  if (serverEnv.APP_ENV !== 'development') {
    throw new Error(`dev:telegram only runs with APP_ENV=development (got ${serverEnv.APP_ENV})`);
  }
  const token = serverEnv.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Set TELEGRAM_BOT_TOKEN (the dev bot) in .env.local');

  const tunnel = await startTunnel();
  process.on('SIGINT', () => {
    tunnel.stop();
    process.exit(0);
  });
  writeAppUrl(tunnel.url);
  console.log(`Tunnel: ${tunnel.url} -> ${LOCAL_URL} (written to ${ENV_FILE})`);

  const bot = createBot({ token, appUrl: tunnel.url, savePhone: savePhoneFromBotContact });
  await bot.api.deleteWebhook();
  await bot.api.setChatMenuButton({
    menu_button: { type: 'web_app', text: 'Barberim', web_app: { url: tunnel.url } },
  });
  await bot.start({
    onStart: (me) =>
      console.log(
        `@${me.username} is polling. Open it in Telegram and tap "Barberim". Ctrl+C stops.`,
      ),
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
