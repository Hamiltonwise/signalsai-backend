import { Router, Request, Response } from "express";
import { db } from "../database/connection";
import { validateSnapshotToken } from "../middleware/snapshotToken";

const router = Router();

// All snapshot routes are read-only, protected by temp token
router.use(validateSnapshotToken);

/**
 * GET /api/snapshot/overview
 *
 * Returns a high-level overview of every admin page's current state.
 * This is the primary endpoint Claude Web should fetch to understand
 * the full app state in a single request.
 */
router.get("/overview", async (_req: Request, res: Response) => {
  try {
    const [
      orgCount,
      activeOrgs,
      recentAgentOutputs,
      schedules,
      morningBriefing,
      dreamTeamNodes,
      websites,
      templates,
      caseStudies,
      recentEvents,
      featureFlags,
    ] = await Promise.all([
      // Total organizations
      db("organizations").count("id as count").first(),
      // Active organizations (not locked out)
      db("organizations")
        .where("subscription_status", "!=", "inactive")
        .count("id as count")
        .first(),
      // Recent agent outputs (last 7 days)
      db("agent_results")
        .where("created_at", ">", db.raw("NOW() - INTERVAL '7 days'"))
        .select(
          db.raw("COUNT(*) as total"),
          db.raw("COUNT(DISTINCT organization_id) as unique_orgs"),
          db.raw("COUNT(DISTINCT agent_key) as unique_agents")
        )
        .first(),
      // Schedules
      db("schedules")
        .select("id", "agent_key", "cron_expression", "is_active", "organization_id")
        .orderBy("is_active", "desc"),
      // Latest morning briefing
      db("morning_briefings").orderBy("briefing_date", "desc").first(),
      // Dream team nodes
      db("dream_team_nodes")
        .select("id", "agent_key", "node_type", "display_name", "department", "health_status", "is_active")
        .orderBy("parent_id", "asc"),
      // Websites
      db("website_builder.projects")
        .select("id", "display_name", "generated_hostname", "custom_domain", "status", "created_at")
        .orderBy("created_at", "desc"),
      // Templates
      db("website_builder.templates")
        .select("id", "name", "status", "created_at")
        .orderBy("created_at", "desc"),
      // Case studies
      db("case_studies")
        .select("id", "practice_name", "specialty", "is_published", "created_at")
        .orderBy("created_at", "desc"),
      // Recent behavioral events (last 24h)
      db("behavioral_events")
        .where("created_at", ">", db.raw("NOW() - INTERVAL '24 hours'"))
        .select(
          db.raw("event_type"),
          db.raw("COUNT(*) as count")
        )
        .groupBy("event_type")
        .orderBy("count", "desc")
        .limit(20),
      // Feature flags
      db("feature_flags")
        .select("flag_name", "is_enabled", "description")
        .orderBy("flag_name"),
    ]);

    res.json({
      snapshot_generated_at: new Date().toISOString(),
      note: "Read-only snapshot for Claude Web design review. No mutations possible.",
      pages: {
        morning_brief: {
          route: "/admin/action-items",
          description: "Landing page. Morning briefing + Route to Unicorn + client health.",
          latest_briefing: morningBriefing || null,
          state: morningBriefing ? "has_data" : "empty",
        },
        organizations: {
          route: "/admin/organization-management",
          description: "All client organizations with tier, status, connections.",
          total: Number(orgCount?.count || 0),
          active: Number(activeOrgs?.count || 0),
          state: Number(orgCount?.count || 0) > 0 ? "has_data" : "empty",
        },
        agent_outputs: {
          route: "/admin/agent-outputs",
          description: "Agent results feed. Shows what the Dream Team produced.",
          last_7_days: {
            total: Number(recentAgentOutputs?.total || 0),
            unique_orgs: Number(recentAgentOutputs?.unique_orgs || 0),
            unique_agents: Number(recentAgentOutputs?.unique_agents || 0),
          },
          state: Number(recentAgentOutputs?.total || 0) > 0 ? "active" : "idle",
        },
        dream_team: {
          route: "/admin/minds",
          description: "AI agent org chart. Departments, roles, health status.",
          nodes: dreamTeamNodes,
          total_agents: dreamTeamNodes.length,
          active_agents: dreamTeamNodes.filter((n: any) => n.is_active).length,
          state: dreamTeamNodes.length > 0 ? "configured" : "empty",
        },
        schedules: {
          route: "/admin/schedules",
          description: "Recurring agent jobs with cron schedules.",
          schedules: schedules,
          total: schedules.length,
          active: schedules.filter((s: any) => s.is_active).length,
          state: schedules.length > 0 ? "configured" : "empty",
        },
        websites: {
          route: "/admin/websites",
          description: "Client website projects with build status.",
          sites: websites,
          total: websites.length,
          live: websites.filter((w: any) => w.status === "LIVE").length,
          state: websites.length > 0 ? "has_data" : "empty",
        },
        templates: {
          route: "/admin/templates",
          description: "Website templates for client sites.",
          templates: templates,
          total: templates.length,
          state: templates.length > 0 ? "has_data" : "empty",
        },
        case_studies: {
          route: "/admin/case-studies",
          description: "Client success stories for marketing.",
          studies: caseStudies,
          total: caseStudies.length,
          published: caseStudies.filter((c: any) => c.is_published).length,
          state: caseStudies.length > 0 ? "has_data" : "empty",
        },
        live_feed: {
          route: "/admin/live-feed",
          description: "Real-time behavioral events stream.",
          last_24h_by_type: recentEvents,
          state: recentEvents.length > 0 ? "active" : "quiet",
        },
        feature_flags: {
          route: "(settings)",
          description: "Feature toggles controlling what's enabled.",
          flags: featureFlags,
          total: featureFlags.length,
          enabled: featureFlags.filter((f: any) => f.is_enabled).length,
        },
      },
    });
  } catch (err: any) {
    console.error("Snapshot overview error:", err.message);
    res.status(500).json({ error: "Snapshot failed", detail: "Internal error" });
  }
});

/**
 * GET /api/snapshot/organizations
 *
 * Full list of organizations with enriched data.
 */
router.get("/organizations", async (_req: Request, res: Response) => {
  try {
    const orgs = await db("organizations")
      .select(
        "organizations.id",
        "organizations.name",
        "organizations.domain",
        "organizations.organization_type",
        "organizations.subscription_tier",
        "organizations.subscription_status",
        "organizations.stripe_customer_id",
        "organizations.created_at",
        "organizations.trial_end_at"
      )
      .orderBy("organizations.created_at", "desc");

    // Get user counts per org
    const userCounts = await db("organization_users")
      .select("organization_id")
      .count("user_id as user_count")
      .groupBy("organization_id");

    const userCountMap = Object.fromEntries(
      userCounts.map((uc: any) => [uc.organization_id, Number(uc.user_count)])
    );

    // Get location counts per org
    const locationCounts = await db("locations")
      .select("organization_id")
      .count("id as location_count")
      .groupBy("organization_id");

    const locationCountMap = Object.fromEntries(
      locationCounts.map((lc: any) => [lc.organization_id, Number(lc.location_count)])
    );

    const enriched = orgs.map((org: any) => ({
      ...org,
      user_count: userCountMap[org.id] || 0,
      location_count: locationCountMap[org.id] || 0,
    }));

    res.json({
      snapshot_generated_at: new Date().toISOString(),
      total: enriched.length,
      organizations: enriched,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Snapshot failed", detail: "Internal error" });
  }
});

/**
 * GET /api/snapshot/revenue
 *
 * Revenue overview with per-org billing data.
 */
router.get("/revenue", async (_req: Request, res: Response) => {
  try {
    const orgs = await db("organizations")
      .select(
        "id",
        "name",
        "subscription_tier",
        "subscription_status",
        "stripe_customer_id",
        "created_at"
      )
      .whereNotNull("stripe_customer_id")
      .orderBy("created_at", "desc");

    res.json({
      snapshot_generated_at: new Date().toISOString(),
      total_orgs_with_billing: orgs.length,
      organizations: orgs,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Snapshot failed", detail: "Internal error" });
  }
});

/**
 * GET /api/snapshot/agent-outputs
 *
 * Recent agent outputs grouped by agent type and organization.
 */
router.get("/agent-outputs", async (_req: Request, res: Response) => {
  try {
    // Summary by agent type
    const byAgent = await db("agent_results")
      .select("agent_key")
      .count("* as total")
      .max("created_at as latest")
      .groupBy("agent_key")
      .orderBy("total", "desc");

    // Summary by org
    const byOrg = await db("agent_results")
      .select("agent_results.organization_id", "organizations.name as org_name")
      .count("agent_results.id as total")
      .max("agent_results.created_at as latest")
      .leftJoin("organizations", "agent_results.organization_id", "organizations.id")
      .groupBy("agent_results.organization_id", "organizations.name")
      .orderBy("total", "desc");

    // Last 10 outputs with details
    const recent = await db("agent_results")
      .select(
        "agent_results.id",
        "agent_results.agent_key",
        "agent_results.organization_id",
        "organizations.name as org_name",
        "agent_results.created_at",
        db.raw("LEFT(agent_results.output::text, 500) as output_preview")
      )
      .leftJoin("organizations", "agent_results.organization_id", "organizations.id")
      .orderBy("agent_results.created_at", "desc")
      .limit(10);

    res.json({
      snapshot_generated_at: new Date().toISOString(),
      by_agent_type: byAgent,
      by_organization: byOrg,
      recent_outputs: recent,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Snapshot failed", detail: "Internal error" });
  }
});

/**
 * GET /api/snapshot/dream-team
 *
 * Full Dream Team hierarchy with health and KPIs.
 */
router.get("/dream-team", async (_req: Request, res: Response) => {
  try {
    const nodes = await db("dream_team_nodes")
      .select("*")
      .orderBy("parent_id", "asc")
      .orderBy("display_name", "asc");

    // Recent resume entries
    const resumes = await db("dream_team_resume_entries")
      .select("node_id", "note", "created_at")
      .orderBy("created_at", "desc")
      .limit(20);

    res.json({
      snapshot_generated_at: new Date().toISOString(),
      nodes: nodes,
      total: nodes.length,
      active: nodes.filter((n: any) => n.is_active).length,
      recent_resume_entries: resumes,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Snapshot failed", detail: "Internal error" });
  }
});

/**
 * GET /api/snapshot/client-health
 *
 * Client health classification and signals.
 */
router.get("/client-health", async (_req: Request, res: Response) => {
  try {
    // Try to get client health data
    const health = await db("organizations")
      .select(
        "organizations.id",
        "organizations.name",
        "organizations.subscription_status",
        "organizations.subscription_tier",
        "organizations.created_at"
      )
      .where("organizations.subscription_status", "!=", "inactive")
      .orderBy("organizations.name");

    // Get last login per org
    const lastLogins = await db("organization_users")
      .select("organization_id")
      .max("users.last_login_at as last_login")
      .leftJoin("users", "organization_users.user_id", "users.id")
      .groupBy("organization_id");

    const loginMap = Object.fromEntries(
      lastLogins.map((l: any) => [l.organization_id, l.last_login])
    );

    const enriched = health.map((org: any) => ({
      ...org,
      last_user_login: loginMap[org.id] || null,
    }));

    res.json({
      snapshot_generated_at: new Date().toISOString(),
      clients: enriched,
      total: enriched.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Snapshot failed", detail: "Internal error" });
  }
});

/**
 * GET /api/snapshot/ui-audit
 *
 * Meta-endpoint: describes each admin page, its component, its data source,
 * and known UX issues. This is what Claude Web should read to write design specs.
 */
router.get("/ui-audit", async (_req: Request, res: Response) => {
  res.json({
    snapshot_generated_at: new Date().toISOString(),
    purpose: "UI audit metadata for Claude Web to write design/build specs in Notion.",
    pages: [
      {
        name: "Morning Brief",
        route: "/admin/action-items",
        component: "MorningBrief.tsx",
        api_endpoints: ["GET /api/admin/signal", "GET /api/admin/client-health", "GET /api/admin/schedules"],
        data_snapshot_endpoint: "GET /api/snapshot/overview (morning_brief section)",
        known_issues: [
          "Hero stat cards show 0/0/0/0 when no morning_briefings row exists",
          "The Signal section may show stale data if agent hasn't run",
          "Client health grid needs visual hierarchy (green/amber/red not differentiated enough)",
        ],
      },
      {
        name: "Live Feed",
        route: "/admin/live-feed",
        component: "LiveFeed.tsx (referenced in sidebar)",
        api_endpoints: ["GET /api/admin/behavioral-events"],
        data_snapshot_endpoint: "GET /api/snapshot/overview (live_feed section)",
        known_issues: [
          "All events look identical, no visual differentiation by event_type",
          "No timestamps visible on event rows",
          "No click-through to event details",
          "Wall of text, needs grouping or timeline view",
        ],
      },
      {
        name: "Revenue",
        route: "/admin/revenue",
        component: "Revenue dashboard",
        api_endpoints: ["Derived from /api/admin/organizations + Stripe data"],
        data_snapshot_endpoint: "GET /api/snapshot/revenue",
        known_issues: [
          "Many rows show $1,000 placeholder values",
          "No chart/graph visualization of MRR trend over time",
          "No distinction between active vs paused billing",
        ],
      },
      {
        name: "Agent Outputs",
        route: "/admin/agent-outputs",
        component: "AgentOutputsList.tsx",
        api_endpoints: [
          "GET /api/admin/agent-outputs",
          "GET /api/admin/agent-outputs/organizations",
          "GET /api/admin/agent-outputs/types",
        ],
        data_snapshot_endpoint: "GET /api/snapshot/agent-outputs",
        known_issues: [
          "Dominated by repeated 'One Endodontics' entries",
          "No grouping by organization or agent type",
          "No summary view, only flat list",
          "Filters exist but not enough visual hierarchy",
        ],
      },
      {
        name: "Referral Intelligence (AI PMS Automation)",
        route: "/admin/ai-pms-automation",
        component: "PMSAutomationCards.tsx",
        api_endpoints: ["GET /api/admin/intelligence"],
        data_snapshot_endpoint: "N/A",
        known_issues: [
          "Card layout works but status badges need clearer meaning",
          "Synced/Issues status could use color coding improvements",
        ],
      },
      {
        name: "Monthly Intelligence (AI Data Insights)",
        route: "/admin/ai-data-insights",
        component: "AIDataInsightsList.tsx",
        api_endpoints: ["GET /api/admin/agent-insights/summary"],
        data_snapshot_endpoint: "N/A",
        known_issues: [
          "Shows 'Intelligence is loading' indefinitely when no data exists",
          "Should show empty state with explanation instead of perpetual loading",
        ],
      },
      {
        name: "Your Market (Practice Ranking)",
        route: "/admin/practice-ranking",
        component: "YourMarket.tsx",
        api_endpoints: ["GET /api/admin/practice-ranking/list", "GET /api/admin/practice-ranking/accounts"],
        data_snapshot_endpoint: "N/A",
        known_issues: [
          "Market cards show rank numbers but small colored dots are hard to read",
          "No explanation of what the colored indicators mean",
        ],
      },
      {
        name: "The Team (Minds)",
        route: "/admin/minds",
        component: "MindsList.tsx",
        api_endpoints: ["GET /api/minds"],
        data_snapshot_endpoint: "GET /api/snapshot/dream-team",
        known_issues: [
          "Org chart is visual but static",
          "No status indicators for active/idle/erroring agents",
          "No click-through to agent detail or recent outputs",
        ],
      },
      {
        name: "Organizations",
        route: "/admin/organization-management",
        component: "OrganizationManagement.tsx",
        api_endpoints: ["GET /api/admin/organizations"],
        data_snapshot_endpoint: "GET /api/snapshot/organizations",
        known_issues: [
          "Many duplicate test entries (One Endodontics repeated)",
          "No visual distinction between real clients and test orgs",
          "Active/Paid filter toggles work but could be more prominent",
        ],
      },
      {
        name: "Websites",
        route: "/admin/websites",
        component: "WebsitesList.tsx",
        api_endpoints: ["GET /api/admin/websites"],
        data_snapshot_endpoint: "GET /api/snapshot/overview (websites section)",
        known_issues: [
          "Status filter works well",
          "Could show preview thumbnails of built sites",
        ],
      },
      {
        name: "Templates",
        route: "/admin/templates",
        component: "TemplatesList.tsx",
        api_endpoints: ["GET /api/admin/templates"],
        data_snapshot_endpoint: "GET /api/snapshot/overview (templates section)",
        known_issues: [
          "Only 2 templates exist, page feels empty",
          "Import tab exists but unclear what formats supported",
        ],
      },
      {
        name: "Case Studies",
        route: "/admin/case-studies",
        component: "CaseStudies.tsx",
        api_endpoints: ["GET /api/admin/case-studies"],
        data_snapshot_endpoint: "GET /api/snapshot/overview (case_studies section)",
        known_issues: [
          "Only 1 entry, page feels abandoned",
          "Table has good columns (practice, timeframe, revenue impact) but needs data",
        ],
      },
      {
        name: "Schedules",
        route: "/admin/schedules",
        component: "Schedules.tsx",
        api_endpoints: ["GET /api/admin/schedules"],
        data_snapshot_endpoint: "GET /api/snapshot/overview (schedules section)",
        known_issues: [
          "Shows 4 scheduled jobs with status",
          "Could show next run time more prominently",
          "Run history should be expandable inline",
        ],
      },
      {
        name: "Settings",
        route: "/admin/settings",
        component: "AdminSettings.tsx",
        api_endpoints: ["GET /api/admin/settings", "PUT /api/admin/settings/:category/:key"],
        data_snapshot_endpoint: "N/A",
        known_issues: [
          "System prompt editor is functional",
          "Webhook configuration exists",
          "Could use sections/tabs for different setting categories",
        ],
      },
      {
        name: "System Health (App Logs)",
        route: "/admin/app-logs",
        component: "AppLogs.tsx",
        api_endpoints: ["GET /api/admin/app-logs"],
        data_snapshot_endpoint: "N/A",
        known_issues: [
          "Terminal-style dark view is dev-facing",
          "Operators need translated, filtered, searchable log view",
          "No log level filtering (info/warn/error)",
        ],
      },
      {
        name: "Batch Analysis",
        route: "/admin/batch-checkup",
        component: "BatchCheckup.tsx",
        api_endpoints: ["POST /api/admin/batch-checkup", "GET /api/admin/batch-checkup/:id"],
        data_snapshot_endpoint: "N/A",
        known_issues: [
          "Input form works (text area + API key selector)",
          "Results table has good structure",
          "Could show historical batch results",
        ],
      },
    ],
    integration_opportunities: {
      slack: "Surface #alloro-brief and #all-alloro messages in Morning Brief or Live Feed",
      gmail: "Show recent client emails in org detail view or CS dashboard",
      calendar: "Show upcoming meetings with prep context in Morning Brief",
      fireflies: "Auto-surface meeting transcripts and action items post-call",
      canva: "Link brand assets in content/template sections",
      notion: "Bidirectional sync for Build Queue and Build State tracking",
    },
  });
});

export default router;
