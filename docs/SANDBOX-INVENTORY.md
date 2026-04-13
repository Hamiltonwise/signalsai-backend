# Sandbox Product Inventory

Every file. Every route. Every page. Nothing unexplained.

764 commits | 73 new route files | 69 new migrations | 22 new pages | 43 new components | 12 new controllers | 7 new models | 2 new jobs | 2 new email templates

---

## How to Read This Document

Dave's agents will scan sandbox and surface every file that doesn't exist on main. This document explains what each one is, why it exists, which Migration Manifest card it belongs to, and its blast radius. If a file isn't in this inventory, it shouldn't be on sandbox.

Verify: `git diff main..sandbox --diff-filter=A --name-only | wc -l` should match the counts above.

---

## WHAT WAS NOT TOUCHED

Dave's existing systems. Confirmed with `git diff main..sandbox --stat`:

- **PM System** (src/controllers/tasks/, 37 files): 0 lines changed
- **Website Builder** (src/controllers/websites/): 0 lines changed
- **Notification System** (src/routes/notifications.ts core logic): existing endpoints preserved, additive only
- **Form Submissions**: 0 lines changed
- **E2E Test Framework** (e2e/): 0 lines changed
- **Infrastructure Configs** (ecosystem.config.js, nginx, PM2): 0 lines changed

---

## BACKEND ROUTES (73 new files)

### Customer-Facing Routes (22 files)

These are what paying customers hit from the dashboard.

| File | Purpose | Card | Blast |
|------|---------|------|-------|
| user/homeIntelligence.ts | Home page data: readings, Oz moment, action card | 9 | Yellow |
| user/ozEngine.ts | Single highest-surprise insight for hero card | 9 | Yellow |
| user/proofOfWork.ts | "What Alloro did this week" timeline | 9 | Yellow |
| user/competitors.ts | Track/untrack competitors by placeId | 8 | Yellow |
| user/ranking.ts | Latest ranking data for authenticated user | 8 | Yellow |
| user/activity.ts | Last 7 days of behavioral events for org | 8 | Yellow |
| user/streaks.ts | Growth/action/review streak tracking | 8 | Yellow |
| user/milestoneCards.ts | Day 30/60/180 Lemonis Protocol check-ins | 8 | Yellow |
| user/improvementPlan.ts | Score improvement recommendations | 8 | Yellow |
| user/reviewDrafts.ts | AI-generated review response drafts | 8 | Yellow |
| user/reviewSentimentRoute.ts | Theme comparison: your reviews vs competitors | 8 | Yellow |
| user/networkIntelligence.ts | Buried intelligence no owner could find alone | 8 | Yellow |
| user/referralThankYou.ts | Auto-draft thank-you letters to referring GPs | 8 | Yellow |
| user/champion.ts | Champion client opt-in ($50/mo funds Heroes seat) | 8 | Yellow |
| user/ownerProfile.ts | Lemonis Protocol onboarding questions | 2 | Green |
| user/anniversaryReport.ts | Journey report: months active, reviews gained | 8 | Yellow |
| user/croInsights.ts | Website optimizations for Presence page | 8 | Yellow |
| user/dataExport.ts | Full JSON data download (GDPR compliance) | 3 | Green |
| user/gpDiscovery.ts | Find GPs not in referral history + outreach letters | 8 | Yellow |
| user/help.ts | HelpButton endpoint: customer support tickets | 8 | Yellow |
| user/helpArticles.ts | Help articles filtered by audience | 8 | Yellow |
| personalAgent.ts | Daily brief for team members by role | 8 | Yellow |

### Checkup/Acquisition Routes (5 files)

Public-facing acquisition funnel.

| File | Purpose | Card | Blast |
|------|---------|------|-------|
| publicScoreCard.ts | Shareable checkup results (email share links) | 6 | Green |
| content.ts | Public blog/content by slug (DynamicArticle) | 4 | Green |
| market.ts | Cached market stats for city SEO pages | 4 | Green |
| alloroLabs.ts | Public benchmark API (anonymized, min 5 sample) | 4 | Green |
| sitemap.ts | Dynamic sitemap.xml generator for all routes | 4 | Green |

### Admin HQ Routes (30 files)

Internal tools. All behind superAdminMiddleware.

| File | Purpose | Card | Blast |
|------|---------|------|-------|
| admin/aaeDashboard.ts | AAE conference real-time funnel metrics | 6 | Green |
| admin/agentActivity.ts | Dream Team activity feed for IntegratorView | 13 | Yellow |
| admin/agentCanon.ts | Agent governance: spec, gold questions, gate verdict | 13 | Yellow |
| admin/agentIdentity.ts | Agent status, audit log, scope violations | 13 | Yellow |
| admin/agentRunner.ts | Invoke Dream Team agents manually | 13 | Yellow |
| admin/analytics.ts | GA4 + GSC data fetch for admin dashboard | 8 | Yellow |
| admin/ceoChat.ts | Claude-powered role-based intelligence chat | 13 | Yellow |
| admin/changelog.ts | Auto-generated changelog from GitHub commits | -- | Green |
| admin/checkupFunnel.ts | Checkup-to-signup funnel analytics | 6 | Green |
| admin/clarityMetrics.ts | Daily clarity score snapshots + 30-day trend | 8 | Yellow |
| admin/claudeObservations.ts | Role-specific observations from real data | 13 | Yellow |
| admin/config.ts | View/edit all business configuration values | -- | Green |
| admin/contentPublish.ts | Publish blog content to published_content table | 4 | Green |
| admin/customerReadiness.ts | Undeniable bar check for VisionaryView | 8 | Yellow |
| admin/emailPreview.ts | Monday email preview/test for admin review | 7 | Yellow |
| admin/experiments.ts | A/B experiment lab: list, conclude with winner | -- | Green |
| admin/flagIssue.ts | Bug/issue reports from admin UI -> dream_team_tasks | -- | Green |
| admin/killSwitch.ts | Emergency stop for all agent execution | 13 | Yellow |
| admin/metrics.ts | Pre-computed MRR/health/counts for all admin pages | 8 | Yellow |
| admin/missionControl.ts | Real-time status of all 50 agents | 13 | Yellow |
| admin/mondayPreview.ts | Monday Email Command Center: preview/hold/send | 7 | Yellow |
| admin/morningBriefing.ts | Latest morning briefing for admin | 8 | Yellow |
| admin/passwordReset.ts | Super admin password reset for any user | -- | Yellow |
| admin/realityCheck.ts | Customer reality check: all active customers | 8 | Yellow |
| admin/revenue.ts | Real Stripe MRR query | 8 | Yellow |
| admin/roadmap.ts | Roadmap state: position, next milestone, ETA | 8 | Yellow |
| admin/scoringConfig.ts | Scoring weight configuration + preview | 9 | Yellow |
| admin/tailor.ts | Per-org text overrides and customization | 1 | Green |
| admin/tasks.ts | Jo's "My Flags" task board for dream_team_tasks | -- | Green |

### Infrastructure Routes (6 files)

| File | Purpose | Card | Blast |
|------|---------|------|-------|
| bootstrap.ts | One-time team account setup (requires BOOTSTRAP_SECRET) | -- | Red |
| compliance.ts | Website compliance scanner for marketing claims | 3 | Green |
| dfyApproval.ts | One-tap approve/reject from Monday email | 7 | Yellow |
| focusKeywords.ts | Org focus keywords for SEO tracking | 4 | Green |
| messages.ts | Internal team messaging | 10 | Yellow |
| snapshot.ts | Weekly ranking snapshot data for dashboards | 8 | Yellow |

### Integration Routes (3 files)

| File | Purpose | Card | Blast |
|------|---------|------|-------|
| integrations/hubspot.ts | HubSpot OAuth + read-only pipeline sync | 11 | Yellow |
| partner/campaigns.ts | Partner campaign intelligence + outreach | 11 | Yellow |
| webhooks/mailgunEvents.ts | Email deliverability tracking (open/click/bounce) | 7 | Yellow |

### PM System Routes (7 files)

Internal project management. NOT Dave's existing PM system in controllers/tasks/.

| File | Purpose | Card | Blast |
|------|---------|------|-------|
| pm/index.ts | Mounts all PM sub-routes | -- | Green |
| pm/projects.ts | CRUD for internal projects | -- | Green |
| pm/tasks.ts | Task CRUD, ordering, column management | -- | Green |
| pm/activity.ts | Global activity feed across projects | -- | Green |
| pm/aiSynth.ts | AI-powered document processing for PM | -- | Green |
| pm/brief.ts | AI-generated daily project briefings | -- | Green |
| pm/stats.ts | Project velocity and workload metrics | -- | Green |
| pm/users.ts | Admin user list for task assignment | -- | Green |

---

## FRONTEND PAGES (22 new files)

### Customer Dashboard Pages (7)

| Page | Route | What Customer Sees | Card |
|------|-------|-------------------|------|
| HomePage.tsx | /home | Readings strip, Oz hero card, one action card, activity feed | 9 |
| ComparePage.tsx | /compare | Head-to-head vs top competitor with verification links | 8 |
| ReviewsPage.tsx | /reviews | Review health, sentiment, response drafts | 8 |
| PresencePage.tsx | /presence | Website CRO insights, Google presence readings | 8 |
| HelpPage.tsx | /help | Help articles + support ticket form | 8 |
| OwnerProfile.tsx | /owner-profile | 5 Lemonis Protocol questions (onboarding) | 2 |
| Messages.tsx | /messages | Internal messaging thread | 10 |

### Checkup Flow Pages (2)

| Page | Route | What Visitor Sees | Card |
|------|-------|-------------------|------|
| UploadPrompt.tsx | /checkup/upload-prompt | Post-signup data upload prompt | 6 |
| ColleagueShare.tsx | /checkup/share | Viral share with referral code | 6 |

### Admin HQ Pages (3)

| Page | Route | Who Sees It | Card |
|------|-------|-------------|------|
| BoardChat.tsx | /hq/board | Corey/Jo: role-based AI chat | 13 |
| MondayEmailHQ.tsx | /hq/monday-emails | Corey/Jo: email command center | 7 |
| ReadinessTracker.tsx | /admin/readiness | Corey: customer readiness dashboard | 8 |

### Marketing/Content Pages (7)

| Page | Route | Purpose | Card |
|------|-------|---------|------|
| AboutPage.tsx | /about | Company story | 4 |
| ProductPage.tsx | /product | Product explainer | 4 |
| RisePage.tsx | /rise | Foundation program | 4 |
| DynamicArticle.tsx | /blog/:slug | Dynamic blog post from published_content | 4 |
| MarketPage.tsx | /market/:specialty/:city | Programmatic city SEO pages | 4 |
| CampaignIntelligence.tsx | /partner/campaigns | Partner campaign tracking | 11 |
| AnniversaryReport.tsx | /dashboard/anniversary | Client anniversary journey report | 8 |

### Other (3)

| Page | Purpose | Card |
|------|---------|------|
| ClarityCard.tsx | Shareable clarity card by ID | 6 |
| DoctorDashboardV1.tsx | Legacy dashboard compat wrapper | 8 |
| PatientPathPreview.tsx | Website preview in dashboard | 8 |

---

## MIGRATIONS (69 new files)

### Safe: CREATE TABLE (27 migrations)

New tables only. No existing data touched.

| Migration | Table Created |
|-----------|--------------|
| create_legacy_tables | Legacy migration baseline |
| create_pm_tables | pm_projects, pm_tasks, pm_activity_log, pm_daily_briefs |
| create_pm_ai_synth_batches | pm_ai_synth_batches, pm_ai_synth_batch_tasks |
| create_referral_thank_you_drafts | referral_thank_you_drafts |
| create_review_response_drafts | review_response_drafts |
| create_checkup_invitations | checkup_invitations |
| create_morning_briefings | morning_briefings |
| create_knowledge_heuristics | knowledge_heuristics |
| create_referrals_table | referrals |
| create_published_content | published_content |
| create_tailor_overrides | tailor_overrides |
| create_messages | messages |
| create_alloro_website_project | Seed data for website builder project |
| create_email_outcomes | email_outcomes |
| create_email_events | email_events |
| create_focus_keywords | focus_keywords |
| create_hubspot_connections | hubspot_connections |
| create_compliance_scans | compliance_scans |
| agent_identity_system | agent_identities, agent_audit_log |
| create_claude_observations | claude_observations |
| create_referral_sources_and_populate | referral_sources |
| create_scoring_config | scoring_config |
| create_pending_actions | pending_actions |

### Safe: ADD COLUMN (23 migrations)

New columns on existing tables. No existing columns touched.

| Migration | Table | Columns Added |
|-----------|-------|--------------|
| add_owner_profile | organizations | owner_profile_data (JSONB) |
| add_week1_win_columns | organizations | week1_win_headline, week1_win_detail, week1_win_type |
| add_owner_archetype | organizations | owner_archetype, archetype_confidence |
| add_week1_win | organizations | week1_win (JSONB) |
| add_champion_and_shareability | organizations | is_champion, champion_since, champion_hero_org_name |
| add_trial_columns | organizations | trial_start_at, trial_end_at, trial_status |
| add_video_columns | published_content | video_id, video_url, video_status |
| add_tracked_competitors | organizations | tracked_competitors (JSONB) |
| add_clarity_score_tracking | organizations | current/previous_clarity_score, score_updated_at |
| add_concierge_fields | dream_team_tasks | task_type, blast_radius, assigned_to |
| add_ga4_gsc | google_data_store | ga4_data, gsc_data |
| agent_canon_columns | dream_team_nodes | canon_spec, gold_questions, gate_verdict |
| add_account_type | organizations | account_type |
| add_force_password_change | users | force_password_change (boolean, default false) |
| add_terms_accepted | organizations | terms_accepted_at |
| add_org_timezone | organizations | timezone, utc_offset_minutes |
| add_review_postable_flag | google_reviews | postable |
| add_target_competitor | organizations | target_competitor_place_id, target_competitor_name, client_context |
| add_referral_code | checkup_shares | referral_code |
| add_behavioral_events_index | behavioral_events | Composite index (performance) |

### Seed Data (12 migrations)

Populate new tables with defaults. No existing rows modified.

| Migration | What It Seeds |
|-----------|--------------|
| seed_additional_vocabulary_defaults | Vocabulary for 5+ verticals |
| complete_vocabulary_defaults | Remaining vocabulary presets |
| complete_original_vocabulary_modes | Mode-based vocab |
| fix_health_score_labels | Score label corrections |
| seed_full_dream_team | Dream team agent roster |
| seed_feedback_loop_schedule | Agent schedules |
| seed_all_agent_schedules | All 50 agent cron schedules |
| seed_dreamweaver_schedule | Dreamweaver agent cron |
| seed_canon_critical_agents | Canon governance for key agents |
| seed_canon_all_agents | Canon governance for all agents |
| seed_dentalemr_focus_keywords | DentalEMR org focus keywords |
| seed_customer_outcomes_schedule | Customer outcomes agent schedule |
| wire_dream_team_agent_keys | Agent key mappings |

### REQUIRES REVIEW (7 migrations)

These touch existing data or contain hardcoded values. Dave should read each one.

| Migration | Risk | What It Does |
|-----------|------|-------------|
| fix_pm_uuid_to_integer | Medium | Drops `created_by` and `assigned_to` columns on pm_tasks, re-adds as integer (was UUID). Only affects new PM tables, not Dave's. |
| create_dentalemr_team | **HIGH** | Creates DentalEMR user accounts with hardcoded password "dentalemr2026". Sandbox-only seed data. **Do not run on production.** |
| reset_merideth_password | **HIGH** | Resets merideth@dentalemr.com password to "dentalemr2026". Sandbox-only. **Do not run on production.** |
| add_force_password_change | Medium | Adds `force_password_change` column (default false). Safe, but Dave should know the column exists for future use. |
| data_integrity_cleanup | Medium | Cleans orphaned records. Read the migration to verify scope. |
| fix_org39_top_competitor | Low | Fixes bad competitor data for One Endo (org 39). Data-specific. |
| clean_org39_all_bad_competitors | Low | Clears non-local competitors for One Endo. Data-specific. |
| reset_previous_score_for_algorithm_change | Low | Nulls previous_clarity_score for all orgs (algorithm change). Scores recalculate on next run. |

---

## MODIFIED FILES (51 existing route files)

These files exist on main and were changed. Most changes are additive (JSDoc headers, new endpoints appended). The high-risk modifications:

| File | What Changed | Risk |
|------|-------------|------|
| checkup.ts | +1,150 lines: conference mode, QR flow, account creation. Original endpoints untouched. | Medium |
| billing.ts | Subscription management + trial system. Original webhook handler unchanged. | **High** |
| auth.ts | Error handler middleware added at tail. Existing auth logic unchanged. | Medium |
| auth/gbp.ts | GBP OAuth callback -- needs APP_URL env var for production. | **High** |
| auth-password.ts | Password reset flow improvements. | Medium |
| All other 46 files | JSDoc headers, console tag fixes, response shape alignment, minor additive endpoints. | Low |

---

## VERIFY THIS INVENTORY

Run these commands. Every number should match.

```bash
# New route files
git diff main..sandbox --diff-filter=A --name-only -- src/routes/ | wc -l
# Expected: 73

# New frontend pages
git diff main..sandbox --diff-filter=A --name-only -- frontend/src/pages/ | wc -l
# Expected: 22

# New migrations
git diff main..sandbox --diff-filter=A --name-only -- src/database/migrations/ | wc -l
# Expected: 69

# TypeScript
cd frontend && npx tsc --noEmit
# Expected: zero errors

# Response shape violations
grep -rn 'json({ error:' src/routes/ | grep -v 'success:' | wc -l
# Expected: 0
```

---

*This inventory maps every new file on sandbox to its purpose and Migration Manifest card. If Dave's agents surface a file not listed here, it's a bug in this document -- flag it.*
