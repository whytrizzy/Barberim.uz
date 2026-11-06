# Subscription billing (P2.11)

Owners pay for PRO a month (30 days) at a time through **Payme** or **Click**. The code is in
`src/server/billing/` (the two providers' protocols) and `src/server/services/billing.ts`
(checkout, settling a payment, the plan page). Payment history is the `payments` table.

## How it switches on

| Setting (Render → Environment)     | Effect                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `BILLING_ENFORCED` empty / `false` | Every shop is PRO (today). Payments still add paid time.                |
| `BILLING_ENFORCED=true`            | A shop is PRO only while `plan_until` is in the future; otherwise FREE. |
| `PRO_PRICE_UZS`                    | Price for 30 days, in so'm. Default 99 000 (placeholder).               |

A provider's button appears on the plan page only once its keys are set. Change keys and price,
then redeploy; nothing else needs to change.

## Payme (Payme Business, https://business.payme.uz)

1. Create a cashbox (kassa). In its settings:
   - **Endpoint URL:** `https://barberim-uz.onrender.com/api/billing/payme`
   - **Account field:** `order_id` (type: string)
2. Copy the cashbox **ID** and the **test key** into Render:
   `PAYME_MERCHANT_ID`, `PAYME_KEY`, and `PAYME_TEST=true`.
3. Run Payme's sandbox checks at https://test.paycom.uz against the endpoint. They call every
   method (CheckPerformTransaction, CreateTransaction, PerformTransaction, CancelTransaction,
   CheckTransaction, GetStatement) with right and wrong data.
4. When it passes and Payme approves the cashbox: put the **live key** in `PAYME_KEY` and remove
   `PAYME_TEST`.

## Click (Click Merchant, https://merchant.click.uz)

1. Register a service. Set:
   - **Prepare URL:** `https://barberim-uz.onrender.com/api/billing/click/prepare`
   - **Complete URL:** `https://barberim-uz.onrender.com/api/billing/click/complete`
2. Copy **service_id**, **merchant_id** and the **secret key** into Render:
   `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY`.
3. Use Click's test tools on that service to send prepare/complete requests.

## What happens on a payment

1. The owner taps "Pay with Payme/Click" on `/staff/shop/:id/plan`: a `PENDING` payment is
   created and the provider's checkout opens outside Telegram.
2. The provider confirms: the payment becomes `PAID`, `plan_until` moves 30 days on from the later
   of now or the time already paid, and the bot messages the owner a receipt.
3. A Payme transaction left open for 12 hours is cancelled (Payme's rule). A paid month is never
   taken back by a provider cancellation (Payme answers -31007).

Secrets never go in git or chat: only in Render's environment settings.
