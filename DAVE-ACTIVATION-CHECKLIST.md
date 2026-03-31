# Dave: Sandbox Activation Checklist

One-time setup. Run these in order. Total time: ~15 minutes.

## 1. Stripe (5 min)

Verify these 3 env vars are set in the sandbox .env file:

```
STRIPE_SECRET_KEY=sk_test_...        # From Stripe dashboard > Developers > API keys
STRIPE_WEBHOOK_SECRET=whsec_...      # From step below
STRIPE_HEALTH_PRICE_ID=price_...     # Create product "Alloro Intelligence" at $997/month, copy price ID
```

Register webhook endpoint in Stripe dashboard:
- URL: `https://sandbox.getalloro.com/api/billing/webhook`
- Events to listen for:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET`

Test: `curl -s https://sandbox.getalloro.com/api/billing/status -H "Authorization: Bearer <any-valid-jwt>"` should return JSON (even if no subscription).

## 2. Monday Email Cron (3 min)

The Monday email system is fully built (`src/jobs/mondayEmail.ts`). It needs the BullMQ scheduler to fire it.

Check if the cron is registered:
```bash
# SSH into sandbox
redis-cli KEYS "{minds}:*:delayed" | head
```

If no Monday email job exists, trigger it manually to verify:
```bash
curl -s -X POST https://sandbox.getalloro.com/api/admin/monday-email/run-all \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json"
```

The scheduler in `src/workers/processors/scheduler.processor.ts` should register the Monday 7am cron automatically on worker start. Verify the worker process is running:
```bash
pm2 list  # Should show "minds-worker" as online
```

## 3. Verify End-to-End (5 min)

Run through this exact path:

1. Open `sandbox.getalloro.com/checkup`
2. Search "McPherson Endodontics"
3. Click the result, click "Run My Checkup"
4. Verify score appears (should be ~67)
5. Enter a test email + password in the signup form
6. Verify account creates and redirects to dashboard
7. Go to Settings > Billing
8. Click Subscribe (should redirect to Stripe checkout)
9. Use test card `4242 4242 4242 4242`, any expiry, any CVC
10. Verify redirect back to dashboard with active subscription

If step 7-10 fail, the Stripe env vars from step 1 are wrong.

## 4. Confirm Health

```bash
curl -s https://sandbox.getalloro.com/api/health/detailed | python3 -m json.tool
```

All checks should show `"status": "ok"`:
- database
- redis
- places_api
- bullmq

## Done

After this checklist, the full journey works:
- Checkup (free, no account)
- Signup (from checkup results)
- Dashboard (pre-populated from checkup data)
- Billing (Stripe checkout)
- Monday email (automated weekly)

Nothing else is needed before beta testers can use the product.
