# Barberim.uz

Telegram Mini App + Telegram bot for booking barbers in Uzbekistan. Currently being rebuilt as v2
on branch `rebuild/v2`.

- **Plan:** `docs/IMPLEMENTATION_PLAN.md` — work one step at a time, tick the box when done.
- **Architecture & import rules:** `docs/ARCHITECTURE.md` (enforced by ESLint).
- **v1 (archived):** `legacy/` and git tag `v1-legacy` — reference only, never built.

## Commands

- `npm run dev` — local dev server (http://localhost:3000)
- `npm run check` — typecheck + lint + format check + tests (run before every commit)
- `npm run build` — production build (fails on type errors and invalid env)
- `npm run format` — apply Prettier

## Rules

- Users are in Uzbekistan: 3 locales (`uz-Latn` default, `uz-Cyrl`, `ru`), money in integer UZS
  (`50 000 so'm`), phones `+998`, time zone `Asia/Tashkent`. No hard-coded UI strings.
- UI work: read `DESIGN.md` first and use the project skills (impeccable, emil-design-eng,
  magic-ui, gsap-react). Must work on cheap Android phones over slow mobile internet.
- Secrets live in `.env.local` only. Local development uses the **dev bot**, never the production bot.
- A step is done only when `npm run check` and `npm run build` pass; then commit and push `rebuild/v2`.
  Never push `main` without asking.
