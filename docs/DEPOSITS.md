# Online deposits (P3.1)

A shop can ask some clients to pay a deposit online before a booking counts. The money goes to
the **shop's own** Payme / Click / Uzum merchant account; Barberim never holds it. The code is in
`src/domain/deposits.ts` (rules), `src/server/services/deposits.ts` (hold, pay, expire, refund,
settings), `src/server/deposits/` (per-shop provider handlers, key encryption) and
`src/server/payments/` (the Payme and Click protocols, shared with subscription billing).

## Who pays a deposit

The owner sets it up at `/staff/shop/:id/deposits` (the "Depozit" tile, owners only):

- **Amount** in so'm (0 = deposits off).
- **Masters** who always need a deposit (popular masters).
- **After a no-show** (on by default): a client whose last no-show at this shop came after their
  last paid deposit must pay one on their next booking. Once they pay, the following booking is
  pay-after-haircut again, until the next no-show.
- At least one connected provider. Without one, nobody is asked for a deposit.

## What happens

1. The booking is created as **PENDING** with a deposit **AWAITING** payment. No messages go out
   yet. The time is held for **30 minutes** (`DEPOSIT_HOLD_MINUTES`).
2. The client pays from the booking screen: Payme or Click checkout opens outside Telegram; for
   Uzum, the screen shows a 6-digit code the client types in the Uzum Bank app.
3. On payment the booking is confirmed (or waits for the shop when the shop approves bookings by
   hand), and the usual booking messages and reminders are queued.
4. If nobody pays in time, the cron (`/api/cron/dispatch`, every 5 minutes) cancels the booking,
   frees the time, tells the client and alerts the waitlist. A payment already in progress at the
   provider gets 15 more minutes.
5. Staff can confirm a booking without the deposit (the deposit is waived).

## Refunds

| What happened                                                          | Deposit           |
| ---------------------------------------------------------------------- | ----------------- |
| The shop cancels                                                       | Refunded          |
| The client cancels 24 h or more before (`DEPOSIT_REFUND_NOTICE_HOURS`) | Refunded          |
| The client cancels later, or doesn't come                              | The shop keeps it |
| A kept deposit, then the visit is marked done                          | Counts as paid    |

- **Payme:** a refund is a cancel of the performed transaction, which the merchant starts in the
  Payme Business cabinet; Payme then calls our endpoint and the deposit becomes REFUNDED.
- **Uzum:** when Uzum reverses a confirmed payment (`/reverse`), the deposit becomes REFUNDED.
- **Click:** refunds are made by the shop in Click's cabinet, then the owner taps "Mark as
  refunded" on the booking.
- Until then the booking shows "refund due", and the owner gets a bot message.

## Setup on Render (once)

`DEPOSIT_KEYS_SECRET` — a random string of 32+ characters. Shops' provider keys are stored
encrypted with it (AES-256-GCM). Without it, owners can't connect a provider. **Never change it**
once shops have connected: their saved keys could no longer be read, and every shop would have
to enter them again. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## What a shop enters (in its own merchant cabinet)

The settings screen shows each address after the provider is saved.

### Payme (https://business.payme.uz)

- **Endpoint URL:** `https://barberim-uz.onrender.com/api/deposits/payme/<shopId>`
- **Account field:** `order_id`
- In Barberim: the cashbox **ID** and **key** (tick "test mode" with the test key while running
  Payme's sandbox at https://test.paycom.uz).

### Click (https://merchant.click.uz)

- **Prepare URL:** `https://barberim-uz.onrender.com/api/deposits/click/<shopId>/prepare`
- **Complete URL:** `https://barberim-uz.onrender.com/api/deposits/click/<shopId>/complete`
- In Barberim: **service_id**, **merchant_id** and the **secret key**.

### Uzum Bank (https://developer.uzumbank.uz/merchant)

- **Base URL:** `https://barberim-uz.onrender.com/api/deposits/uzum/<shopId>` — Uzum calls
  `/check`, `/create`, `/confirm`, `/reverse` and `/status` under it.
- **Payment field** of the service: `account` (the client's 6-digit code).
- In Barberim: **serviceId**, and the **login** and **password** Uzum uses for Basic auth.
- A transaction Uzum created but didn't confirm within 30 minutes counts as failed; errors are
  HTTP 400 with Uzum's `errorCode`.
