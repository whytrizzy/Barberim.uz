/**
 * Deep-link payloads: t.me/<bot>?start=<payload>. Telegram allows up to 64 chars of
 * A-Z a-z 0-9 _ -, so payloads are `<kind>_<value>` with no other separators.
 */
export type StartPayload =
  | { kind: 'shop'; slug: string } // a shop's own link, shared on Instagram / in the window
  | { kind: 'staff'; staffId: string } // a link straight to one master
  | { kind: 'invite'; token: string } // owner invites a master to join the shop
  | { kind: 'none' };

const patterns = [
  [/^shop_([a-z0-9-]{2,58})$/, (m: string) => ({ kind: 'shop', slug: m }) as const],
  [/^staff_([A-Za-z0-9-]{1,58})$/, (m: string) => ({ kind: 'staff', staffId: m }) as const],
  [/^invite_([A-Za-z0-9_-]{16,57})$/, (m: string) => ({ kind: 'invite', token: m }) as const],
] as const;

export function parseStartPayload(raw: string | undefined): StartPayload {
  const value = (raw ?? '').trim();
  for (const [pattern, build] of patterns) {
    const match = pattern.exec(value);
    if (match?.[1]) return build(match[1]);
  }
  return { kind: 'none' };
}

/** The Mini App page a payload should open. */
export function miniAppUrl(appUrl: string, payload: StartPayload): string {
  const base = appUrl.replace(/\/+$/, '');
  switch (payload.kind) {
    case 'shop':
      return `${base}/shop/${payload.slug}`;
    case 'staff':
      return `${base}/master/${payload.staffId}`;
    case 'invite':
      return `${base}/invite/${payload.token}`;
    case 'none':
      return base;
  }
}

/** Telegram only opens Mini Apps (and accepts web_app buttons) on HTTPS URLs. */
export function canOpenMiniApp(appUrl: string): boolean {
  return appUrl.startsWith('https://');
}
