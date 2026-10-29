# Barberim v2 — Architecture

How the code is organized and which parts may depend on which. The import rules below are
enforced by ESLint (`eslint.config.mjs`), so a wrong import fails `npm run lint`.

## Folder layout

```
src/
  app/                    Next.js routes only — thin pages/layouts that compose features.
    (client)/             Client screens: shop/[slug], book, bookings, discover…
    (staff)/              Barber / owner panel: dashboard, calendar, services, staff, schedule…
    api/                  Route handlers: parse input → call a server service → respond.
      bot/                Telegram webhook (P0.6)
      cron/               Scheduled jobs, e.g. notification dispatch (P1.17)

  domain/                 Pure business logic. No I/O, no React, no Prisma, no Next.js.
                          Availability engine, booking state machine, money, Tashkent time.
                          The most heavily tested code in the project.

  server/                 Server-only code. Every entry file starts with `import 'server-only'`.
    db/                   Prisma client, transaction helpers
    auth/                 Telegram initData verification, sessions, role guards
    services/             Use cases per domain (createBooking, inviteStaff…), call domain + db
    http/                 Route-handler helpers: error → HTTP mapping, rate limiting

  bot/                    grammY bot: commands, deep links, inline keyboards, message templates.

  features/<domain>/      UI per business area (booking, shop, staff, schedule, services,
                          clients, reviews, notifications…):
    components/           React components for this area
    hooks/                TanStack Query hooks
    api.ts                Client-side fetchers for this area's endpoints
    schemas.ts            Zod request/response schemas — shared by the client and server/

  ui/                     Design-system primitives (shadcn/ui based). No business logic.
  telegram/               Mini App SDK wrapper: initData, theme, Back/Main button, haptics.
  i18n/                   Dictionaries (uz-Latn, uz-Cyrl, ru) and formatters (so'm, +998, dates).
  lib/                    Tiny generic helpers (cn, assertNever…).
  env/                    Validated environment variables (server.ts / client.ts).
  test/                   Test helpers and stubs.
```

Folders are created by the plan step that first needs them; an empty folder is never committed.

## Dependency rules

Arrows mean "may import from".

| Folder      | May import                                                                      | Must not import                                                   |
| ----------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `domain/`   | `lib/`                                                                          | everything else (keeps it pure and testable)                      |
| `ui/`       | `lib/`                                                                          | `features/`, `server/`, `bot/`, `domain/`, `app/`                 |
| `features/` | `ui/`, `domain/`, `telegram/`, `i18n/`, `lib/`, `env/client`, other `features/` | `server/`, `bot/`, `env/server`, `app/`                           |
| `telegram/` | `lib/`, `env/client`                                                            | `server/`, `bot/`, `features/`, `app/`                            |
| `server/`   | `domain/`, `lib/`, `env/`, `i18n/`, `features/*/schemas`                        | `ui/`, `telegram/`, `app/`, feature components                    |
| `bot/`      | `server/`, `domain/`, `i18n/`, `lib/`, `env/`                                   | `ui/`, `features/`, `telegram/`, `app/`                           |
| `app/`      | anything (composition root)                                                     | `server/` from client components (`server-only` breaks the build) |

Use the `@/` alias for imports across folders (`@/domain/availability`), relative paths only
inside one folder.

## Conventions

- **Files:** `kebab-case` for everything, components included (`tile-group.tsx`, as shadcn/ui does); exported components are `PascalCase`; tests next to the code as `*.test.ts`.
- **Validation:** every API input is parsed with a Zod schema from `features/<domain>/schemas.ts`.
- **Errors:** services throw typed `AppError`s (code + i18n key); `server/http` maps them to HTTP.
- **Time:** store UTC, compute in `Asia/Tashkent` via `domain/time` helpers only — never `new Date()`
  arithmetic in components.
- **Money:** integer UZS everywhere; format only at the edge with `i18n` helpers.
- **Text:** no hard-coded user-facing strings — everything goes through `i18n/` (3 locales).
