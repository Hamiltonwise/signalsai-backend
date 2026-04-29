# PMS Statistics Redesign Prototype

## Why
Current PMS statistics page shows raw tables and basic charts that are hard to digest. Need a standalone prototype matching the main dashboard's design language (Fraunces serif headings, parchment callouts, alloro-orange accent) that renders ALL available data in the most intuitive layout possible.

## What
Standalone Vite + React + TypeScript app at `/Users/rustinedave/Desktop/pms-statistics-redesign/` on port 2121. Uses Tailwind, Framer Motion, Recharts. Mock data from the data catalog. No header/footer. Client-ready visual prototype.

## Design Tokens (from main app)
- Navy: `#11151C`
- Orange: `#D66853`
- Background: `#F3F4F6`
- Cream: `#FCFAED`
- Cream border: `#EDE5C0`
- Font display: `Fraunces` (serif, headings)
- Font body: `Plus Jakarta Sans` (sans, body text)
- Shadow premium: `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)`
- Border radius: `1rem` (rounded-2xl)

## Page Sections (top to bottom)

### S1: Hero KPI Row
4 cards, horizontal, equal width:
- **Total Production** — `totals.totalProduction` formatted as `$497.7K`
- **Total Referrals** — `totals.totalReferrals` as `397`
- **Doctor Referral %** — computed `(sum doctorReferrals / totalReferrals) * 100`
- **Avg $ / Referral** — `totalProduction / totalReferrals` formatted as `$1,254`

### S2: Monthly Trends (Recharts)
Dual-axis bar + line chart:
- X axis: month labels (JAN 2026, FEB 2026, MAR 2026)
- Left axis (bars): referral count per month (stacked: doctor dark, self orange)
- Right axis (line): production per month ($)
- Framer Motion entrance animation

### S3: Executive Summary
Parchment callout card (`#FCFAED` bg, `#EDE5C0` border):
- Fraunces heading: "Referral Health Summary"
- RE `executive_summary[]` bullets rendered as clean list

### S4: Source Leaderboard
Table/card list of top sources from `sources[]` joined with `sourceTrends[]`:
- Rank, Name, Referrals, Production ($), Avg/Ref, Trend arrow (↑↓→ new dormant)
- Trend color: green=increasing, red=decreasing, orange=new, gray=dormant/stable
- Scrollable if >10 rows

### S5: Growth Opportunities
3 horizontal cards from `growth_opportunity_summary.top_three_fixes[]`:
- Title (serif), description, impact badge
- `estimated_additional_annual_revenue` as a highlight number

### S6: Monthly Actions (Summary v2)
`top_actions[]` rendered as priority-sorted cards:
- Title, urgency badge (high=red, medium=amber, low=green), domain tag
- Rationale text with highlights bolded
- 3 supporting_metrics as small KPI pills
- Outcome section (deliverables + mechanism)

### S7: Trend Alerts
`sourceTrends[]` filtered to dormant + decreasing:
- Card per alert: source name, trend_label, delta, prior vs current
- Red for decreasing, gray for dormant

### S8: Data Quality Footer
`dataQualityFlags[]` rendered as small info pills at bottom (if any)

## Tasks

### T1: Scaffold Vite + React + Tailwind + deps
**Do:** Create `/Users/rustinedave/Desktop/pms-statistics-redesign/` with `npm create vite`, install tailwindcss, framer-motion, recharts, @fontsource/fraunces, @fontsource/plus-jakarta-sans. Configure Tailwind with Alloro design tokens. Set Vite dev port to 2121.
**Verify:** `npm run dev` serves on localhost:2121

### T2: Mock data file
**Do:** Create `src/data/mockData.ts` with realistic 3-month data for One Endodontics (Jan+Feb+Mar 2026). Populate all fields from the data catalog: aggregated PMS, RE output, dashboard_metrics, Summary v2 output.
**Verify:** Imports cleanly, TypeScript types match

### T3: Build all 8 sections
**Do:** Create component per section (S1-S8), compose in App.tsx. Single-page vertical scroll. Framer Motion entrance animations (staggered fade-up). Recharts for S2 chart. Match design tokens exactly.
**Verify:** Visual inspection on localhost:2121

## Done
- [ ] `npm run dev` runs on port 2121
- [ ] All 8 sections render with mock data
- [ ] Design matches main dashboard: Fraunces headings, parchment callouts, alloro-orange accents
- [ ] No header/footer
- [ ] Responsive (looks good 1200px+)
- [ ] All data shown is from the catalog — nothing fabricated beyond mock values
