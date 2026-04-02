/**
 * Readiness Tracker -- "What can we push to production?"
 *
 * One page. One question. For Dave: what's tested and safe to merge.
 * For Corey: what's ready and what's blocking customers.
 *
 * Each feature/area has:
 * - Status: READY (tested, no dependencies) / NEEDS_MIGRATION / NEEDS_ENV / UNTESTED / BROKEN
 * - Last verified: when someone confirmed it works
 * - Dependencies: migrations, env vars, infrastructure
 * - Notes: what to watch for
 *
 * This is not a project management tool. It's a deployment checklist.
 * Dave reads this, pushes what's green, skips what's not.
 */

import { useState } from "react";
import { CheckCircle2, AlertTriangle, Clock, XCircle, ChevronDown, ChevronRight } from "lucide-react";

type FeatureStatus = "ready" | "needs_migration" | "needs_env" | "untested" | "broken";

interface Feature {
  name: string;
  area: string;
  status: FeatureStatus;
  lastVerified: string | null;
  dependencies: string[];
  notes: string;
  files: string[];
}

const STATUS_CONFIG: Record<FeatureStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  ready: { label: "Ready to Push", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  needs_migration: { label: "Needs Migration", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: AlertTriangle },
  needs_env: { label: "Needs Env Var", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: AlertTriangle },
  untested: { label: "Untested", color: "text-gray-500", bg: "bg-gray-50 border-gray-200", icon: Clock },
  broken: { label: "Broken", color: "text-red-700", bg: "bg-red-50 border-red-200", icon: XCircle },
};

// This is the source of truth. Update this as features are verified.
// Dave reads this before any merge to main.
const FEATURES: Feature[] = [
  // ─── CUSTOMER-FACING (what Dr. Pawlak sees) ────────────────
  {
    name: "Warm Design System (CSS foundation)",
    area: "Design",
    status: "ready",
    lastVerified: "2026-04-01",
    dependencies: [],
    notes: "Pure CSS/Tailwind changes. No backend dependencies. Safe to push.",
    files: ["frontend/src/index.css", "frontend/src/lib/animations.ts"],
  },
  {
    name: "Dashboard Warmth (card hierarchy, empty states)",
    area: "Dashboard",
    status: "ready",
    lastVerified: "2026-04-01",
    dependencies: [],
    notes: "Frontend-only changes to DoctorDashboard.tsx and dashboard components.",
    files: ["frontend/src/pages/DoctorDashboard.tsx", "frontend/src/components/dashboard/"],
  },
  {
    name: "Homepage Rebuild (tribe front door)",
    area: "Marketing",
    status: "ready",
    lastVerified: "2026-04-01",
    dependencies: [],
    notes: "Complete rewrite of HomePage.tsx. Foundation section prominent. Identity-first.",
    files: ["frontend/src/pages/marketing/HomePage.tsx"],
  },
  {
    name: "Checkup Trust Fixes (specialty detection, Oz fallback, vocabulary)",
    area: "Checkup",
    status: "ready",
    lastVerified: "2026-04-01",
    dependencies: [],
    notes: "Backend: specialty maps, economics, Oz fallback. Frontend: scanning theater vocab, blur gate reframe, entry screen. Tested against 10 businesses on live sandbox.",
    files: ["src/routes/checkup.ts", "src/services/ozMoment.ts", "frontend/src/pages/checkup/"],
  },
  {
    name: "Research-Backed Economics",
    area: "Checkup",
    status: "ready",
    lastVerified: "2026-04-01",
    dependencies: [],
    notes: "Orthodontist $800->$5,500, dentist $500->$275, chiropractor $400->$65, PT $350->$106. All sourced from 2025 industry data.",
    files: ["src/routes/checkup.ts"],
  },
  {
    name: "Scoring Model Upgrade (trust assessment, new API fields)",
    area: "Checkup",
    status: "ready",
    lastVerified: "2026-04-01",
    dependencies: [],
    notes: "New Google Places API v1 fields in field mask. openingDate scoring. 'People' not 'Prospects'. No-competitor reframing.",
    files: ["src/routes/checkup.ts", "src/controllers/places/feature-utils/fieldMasks.ts"],
  },
  {
    name: "Conversion Fixes (Voss blur gate, no dollar impact, no question field)",
    area: "Checkup",
    status: "ready",
    lastVerified: "2026-04-01",
    dependencies: [],
    notes: "Blur gate reframed as delivery. Dollar impact removed from display. Question field removed. 'No login required' -> 'See your score instantly' across 20 pages.",
    files: ["frontend/src/pages/checkup/ResultsScreen.tsx", "frontend/src/pages/checkup/EntryScreen.tsx", "frontend/src/pages/content/"],
  },
  {
    name: "DentalEMR / Non-Local Business Gate",
    area: "Checkup",
    status: "ready",
    lastVerified: "2026-04-01",
    dependencies: [],
    notes: "Honest message for software companies. Mailto link to Corey.",
    files: ["frontend/src/pages/checkup/ResultsScreen.tsx"],
  },
  {
    name: "ThankYou Page (AAE conditional, warm design)",
    area: "Post-Signup",
    status: "ready",
    lastVerified: "2026-04-01",
    dependencies: [],
    notes: "Booth #835 only shows in conference mode. 'Alloro is watching your market now.'",
    files: ["frontend/src/pages/ThankYou.tsx"],
  },
  {
    name: "Signin Page (warm design)",
    area: "Auth",
    status: "ready",
    lastVerified: "2026-04-01",
    dependencies: [],
    notes: "Warm gradient card, terracotta inputs, btn-primary.",
    files: ["frontend/src/pages/Signin.tsx"],
  },
  // ─── ADMIN-FACING ──────────────────────────────────────────
  {
    name: "VisionaryView Warmth",
    area: "Admin",
    status: "ready",
    lastVerified: "2026-04-01",
    dependencies: [],
    notes: "card-supporting panels, warm headers, terracotta accents.",
    files: ["frontend/src/pages/admin/VisionaryView.tsx"],
  },
  {
    name: "IntegratorView Warmth",
    area: "Admin",
    status: "ready",
    lastVerified: "2026-04-01",
    dependencies: [],
    notes: "card-supporting panels, warm headers.",
    files: ["frontend/src/pages/admin/IntegratorView.tsx"],
  },
  // ─── INFRASTRUCTURE-DEPENDENT ──────────────────────────────
  {
    name: "Dream Team Agent Scheduler",
    area: "Agents",
    status: "needs_migration",
    lastVerified: null,
    dependencies: ["Migration: agent_schedules table", "Redis must be stable", "BullMQ worker running"],
    notes: "26 agents registered on cron schedules. Requires DB migration and Redis.",
    files: ["src/jobs/", "src/workers/"],
  },
  {
    name: "Monday Email System",
    area: "Email",
    status: "needs_env",
    lastVerified: null,
    dependencies: ["MAILGUN_API_KEY", "MAILGUN_DOMAIN", "DNS verification for sending domain"],
    notes: "The product's core retention mechanic. Never tested in production. Requires Mailgun setup.",
    files: ["src/jobs/mondayEmail.ts"],
  },
  {
    name: "CS Pulse Engine (client health cron)",
    area: "Agents",
    status: "needs_migration",
    lastVerified: null,
    dependencies: ["Migration: client_health_status column", "ALLORO_CS_SLACK_WEBHOOK env var"],
    notes: "Daily 7am cron classifies clients GREEN/AMBER/RED.",
    files: ["src/jobs/csPulse.ts"],
  },
  {
    name: "Weekly Digest (Sunday 8pm)",
    area: "Agents",
    status: "needs_migration",
    lastVerified: null,
    dependencies: ["Migration: weekly_metrics table", "Redis", "BullMQ"],
    notes: "Compiles weekly intelligence brief for #alloro-brief.",
    files: ["src/jobs/weeklyDigest.ts"],
  },
  // ─── KNOWN ISSUES ──────────────────────────────────────────
  {
    name: "PMS CSV Upload / Data Parsing",
    area: "Dashboard",
    status: "broken",
    lastVerified: null,
    dependencies: [],
    notes: "Customer-reported: CSVs are confusing, data not parsing correctly. Needs investigation on production data formats vs parser expectations.",
    files: ["src/services/pmsParser.ts", "frontend/src/components/PMS/"],
  },
  {
    name: "Production API Routing",
    area: "Infrastructure",
    status: "broken",
    lastVerified: null,
    dependencies: ["Dave: Apache/nginx config on production EC2"],
    notes: "getalloro.com/api/health returns HTML not JSON. Backend API may not be routing correctly on production.",
    files: [],
  },
];

function FeatureRow({ feature }: { feature: Feature }) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[feature.status];
  const Icon = config.icon;

  return (
    <div className={`rounded-xl border p-4 ${config.bg} transition-all`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 text-left"
      >
        <Icon className={`w-4 h-4 shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${config.color}`}>{feature.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{feature.area}</p>
        </div>
        <span className={`text-xs font-bold uppercase tracking-wider ${config.color} shrink-0`}>
          {config.label}
        </span>
        {expanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
      </button>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-current/10 space-y-2">
          <p className="text-xs text-gray-600">{feature.notes}</p>
          {feature.dependencies.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Dependencies:</p>
              <ul className="mt-1 space-y-0.5">
                {feature.dependencies.map((d, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {feature.lastVerified && (
            <p className="text-xs text-gray-400">Last verified: {feature.lastVerified}</p>
          )}
          {feature.files.length > 0 && (
            <p className="text-xs text-gray-400 font-mono">{feature.files.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReadinessTracker() {
  const ready = FEATURES.filter(f => f.status === "ready");
  const needsWork = FEATURES.filter(f => f.status === "needs_migration" || f.status === "needs_env");
  const broken = FEATURES.filter(f => f.status === "broken");
  const untested = FEATURES.filter(f => f.status === "untested");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#212D40] font-heading">Production Readiness</h1>
        <p className="text-sm text-[#212D40]/50 mt-1">
          What can Dave push to production right now? Green = go. Amber = needs something first. Red = fix before push.
        </p>
        <div className="flex items-center gap-4 mt-4">
          <span className="badge-success">{ready.length} ready</span>
          <span className="badge-warm">{needsWork.length} needs work</span>
          {broken.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
              {broken.length} broken
            </span>
          )}
          {untested.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-gray-50 text-gray-500 border border-gray-200">
              {untested.length} untested
            </span>
          )}
        </div>
      </div>

      {broken.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-red-500">Known Issues (fix first)</p>
          {broken.map(f => <FeatureRow key={f.name} feature={f} />)}
        </div>
      )}

      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-600">Ready to Push ({ready.length})</p>
        {ready.map(f => <FeatureRow key={f.name} feature={f} />)}
      </div>

      {needsWork.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-600">Needs Dependencies ({needsWork.length})</p>
          {needsWork.map(f => <FeatureRow key={f.name} feature={f} />)}
        </div>
      )}

      {untested.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-gray-500">Untested ({untested.length})</p>
          {untested.map(f => <FeatureRow key={f.name} feature={f} />)}
        </div>
      )}

      <div className="text-center pt-4">
        <div className="h-px divider-warm mx-auto max-w-[10rem] mb-4" />
        <p className="text-xs text-[#212D40]/30">
          360 commits on sandbox not on main. This page tracks what's safe to merge.
        </p>
      </div>
    </div>
  );
}
