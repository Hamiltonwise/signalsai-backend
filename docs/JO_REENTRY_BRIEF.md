# Jo's Re-Entry Brief

What happened while you were on leave. Everything you need to get back up to speed on Day 1.

## Architecture Changes

- **50 agents now running.** The Dream Team went from a handful of scheduled jobs to a full agent fleet. Each has a dedicated file in `src/services/agents/`, a circuit breaker for fault isolation, and a personal brief system that gives each team member (you, Corey, Dave) a tailored daily summary.
- **Flight Manual** (`docs/AGENT_FLIGHT_MANUAL.md`). The operating guide for every agent: what it does, when it runs, what it writes to behavioral_events. This is your reference when something fires unexpectedly.
- **Wind Tunnel testing.** Before agents ship, they run through simulated scenarios. Corey can invoke any agent from HQ using the Agent Runner panel.
- **Mission Control** (`/hq` > BuildView). Dave's real-time grid showing every agent's status, last run time, error rate, and cost. If an agent is red, it needs attention.
- **Kill Switch.** New as of this build. One-click emergency stop that halts all agent execution. Red button visible in every admin view (VisionaryView, IntegratorView, BuildView). If something goes sideways, hit it first, investigate second.
- **Circuit Breaker.** Each agent has an automatic circuit breaker: 3 consecutive failures opens the circuit, 5-minute cooldown, then one retry. If the retry fails, it stays open until manually reset.

## Key Decisions Made

- **First Impression scoring, not competitive rank.** The Checkup no longer ranks a business against competitors. It scores their "First Impression" on a 0-100 scale. This removes the adversarial framing and focuses on what the business can control.
- **Trust-first findings.** Every insight shown to a client is framed through the lens of "what can you do about this" rather than "here's what's wrong." The tone is a trusted advisor, not an auditor.
- **Chain of Intent.** Every piece of data has a documented path from source to insight to action. If a finding says "you're losing $X/month," the chain traces exactly how that number was calculated.
- **Billing activates after TTFV (Time to First Value), not at Step 4.** Clients are not asked for payment until they've experienced a real insight. This is a standing rule.
- **Universal language in core, vertical-specific in configs.** The codebase says "customer" and "business" everywhere. Vertical-specific terms (patient, client, case) live in `vocabulary_configs` per org.

## New Dashboards

- **IntegratorView** (your view at `/hq`). Upgraded with:
  - Weekly Pulse: are we growing week over week?
  - Client Health Grid: GREEN/AMBER/RED status for every client
  - Agent Pipeline Status: which agents ran, which are stuck
  - Blocker Panel: overdue tasks, open circuits, email delivery issues
  - Trial Pipeline: who's in trial, when do they convert or churn
  - Dream Team Activity: recent agent outputs and task completions
- **VisionaryView** (Corey's view). Now has Morning Briefing stats, revenue panel, Route to Unicorn roadmap, portfolio score, and Mission Control.
- **BuildView** (Dave's view). Terminal-styled with system status, agent health grid, cost dashboard, email delivery health, recent errors, and deploy status.

## What Needs You

- **Trial pipeline monitoring.** Every trial client needs human attention at day 3 and day 5. The system sends automated emails, but you should check who's engaged and who's going silent. IntegratorView > Trial Pipeline shows this.
- **Client health triage.** The Client Health Grid flags AMBER and RED clients. AMBER means declining engagement or score. RED means churn risk. Check this daily. If a client is RED, a dream_team_task should already exist for intervention.
- **Task queue management.** `dream_team_tasks` is the shared work queue. Tasks are created by agents, Corey, and the system. You own the operational ones (client follow-up, onboarding help, pipeline nudges). Corey owns the strategic ones. Dave owns infrastructure.
- **Email health.** Monday emails go to every active client. If delivery fails, the system creates an in-app fallback notification, but you should check the Email Health panel in IntegratorView for bounces and delivery rates.
- **Blue Tape flags.** The Blue Tape button in IntegratorView lets you flag anything that feels off. Use it liberally. These flags go into the morning briefing.

## What Does NOT Need You

- **Agent scheduling.** Fully automated via BullMQ cron. Agents run on their schedules without manual intervention.
- **Content pipeline.** The CMO, Content Performance, and Programmatic SEO agents handle content strategy, creation, and measurement autonomously.
- **Competitive monitoring.** The Competitive Scout, Intelligence Agent, and Market Signal Scout run weekly scans. Findings flow into Monday emails automatically.
- **Email sending.** Monday emails, welcome emails, and trial emails are all automated. You only need to intervene on delivery failures.
- **Score calculations.** Business Clarity Scores recalculate automatically from weekly ranking snapshots and behavioral data.

## First Day Back Checklist

1. Log in to `/hq`. Your IntegratorView loads by default.
2. Read the greeting and agent brief at the top. It summarizes what needs your attention today.
3. Check the **Client Health Grid**. Note any AMBER or RED clients.
4. Check the **Trial Pipeline**. Anyone past day 5 without engagement needs a personal touch.
5. Open `dream_team_tasks` (IntegratorView > Dream Team Activity, or `/hq/dream-team`). Sort by priority. Handle any tasks assigned to "Jo" or "Ops."
6. Check **Blocker Panel** for anything stuck.
7. If everything looks clean, you're caught up. Check back at end of day.

## Key URLs

- IntegratorView: `/hq` (your default)
- Dream Team Tasks: `/hq/dream-team`
- Client Health: visible in IntegratorView Client Health Grid
- Agent Flight Manual: `docs/AGENT_FLIGHT_MANUAL.md`
- Build State (Notion): https://www.notion.so/32dfdaf120c4810f908ee3a1ea7452b7

## Questions?

Corey has full context on every decision. Dave has full context on infrastructure. The Morning Briefing agent compiles a daily summary that covers both.
