/**
 * The Food Lab Method: Finding the Perfect Checkup
 *
 * Kenji López-Alt doesn't guess. He isolates ONE variable, holds
 * everything else constant, tests, documents, and builds. The
 * Perfect Chocolate Chip Cookie wasn't one experiment. It was 30.
 *
 * We apply the same rigor to find:
 * 1. The Perfect Checkup (what makes someone share?)
 * 2. The Perfect Monday Email (what makes someone open and act?)
 * 3. The Perfect Dashboard (what creates TTFV?)
 * 4. The Perfect Upgrade Moment (what converts DWY to DFY?)
 *
 * Each experiment isolates ONE variable. Metrics are tracked in
 * behavioral_events. Results feed the Collective Intelligence Engine.
 *
 * Run: npx tsx src/scripts/kenjiTestPlan.ts
 */

// ═══════════════════════════════════════════════════════
// EXPERIMENT 1: THE PERFECT CHECKUP
// Question: What makes someone screenshot and share?
// ═══════════════════════════════════════════════════════

const CHECKUP_EXPERIMENTS = [
  {
    id: "CK-01",
    variable: "Oz moment position",
    hypothesis: "Showing the Oz moment BEFORE the score creates more shares than showing the score first",
    control: "Score ring first, then Oz moments below",
    variant: "Oz moment hook first (dark card), then score ring",
    metric: "checkup.share_created / checkup.gate_viewed",
    minSampleSize: 50,
    duration: "2 weeks",
    notes: "The score is a number. The Oz moment is a story. Stories share better than numbers.",
  },
  {
    id: "CK-02",
    variable: "Hook type effectiveness",
    hypothesis: "Cross-referenced review language gaps convert higher than photo/hours gaps",
    control: "Mix of all hook types (current behavior)",
    variant: "Force review-language hooks only vs force structural hooks only",
    metric: "checkup.email_captured / checkup.gate_viewed per hook type",
    minSampleSize: 100,
    duration: "4 weeks",
    notes: "Tag each Oz moment with its type in behavioral_events. Analyze which type drives conversion.",
  },
  {
    id: "CK-03",
    variable: "Score anchor effect",
    hypothesis: "Showing market rank (#4 of 12) before the composite score anchors perception and increases urgency",
    control: "Composite score (73/100) shown first",
    variant: "Market rank (#4 of 12) shown first, composite second",
    metric: "checkup.email_captured / checkup.gate_viewed",
    minSampleSize: 50,
    duration: "2 weeks",
    notes: "Rank is relative and competitive. Score is absolute and less emotional.",
  },
  {
    id: "CK-04",
    variable: "Share card design",
    hypothesis: "A pre-designed visual share card (Spotify Wrapped style) increases share rate vs text-only share button",
    control: "Copy link button",
    variant: "Visual score card with screenshot-worthy design + copy link",
    metric: "checkup.share_created / checkup.scan_completed",
    minSampleSize: 50,
    duration: "2 weeks",
    notes: "The visual IS the share. Nobody screenshots a 'Copy link' button.",
  },
  {
    id: "CK-05",
    variable: "Theater duration",
    hypothesis: "10-second theater converts higher than 15-second (less abandonment) but 15-second creates more anticipation (higher perceived value)",
    control: "10 seconds (current)",
    variant: "15 seconds with richer theater (competitor map, review ticker)",
    metric: "checkup.scan_completed / checkup.scan_started AND checkup.email_captured / checkup.gate_viewed",
    minSampleSize: 100,
    duration: "4 weeks",
    notes: "Two competing effects: shorter = less abandonment, longer = more anticipation. Only data resolves this.",
  },
];

// ═══════════════════════════════════════════════════════
// EXPERIMENT 2: THE PERFECT MONDAY EMAIL
// Question: What makes someone open, read, and act?
// ═══════════════════════════════════════════════════════

const EMAIL_EXPERIMENTS = [
  {
    id: "ME-01",
    variable: "Subject line format",
    hypothesis: "Named competitor in subject line increases open rate vs generic finding headline",
    control: '"Smith, your position held this week"',
    variant: '"Smith, Scottsdale Endo added 6 reviews. You added 1."',
    metric: "monday_email.opened / monday_email.sent",
    minSampleSize: 30,
    duration: "4 weeks (1 email/week)",
    notes: "The competitor name creates urgency. But does it also create anxiety that reduces engagement?",
  },
  {
    id: "ME-02",
    variable: "Email length",
    hypothesis: "3-sentence emails get higher action rates than 3-paragraph emails",
    control: "Current format (finding + bullets + 5-min fix + competitor note + referral + founder line)",
    variant: "Three sentences: finding, action, sign-off",
    metric: "one_action.completed within 48h of monday_email.opened",
    minSampleSize: 30,
    duration: "4 weeks",
    notes: "Busy owner at 7am. Do they read 3 paragraphs or 3 sentences?",
  },
  {
    id: "ME-03",
    variable: "Founder voice vs brand voice",
    hypothesis: "Emails signed 'Corey' with personal tone get higher reply rates than professional brand voice",
    control: "Signed by Corey with personal line",
    variant: "Brand voice, no personal sign-off",
    metric: "Email reply rate + one_action.completed rate",
    minSampleSize: 30,
    duration: "4 weeks",
    notes: "B2C insight: this is a person-to-person relationship. But does the personal voice scale?",
  },
];

// ═══════════════════════════════════════════════════════
// EXPERIMENT 3: THE PERFECT DASHBOARD
// Question: What creates TTFV (Time to First Value)?
// ═══════════════════════════════════════════════════════

const DASHBOARD_EXPERIMENTS = [
  {
    id: "DB-01",
    variable: "First element on dashboard load",
    hypothesis: "Showing the Oz moment first (not the greeting or score) creates faster TTFV",
    control: "Greeting → One Action Card → Onboarding Checklist → Score → Findings",
    variant: "Oz moment card → Score → One Action Card → rest",
    metric: "ttfv.yes rate AND time from first_login to ttfv.yes",
    minSampleSize: 20,
    duration: "4 weeks",
    notes: "The Oz moment is the 'how did they know that?' The question: does it hit harder in the email or on the dashboard?",
  },
  {
    id: "DB-02",
    variable: "Exit emotion specificity",
    hypothesis: "Context-aware exit line (naming competitor) increases return visits vs generic encouragement",
    control: '"You checked in. That puts you ahead."',
    variant: '"Scottsdale Endo didn\'t check theirs today. You did."',
    metric: "Days between dashboard visits (lower = better)",
    minSampleSize: 20,
    duration: "8 weeks",
    notes: "Peak-end rule: the last thing determines memory. Already built context-aware exit. Need to measure impact.",
  },
  {
    id: "DB-03",
    variable: "Activity card prominence",
    hypothesis: "Showing 'What your agents did this week' above the fold increases perceived value and reduces churn",
    control: "Activity card below the fold (current position)",
    variant: "Activity card as second element, right after greeting",
    metric: "Engagement score change + churn rate comparison",
    minSampleSize: 30,
    duration: "8 weeks",
    notes: "This card proves the system is working. If they see it first, do they feel more confident?",
  },
];

// ═══════════════════════════════════════════════════════
// EXPERIMENT 4: THE PERFECT CONVERSION
// Question: What makes someone go from free to paid?
// ═══════════════════════════════════════════════════════

const CONVERSION_EXPERIMENTS = [
  {
    id: "CV-01",
    variable: "TTFV trigger timing",
    hypothesis: "Asking 'Did this tell you something you didn't know?' at 60 seconds gets higher yes rate than 90 seconds",
    control: "TTFV sensor appears at 90 seconds",
    variant: "TTFV sensor appears at 60 seconds",
    metric: "ttfv.yes / ttfv.shown",
    minSampleSize: 30,
    duration: "4 weeks",
    notes: "If the Oz moment landed, they know within 30 seconds. Waiting 90 seconds may lose the emotional peak.",
  },
  {
    id: "CV-02",
    variable: "Billing prompt framing",
    hypothesis: "Loss aversion framing converts higher than gain framing",
    control: '"Keep your intelligence running" (current)',
    variant: '"Your competitor gained 4 reviews this week. Without monitoring, you won\'t know until it\'s too late."',
    metric: "billing.subscription_created / billing_prompt.shown",
    minSampleSize: 30,
    duration: "8 weeks",
    notes: "Kahneman: losses are felt 2x more than equivalent gains. But does it feel manipulative?",
  },
  {
    id: "CV-03",
    variable: "Trial length",
    hypothesis: "14-day trial converts better than 7-day because more Monday emails = more proof",
    control: "7-day trial",
    variant: "14-day trial (gets 2 Monday emails instead of 1)",
    metric: "billing.subscription_created / trial_started",
    minSampleSize: 30,
    duration: "8 weeks",
    notes: "The Monday email IS the product for most users. One email may not be enough proof. Two might be the tipping point.",
  },
];

// ═══════════════════════════════════════════════════════
// CROSS-PATTERN ANALYSIS: What the 10 businesses revealed
// ═══════════════════════════════════════════════════════

const PATTERNS_DISCOVERED = {
  dataset: "10 real businesses tested March 29, 2026",
  businesses: [
    "Artful Orthodontics (FL)", "Caswell Orthodontics (HI)", "Garrison Orthodontics (NJ)",
    "1Endodontics (VA)", "SD Center for Endo (CA)", "Surf City Endo (CA)",
    "Ray's Place Barbershop (OR)", "Evergreen Oculofacial (OR)", "Grove & Kane (WA)", "DentalEMR (N/A)"
  ],

  findings: [
    {
      pattern: "RATING_MOAT",
      observation: "8 of 9 businesses have a HIGHER rating than their top competitor. They're winning on quality but losing on visibility.",
      count: 8,
      implication: "The Oz moment should LEAD with this: 'You're rated higher than your competitor. But they have 6x your reviews. Google shows volume, not quality.' This reframes the problem from 'you're losing' to 'you're being hidden.'",
    },
    {
      pattern: "REVIEW_VOLUME_GAP",
      observation: "Average review gap to top competitor: -156 reviews. But 3 businesses (Caswell, 1Endo, SD Endo) LEAD their competitor in reviews.",
      count: 9,
      implication: "The commodity finding ('you have fewer reviews') applies to 6 of 9. For the 3 leaders, the Oz moment must find something ELSE. The anti-commodity prompt works.",
    },
    {
      pattern: "PHOTO_PARITY",
      observation: "7 of 9 businesses have 10 photos (the Google Places max returned). Photo gap is NOT a differentiator for most.",
      count: 7,
      implication: "Photo-based Oz moments will feel generic for businesses with 10 photos. The prompt should deprioritize photo gaps when both sides have 10.",
    },
    {
      pattern: "PERFECT_RATING_TRAP",
      observation: "6 of 9 businesses have a perfect 5.0 rating. They think they're doing everything right. But they're ranked 4th, 5th, 6th in their market.",
      count: 6,
      implication: "This is the biggest Oz moment opportunity: 'You have a perfect 5.0 rating. You're ranked #6. Here's why rating alone doesn't win.' This breaks the assumption.",
    },
    {
      pattern: "SPECIALIST_VS_GENERALIST",
      observation: "In every market, the top-review business is a GENERALIST (general dentist, general spa, general health). The Alloro customer is a SPECIALIST with fewer reviews but higher expertise.",
      count: 7,
      implication: "The narrative should ALWAYS be 'specialist vs generalist.' This reframes the competition: you're not losing to a better business. You're being outshown by a louder one.",
    },
    {
      pattern: "CROSS_VERTICAL_CONSISTENCY",
      observation: "The Oz engine produced quality moments for orthodontics, endodontics, plastic surgery, barbershop, and medspa. The anti-commodity prompt works across all verticals.",
      count: 9,
      implication: "The product is truly universal. The vocabulary auto-mapper + vertical-aware economics make the findings relevant regardless of industry.",
    },
  ],

  hypothesesToTest: [
    "H1: 'Perfect rating + low rank' Oz moments have the highest share rate (breaks assumptions)",
    "H2: 'Specialist vs generalist' framing converts higher than 'you vs competitor' framing",
    "H3: Businesses with <50 reviews share at higher rates than those with 200+ (more to gain, more urgency)",
    "H4: Non-dental verticals (barbershop, medspa, plastic surgery) share at EQUAL rates to dental (universal problem)",
    "H5: Businesses that already have websites share LESS than those without (less perceived value from DFY)",
  ],
};

// Print the plan
console.log("═══════════════════════════════════════════════════════");
console.log("  THE FOOD LAB: Finding the Perfect Alloro Experience");
console.log("  Kenji Method: One variable at a time. Document everything.");
console.log("═══════════════════════════════════════════════════════\n");

console.log("EXPERIMENT 1: THE PERFECT CHECKUP");
console.log(`  ${CHECKUP_EXPERIMENTS.length} tests planned\n`);
for (const e of CHECKUP_EXPERIMENTS) {
  console.log(`  [${e.id}] ${e.variable}`);
  console.log(`    H: ${e.hypothesis}`);
  console.log(`    Metric: ${e.metric}`);
  console.log(`    Sample: ${e.minSampleSize} | Duration: ${e.duration}\n`);
}

console.log("\nEXPERIMENT 2: THE PERFECT MONDAY EMAIL");
console.log(`  ${EMAIL_EXPERIMENTS.length} tests planned\n`);
for (const e of EMAIL_EXPERIMENTS) {
  console.log(`  [${e.id}] ${e.variable}`);
  console.log(`    H: ${e.hypothesis}`);
  console.log(`    Metric: ${e.metric}\n`);
}

console.log("\nEXPERIMENT 3: THE PERFECT DASHBOARD");
console.log(`  ${DASHBOARD_EXPERIMENTS.length} tests planned\n`);
for (const e of DASHBOARD_EXPERIMENTS) {
  console.log(`  [${e.id}] ${e.variable}`);
  console.log(`    H: ${e.hypothesis}\n`);
}

console.log("\nEXPERIMENT 4: THE PERFECT CONVERSION");
console.log(`  ${CONVERSION_EXPERIMENTS.length} tests planned\n`);
for (const e of CONVERSION_EXPERIMENTS) {
  console.log(`  [${e.id}] ${e.variable}`);
  console.log(`    H: ${e.hypothesis}\n`);
}

console.log("\n═══════════════════════════════════════════════════════");
console.log("  PATTERNS FROM 10 REAL BUSINESSES");
console.log("═══════════════════════════════════════════════════════\n");
for (const f of PATTERNS_DISCOVERED.findings) {
  console.log(`  [${f.pattern}] (${f.count}/9 businesses)`);
  console.log(`    ${f.observation}`);
  console.log(`    → ${f.implication}\n`);
}

console.log("\n  HYPOTHESES TO TEST:");
for (const h of PATTERNS_DISCOVERED.hypothesesToTest) {
  console.log(`    ${h}`);
}

console.log("\n═══════════════════════════════════════════════════════");
console.log("  Total: " + (CHECKUP_EXPERIMENTS.length + EMAIL_EXPERIMENTS.length + DASHBOARD_EXPERIMENTS.length + CONVERSION_EXPERIMENTS.length) + " experiments across 4 categories");
console.log("  Method: One variable at a time. Measure. Document. Build.");
console.log("═══════════════════════════════════════════════════════\n");
