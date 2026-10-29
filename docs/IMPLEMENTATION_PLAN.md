# Barberim.uz v2 — Implementation Plan

Telegram Mini App + Telegram bot for booking barbers in Uzbekistan.
This document is the source of truth for the rebuild. Each step is small enough to be done,
tested and committed on its own. Tick steps off as they land.

Feature numbers like `(#15)` refer to the agreed feature list (section "Feature list" at the end).

---

## 0. Key decisions

| Area            | Decision                                                                                                                                                             | Why                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Where           | Same repo, branch `rebuild/v2`. Old code tagged `v1-legacy`.                                                                                                         | Keeps history; nothing is lost.                                                                                    |
| Platform        | Telegram Mini App + bot only (public website is Phase 3).                                                                                                            | Telegram is where users in Uzbekistan are.                                                                         |
| Framework       | Next.js 16 (App Router), TypeScript **strict**, no `ignoreBuildErrors`.                                                                                              | Same family as v1, but with real routes.                                                                           |
| UI              | Tailwind v4, shadcn/ui, Magic UI, `motion` (framer-motion), lucide icons.                                                                                            | Skills installed: impeccable, emil-design-eng, magic-ui, gsap-react.                                               |
| Design system   | `DESIGN.md` at repo root (google design.md format), written before screens.                                                                                          | One visual source of truth.                                                                                        |
| Data fetching   | TanStack Query on the client, Route Handlers + Zod validation on the server.                                                                                         | Caching for slow mobile internet.                                                                                  |
| Hosting         | AWS `eu-central-1` (Frankfurt): Next.js on Lambda via SST (OpenNext), EventBridge Scheduler for cron. Billing alarm at $1.                                           | Lambda stays in the always-free tier; closest good region to Uzbekistan.                                           |
| Database        | New PostgreSQL on **Neon** free tier (from zero, no v1 data migration) + Prisma, **`prisma migrate`** (no more `db push`). Separate dev and prod branches/databases. | Free after the AWS 6-month plan ends; migrations allow raw SQL constraints. Move to RDS later when revenue exists. |
| Brand           | Keep the name **Barberim**. Visual direction chosen in P0.4 — must look crafted and premium, not like a generic AI template.                                         |                                                                                                                    |
| Bots            | Existing bot = **production**. New separate **dev bot** for testing (created by the user in @BotFather).                                                             | Never test on real users.                                                                                          |
| Double booking  | Postgres `EXCLUDE USING gist` on `(staff_id, tstzrange(start,end))` for active bookings.                                                                             | Impossible to double-book, even under races.                                                                       |
| Time            | All timestamps stored UTC; business logic in `Asia/Tashkent` (UTC+5, no DST).                                                                                        | Correct slots regardless of server location.                                                                       |
| Money           | Integer UZS, formatted `50 000 so'm`.                                                                                                                                | No float errors.                                                                                                   |
| i18n            | 3 locales: `uz-Latn` (default), `uz-Cyrl`, `ru`. Typed dictionaries.                                                                                                 | Covers young, older and Russian-speaking users.                                                                    |
| Bot             | grammY, **webhook** at `/api/bot` (no long-polling process).                                                                                                         | Runs on serverless hosting.                                                                                        |
| Background jobs | `Notification` outbox table + cron endpoint every 5 min (`/api/cron/dispatch`).                                                                                      | Reminders without extra infrastructure.                                                                            |
| Maps            | Yandex Maps (static map + deep links to Yandex Navigator / Yandex Go).                                                                                               | Most accurate in Uzbekistan.                                                                                       |
| Payments        | Phase 3: Click, Payme, Uzum. Booking always works with cash.                                                                                                         | Cash is still the norm.                                                                                            |
| SMS             | Phase 3: Eskiz.uz.                                                                                                                                                   | Fallback for walk-in clients without the bot.                                                                      |
| Tests           | Vitest (slot engine, booking rules, API), Playwright smoke tests later.                                                                                              | Booking logic must never regress.                                                                                  |
| Monitoring      | Sentry + structured logs (Phase 3, basic logging from Phase 0).                                                                                                      |                                                                                                                    |

### Answered questions (2026-10-29)

1. Hosting: AWS, as free as possible → Lambda + external free Postgres (above).
2. Database: brand-new database, start from zero.
3. Brand: keep "Barberim"; colors are my call, premium and non-generic for both clients and barbers.
4. Bot: reuse the current bot for production; separate dev bot for testing.

### Setup the user does (Claude can't create accounts)

- AWS account (needs a Visa/Mastercard) — before **P0.6** deploy.
- Neon account — before **P1.1**.
- Dev bot in @BotFather — before **P0.6**. Put its token in `.env.local`, never in chat or git.

---

## 1. Data model (v2)

```
User            telegramId, name, phone, phoneVerified, locale, createdAt
Shop            slug, name, about, address, landmark, district, region, lat, lng,
                photos[], status (DRAFT|ACTIVE|SUSPENDED), plan (FREE|PRO), settings
Staff           shopId, userId? (null until invite accepted), displayName, photo, bio,
                role (OWNER|ADMIN|MASTER), commissionPct, isActive, sortOrder
StaffInvite     staffId, token, expiresAt, usedAt
Service         shopId, name (per locale), category (ADULT|KIDS|BEARD|WEDDING|OTHER),
                durationMin, price, priceIsFrom, isActive, sortOrder
StaffService    staffId, serviceId, priceOverride?, durationOverride?
WeeklyHours     staffId, weekday (1=Mon), startMin, endMin        (several rows = breaks between)
ScheduleOverride staffId, date, type (DAY_OFF|CUSTOM_HOURS), startMin?, endMin?, reason
ShopClient      shopId, userId?, name, phone, notes, visitCount, noShowCount, isBlocked   (CRM)
Booking         shopId, staffId, shopClientId, startAt, endAt, status
                (PENDING|CONFIRMED|COMPLETED|NO_SHOW|CANCELLED_CLIENT|CANCELLED_SHOP),
                source (APP|WALK_IN|PHONE), groupId? (family / wedding group), totalPrice, note
                + EXCLUDE constraint for active statuses
BookingItem     bookingId, serviceId, nameSnapshot, priceSnapshot, durationSnapshot
Review          bookingId (unique), rating 1-5, text, reply, isHidden
Favorite        userId, shopId | staffId
WaitlistEntry   userId, staffId?, shopId, date, fromMin, toMin, notifiedAt
Notification    channel (TELEGRAM|SMS), chatId/phone, template, payload, sendAt, status, attempts
Promotion       shopId, type (PERCENT_OFF|LOYALTY_NTH_FREE|REFERRAL), rules, activeFrom/To   (Phase 3)
Subscription    shopId, plan, periodEnd, provider                                            (Phase 2)
Payment         bookingId? | subscriptionId?, provider (CLICK|PAYME|UZUM), amount, status, raw (Phase 3)
AuditLog        actorId, action, entity, entityId, data, createdAt
```

---

## Phase 0 — Foundation (no features yet, everything else builds on it)

- [x] **P0.1 Branch + clean slate.** Tag `v1-legacy`, create `rebuild/v2`, move v1 `src/` aside (`legacy/`, excluded from build), add `agent1/` and secrets to `.gitignore`.
- [x] **P0.2 Project setup.** Next.js 16, TS strict, ESLint + Prettier, path aliases, env validation with Zod (`src/env/`), Vitest. Build fails on type errors.
- [x] **P0.3 Folder structure.** `src/app` (routes), `src/features/<domain>` (booking, shop, staff, schedule, clients…), `src/server` (db, auth, services), `src/ui` (design-system components), `src/i18n`, `src/bot`.
- [x] **P0.4 Design system.** Direction "Sartaroshxona" chosen from 4 mockups (`docs/design/directions.html`). `PRODUCT.md`, `DESIGN.md`, tokens in Tailwind v4 (light + dark, ready for Telegram's theme in P0.5), Onest + Fira Sans Extra Condensed, base components in `src/ui/` (sign, tiles, lists, buttons), dev preview at `/design`. shadcn/ui primitives (sheet, dialog…) are added when a step first needs them, themed with these tokens.
- [x] **P0.5 Telegram shell.** Telegram WebApp SDK wrapper: initData, theme sync, BackButton/MainButton hooks, haptics (guarded), viewport/safe areas. Dev mode that works in a normal browser with a fake user.
- [x] **P0.6 Bot skeleton.** grammY bot: `/start` deep links (`shop_<slug>`, `staff_<id>`, `invite_<token>`) and `/help` in uz/ru; webhook route `/api/bot` with secret-token check and token-safe error logging; `npm run bot:dev` (local long polling, dev bot only) and `npm run bot:setup` (commands, descriptions, menu button, `--webhook`). Dev bot: @barberim_dev_bot. Production webhook + menu button are registered at deploy (P1.21); opening the Mini App from Telegram locally needs an HTTPS tunnel.
- [x] **P0.7 i18n.** 3 locales: uz-Latn (default) and ru written by hand, uz-Cyrl generated by a Latin→Cyrillic transliterator with overrides; locale in a cookie (server renders it) + localStorage (Telegram Web iframe); first-launch picker preselected from Telegram's language; formatters for soʻm, durations, dates (Monday-first), Russian plurals; Tashkent time (UTC+5) and +998 phone helpers in `src/domain`; bot copy moved into the dictionaries. (#7, #8)

**Done when:** an empty, themed Mini App opens from the bot in all 3 languages, CI passes lint + types + tests.

---

## Phase 1 — MVP rebuild (feature #1–12, 15–16, 19–20, 26)

### 1A. Data + auth

- [x] **P1.1 Schema + migrations** for User, Shop, Staff, StaffInvite, Service, StaffService, WeeklyHours, ScheduleOverride, ShopClient, Booking, BookingItem, Notification, AuditLog. Raw SQL migration for the exclusion constraint. Seed script with a realistic Tashkent shop. (#1, #4) — Done: Prisma 7.10 + @prisma/adapter-pg on the Neon dev branch; `bookings_no_overlap` exclusion constraint + value checks in SQL; `npm run test:db` proves overlaps (incl. a simultaneous race) are rejected.
- [x] **P1.2 Auth.** Telegram initData verified server-side (HMAC-SHA256, timing-safe, 24h max age) on every request via `Authorization: tma …` — no cookies, so it also works in Telegram Web's iframe. `POST /api/auth/session` syncs the account (and the chosen language). `requireUser` / `requireStaff(userId, shopId, roles)`, typed API errors, Zod-validated bodies, basic per-instance rate limiting. Dev-only signed login for browser mode, gated on APP_ENV=development **and** a non-production build. (#36 basics)
- [x] **P1.3 Phone capture.** One tap via Telegram `requestContact`: its signed response is verified on the server (same HMAC as launch data, 10-minute max age, must be the user's own contact) → saved as verified. Backup path: the contact Telegram also sends to the bot is saved by the bot. Fallback: typed number in a +998 field with a progressive mask → saved unverified. `PUT /api/me/phone`, reusable `<PhoneCapture>` and `<TextField>`. (#8)

### 1B. Core booking engine

- [x] **P1.4 Availability engine** (`src/domain/availability.ts`, pure): working windows from weekly blocks (breaks) + date overrides (day off wins, custom hours replace), a step grid plus "right after a booking" starts (no gaps), buffer, minimum notice, horizon, Tashkent time; day status open/full/closed/day_off/past/beyond_horizon; `checkSlot` for server-side re-checks (clients only offered starts, staff `anyStart`). 500-run randomized invariant test. Server loader `getAvailability` (range of days in one round trip) with shop settings parsed safely. (#3)
- [x] **P1.5 Booking service.** Pure rules in `src/domain/booking.ts` (who may confirm/cancel/complete/no-show/reschedule, when; price/duration snapshots with per-master overrides). `src/server/services/booking.ts`: client bookings (phone required, offered starts only, blocked clients, max upcoming per client, optional approval), staff walk-in/phone bookings (any time, own calendar for masters), actions with compare-and-set updates, visit/no-show counters, audit log; DB overlap → friendly `slot_taken`. Routes `POST /api/bookings`, `PATCH /api/bookings/:id`. 15 end-to-end DB tests incl. a simultaneous race. (#1, #4)
- [x] **P1.6 "Any free master" + family booking.** `src/domain/combine.ts`: merge masters per start (who can take it, least busy first, then shop order), back-to-back group split. `getShopAvailability` / `getMasterAvailability` (durations from each master's own service times). `createClientBookings`: `staffId: "any"` tries masters best first and falls through to the next if one loses the time in a race; families of 2–5 booked back to back with one master in one transaction (all or nothing), shared `groupId`, labels per person, counted once towards the client limit. `POST /api/bookings/group`. (#24 core, #14 core)

### 1C. Shop & staff management (barber side)

- [x] **P1.7 Shop onboarding.** `/staff/new` and `/staff/shop/:id`: name, auto link name (`slugify`, live availability check, reserved words), region (14) + Tashkent district (12) or free text, address, landmark, map pin from device location (Telegram LocationManager / GPS) or a pasted Yandex/Google link; optional Yandex static map preview (`NEXT_PUBLIC_YANDEX_MAPS_KEY`). Shop starts as DRAFT with the user as bookable OWNER; max 3 owned shops. `POST /api/shops`, `GET /api/shops/slug`, `GET/PATCH /api/shops/:id`. (#10)
- [ ] **P1.7b Shop photos.** Upload, order and delete shop photos. Needs a storage decision first: AWS S3 (+ CloudFront) or Neon Object Storage (S3-compatible, eu-central-1, no CDN).
- [ ] **P1.8 Services.** CRUD, categories (adult / kids / beard), "from" prices, which masters do which service. (#14)
- [ ] **P1.9 Staff + invites.** Owner adds a master → bot invite link → master accepts and gets their own login. Roles OWNER / ADMIN / MASTER. (#2)
- [ ] **P1.10 Schedules.** Weekly hours per master, breaks, days off / vacations, "today I leave at 16:00", presets: Friday prayer break, Ramadan hours. (#3, #12)
- [ ] **P1.11 Calendar view.** Day view per master and whole shop, booking details, status actions. (#26)
- [ ] **P1.12 Walk-in / phone bookings** in 2 taps, auto-creates ShopClient. (#26)

### 1D. Client side

- [ ] **P1.13 Shop profile page** (deep link target): photos, services, masters, today's free slots strip, address + "Route" (Yandex Navigator / Yandex Go). (#10, #20)
- [ ] **P1.14 Booking flow:** services → master (or "any") → date → slot → confirm with phone. Uses Telegram MainButton. Light skeletons, cached data. (#11, #24)
- [ ] **P1.15 My bookings:** upcoming / past, cancel, reschedule.
- [ ] **P1.16 Discovery:** search + filters (district, price, "free today", near me). (#19)

### 1E. Notifications

- [ ] **P1.17 Outbox + dispatcher.** `Notification` rows + cron endpoint + retries, templates in 3 languages.
- [ ] **P1.18 Client reminders** 24h and 2h before with inline buttons (Coming / Cancel / Reschedule). (#15)
- [ ] **P1.19 Staff alerts** on new / cancelled / rescheduled bookings with Accept / Reject buttons. (#16)

### 1F. Ship

- [ ] **P1.20 Quality pass.** `/impeccable audit` on all screens, performance on a budget Android (bundle size, no heavy animations), error states, empty states. (#11)
- [ ] **P1.21 Production setup.** Staging + prod envs, prod bot webhook, DB backups, remove debug code, basic logging. (No v1 data migration — fresh start.) (#5, #6)

**Done when:** a real shop can onboard, add masters and schedules, clients book through the bot link, everyone gets reminders, and double booking is impossible.

---

## Phase 2 — Retention + revenue (feature #13–14, 17, 21–25, 27–28, 30, 32–33)

- [ ] **P2.1 Reviews & ratings** only after COMPLETED bookings, shop reply, moderation flag. (#25)
- [ ] **P2.2 Portfolio** photos per master, shown on profile. (#20)
- [ ] **P2.3 Favorites** + "Repeat last booking" + "time for a haircut?" nudge after 3–4 weeks. (#21, #22)
- [ ] **P2.4 Waitlist** with automatic bot message when a slot frees up. (#23)
- [ ] **P2.5 "Your turn is next" / running-late messages.** (#17)
- [ ] **P2.6 Wedding (to'y) packages:** group booking, long-range dates, fixed block, optional prepayment flag. (#13)
- [ ] **P2.7 Client CRM:** visit history, notes, no-show counter, blacklist. (#27)
- [ ] **P2.8 Earnings dashboard:** income per day/week/month and per master, top services, busy hours, no-show rate. (#28)
- [ ] **P2.9 Sharing kit:** Instagram story card + QR code + printable window poster. (#30)
- [ ] **P2.10 Plans & limits:** FREE (1 master, basic) vs PRO; feature gating. (#32)
- [ ] **P2.11 Subscription billing** via Click / Payme (monthly). (#33)

---

## Phase 3 — Growth + scale (feature #9, 18, 29, 31, 34–38)

- [ ] **P3.1 Online deposits** (Click / Payme / Uzum) for popular masters / peak hours, refunds on shop cancellation. (#9)
- [ ] **P3.2 SMS fallback** via Eskiz.uz for walk-in clients. (#18)
- [ ] **P3.3 Commission split** per master + payout report. (#29)
- [ ] **P3.4 Promotions:** % off by time, loyalty "every Nth free", referral bonus. (#31)
- [ ] **P3.5 Monetization extras:** featured placement, deposit fee. (#34)
- [ ] **P3.6 Platform admin panel:** verify shops, moderate reviews, subscriptions, stats. (#35)
- [ ] **P3.7 Abuse protection:** max active bookings per user, phone verification enforcement, stricter rate limits. (#36)
- [ ] **P3.8 Monitoring:** Sentry, uptime, alerting. (#37)
- [ ] **P3.9 Public website** barberim.uz with SEO pages per shop; women's salon category. (#38)

---

## How we work

- One step (or a few small ones) per session. Each step ends with: code, tests where logic exists, a commit on `rebuild/v2`, and a tick in this file.
- Before UI work: check `DESIGN.md`; use impeccable / emil-design-eng / magic-ui skills.
- Never mark a step done without running build + tests.

---

## Feature list (agreed)

1 DB-level double-booking protection · 2 Master logins via invite · 3 Real schedules (hours, breaks, days off, overrides) · 4 Price/duration snapshots · 5 Real routes · 6 Remove debug code + tests ·
7 Uzbek Latin / Cyrillic / Russian · 8 Local formats (so'm, +998, 24h, Tashkent TZ) · 9 Cash-first, optional Click/Payme/Uzum deposit · 10 Yandex Maps + landmarks + route buttons · 11 Light & fast on cheap phones · 12 Friday prayer / Ramadan / Hayit calendar · 13 Wedding packages · 14 Kids services + family booking ·
15 Client reminders with buttons · 16 Staff alerts · 17 "Your turn is next" · 18 SMS fallback (Eskiz) ·
19 Discovery & filters · 20 Shop/master profile + portfolio · 21 Repeat booking + nudge · 22 Favorites · 23 Waitlist · 24 "Any free master" · 25 Verified reviews ·
26 Walk-in / phone bookings + calendar · 27 Client CRM · 28 Earnings dashboard · 29 Commission split · 30 Instagram/QR sharing kit · 31 Promotions & loyalty ·
32 Free tier · 33 Pro subscription · 34 Featured placement / fees ·
35 Admin panel · 36 Abuse protection · 37 Monitoring & backups · 38 Public website + women's salons
