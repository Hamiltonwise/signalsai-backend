/**
 * The Food Lab: Finding the Perfect Subject Line
 *
 * Corey gets cold emails all day and never opens any.
 * So does every ICP. The subject line is the ENTIRE battle.
 *
 * Kenji method: isolate ONE variable per test. Minimum 50 sends
 * per variant. Track opens, clicks, checkup completions.
 * ProspectAI provides the delivery and tracking infrastructure.
 *
 * The Dream Team agents (CMO, Conversion Optimizer, Learning Agent)
 * analyze results weekly and propose the next test.
 *
 * Rule: the subject line must deliver VALUE, not promise it.
 * "We can help your practice grow" = promise = delete
 * "The Smile Home added 14 reviews. You added 3." = value = open
 */

// ═══════════════════════════════════════════════════════
// SUBJECT LINE VARIABLES TO TEST
// ═══════════════════════════════════════════════════════

const SUBJECT_LINE_EXPERIMENTS = [
  // ─── ROUND 1: Format (which structure gets opened?) ─────────
  {
    id: "SL-01",
    variable: "Named competitor vs no competitor",
    variants: [
      { label: "A: Named", template: "{competitor} added {n} reviews last month. You added {m}." },
      { label: "B: Anonymous", template: "Your top competitor added {n} reviews last month. You added {m}." },
    ],
    hypothesis: "Named competitor creates urgency. Anonymous feels less threatening but less specific.",
    metric: "open_rate",
    minSample: 50,
  },
  {
    id: "SL-02",
    variable: "Number-first vs insight-first",
    variants: [
      { label: "A: Number first", template: "61/100. That's your Business Clarity Score, {firstName}." },
      { label: "B: Insight first", template: "{firstName}, your 5-star rating isn't protecting your rank." },
    ],
    hypothesis: "Numbers create curiosity (what does 61 mean?). Insights create urgency (my rating isn't working?).",
    metric: "open_rate",
    minSample: 50,
  },
  {
    id: "SL-03",
    variable: "Question vs statement",
    variants: [
      { label: "A: Question", template: "{firstName}, do you know why {competitor} outranks you?" },
      { label: "B: Statement", template: "{firstName}, {competitor} outranks you. Here's why." },
    ],
    hypothesis: "Questions engage curiosity. Statements feel more authoritative. Which wins for a defensive ICP?",
    metric: "open_rate",
    minSample: 50,
  },
  {
    id: "SL-04",
    variable: "Short vs detailed",
    variants: [
      { label: "A: Ultra-short", template: "{businessName}: 61/100" },
      { label: "B: One insight", template: "{businessName} ranked #6 of 12. One thing is holding you back." },
    ],
    hypothesis: "Ultra-short is intriguing but might feel spammy. One insight gives enough to compel the open.",
    metric: "open_rate",
    minSample: 50,
  },

  // ─── ROUND 2: Emotional angle (what FEELING opens the email?) ────
  {
    id: "SL-05",
    variable: "Loss aversion vs curiosity vs pride",
    variants: [
      { label: "A: Loss", template: "{firstName}, {competitor} is closing the gap on you in {city}." },
      { label: "B: Curiosity", template: "{firstName}, I found something about {businessName} you should see." },
      { label: "C: Pride", template: "{firstName}, your patients say something your competitor's don't." },
    ],
    hypothesis: "Loss aversion is proven 2x stronger (Kahneman). But curiosity may feel less threatening for a defensive ICP. Pride reframes from threat to strength.",
    metric: "open_rate AND click_rate (opens without clicks = wrong emotion)",
    minSample: 50,
  },
  {
    id: "SL-06",
    variable: "From Corey vs from Alloro",
    variants: [
      { label: "A: Person", template: "From: Corey Wise | Subject: {firstName}, I ran a checkup on {businessName}" },
      { label: "B: Brand", template: "From: Alloro | Subject: {firstName}, your free Business Clarity Score is ready" },
    ],
    hypothesis: "Person-to-person (B2C) should outperform brand-to-business (B2B). But 'Alloro' may signal legitimacy.",
    metric: "open_rate",
    minSample: 50,
  },

  // ─── ROUND 3: Preview text (the second line) ─────────────────
  {
    id: "SL-07",
    variable: "Preview text: continuation vs separate hook",
    variants: [
      { label: "A: Continue", template: "Subject: {competitor} added 14 reviews. You added 3. | Preview: At this rate, they pass you by August." },
      { label: "B: New hook", template: "Subject: {competitor} added 14 reviews. You added 3. | Preview: But your reviews say something theirs don't." },
    ],
    hypothesis: "Continuation deepens the threat. New hook introduces hope. Which drives the open for someone who's defensive?",
    metric: "open_rate",
    minSample: 50,
  },

  // ─── ROUND 4: The zero-pitch test ─────────────────────────
  {
    id: "SL-08",
    variable: "No mention of Alloro at all",
    variants: [
      { label: "A: Branded", template: "From: Corey at Alloro | Subject: I found something about {businessName}" },
      { label: "B: Unbranded", template: "From: Corey Wise | Subject: I found something about {businessName}" },
    ],
    hypothesis: "Any brand name in the from-line triggers the 'this is a sales email' filter. A person's name doesn't.",
    metric: "open_rate",
    minSample: 50,
  },
];

// ═══════════════════════════════════════════════════════
// EMAIL BODY EXPERIMENTS (only matter if subject line wins)
// ═══════════════════════════════════════════════════════

const EMAIL_BODY_EXPERIMENTS = [
  {
    id: "EB-01",
    variable: "Length: 3 lines vs 8 lines",
    variants: [
      {
        label: "A: Ultra-short",
        template: `{firstName},

{ozMoment1}

Full analysis (free): {link}

Corey`,
      },
      {
        label: "B: Two findings + context",
        template: `{firstName},

I ran a free competitive analysis on {businessName}. Two things stood out:

1. {ozMoment1}

2. {ozMoment2}

Your Business Clarity Score: {score}/100
Full analysis: {link}

Corey Wise
Alloro, Bend OR`,
      },
    ],
    hypothesis: "3 lines respects their time. 8 lines proves the depth. Which converts for a busy, skeptical owner?",
    metric: "click_rate AND checkup_completion_rate",
    minSample: 50,
  },
  {
    id: "EB-02",
    variable: "CTA phrasing",
    variants: [
      { label: "A: See your analysis", template: "See your full analysis (free): {link}" },
      { label: "B: See what we found", template: "See what we found: {link}" },
      { label: "C: No CTA, just link", template: "{link}" },
    ],
    hypothesis: "'See your full analysis' implies a report. 'See what we found' implies a reveal. Bare link is lowest friction.",
    metric: "click_rate",
    minSample: 50,
  },
  {
    id: "EB-03",
    variable: "Sign-off: personal vs professional",
    variants: [
      { label: "A: Just name", template: "Corey" },
      { label: "B: Name + location", template: "Corey Wise\nBend, Oregon" },
      { label: "C: Name + context", template: "Corey Wise\nFormer endodontic practice consultant\nBend, Oregon" },
    ],
    hypothesis: "Context builds credibility. But length adds friction. And 'consultant' might trigger the defensive response.",
    metric: "reply_rate (replies = trust)",
    minSample: 50,
  },
];

// ═══════════════════════════════════════════════════════
// DREAM TEAM AGENT WORKFLOW
// ═══════════════════════════════════════════════════════

const AGENT_WORKFLOW = {
  description: "Weekly cycle for outbound optimization",
  steps: [
    {
      day: "Monday",
      agent: "CMO Agent",
      action: "Review last week's ProspectAI open/click data. Identify winning subject line variant. Propose next week's test.",
    },
    {
      day: "Tuesday",
      agent: "Conversion Optimizer",
      action: "Analyze click-to-checkup conversion. Identify where people drop off after clicking. Propose landing page changes.",
    },
    {
      day: "Wednesday",
      agent: "Learning Agent",
      action: "Update heuristics: which Oz moment types drive highest open rates? Which verticals respond best? Calibrate the system.",
    },
    {
      day: "Thursday",
      agent: "Competitive Scout",
      action: "Scan target markets for fresh competitive data. Feed new Oz moments into next week's email batch.",
    },
    {
      day: "Friday",
      agent: "System Conductor",
      action: "Review all agent outputs. Approve next week's test variant. Flag anything that feels too aggressive or off-brand for Corey.",
    },
  ],
};

// Print the plan
console.log("═══════════════════════════════════════════════════════");
console.log("  THE FOOD LAB: Finding the Perfect Subject Line");
console.log("  The subject line is the ENTIRE battle.");
console.log("═══════════════════════════════════════════════════════\n");

console.log("ROUND 1: FORMAT (4 tests)");
for (const e of SUBJECT_LINE_EXPERIMENTS.slice(0, 4)) {
  console.log(`\n  [${e.id}] ${e.variable}`);
  for (const v of e.variants) {
    console.log(`    ${v.label}: "${v.template}"`);
  }
  console.log(`    Hypothesis: ${e.hypothesis}`);
}

console.log("\n\nROUND 2: EMOTIONAL ANGLE (2 tests)");
for (const e of SUBJECT_LINE_EXPERIMENTS.slice(4, 6)) {
  console.log(`\n  [${e.id}] ${e.variable}`);
  for (const v of e.variants) {
    console.log(`    ${v.label}: "${v.template}"`);
  }
  console.log(`    Hypothesis: ${e.hypothesis}`);
}

console.log("\n\nROUND 3-4: PREVIEW TEXT + ZERO-PITCH (2 tests)");
for (const e of SUBJECT_LINE_EXPERIMENTS.slice(6)) {
  console.log(`\n  [${e.id}] ${e.variable}`);
  for (const v of e.variants) {
    console.log(`    ${v.label}: "${v.template}"`);
  }
}

console.log("\n\nEMAIL BODY (3 tests, run AFTER subject line winner is found)");
for (const e of EMAIL_BODY_EXPERIMENTS) {
  console.log(`\n  [${e.id}] ${e.variable}`);
  console.log(`    Hypothesis: ${e.hypothesis}`);
}

console.log("\n\nDREAM TEAM WEEKLY CYCLE:");
for (const s of AGENT_WORKFLOW.steps) {
  console.log(`  ${s.day}: ${s.agent} → ${s.action}`);
}

console.log(`\n\nTotal: ${SUBJECT_LINE_EXPERIMENTS.length + EMAIL_BODY_EXPERIMENTS.length} experiments`);
console.log("Minimum sample: 50 sends per variant");
console.log("Method: Subject line experiments FIRST. Body experiments AFTER.");
console.log("Tracking: ProspectAI open rate + click rate → Alloro funnel analytics");
console.log("═══════════════════════════════════════════════════════\n");
