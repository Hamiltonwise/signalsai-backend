/**
 * Page Manifest for Screenshot Audit
 *
 * Tiered page list. Tier 1 runs every iteration (~40s).
 * Tier 2/3 run on-demand.
 *
 * auth: "none" = public page, "client" = demo login, "admin" = demo login + super admin
 */

export interface PageEntry {
  name: string;
  route: string;
  auth: "none" | "client" | "admin";
  tier: 1 | 2 | 3;
  /** Optional: actions to take before screenshot (hover, click, scroll) */
  setup?: string;
}

export const pages: PageEntry[] = [
  // ═══════════════════════════════════════════════
  // TIER 1 — Priority pages, every iteration
  // ═══════════════════════════════════════════════

  // Client-Facing (Money Pages)
  { name: "marketing-home", route: "/", auth: "none", tier: 1 },
  { name: "checkup-entry", route: "/checkup", auth: "none", tier: 1 },
  { name: "pricing", route: "/pricing", auth: "none", tier: 1 },
  { name: "dashboard", route: "/dashboard", auth: "client", tier: 1 },
  { name: "dashboard-rankings", route: "/dashboard/rankings", auth: "client", tier: 1 },
  { name: "dashboard-referrals", route: "/dashboard/referrals", auth: "client", tier: 1 },

  // Admin (HQ)
  { name: "hq-morning-brief", route: "/admin/action-items", auth: "admin", tier: 1 },
  { name: "hq-organizations", route: "/admin/organization-management", auth: "admin", tier: 1 },
  { name: "hq-dream-team", route: "/admin/minds", auth: "admin", tier: 1 },
  { name: "hq-agent-outputs", route: "/admin/agent-outputs", auth: "admin", tier: 1 },

  // ═══════════════════════════════════════════════
  // TIER 2 — On-demand, detailed pages
  // ═══════════════════════════════════════════════

  // Client-Facing
  { name: "dashboard-progress", route: "/dashboard/progress", auth: "client", tier: 2 },
  { name: "dashboard-reviews", route: "/dashboard/reviews", auth: "client", tier: 2 },
  { name: "dashboard-intelligence", route: "/dashboard/intelligence", auth: "client", tier: 2 },
  { name: "dashboard-settings", route: "/dashboard/settings", auth: "client", tier: 2 },
  { name: "dashboard-website", route: "/dashboard/website", auth: "client", tier: 2 },
  { name: "tasks", route: "/tasks", auth: "client", tier: 2 },
  { name: "settings-integrations", route: "/settings/integrations", auth: "client", tier: 2 },
  { name: "settings-billing", route: "/settings/billing", auth: "client", tier: 2 },
  { name: "settings-users", route: "/settings/users", auth: "client", tier: 2 },
  { name: "settings-account", route: "/settings/account", auth: "client", tier: 2 },

  // Auth Flows
  { name: "signin", route: "/signin", auth: "none", tier: 2 },
  { name: "signup", route: "/signup", auth: "none", tier: 2 },

  // Checkup Flow
  { name: "checkup-scanning", route: "/checkup/scanning", auth: "none", tier: 2 },

  // Admin HQ
  { name: "hq-live-feed", route: "/admin/live-feed", auth: "admin", tier: 2 },
  { name: "hq-revenue", route: "/admin/revenue", auth: "admin", tier: 2 },
  { name: "hq-practice-ranking", route: "/admin/practice-ranking", auth: "admin", tier: 2 },
  { name: "hq-ai-data-insights", route: "/admin/ai-data-insights", auth: "admin", tier: 2 },
  { name: "hq-ai-pms-automation", route: "/admin/ai-pms-automation", auth: "admin", tier: 2 },
  { name: "hq-schedules", route: "/admin/schedules", auth: "admin", tier: 2 },
  { name: "hq-websites", route: "/admin/websites", auth: "admin", tier: 2 },
  { name: "hq-templates", route: "/admin/templates", auth: "admin", tier: 2 },
  { name: "hq-case-studies", route: "/admin/case-studies", auth: "admin", tier: 2 },
  { name: "hq-batch-checkup", route: "/admin/batch-checkup", auth: "admin", tier: 2 },
  { name: "hq-settings", route: "/admin/settings", auth: "admin", tier: 2 },
  { name: "hq-app-logs", route: "/admin/app-logs", auth: "admin", tier: 2 },

  // ═══════════════════════════════════════════════
  // TIER 3 — Marketing/SEO, on-demand only
  // ═══════════════════════════════════════════════

  { name: "product", route: "/product", auth: "none", tier: 3 },
  { name: "how-it-works", route: "/how-it-works", auth: "none", tier: 3 },
  { name: "who-its-for", route: "/who-its-for", auth: "none", tier: 3 },
  { name: "about", route: "/about", auth: "none", tier: 3 },
  { name: "story", route: "/story", auth: "none", tier: 3 },
  { name: "blog", route: "/blog", auth: "none", tier: 3 },
  { name: "foundation", route: "/foundation", auth: "none", tier: 3 },
  { name: "referral-program", route: "/referral-program", auth: "none", tier: 3 },
  { name: "compare", route: "/compare", auth: "none", tier: 3 },
  { name: "terms", route: "/terms", auth: "none", tier: 3 },
  { name: "privacy", route: "/privacy", auth: "none", tier: 3 },
  { name: "demo", route: "/demo", auth: "none", tier: 3 },
  { name: "business-clarity", route: "/business-clarity", auth: "none", tier: 3 },
  { name: "endodontist-marketing", route: "/endodontist-marketing", auth: "none", tier: 3 },
];

export function getPagesByTier(tier: 1 | 2 | 3): PageEntry[] {
  return pages.filter((p) => p.tier <= tier);
}

export function getPagesByAuth(auth: "none" | "client" | "admin"): PageEntry[] {
  return pages.filter((p) => p.auth === auth);
}
