# Deploy Stripe Billing to Production (Test Mode)

## Problem Statement

The entire Stripe billing flow (checkout, webhooks, subscription management, billing gate) has been built and tested locally only. It needs to be deployed to production while remaining in **Stripe test mode** (`sk_test_*` / `pk_test_*`). This means real users will see the checkout flow and can subscribe using Stripe's test card numbers, but no real money moves.

## Context Summary

### Current State
- **Backend**: Billing routes mounted at `/api/billing` (checkout, portal, status, webhook)
- **Frontend**: `OnboardingPaymentSuccess`, `OnboardingPaymentCancelled`, `Step3_PlanChooser`, `BillingTab` all implemented
- **Database**: Migration `20260216000000_add_subscription_to_organizations.ts` adds subscription columns — **not yet run in prod**
- **Deployment**: GitHub Actions builds both repos, deploys to EC2 via PM2. `.env` injected from `secrets.ENV_FILE`
- **Stripe keys**: Local `.env` has test keys. GitHub Secret `ENV_FILE` needs to include them
- **Webhook**: Currently using a local CLI-forwarded secret (`whsec_*`). Prod needs a registered endpoint in Stripe Dashboard

### Architecture
```
User → app.getalloro.com (Express serves SPA)
         ├── /api/billing/checkout     → Creates Stripe Checkout Session (test mode)
         ├── /api/billing/webhook      → Receives Stripe webhook events
         ├── /api/billing/portal       → Creates Stripe Customer Portal session
         ├── /api/billing/status       → Returns subscription status
         └── /onboarding/payment-*     → Frontend payment result pages (SPA routes)

Stripe → POST app.getalloro.com/api/billing/webhook (signature-verified)
```

### Key Files
| File | Role |
|------|------|
| `signalsai-backend/src/routes/billing.ts` | Route definitions |
| `signalsai-backend/src/controllers/billing/BillingController.ts` | Request handlers |
| `signalsai-backend/src/controllers/billing/BillingService.ts` | Stripe SDK integration, webhook processing |
| `signalsai-backend/src/config/stripe.ts` | Stripe client init, key/price lookups |
| `signalsai-backend/src/middleware/billingGate.ts` | 402 lockout for inactive subscriptions |
| `signalsai-backend/src/database/migrations/20260216000000_*.ts` | Subscription columns migration |
| `signalsai/src/api/billing.ts` | Frontend billing API client |
| `signalsai/src/components/settings/BillingTab.tsx` | Billing management UI |
| `signalsai/src/components/onboarding/Step3_PlanChooser.tsx` | Onboarding checkout step |
| `signalsai/src/pages/OnboardingPaymentSuccess.tsx` | Post-checkout polling + completion |
| `signalsai/src/pages/OnboardingPaymentCancelled.tsx` | Checkout cancellation page |
| `signalsai-backend/.github/workflows/main.yml` | CI/CD pipeline |

## Existing Patterns to Follow

- `.env` is injected from GitHub Secrets `ENV_FILE` at deploy time
- All routes follow `authenticateToken` + `rbacMiddleware` pattern (billing webhook is the exception — uses Stripe signature verification)
- Webhook raw body parsing is already mounted BEFORE JSON parser in `index.ts:117`
- SPA catch-all route handles `/onboarding/payment-*` frontend routes
- Billing gate middleware exempts `/api/billing` and `/api/onboarding` paths
- PM2 process manager with `ecosystem.config.js`

## Proposed Approach

### Step 1: Run database migration on production

The migration `20260216000000_add_subscription_to_organizations.ts` must be run **before** deploying the new code. The new billing code reads/writes columns that don't exist yet.

**Action**: SSH into EC2 and run the migration manually:
```bash
cd $TARGET_DIR
npx knex migrate:latest
```

Or, since the compiled migration is in `dist/`, run against the prod DB directly. This is a non-destructive schema change (adds columns with defaults).

**Timing**: Before the code deploy, or immediately after if the code gracefully handles missing columns (it doesn't — queries will fail).

### Step 2: Update GitHub Secret `ENV_FILE`

The `ENV_FILE` secret must include the Stripe test keys. Add these lines to the secret value:

```env
# Stripe (Test Mode — safe for production)
STRIPE_SECRET_KEY=<stored in GitHub Secrets>
STRIPE_PUBLISHABLE_KEY=<stored in GitHub Secrets>
STRIPE_DFY_PRICE_ID=<stored in GitHub Secrets>
STRIPE_WEBHOOK_SECRET=<will be generated in Step 3>
```

**The webhook secret is NOT the local CLI secret.** Step 3 generates the correct one.

### Step 3: Register webhook endpoint in Stripe Dashboard

In the [Stripe Dashboard](https://dashboard.stripe.com/test/webhooks):

1. Click **Add endpoint**
2. URL: `https://app.getalloro.com/api/billing/webhook`
3. Select events:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
4. Copy the **Signing secret** (`whsec_...`)
5. Update `STRIPE_WEBHOOK_SECRET` in GitHub Secret `ENV_FILE` with this value

**Critical**: The local CLI webhook secret is NOT the same as the Dashboard webhook secret. They are separate. The prod `.env` must use the Dashboard-generated secret.

### Step 4: Commit and push all pending changes

Both the `signalsai` and `signalsai-backend` repos need their latest changes pushed to `main`:

**Frontend (`signalsai`) — new files and changes:**
- `src/api/billing.ts` (new)
- `src/components/settings/BillingTab.tsx` (new)
- `src/components/onboarding/Step3_PlanChooser.tsx` (new)
- `src/pages/OnboardingPaymentSuccess.tsx` (new)
- `src/pages/OnboardingPaymentCancelled.tsx` (new)
- `src/App.tsx` (modified — new routes)
- `src/components/onboarding/OnboardingContainer.tsx` (modified)
- `src/hooks/useOnboarding.ts` (modified)
- `src/contexts/OnboardingWizardContext.tsx` (modified)
- `src/contexts/AuthContext.tsx` (modified)
- `src/pages/Settings.tsx` (modified)
- And other pending changes

**Backend (`signalsai-backend`) — billing infrastructure:**
- `src/routes/billing.ts`
- `src/controllers/billing/BillingController.ts`
- `src/controllers/billing/BillingService.ts`
- `src/config/stripe.ts`
- `src/middleware/billingGate.ts`
- `src/database/migrations/20260216000000_add_subscription_to_organizations.ts`
- `src/index.ts` (billing route mounting, raw body parsing, billing gate)

Both repos must be on `main` since CI/CD triggers on push to `main` for backend and clones `main` of frontend.

### Step 5: Deploy via GitHub Actions

Push to `main` on the backend repo triggers the CI/CD pipeline:
1. Builds backend
2. Clones and builds frontend (from `signalsai` repo `main` branch)
3. Bundles everything with `.env`
4. Deploys to EC2 via SCP
5. PM2 reload

### Step 6: Run migration on EC2 (if not done in Step 1)

After deployment, SSH in and run:
```bash
cd $TARGET_DIR
npx knex migrate:latest
```

Then restart PM2:
```bash
pm2 reload ecosystem.config.js
```

### Step 7: Verify end-to-end

Using Stripe test card `4242 4242 4242 4242`:

1. **Onboarding checkout**: Complete onboarding → Step 4 → Subscribe → Stripe Checkout → test card → redirect to `/onboarding/payment-success` → polls → dashboard
2. **Webhook delivery**: Check Stripe Dashboard → Webhooks → verify events are delivered and getting 200 responses
3. **Billing status**: After subscribing, `/api/billing/status` should return `hasStripeSubscription: true`
4. **Customer portal**: Settings → Billing → "Manage Subscription" → opens Stripe portal
5. **Admin grant**: Test admin-granted access (no Stripe, subscription_status = active)
6. **Billing lockout**: Test that setting `subscription_status = inactive` shows the lockout banner

## Risk Analysis

| Risk | Level | Impact | Mitigation |
|------|-------|--------|------------|
| Migration fails on prod DB | Level 2 | Billing queries crash with missing columns | Run migration first, verify columns exist before deploying code |
| Wrong webhook secret in prod | Level 3 | All webhooks fail signature verification → subscriptions never activate | Use Dashboard-generated secret, not the local CLI one. Verify with test event |
| Frontend not built with latest changes | Level 2 | Payment routes 404, BillingTab missing | Ensure frontend repo `main` has all changes pushed before backend deploy triggers |
| Price ID doesn't exist in test account | Level 2 | Checkout session creation fails | Verify DFY price ID exists in Stripe test products |
| Billing gate locks out existing users | Level 2 | Users with no subscription see 402 on every API call | Default `subscription_status` is `active` in migration, existing orgs keep `active` |
| Test mode visible to real users | Level 1 | Users could attempt test checkout and be confused | Stripe test mode shows "test" banner on checkout page. Acceptable for now |

## Security Considerations

- **Test keys in production**: Acceptable. Test keys can only process test transactions. No real money can be charged. This is standard Stripe practice for staging environments.
- **Webhook secret rotation**: When switching to live mode later, a new webhook endpoint with new secret must be created. The test endpoint should be deactivated.
- **Stripe customer data**: Test mode data is isolated from live mode in Stripe. No crossover risk.

## Definition of Done

- [ ] Migration `20260216000000` has been run on prod DB — subscription columns exist
- [ ] GitHub Secret `ENV_FILE` includes all Stripe test keys + Dashboard webhook secret
- [ ] Webhook endpoint registered in Stripe Dashboard for `app.getalloro.com/api/billing/webhook`
- [ ] Both frontend and backend repos have all billing changes on `main`
- [ ] CI/CD pipeline runs successfully (build + deploy)
- [ ] Test checkout with `4242 4242 4242 4242` completes end-to-end (onboarding path)
- [ ] Webhook events show 200 responses in Stripe Dashboard
- [ ] Billing status API returns correct subscription state
- [ ] Customer portal accessible from Settings → Billing
- [ ] Existing users are NOT locked out (subscription_status defaults to active)

## Rollback Plan

If billing causes issues in prod:

1. **Quick fix**: Comment out `app.use(billingGateMiddleware)` in `index.ts` if lockout is the issue
2. **Disable billing routes**: Comment out `app.use("/api/billing", billingRoutes)` — removes all Stripe endpoints. Frontend billing tab will show errors but app remains functional
3. **Full rollback**: Revert to previous commit on `main`, push triggers redeploy. Migration columns are additive and won't affect existing queries

## Pre-Deploy Checklist (Manual Steps)

This is what you need to do in order, outside the codebase:

1. **Stripe Dashboard**: Register webhook endpoint → get signing secret
2. **GitHub Settings**: Update `ENV_FILE` secret with Stripe keys + webhook secret
3. **Frontend repo**: Push all changes to `main`
4. **Backend repo**: Push all changes to `main` (triggers deploy)
5. **EC2**: SSH in, run `npx knex migrate:latest`, restart PM2
6. **Stripe Dashboard**: Send test webhook event to verify endpoint
7. **Browser**: Walk through onboarding with test card `4242 4242 4242 4242`
