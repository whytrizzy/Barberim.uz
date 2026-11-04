# Barberim.uz v2 — Implementation Plan

Telegram Mini App + Telegram bot for booking barbers in Uzbekistan.
This document is the source of truth for the rebuild. Each step is small enough to be done,
tested and committed on its own. Tick steps off as they land.

Feature numbers like `(#15)` refer to the agreed feature list (section "Feature list" at the end).

---

## 0. Key decisions

| Area            | Decision                                                                                                                                                                                              | Why                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Where           | Same repo, branch `rebuild/v2`. Old code tagged `v1-legacy`.                                                                                                                                          | Keeps history; nothing is lost.                                                                             |
| Platform        | Telegram Mini App + bot only (public website is Phase 3).                                                                                                                                             | Telegram is where users in Uzbekistan are.                                                                  |
| Framework       | Next.js 16 (App Router), TypeScript **strict**, no `ignoreBuildErrors`.                                                                                                                               | Same family as v1, but with real routes.                                                                    |
| UI              | Tailwind v4, shadcn/ui, Magic UI, `motion` (framer-motion), lucide icons.                                                                                                                             | Skills installed: impeccable, emil-design-eng, magic-ui, gsap-react.                                        |
| Design system   | `DESIGN.md` at repo root (google design.md format), written before screens.                                                                                                                           | One visual source of truth.                                                                                 |
| Data fetching   | TanStack Query on the client, Route Handlers + Zod validation on the server.                                                                                                                          | Caching for slow mobile internet.                                                                           |
| Hosting         | **Render** paid web service (about $7/month), Frankfurt if offered: Next.js as a normal Node server. **Cloudflare R2** for photos. Scheduled trigger for cron (Cloudflare, to be confirmed at P1.21). | Changed from AWS on 2026-10-31: AWS phone verification failed for +998. Fixed price, no server to maintain. |
| Database        | New PostgreSQL on **Neon** free tier (from zero, no v1 data migration) + Prisma, **`prisma migrate`** (no more `db push`). Separate dev and prod branches/databases.                                  | Free to start; migrations allow raw SQL constraints. Upgrade the Neon plan when revenue exists.             |
| Brand           | Keep the name **Barberim**. Visual direction chosen in P0.4 — must look crafted and premium, not like a generic AI template.                                                                          |                                                                                                             |
| Bots            | Existing bot = **production**. New separate **dev bot** for testing (created by the user in @BotFather).                                                                                              | Never test on real users.                                                                                   |
| Double booking  | Postgres `EXCLUDE USING gist` on `(staff_id, tstzrange(start,end))` for active bookings.                                                                                                              | Impossible to double-book, even under races.                                                                |
| Time            | All timestamps stored UTC; business logic in `Asia/Tashkent` (UTC+5, no DST).                                                                                                                         | Correct slots regardless of server location.                                                                |
| Money           | Integer UZS, formatted `50 000 so'm`.                                                                                                                                                                 | No float errors.                                                                                            |
| i18n            | 3 locales: `uz-Latn` (default), `uz-Cyrl`, `ru`. Typed dictionaries.                                                                                                                                  | Covers young, older and Russian-speaking users.                                                             |
| Bot             | grammY, **webhook** at `/api/bot` (no long-polling process).                                                                                                                                          | Needs no separate bot process.                                                                              |
| Background jobs | `Notification` outbox table + cron endpoint every 5 min (`/api/cron/dispatch`).                                                                                                                       | Reminders without extra infrastructure.                                                                     |
| Maps            | Yandex Maps (static map + deep links to Yandex Navigator / Yandex Go).                                                                                                                                | Most accurate in Uzbekistan.                                                                                |
| Payments        | Phase 3: Click, Payme, Uzum. Booking always works with cash.                                                                                                                                          | Cash is still the norm.                                                                                     |
| SMS             | Phase 3: Eskiz.uz.                                                                                                                                                                                    | Fallback for walk-in clients without the bot.                                                               |
| Tests           | Vitest (slot engine, booking rules, API), Playwright smoke tests later.                                                                                                                               | Booking logic must never regress.                                                                           |
| Monitoring      | Sentry + structured logs (Phase 3, basic logging from Phase 0).                                                                                                                                       |                                                                                                             |

### Answered questions (2026-10-29)

1. Hosting: originally AWS, as free as possible; switched to Render + Cloudflare R2 on 2026-10-31 (above), with Postgres staying on Neon.
2. Database: brand-new database, start from zero.
3. Brand: keep "Barberim"; colors are my call, premium and non-generic for both clients and barbers.
4. Bot: reuse the current bot for production; separate dev bot for testing.

### Setup the user does (Claude can't create accounts)

- Render and Cloudflare accounts (a Visa/Mastercard is probably needed) — before **P1.21** deploy.
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
- [x] **P1.7b Shop photos.** Up to 8 photos per shop on the edit screen: add several at once, tap one to move it, make it the cover (first) or delete it; saved at once, apart from the details form. The phone resizes each photo to 1600 px and re-encodes it (WebP, or JPEG where Safari can't write WebP) — ~300 KB instead of 4 MB, and no EXIF/GPS. The server accepts only well-formed JPEG/WebP ≤ 2 MB, strips any metadata left, stores it under an immutable key `shops/<shopId>/<photoId>.<ext>` and appends it atomically (two uploads at once can't pass the limit); reorder is compare-and-set. Storage: Cloudflare R2 (`MEDIA_BUCKET`, `MEDIA_BASE_URL`, `R2_*`, required outside development); in development photos go to `.media/` and are served by `/api/dev/media`. **The bucket is created at deploy (P1.21).**
- [x] **P1.8 Services.** CRUD at `/staff/shop/:id/services` (owners and admins edit; masters read): categories (adult / kids / beard / wedding / other), duration, "from" prices, which masters do which service. Deleting hides the service (bookings keep their snapshots); masters who stay keep their own price and time overrides. Per-master overrides and reordering have no screen yet. (#14)
- [x] **P1.9 Staff + invites.** `/staff/shop/:id/team`: owner adds a master (with all the shop's services) → bot invite link → master accepts at `/invite/:token` and gets their own login. Roles OWNER / ADMIN / MASTER: owners manage everyone and make admins, admins manage masters, masters only read and don't see the shop's edit form. Links work once for 7 days, only their hash is stored, a new link replaces the old one. Removing someone ends their access and is refused while clients are booked with them. Handing a shop to a new owner isn't covered. (#2)
- [x] **P1.10 Schedules.** `/staff/shop/:id/team/:staffId/schedule`: weekly hours with breaks (saved as a whole), "today I leave at…", days off, vacations and special hours for up to 90 days (grouped into one row, undoable), presets: Friday prayer break, Ramadan hours (dates and times chosen by the barber: the moon decides them). Masters run their own hours; owners and admins also run the hours of those they manage. Bookings are never touched by a schedule change: the screen warns how many no longer fit. (#3, #12)
- [x] **P1.11 Calendar view.** `/staff/shop/:id/calendar`: day view with a week strip, whole shop or one master, in order with free gaps and breaks, the client in the chair marked, day count and total, refreshes every minute. Masters see only their own calendar. Booking details: client with phone and history, services, note; confirm, came, no-show, move to another time, cancel. (#26)
- [x] **P1.12 Walk-in / phone bookings.** From the calendar (or a free gap, which fills in master and time) at `/staff/shop/:id/calendar/new`: a walk-in needs only a service, starting now or when the current client finishes; a phone booking adds a name and date. Known clients are found by name or phone and reused; a new one is created on the way (same phone = same client; nameless walk-ins share one record). (#26)

### 1D. Client side

- [x] **P1.13 Shop profile page** (deep link target) at `/shop/:slug`: photos, services, masters, today's free times (across masters, shortest service), address + route and pin through Yandex Maps. Owners and admins publish from the shop screen: a shop goes from DRAFT to ACTIVE once a master has a service and hours, and can be taken down again; staff can preview it before that. The free times become tappable in P1.14. Direct Yandex Navigator / Yandex Go buttons are still to do: their links couldn't be confirmed without a real phone. (#10, #20)
- [x] **P1.14 Booking flow** at `/shop/:slug/book`, on one screen: services → master (or "any") → day (14 ahead) → time → phone and optional note; Telegram MainButton books, showing the chosen time. The shop page's button, services and today's times all lead here with that choice filled in. Light skeletons, cached data. A time lost to someone faster asks to choose again from a refreshed list. Family booking has its server side (P1.6) but no screen yet. (#11, #24)
- [x] **P1.15 My bookings** at `/bookings` and `/booking/:id`: upcoming and past at every shop, details with address and route, cancel, move to another offered time with the same master (until it starts), book again. Someone else's booking looks like one that doesn't exist.
- [x] **P1.16 Discovery** at `/discover`: search by name, address or landmark in either script, filters for region and Tashkent district, price, "free today" and "near me" (location sent in the request body, never stored). Only shops that can really be booked; those with room today come first, or the closest. (#19)

### 1E. Notifications

- [x] **P1.17 Outbox + dispatcher.** `Notification` rows written in the same transaction as the booking change; `POST /api/cron/dispatch` (`CRON_SECRET`) with retries and backoff, safe against two runs at once and crashes; templates in 3 languages. First messages, to clients with a Telegram account: booked, request sent, confirmed, moved or cancelled by the shop. `npm run dev:telegram` runs the outbox locally.
- [x] **P1.18 Client reminders** 24h and 2h before with inline buttons: Coming (shown to staff; cleared if the time moves), Cancel (asks first), Reschedule (opens the booking). Scheduled with the booking in the same transaction, redone when it moves, dropped when it's cancelled or done; a booking made at the last minute gets fewer. For a family, only the first booking is reminded. (#15)
- [x] **P1.19 Staff alerts** on new / cancelled / rescheduled bookings, each in the recipient's language, never to whoever did it. A client's change tells the master, the owner and admins; a colleague's change tells just the master. Requests in shops that approve bookings first come with Accept / Reject (asks first); a second person's tap is told it's already decided. (#16)

### 1F. Ship

- [x] **P1.20 Quality pass.** `/impeccable audit` on all screens at phone size: every failed load offers a retry, loading shows the screen's shape, crashes and unknown pages are translated, the home screen no longer goes blank when sign-in fails; contrast and tap sizes fixed; fonts no longer preloaded (only the files a page uses are fetched). First load is about 250 KB of compressed JavaScript, most of it React and Next.js. An owner's setting for accepting bookings by hand. Not measured on a real budget Android. (#11)
- [x] **P1.21 Production setup.** Live at `https://barberim-uz.onrender.com` (Render Starter, Frankfurt), bot `@barberim_uz_bot` by webhook, Neon `production` branch; migrations and webhook in the Pre-Deploy command; photos in Cloudflare R2 served by the `workers/media` Worker on workers.dev, which also runs the 5-minute outbox schedule. Booking messages confirmed on real accounts. No staging, to save a service. Still open: turn off the bucket's r2.dev address, check Neon's restore window, a real domain, the 2-hour reminder not yet seen on a real booking. (#5, #6)

**Done when:** a real shop can onboard, add masters and schedules, clients book through the bot link, everyone gets reminders, and double booking is impossible.

---

## Phase 2 — Retention + revenue (feature #13–14, 17, 21–25, 27–28, 30, 32–33)

- [x] **P2.1 Reviews & ratings** only after COMPLETED bookings, once per visit, first names only; an hour after a finished visit the bot asks (once). Average on the shop page and in search, latest 10 on the shop page. Staff answer (masters their own) and flag for moderation at `/staff/shop/:id/reviews`; flagging never hides a review, so a shop cannot remove one it dislikes. Hiding comes with the admin panel (P3.6). (#25)
- [x] **P2.2 Portfolio** up to 12 photos of their work per master, managed by the master (or the owner/admin who manages them) at `/staff/shop/:id/team/:staffId/portfolio`; shown as thumbnails under each master on the shop page, opening a full-screen swipe viewer. Stored beside the shop photos, so the photo worker is unchanged. (#20)
- [x] **P2.3 Favorites** + "Repeat last booking" + "time for a haircut?" nudge after 3–4 weeks. (#21, #22) Save a shop from its page (kept apart from ShopClient, so saving doesn't make you a client); `/favorites` lists saved shops as search cards with the last visit there. "Book again" (booking page, My bookings when nothing is coming up, saved shops) opens the booking screen with the same services and master. 24 days after a finished visit, at 11:00 Tashkent time, the bot asks once; only the latest visit at a shop counts, and it's dropped if they've booked there again or the visit becomes a no-show.
- [x] **P2.4 Waitlist** with automatic bot message when a slot frees up. (#23) Full days can be tapped on the booking screen to join (per person, shop and day; a master or any; at most 5 days at once). A cancelled or moved booking queues a message for everyone waiting that day; just before it goes, the dispatcher checks a time that fits them is really free (else it waits for the next one), and drops it if they've booked that day. The message opens the booking screen on that day. Waiting days are listed on My bookings.
- [x] **P2.5 "Your turn is next" / running-late messages.** (#17) Marking a visit done (or a no-show) tells the master's next client, if due within 45 minutes, that their turn is next (once per booking); staff can also send it by hand. Staff can say the master is running 10–45 minutes late, and a client can say they are running 5–30 minutes late (the master and owner/admins hear; the calendar shows it). From 3 hours before until 30 minutes after the start, at most 3 per side per booking; moving the booking clears them.
- [x] **P2.6 Wedding (to'y) packages:** group booking, long-range dates, fixed block, optional prepayment flag. (#13) A WEDDING service can set how many people it covers (the client picks 1–N; one master's block, time and price unchanged), how far ahead it can be booked (up to 365 days, past the shop's usual horizon; the booking screen gets an "other date" field), and a prepayment: such bookings wait (PENDING) until the shop confirms it received the money. Online payment comes with P3.1. Moving a package booking still only offers the next 14 days.
- [x] **P2.7 Client CRM:** visit history, notes, no-show counter, blacklist. (#27) `/staff/shop/:id/clients`: search by name or phone, filters (all, regulars with 3+ visits, no-shows, blacklisted), 30 a page. A client's page has visits, no-shows, total spent, the latest 30 bookings, staff-only notes, and the blacklist (owners and admins); a blacklisted client can't book or join the waitlist online, staff can still book them by hand. Masters see only clients they have served. The staff booking screen links to the client.
- [x] **P2.8 Earnings dashboard:** income per day/week/month and per master, top services, busy hours, no-show rate. (#28) `/staff/shop/:id/earnings`: a day, week (Monday first) or month, stepped back and forth; income from visits marked done (booked prices, Tashkent time) against the period before, visits, average ticket, no-show rate, what is still expected, a column chart by hour or day (tap for the value; a table for screen readers), masters, top 5 services and busy hours. Masters see only their own visits.
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
