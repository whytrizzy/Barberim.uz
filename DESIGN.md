---
version: alpha
name: Sartaroshxona
description: >-
  Barberim's design system: the neighborhood barbershop of every Uzbek mahalla — mint tiled walls,
  chrome, and the shop's name on a red enamel sign. Light theme shown here; dark tokens below.
colors:
  tile: '#d9e8e1'
  porcelain: '#fbfdfc'
  porcelain-sunk: '#eef3f1'
  chrome: '#a9b7b2'
  ink: '#0f332b'
  ink-muted: '#4b6a62'
  ink-faint: '#7f948d'
  enamel: '#ae1730'
  enamel-strong: '#921327'
  enamel-text: '#ae1730'
  on-enamel: '#ffffff'
  pick: '#0f332b'
  on-pick: '#fbfdfc'
  success: '#1f7a4d'
  warning: '#9a6a00'
typography:
  sign-display:
    fontFamily: Fira Sans Extra Condensed
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0.02em
  sign-heading:
    fontFamily: Fira Sans Extra Condensed
    fontSize: 34px
    fontWeight: 700
    lineHeight: 1
  section-label:
    fontFamily: Fira Sans Extra Condensed
    fontSize: 13px
    fontWeight: 700
    letterSpacing: 0.08em
  body:
    fontFamily: Onest
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.45
  body-strong:
    fontFamily: Onest
    fontSize: 15px
    fontWeight: 600
  caption:
    fontFamily: Onest
    fontSize: 12px
    fontWeight: 400
  time:
    fontFamily: Onest
    fontSize: 16px
    fontWeight: 600
    fontFeature: '"tnum"'
rounded:
  tile: 8px
  sign: 6px
  inner: 5px
spacing:
  grout: 1px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  section: 20px
components:
  enamel-sign:
    backgroundColor: '{colors.enamel}'
    textColor: '{colors.on-enamel}'
    rounded: '{rounded.sign}'
  button-primary:
    backgroundColor: '{colors.enamel}'
    textColor: '{colors.on-enamel}'
    rounded: '{rounded.tile}'
  button-secondary:
    backgroundColor: '{colors.porcelain}'
    textColor: '{colors.ink}'
    rounded: '{rounded.tile}'
  tile:
    backgroundColor: '{colors.porcelain}'
    textColor: '{colors.ink}'
  tile-selected-time:
    backgroundColor: '{colors.enamel}'
    textColor: '{colors.on-enamel}'
  tile-selected:
    backgroundColor: '{colors.pick}'
    textColor: '{colors.on-pick}'
  tile-unavailable:
    backgroundColor: '{colors.porcelain-sunk}'
    textColor: '{colors.ink-faint}'
---

# Sartaroshxona — Barberim design system

Code lives in `src/app/globals.css` (tokens) and `src/ui/` (components). Live preview in
development: `http://localhost:3000/design`. Chosen direction and its contract:
`docs/design/DIRECTION.md`; the rejected alternatives: `docs/design/directions.html`.

## Overview

Barberim should feel like walking into a good neighborhood barbershop (sartaroshxona): tiled walls,
clean porcelain, chrome fittings and the shop's name on a red enamel sign over the door. It's a
working app first (Operate mode). The world only supplies color, type, density and one signature
move, the **enamel sign plus joined tiles**. Layout, navigation and controls stay as familiar as any
good booking app.

It deliberately avoids both barber-app clichés (black-and-gold "luxury", barber poles, mustache
icons) and the generic white-card SaaS look.

## Colors

- **Tile (#d9e8e1):** the wall. Page ground, always with faint white grout lines (24px grid).
- **Porcelain (#fbfdfc) / sunk (#eef3f1):** tile surfaces. Every row and choice sits on porcelain.
  Sunk means taken, free gap or inactive.
- **Chrome (#a9b7b2):** the 1px grout between joined tiles and every border. No other border colors.
- **Ink (#0f332b) / muted (#4b6a62) / faint (#7f948d):** bottle-green text. Faint is only for
  unavailable items (with strikethrough), never for content people need to read.
- **Enamel (#ae1730):** the one accent. Used for the sign, the primary action (Telegram MainButton),
  the selected **time** and the client in the chair now. Never decoration.
- **Enamel text (#ae1730 light / #f27a88 dark):** red used as text (ghost buttons, inline actions,
  errors). Dark mode needs the lighter red to stay readable (5:1 or more on every dark surface).
- **Pick (#0f332b light / #2f6b5c dark):** selection on the way to booking (master, day).
- **Errors:** use enamel text plus an icon and a sentence that says what to do. Color is never the
  only signal, because enamel is also the primary color.

**Dark theme** (Telegram dark mode, also the OS fallback): a dark green-tiled room. tile `#0f2621`,
porcelain `#16332c`, sunk `#122b25`, chrome `#2b4b43`, ink `#e6f2ed`, muted `#9bb8af`, faint
`#6a8a81`, enamel `#c8243d`, enamel text `#f27a88`, pick `#2f6b5c`, grout lines at 3.5% white.

## Typography

- **Fira Sans Extra Condensed 700, uppercase:** sign lettering. For shop names on the sign, big
  screen titles ("BUGUN") and small section labels. Never for running text.
- **Onest:** everything else. Times, prices and counts always use tabular numbers.
- Both faces are self-hosted via `next/font` with Latin, Latin Extended and Cyrillic subsets. They
  render the Uzbek `oʻ gʻ` (U+02BB) and full Cyrillic, which covers all three locales.

## Layout

- Phone-first, a single column, a 16px side gutter, max 390px of content on wider screens.
- **Joined tile groups:** related choices sit in one group with 1px chrome grout (`gap-px` on a
  chrome background, one outer border, 8px radius). Masters, days and times each form one group.
  Lists (bookings, services) are vertical joined groups.
- A section label sits 20px above its group and 8px under it.
- The primary action is Telegram's MainButton in enamel. Inside the page, at most one primary button
  per screen.

## Elevation & Depth

Flat by default: tiles are flush on the wall. Only the enamel sign carries depth (a soft drop shadow
plus a 1px top highlight and an inner white keyline, like pressed steel). Cards, glass and blur are
not used.

## Shapes

8px radius for tile groups and buttons, 6px for the sign, 5px for small inner tiles (the current
time). Circles only for avatars and photos.

## Components

- `EnamelSign`: the shop's name. One per shop page, at the top.
- `TileGroup` + `Tile`: single choice (radio group). `tone="enamel"` for the final choice (time),
  `tone="pick"` for choices on the way. `unavailable` = taken (sunk, faint, struck through).
- `TileList` + `TileRow`: lead (time) · title + detail · trail (price/action). States: `current`
  (lead on an enamel tile), `free` (sunk), `break` (diagonal stripes).
- `Button`: `primary` (enamel), `secondary` (porcelain + chrome border), `ghost` (enamel text);
  `loading` shows a spinner and blocks double taps.
- `SectionLabel`: condensed caps label above a group.

## Motion

Quick and quiet. Presses scale to 0.97 (buttons) or darken (tiles) in 150ms with a strong ease-out
`cubic-bezier(0.23, 1, 0.32, 1)`. UI motion stays under 300ms. Content never waits for an animation.
`prefers-reduced-motion` turns animation off. Cheap Android phones come first: no scroll-driven
effects, no blur.

## Do's and Don'ts

- Do group related choices into one joined tile group; don't scatter separate rounded cards.
- Do keep enamel for the sign, the primary action, the chosen time and "now"; don't use it for
  decoration, icons or headings.
- Do write in the product's language (Uzbek Latin by default, plus Cyrillic and Russian); don't
  hard-code strings outside `src/i18n` (the dev preview is the only exception).
- Don't add eyebrow labels above headings, gradient text, glass, colored left borders, emoji as
  icons, or invented ratings or customer numbers.
- Icons come from lucide only, at one stroke weight.
