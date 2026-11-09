Modeled on Stripe API version 2026-10-28.endive (the newest at time of writing).
These fixtures are synthetic, built from the API reference. Task 14 checks them against real test-mode events.

Findings for the current API version:
- Invoice has no `subscription` field. The subscription ID is `invoice.parent.subscription_details.subscription`, and `invoice.parent.type` is `subscription_details` (since 2025-03-31.basil).
- Invoice has no `payment_intent` or `charge` field. The PaymentIntent comes from `GET /v1/invoice_payments?invoice=<id>` (`payment.type = payment_intent`, `payment.payment_intent`). The `payments` list on the invoice is only present when expanded, so these fixtures set it to null.
- `charge.refunded`: the Charge carries `payment_intent` directly. If null, retrieve the Charge.
- Checkout Session keeps `payment_intent` (mode=payment) and `subscription` (mode=subscription) as top-level IDs.
