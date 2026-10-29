# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(A Telegram Mini App: a web app running inside Telegram's in-app browser on phones, mostly Android.
Mobile web, not a native app.)

## Users

- **Clients** — men and boys in Uzbekistan (Tashkent first, then regions) who want a haircut without
  calling or waiting in line. They open Barberim from a barber's link in Instagram or Telegram, or from
  the bot. Typical scene: on the phone, one hand, often outdoors or on the go, sometimes on slow 3G.
  Many older users read Uzbek in Cyrillic; many in Tashkent prefer Russian.
- **Barbers (masters)** — work in a shop, between clients, checking the next booking or adding a
  walk-in in a few seconds with wet or busy hands, under bright shop lighting.
- **Shop owners / admins** — manage masters, schedules, services and prices; look at earnings.
- **Family and group bookings** — a father booking for himself and his sons; a groom and friends
  before a wedding (to'y).

## Product Purpose

Book a specific barber at a specific free time in under a minute, inside Telegram, and get reminded
so nobody forgets. For barbers: a calendar that is always true (online, phone and walk-in clients in
one place), fewer no-shows, and simple earnings numbers.

Success: clients stop calling to book; barbers trust the calendar enough to stop keeping paper notes.

## Positioning

Made for how barbering works in Uzbekistan: lives in Telegram (no app to install), three languages
(Uzbek Latin, Uzbek Cyrillic, Russian), cash first, Yandex Maps with landmarks, Friday-prayer and
Ramadan schedules, wedding (to'y) group bookings, family bookings, walk-ins in two taps.

## Operating Context

- Entry points: barber's deep link (`t.me/<bot>?start=shop_<slug>`), bot menu button, shared links.
- Telegram Mini App chrome: Telegram's own header, BackButton, MainButton, light/dark theme from the
  user's Telegram settings, haptics.
- Reminders and staff alerts arrive as Telegram bot messages with inline buttons.
- Devices: budget Android phones are common; mobile internet can be slow outside Tashkent.

## Capabilities and Constraints

- Money: integer UZS, shown as `50 000 so'm`. Phones `+998 90 123 45 67`. 24-hour time.
  Time zone Asia/Tashkent. Week starts Monday.
- Uzbek Latin uses the modifier letter turned comma (oʻ, gʻ — U+02BB); fonts must render it and
  full Cyrillic.
- Full feature list and phases: `docs/IMPLEMENTATION_PLAN.md`.

## Brand Commitments

- Name: **Barberim** (keep). Colors and visual identity: delegated to Claude.
- Must look crafted and trustworthy to both clients and barbers — explicitly **not** like a cheap,
  generic AI-generated app.

## Evidence on Hand

None yet: no real shop photos, reviews, or customer numbers. Demo content must be labeled as demo,
and no ratings, customer counts or claims may be invented for the live product.

## Product Principles

1. Fast on a cheap phone: the booking path never waits on decoration.
2. The calendar is the truth: one place for online, phone and walk-in bookings.
3. Local by default: language, money, maps, calendar rhythms of Uzbekistan.
4. Respect both sides: clients get calm clarity; barbers get speed and density.
5. Never fake trust: no invented reviews, numbers or badges.

## Accessibility & Inclusion

Large touch targets for one-handed use; readable contrast in bright light and in Telegram dark mode;
older users reading Cyrillic; no meaning carried by color alone.
