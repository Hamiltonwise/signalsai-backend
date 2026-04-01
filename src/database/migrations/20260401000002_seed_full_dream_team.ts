import type { Knex } from "knex";

/**
 * Seed the FULL dream team into dream_team_nodes.
 * Adds ~35 missing agents across 8 departments.
 * Idempotent: checks role_title before inserting.
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("dream_team_nodes");
  if (!hasTable) return;

  // Helper: look up existing node ID by role_title
  async function findNode(roleTitle: string): Promise<string | null> {
    const row = await knex("dream_team_nodes")
      .where({ role_title: roleTitle })
      .first("id");
    return row?.id ?? null;
  }

  // Helper: insert node only if role_title does not already exist
  async function insertIfMissing(
    role_title: string,
    display_name: string | null,
    node_type: "human" | "agent",
    department: string | null,
    parent_id: string | null,
    agent_key: string | null,
    kpis: { name: string; target: string }[],
    sort: number,
  ): Promise<string | null> {
    const existing = await findNode(role_title);
    if (existing) return existing;

    const [row] = await knex("dream_team_nodes")
      .insert({
        role_title,
        display_name,
        node_type,
        department,
        parent_id,
        agent_key,
        kpi_targets: JSON.stringify(kpis),
        health_status: "gray",
        is_active: true,
        sort_order: sort,
      })
      .returning("id");
    return row.id;
  }

  // ── Look up existing parent nodes ──
  const cmoId = await findNode("CMO Agent");
  const salesDirId = await findNode("Sales Director Agent");
  const csCoachId = await findNode("CS Coach Agent");
  const intelDirId = await findNode("Intelligence Director Agent");
  const productDirId = await findNode("Product Director Agent");
  const opsDirId = await findNode("Operations Director Agent");
  const daveId = await findNode("CTO");
  const alloroId = await findNode("Alloro Inc.");

  // ══════════════════════════════════════════════
  // Content + AEO department (parent: CMO Agent)
  // ══════════════════════════════════════════════
  if (cmoId) {
    await insertIfMissing(
      "Content Performance Agent", null, "agent", "Content + AEO", cmoId,
      "contentPerformance",
      [{ name: "Content ROI tracked", target: "100%" }, { name: "Attribution reports per week", target: "1" }],
      14,
    );
    await insertIfMissing(
      "Programmatic SEO Agent", null, "agent", "Content + AEO", cmoId,
      "programmaticSEO",
      [{ name: "Pages generated per week", target: "20" }, { name: "Indexed pages growth", target: "10%/mo" }],
      15,
    );
    await insertIfMissing(
      "AEO Monitor Agent", null, "agent", "Content + AEO", cmoId,
      "aeoMonitor",
      [{ name: "AI citation checks per week", target: "7" }, { name: "Citation gaps flagged", target: "all" }],
      16,
    );
    await insertIfMissing(
      "Ghost Writer Agent", null, "agent", "Content + AEO", cmoId,
      "ghostWriter",
      [{ name: "Drafts per week", target: "3" }, { name: "Voice match score", target: "90%+" }],
      17,
    );
    await insertIfMissing(
      "Script Writer Agent", null, "agent", "Content + AEO", cmoId,
      null,
      [{ name: "Scripts per week", target: "2" }],
      18,
    );
    await insertIfMissing(
      "Podcast Scout Agent", null, "agent", "Content + AEO", cmoId,
      "podcastScout",
      [{ name: "Podcast opportunities found per week", target: "5" }, { name: "Pitches sent", target: "3" }],
      19,
    );
  }

  // ══════════════════════════════════════════════
  // Sales department (parent: Sales Director Agent)
  // ══════════════════════════════════════════════
  if (salesDirId) {
    await insertIfMissing(
      "Conversion Optimizer Agent", null, "agent", "Sales", salesDirId,
      "conversionOptimizer",
      [{ name: "Funnel conversion rate", target: "5%+" }, { name: "A/B tests per month", target: "2" }],
      24,
    );
    await insertIfMissing(
      "Competitive Scout Agent", null, "agent", "Sales", salesDirId,
      "competitiveScout",
      [{ name: "Competitor changes detected per week", target: "10+" }, { name: "Briefs delivered", target: "weekly" }],
      25,
    );
    await insertIfMissing(
      "Market Signal Scout Agent", null, "agent", "Sales", salesDirId,
      "marketSignalScout",
      [{ name: "Market signals captured per week", target: "20+" }, { name: "Actionable signals", target: "5+" }],
      26,
    );
  }

  // ══════════════════════════════════════════════
  // Client Success department (parent: CS Coach Agent)
  // ══════════════════════════════════════════════
  if (csCoachId) {
    await insertIfMissing(
      "Client Monitor Agent", null, "agent", "Client Success", csCoachId,
      "clientMonitor",
      [{ name: "Clients monitored", target: "100%" }, { name: "Churn risk flags per week", target: "<3" }],
      34,
    );
    await insertIfMissing(
      "CS Expander Agent", null, "agent", "Client Success", csCoachId,
      "csExpander",
      [{ name: "Expansion opportunities identified per month", target: "5" }],
      35,
    );
    await insertIfMissing(
      "CS Agent", null, "agent", "Client Success", csCoachId,
      "csAgent",
      [{ name: "Response time", target: "<4h" }, { name: "Resolution rate", target: "95%+" }],
      36,
    );
    await insertIfMissing(
      "Week 1 Win Agent", null, "agent", "Client Success", csCoachId,
      "week1Win",
      [{ name: "Win delivered within 7 days", target: "100%" }, { name: "TTFV", target: "<48h" }],
      37,
    );
    await insertIfMissing(
      "Trial Email Agent", null, "agent", "Client Success", csCoachId,
      "trialEmail",
      [{ name: "Trial emails sent on schedule", target: "100%" }, { name: "Open rate", target: "40%+" }],
      38,
    );
  }

  // ══════════════════════════════════════════════
  // Intelligence department (parent: Intelligence Director)
  // ══════════════════════════════════════════════
  if (intelDirId) {
    await insertIfMissing(
      "Intelligence Agent", null, "agent", "Intelligence", intelDirId,
      "intelligenceAgent",
      [{ name: "Findings per week", target: "10+" }, { name: "Accuracy rate", target: "95%+" }],
      44,
    );
    await insertIfMissing(
      "Morning Briefing Agent", null, "agent", "Intelligence", intelDirId,
      "morningBriefing",
      [{ name: "Briefings delivered", target: "daily" }, { name: "Signal coverage", target: "100%" }],
      45,
    );
    await insertIfMissing(
      "Learning Agent", null, "agent", "Intelligence", intelDirId,
      "learningAgent",
      [{ name: "Heuristics updated per month", target: "5+" }, { name: "Compound rate improvement", target: "weekly" }],
      46,
    );
    await insertIfMissing(
      "Technology Horizon Agent", null, "agent", "Intelligence", intelDirId,
      "technologyHorizon",
      [{ name: "Technologies scanned per week", target: "20+" }, { name: "Implementation briefs", target: "monthly" }],
      47,
    );
    await insertIfMissing(
      "Strategic Intelligence Agent", null, "agent", "Intelligence", intelDirId,
      "strategicIntelligence",
      [{ name: "Strategic insights per month", target: "4" }, { name: "Decision support docs", target: "2/mo" }],
      48,
    );
    await insertIfMissing(
      "Dreamweaver Agent", null, "agent", "Intelligence", intelDirId,
      null,
      [{ name: "Vision documents per quarter", target: "1" }],
      49,
    );
  }

  // ══════════════════════════════════════════════
  // Product department (parent: Product Director Agent)
  // ══════════════════════════════════════════════
  if (productDirId) {
    await insertIfMissing(
      "Website Copy Agent", null, "agent", "Product", productDirId,
      null,
      [{ name: "Copy iterations per project", target: "3" }, { name: "Conversion lift", target: "measurable" }],
      53,
    );
    await insertIfMissing(
      "PatientPath Research Agent", null, "agent", "Product", productDirId,
      null,
      [{ name: "Research reports per project", target: "1" }],
      54,
    );
    await insertIfMissing(
      "PatientPath Copy Agent", null, "agent", "Product", productDirId,
      null,
      [{ name: "Path copy sets delivered", target: "per project" }],
      55,
    );
    await insertIfMissing(
      "Bug Triage Agent", null, "agent", "Product", productDirId,
      "bugTriage",
      [{ name: "Bugs triaged within 24h", target: "100%" }, { name: "P0 response time", target: "<1h" }],
      56,
    );
  }

  // ══════════════════════════════════════════════
  // Operations department (parent: Operations Director)
  // ══════════════════════════════════════════════
  if (opsDirId) {
    await insertIfMissing(
      "Safety Agent", null, "agent", "Operations", opsDirId,
      null,
      [{ name: "Safety checks per deploy", target: "1" }, { name: "Blast radius violations caught", target: "all" }],
      64,
    );
    await insertIfMissing(
      "Nothing Gets Lost Agent", null, "agent", "Operations", opsDirId,
      "nothingGetsLost",
      [{ name: "Orphan documents found per month", target: "report" }, { name: "Index coverage", target: "100%" }],
      65,
    );
    await insertIfMissing(
      "Foundation Operations Agent", null, "agent", "Operations", opsDirId,
      "foundationOperations",
      [{ name: "Grant applications per quarter", target: "2" }, { name: "Sponsor pipeline", target: "active" }],
      66,
    );
    await insertIfMissing(
      "Human Authenticity Agent", null, "agent", "Operations", opsDirId,
      null,
      [{ name: "Content authenticity score", target: "95%+" }, { name: "AI fingerprint detections", target: "all" }],
      67,
    );
  }

  // ══════════════════════════════════════════════
  // Finance + Legal department (NEW, parent: CTO)
  // ══════════════════════════════════════════════
  if (daveId) {
    await insertIfMissing(
      "CFO Agent", null, "agent", "Finance + Legal", daveId,
      "cfoAgent",
      [{ name: "Revenue projections accuracy", target: "90%+" }, { name: "Cost analysis per month", target: "1" }],
      70,
    );
    await insertIfMissing(
      "CLO Agent", null, "agent", "Finance + Legal", daveId,
      "cloAgent",
      [{ name: "Trademark alerts", target: "real-time" }, { name: "Compliance reviews per quarter", target: "4" }],
      71,
    );
    await insertIfMissing(
      "CPA Agent", null, "agent", "Finance + Legal", daveId,
      "cpaPersonal",
      [{ name: "Tax optimization reviews per quarter", target: "1" }, { name: "Deduction tracking", target: "continuous" }],
      72,
    );
    await insertIfMissing(
      "Financial Advisor Agent", null, "agent", "Finance + Legal", daveId,
      "financialAdvisor",
      [{ name: "Portfolio reviews per quarter", target: "1" }, { name: "Financial plans updated", target: "quarterly" }],
      73,
    );
  }

  // ══════════════════════════════════════════════
  // Growth + Amplification department (NEW, parent: Alloro Inc.)
  // ══════════════════════════════════════════════
  if (alloroId) {
    await insertIfMissing(
      "System Conductor Agent", null, "agent", "Growth + Amplification", alloroId,
      null,
      [{ name: "Gate decisions per day", target: "all outputs" }, { name: "PASS/HOLD/ESCALATE ratio", target: "tracked" }],
      80,
    );
    await insertIfMissing(
      "Human Deployment Scout Agent", null, "agent", "Growth + Amplification", alloroId,
      "humanDeploymentScout",
      [{ name: "Hiring recommendations per quarter", target: "as needed" }],
      81,
    );
    await insertIfMissing(
      "Vertical Readiness Scout Agent", null, "agent", "Growth + Amplification", alloroId,
      "verticalReadiness",
      [{ name: "Verticals assessed per quarter", target: "2" }, { name: "Readiness score accuracy", target: "85%+" }],
      82,
    );
    await insertIfMissing(
      "Trend Scout Agent", null, "agent", "Growth + Amplification", alloroId,
      "trendScout",
      [{ name: "Trends identified per month", target: "10+" }, { name: "Actionable trend briefs", target: "2/mo" }],
      83,
    );
    await insertIfMissing(
      "Real Estate Agent", null, "agent", "Growth + Amplification", alloroId,
      "realEstateAgent",
      [{ name: "Location analyses per request", target: "1" }, { name: "Market comps included", target: "5+" }],
      84,
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("dream_team_nodes");
  if (!hasTable) return;

  // Remove only the nodes this migration added
  const roleTitles = [
    // Content + AEO
    "Content Performance Agent",
    "Programmatic SEO Agent",
    "AEO Monitor Agent",
    "Ghost Writer Agent",
    "Script Writer Agent",
    "Podcast Scout Agent",
    // Sales
    "Conversion Optimizer Agent",
    "Competitive Scout Agent",
    "Market Signal Scout Agent",
    // Client Success
    "Client Monitor Agent",
    "CS Expander Agent",
    "CS Agent",
    "Week 1 Win Agent",
    "Trial Email Agent",
    // Intelligence
    "Intelligence Agent",
    "Morning Briefing Agent",
    "Learning Agent",
    "Technology Horizon Agent",
    "Strategic Intelligence Agent",
    "Dreamweaver Agent",
    // Product
    "Website Copy Agent",
    "PatientPath Research Agent",
    "PatientPath Copy Agent",
    "Bug Triage Agent",
    // Operations
    "Safety Agent",
    "Nothing Gets Lost Agent",
    "Foundation Operations Agent",
    "Human Authenticity Agent",
    // Finance + Legal
    "CFO Agent",
    "CLO Agent",
    "CPA Agent",
    "Financial Advisor Agent",
    // Growth + Amplification
    "System Conductor Agent",
    "Human Deployment Scout Agent",
    "Vertical Readiness Scout Agent",
    "Trend Scout Agent",
    "Real Estate Agent",
  ];

  await knex("dream_team_nodes").whereIn("role_title", roleTitles).del();
}
