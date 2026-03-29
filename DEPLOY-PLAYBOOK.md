# Dave Deployment Playbook

One-sitting checklist. Every step has a verification command.
Do them in order. Skip nothing.

## Pre-flight (5 minutes)

```bash
# SSH into EC2
ssh -i your-key.pem ec2-user@sandbox.getalloro.com

# Pull latest code and rebuild (REQUIRED -- nanoid ESM fix from March 29)
cd /home/ec2-user/alloro
git checkout sandbox && git pull origin sandbox
npm ci
cd frontend && npm ci && npm run build && cd ..
npm run build
rm -rf public && mkdir -p public && cp -r frontend/dist/* public/

# Verify Node, PM2, Redis are running
node --version    # Needs 20.19+ or 22+
pm2 --version     # Should be installed
redis-cli ping    # Must return PONG
```

If Redis is not installed:
```bash
sudo yum install redis -y   # Amazon Linux
sudo systemctl start redis
sudo systemctl enable redis
```

## Step 1: Environment Variables (3 minutes)

Add these to `/home/ec2-user/alloro/.env` (or wherever the app runs):

```bash
# Required for agents to work
ANTHROPIC_API_KEY=sk-ant-...          # Claude API key for agent intelligence
GOOGLE_PLACES_API_KEY=AIza...         # For competitive scans and checkup

# Required for email delivery
ALLORO_EMAIL_SERVICE_WEBHOOK=https://... # n8n webhook URL for Mailgun

# Required for Sentry error tracking
VITE_SENTRY_DSN=https://...@sentry.io/...

# Required for billing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Redis (usually defaults are fine)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# JWT (must match what's in current .env)
JWT_SECRET=<existing-value>
```

Verify:
```bash
source .env
echo $ANTHROPIC_API_KEY | head -c 10   # Should show sk-ant-...
echo $REDIS_HOST                        # Should show 127.0.0.1
```

## Step 2: Run Migrations (2 minutes)

```bash
cd /home/ec2-user/alloro
npx knex migrate:latest
```

Expected output: a list of migration files being applied.
If it says "Already up to date", that's fine too.

Verify:
```bash
npx knex migrate:status | tail -5
# All migrations should show as "run"
```

## Step 3: Seed Demo Account (1 minute)

```bash
npx tsx src/scripts/seedDemoAccount.ts
```

Expected output:
```
[SeedDemo] Done!
  Email: demo@getalloro.com
  Password: demo2026
  Org ID: <number>
  Practice: Valley Endodontics, Salt Lake City UT
```

Verify:
```bash
curl -s http://localhost:3000/api/demo/login | jq .success
# Should return: true
```

## Step 4: Restart PM2 (1 minute)

```bash
pm2 reload ecosystem.config.js
pm2 status
```

Expected: two processes running:
- `signals-backend` (status: online)
- `minds-worker` (status: online)

If minds-worker crashes immediately, check Redis:
```bash
redis-cli ping
pm2 logs minds-worker --lines 20
```

## Step 5: Verify Everything (3 minutes)

```bash
# Health check
curl -s http://localhost:3000/api/health | jq .

# Demo login
curl -s http://localhost:3000/api/demo/login | jq .success

# One Action Card (needs demo token)
TOKEN=$(curl -s http://localhost:3000/api/demo/login | jq -r .token)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/user/one-action-card | jq .

# Streaks
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/user/streaks | jq .
```

All should return `{ "success": true, ... }`.

## Step 6: GitHub Actions Workflow (2 minutes)

Push the e2e.yml workflow file (requires workflow-scoped PAT):

```bash
git checkout sandbox
git add .github/workflows/e2e.yml
git commit -m "chore: add E2E workflow"
git push origin sandbox
```

This requires a PAT with the `workflow` scope. The current token
used by CC does not have this scope.

## Post-Deploy Checklist

- [ ] sandbox.getalloro.com loads the homepage
- [ ] /checkup flow works end to end
- [ ] /demo auto-logs in and shows the dashboard
- [ ] Dashboard shows One Action Card with real intelligence
- [ ] Dashboard shows 8-week growth streak badge
- [ ] Admin HQ at /admin shows Morning Brief with scene-setter
- [ ] Revenue and Live Feed pages render (not blank)
- [ ] PM2 shows both processes online after 5 minutes

## If Something Breaks

```bash
# Check logs
pm2 logs signals-backend --lines 50
pm2 logs minds-worker --lines 50

# Check database connection
npx knex raw "SELECT 1"

# Check Redis
redis-cli ping

# Restart everything
pm2 restart all
```
