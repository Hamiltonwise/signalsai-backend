# Alloro Onboarding Guide

> Two audiences: customers getting started, and team members joining the project.

---

## For Customers

### Your First 60 Seconds

You just ran your Google Health Check. Here's what you saw:

1. **Your readings** -- star rating, review count, profile completeness, your market. Each with a link to verify on Google.
2. **Your top competitor** -- named, with their numbers next to yours.
3. **Findings** -- what's strong, what needs attention, backed by research.

You created an account. Your website is being built. Your readings are live.

### Your First 24 Hours

| When | What Happens | Where to See It |
|------|-------------|----------------|
| Immediately | Readings appear on your Home page | /home |
| Within 5 minutes | Competitive snapshot taken | Home page action card updates |
| Within 4 hours | Welcome intelligence email arrives in your inbox | Check email |
| Within 24 hours | Google reviews sync to your Reviews page | /reviews |
| Within 24 hours | Your website goes live | /presence, click "View site" |

### Your First Week

| Day | What Happens |
|-----|-------------|
| Day 1 | Readings, website, welcome email (above) |
| Day 2-6 | Reviews continue syncing. Your competitive landscape is being monitored. |
| Monday | Your first Monday email arrives at 7 AM your local time. One finding. One action. Plain English. |

### What to Do

**Connect Google (if you haven't):**
Settings > Integrations > Connect Google. This unlocks:
- Weekly competitive tracking
- Review syncing with AI-drafted responses
- One-tap review response posting

**Upload business data (if you have it):**
Compare > Referral Sources > Upload business data. This unlocks:
- Referral source tracking (who sends you business)
- Which sources are active, declining, or new
- Deeper competitive comparison

**Ask the advisor anything:**
Tap the terracotta chat bubble on any page. The advisor knows your readings, your competitor, and your market. Ask "What should I focus on this week?" and get a specific, data-backed answer.

### The Five Pages

| Page | What It Answers | When to Check |
|------|----------------|--------------|
| **Home** | Am I okay? | When you want a quick status check |
| **Compare** | How do I compare? | When you want to see the competitive gap |
| **Reviews** | What are people saying? | When you want to read and respond to reviews |
| **Presence** | What does my online presence look like? | When you want to see your website and GBP completeness |
| **Progress** | Am I getting better? | When you want to see how your readings have changed over time |

### How to Verify Any Number

Every number on your dashboard links to Google. Click the link. You'll see the same number. If it doesn't match, it means the data hasn't refreshed yet (refreshes weekly on Sundays). Tap the chat bubble and let us know -- we'll trigger a manual refresh.

### How to Get Help

- **Tap the chat bubble** on any page. The advisor answers in your context.
- **Tap the "?" icon** on any reading card to see why that reading matters (with research backing).
- **Email** corey@getalloro.com for anything the advisor can't answer.

---

## For Team Members

### Read These First (In Order)

1. **`docs/PRODUCT-OPERATIONS.md`** -- What the product does and why. The constitution. 15 Knowns with tests. Read before touching any code.
2. **`docs/TECHNICAL-ARCHITECTURE.md`** -- How the code implements it. Infrastructure, workers, services, customer journey, troubleshooting.
3. **`docs/RUNBOOK.md`** -- When something breaks. Step-by-step with escalation chain.
4. **`CLAUDE.md`** -- How Claude Code sessions work. Session start protocol, commit rules, standing rules.
5. **`frontend/.claude/rules/design-system.md`** -- Visual design tokens and patterns. Read before any UI work.

### The Team

| Person | Role | What They Own | How to Reach |
|--------|------|-------------|-------------|
| Corey | Founder/Visionary | Product decisions, customer relationships, red blast radius approvals | Direct |
| Jo | COO/Integrator | Operations, status boards, changelog (maternity leave until Oct 9) | Slack, needs status boards not paragraphs |
| Dave | CTO | Infrastructure (EC2, Redis, DNS, env vars, deploys), merges to main | Notion task page, async. Philippines UTC+8. Receives finished specs only. |
| Claude Code | Builder | Code changes, debugging, documentation, testing | New session |

### How Work Gets Done

1. Check the Build Queue on Notion for active work orders
2. Read the constitution before building anything
3. Write a Customer Reality Check before touching code
4. One feature = one commit = one verifiable step
5. TypeScript must compile clean before committing
6. Describe what the customer sees on each affected page before committing
7. Never push to main directly. Dave merges.

### Blast Radius

| Level | Examples | Action |
|-------|---------|--------|
| Green | New component, CSS change, help article | Build it |
| Yellow | DB migration, new API route, nav change | Notify, then build |
| Red | Billing, auth, pricing, client copy, data deletion | Stop. Corey approves. |

### Key URLs

| What | Where |
|------|-------|
| Sandbox | sandbox.getalloro.com |
| Production | app.getalloro.com / getalloro.com |
| Admin | sandbox.getalloro.com/admin (or app.getalloro.com/admin) |
| Build Queue | Notion (see CLAUDE.md for link) |
| Build State | Notion (see CLAUDE.md for link) |
| Repository | github.com/Hamiltonwise/alloro |

### Common First Tasks

**"I need to see what a customer sees":**
Log into sandbox.getalloro.com/admin > Organizations > click an org > "View as User" (Pilot Mode)

**"I need to understand the data flow":**
Read TECHNICAL-ARCHITECTURE.md, specifically the Customer Journey section (14 steps from signup to weekly engagement).

**"I need to fix a bug":**
Read the Runbook first. If the issue is listed, follow the steps. If not, start a Claude Code session with the error message and affected org ID.

**"I need to add a feature":**
Read the constitution. Does it pass the Three Questions filter? Is the blast radius Green? Write a Work Order (format in `.claude/rules/build-safety.md`). Build it.

---

*Alloro exists to give every business owner the life they set out to build. Every document, every line of code, every decision serves that mission.*
