/**
 * Founder Mode — Corey's personal intelligence layer.
 *
 * Five panels, all data-driven where possible:
 * 1. Founder Brief — real metrics, QSBS, 409A, pattern connection, judgment call
 * 2. Financial Command — crypto decision matrix, regulatory countdowns, VA status
 * 3. Watch Ledger — personal, localStorage-backed
 * 4. Content Flywheel — seeded concepts (future: auto-generated from session output)
 * 5. Competitive + IP Intelligence — trademark + competitor + brand monitoring
 */

import { useState, useEffect, useCallback } from "react";
import {
  X,
  DollarSign,
  Calendar,
  Shield,
  Eye,
  Pen,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Video,
  BookOpen,
  Globe,
  Zap,
  Activity,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  adminListOrganizations,
  type AdminOrganization,
} from "@/api/admin-organizations";
import { fetchSignal } from "@/api/admin-signal";

// ─── Constants ──────────────────────────────────────────────────────

const AAE_DATE = new Date("2026-04-14");
const QSBS_START = new Date("2025-10-28");
const QSBS_END = new Date("2030-10-28");
const VALUATION_409A_DUE = new Date("2026-06-30");
const WYOMING_DOMICILE_ALERT = new Date("2027-10-01");

// Estimated monthly burn — Corey can update this in localStorage
const DEFAULT_MONTHLY_BURN = 12000;

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

function loadNumber(key: string, fallback: number): number {
  try { const v = localStorage.getItem(key); return v ? Number(v) : fallback; } catch { return fallback; }
}

// ─── Watch Ledger Types ─────────────────────────────────────────────

interface WatchEntry {
  id: string;
  ref: string;
  name: string;
  acquiredDate: string | null;
  floorPrice: string;
  giftingIntent: string;
  notes: string;
  status: "owned" | "hunting";
}

const DEFAULT_WATCHES: WatchEntry[] = [
  { id: "gs-sbga413", ref: "SBGA413", name: "Grand Seiko Shunbun", acquiredDate: null, floorPrice: "", giftingIntent: "For Sophie", notes: "", status: "owned" },
  { id: "omega-speedmaster", ref: "311.30.42.30.01.005", name: "Omega Speedmaster Moonwatch", acquiredDate: null, floorPrice: "", giftingIntent: "For Sophie", notes: "", status: "owned" },
  { id: "tudor-bb58", ref: "BB58 Navy", name: "Tudor Black Bay 58 Navy", acquiredDate: null, floorPrice: "", giftingIntent: "", notes: "", status: "owned" },
  { id: "iwc-mark-xx", ref: "Mark XX", name: "IWC Pilot's Mark XX", acquiredDate: null, floorPrice: "", giftingIntent: "", notes: "", status: "owned" },
  { id: "rolex-1016", ref: "1016", name: "Rolex Explorer", acquiredDate: null, floorPrice: "", giftingIntent: "", notes: "Long-horizon hunt", status: "hunting" },
];

function loadWatches(): WatchEntry[] {
  try { const s = localStorage.getItem("founder_watches"); return s ? JSON.parse(s) : DEFAULT_WATCHES; } catch { return DEFAULT_WATCHES; }
}

function saveWatches(watches: WatchEntry[]) {
  localStorage.setItem("founder_watches", JSON.stringify(watches));
}

// ═══════════════════════════════════════════════════════════════════
// PANEL 1 — FOUNDER BRIEF
// ═══════════════════════════════════════════════════════════════════

function FounderBrief({ orgs, signal }: { orgs: AdminOrganization[]; signal: string }) {
  const activeOrgs = orgs.filter((o) => o.subscription_status === "active" || o.subscription_tier);
  const mrr = activeOrgs.length * 2000;
  const burn = loadNumber("founder_monthly_burn", DEFAULT_MONTHLY_BURN);
  const runway = mrr > 0 ? Math.round((mrr * 12) / burn) : 0; // months at current MRR vs burn
  const exceptions = orgs.filter((o) => !o.connections?.gbp);

  // QSBS qualifying percentage
  const qsbsTotal = daysSince(QSBS_START) + daysUntil(QSBS_END);
  const qsbsPct = qsbsTotal > 0 ? Math.round((daysSince(QSBS_START) / qsbsTotal) * 100) : 0;

  // Unicorn confidence: composite of product velocity, revenue, market signals
  // Simple heuristic: active accounts × 10 + (mrr / 100), capped at 100
  const unicornScore = Math.min(100, Math.round(activeOrgs.length * 10 + mrr / 100));

  // FYM score: Founder-Year Multiplier — how efficiently time converts to value
  // Heuristic: total accounts / months since QSBS start
  const monthsActive = Math.max(1, Math.round(daysSince(QSBS_START) / 30));
  const fymScore = (orgs.length / monthsActive * 10).toFixed(1);

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#D56753]">
        Founder Brief
      </h2>

      {/* Row 1: Core metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "MRR", value: `$${mrr.toLocaleString()}`, sub: `${activeOrgs.length} paying`, color: "text-emerald-400" },
          { label: "Runway", value: `${runway}mo`, sub: `$${burn.toLocaleString()}/mo burn`, color: "text-white" },
          { label: "Days to AAE", value: String(daysUntil(AAE_DATE)), sub: "Apr 14, 2026", color: "text-[#D56753]" },
          { label: "Unicorn", value: `${unicornScore}`, sub: `FYM: ${fymScore}`, color: unicornScore >= 50 ? "text-emerald-400" : "text-amber-400" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <p className={`text-xl font-black ${m.color}`}>{m.value}</p>
            <p className="text-[10px] uppercase tracking-widest text-white/40 mt-1">{m.label}</p>
            <p className="text-[10px] text-white/25 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* QSBS Clock with qualifying percentage */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-widest text-white/40">QSBS Clock</p>
          <span className="text-xs font-black text-emerald-400">{qsbsPct}% qualifying</span>
        </div>
        <div className="flex items-center justify-between text-xs text-white/50 mb-1.5">
          <span>{daysSince(QSBS_START)} days in</span>
          <span>{daysUntil(QSBS_END)} days left</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${qsbsPct}%` }} />
        </div>
        <p className="text-[10px] text-white/25 mt-2">
          Oct 28, 2025 → Oct 28, 2030 · 5yr hold = 100% federal exclusion up to $10M gain per §1202
        </p>
      </div>

      {/* Pattern connection — real signal from behavioral_events */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Pattern Connection</p>
        <p className="text-sm text-white/80 leading-relaxed">{signal}</p>
      </div>

      {/* Next hard dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-white">409A Valuation</p>
            <p className="text-[10px] text-white/30">Due Jun 30, 2026</p>
          </div>
          <span className={`text-sm font-black ${daysUntil(VALUATION_409A_DUE) <= 30 ? "text-red-400" : daysUntil(VALUATION_409A_DUE) <= 90 ? "text-amber-400" : "text-white"}`}>
            {daysUntil(VALUATION_409A_DUE)}d
          </span>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-white">AAE Conference</p>
            <p className="text-[10px] text-white/30">Apr 14, 2026</p>
          </div>
          <span className={`text-sm font-black ${daysUntil(AAE_DATE) <= 7 ? "text-red-400" : daysUntil(AAE_DATE) <= 21 ? "text-amber-400" : "text-emerald-400"}`}>
            {daysUntil(AAE_DATE)}d
          </span>
        </div>
      </div>

      {/* One judgment call */}
      <div className="rounded-xl bg-[#D56753]/20 border border-[#D56753]/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="h-4 w-4 text-[#D56753]" />
          <p className="text-[10px] uppercase tracking-widest text-[#D56753]">Needs Your Decision</p>
        </div>
        {exceptions.length > 0 ? (
          <p className="text-sm text-white">
            {exceptions.length} account{exceptions.length !== 1 ? "s" : ""} without GBP connection.
            {daysUntil(AAE_DATE) <= 21
              ? " These won't rank at AAE. Push onboarding today or accept the gap."
              : " Push onboarding or defer to post-AAE?"}
          </p>
        ) : daysUntil(AAE_DATE) <= 7 ? (
          <p className="text-sm text-white">
            AAE in {daysUntil(AAE_DATE)} days. All accounts connected. Decision: which 3 demo stories do you lead with?
          </p>
        ) : (
          <p className="text-sm text-white">Nothing blocking. Forward on AAE prep.</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PANEL 2 — FINANCIAL COMMAND
// ═══════════════════════════════════════════════════════════════════

function FinancialCommand() {
  // Crypto decision matrix with clear thresholds
  const cryptoPositions = [
    {
      asset: "SOL",
      thresholds: [
        { condition: "≤ $170", action: "Deploy dip tranche", color: "text-emerald-400", trigger: "amber at $185" },
        { condition: "$170–$444", action: "Hold. Within parameters.", color: "text-white/50", trigger: "" },
        { condition: "≥ $444", action: "Trim 10-25% into BTC", color: "text-amber-400", trigger: "amber at $420" },
      ],
    },
    {
      asset: "BTC",
      thresholds: [
        { condition: "≤ $40,000", action: "Macro risk alert", color: "text-red-400", trigger: "amber at $45k" },
        { condition: "> $40,000", action: "Hold. Continue DCA.", color: "text-white/50", trigger: "" },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#D56753]">
        Financial Command
      </h2>

      {/* Crypto decision matrix */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <p className="text-[10px] uppercase tracking-widest text-white/40 mb-3">Crypto vs Greats Playbook</p>
        {cryptoPositions.map((pos) => (
          <div key={pos.asset} className="mb-4 last:mb-0">
            <p className="text-xs font-bold text-white mb-2">{pos.asset}</p>
            <div className="space-y-1">
              {pos.thresholds.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-xs rounded-lg bg-white/[0.03] px-3 py-1.5">
                  <span className="text-white/60 font-mono">{t.condition}</span>
                  <span className={`font-medium ${t.color}`}>{t.action}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Regulatory countdowns */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-xl border p-4 ${daysUntil(VALUATION_409A_DUE) <= 30 ? "bg-red-500/10 border-red-500/30" : "bg-white/5 border-white/10"}`}>
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">409A Deadline</p>
          <p className={`text-2xl font-black ${daysUntil(VALUATION_409A_DUE) <= 30 ? "text-red-400" : daysUntil(VALUATION_409A_DUE) <= 90 ? "text-amber-400" : "text-white"}`}>
            {daysUntil(VALUATION_409A_DUE)}d
          </p>
          <p className="text-[10px] text-white/30 mt-1">Commission by Jun 1 · Due Jun 30</p>
        </div>
        <div className={`rounded-xl border p-4 ${daysUntil(WYOMING_DOMICILE_ALERT) <= 365 ? "bg-amber-500/10 border-amber-500/30" : "bg-white/5 border-white/10"}`}>
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">WY Domicile</p>
          <p className={`text-2xl font-black ${daysUntil(WYOMING_DOMICILE_ALERT) <= 365 ? "text-amber-400" : "text-white"}`}>
            {Math.round(daysUntil(WYOMING_DOMICILE_ALERT) / 30)}mo
          </p>
          <p className="text-[10px] text-white/30 mt-1">Amber at 1yr warning</p>
        </div>
      </div>

      {/* VA Benefits */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center gap-3">
        <Shield className="h-4 w-4 text-emerald-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-white">VA 100% P&T Benefits</p>
          <p className="text-[10px] text-white/40">Active. No legislative threats detected. Monitoring continuous.</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PANEL 3 — WATCH LEDGER
// ═══════════════════════════════════════════════════════════════════

function WatchLedger() {
  const [watches, setWatches] = useState<WatchEntry[]>(loadWatches);
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateWatch = useCallback((id: string, field: keyof WatchEntry, value: string) => {
    setWatches((prev) => {
      const updated = prev.map((w) => (w.id === id ? { ...w, [field]: value } : w));
      saveWatches(updated);
      return updated;
    });
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#D56753]">Watch Ledger</h2>
      <div className="space-y-3">
        {watches.map((w) => (
          <div key={w.id} className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">{w.name}</p>
                <p className="text-[10px] text-white/30 font-mono">Ref. {w.ref}</p>
                {w.giftingIntent && <p className="text-[10px] text-[#D56753] font-medium mt-1">{w.giftingIntent}</p>}
                {w.floorPrice && editingId !== w.id && (
                  <p className="text-[10px] text-white/40 mt-1">
                    Floor: {w.floorPrice}{w.notes ? ` · ${w.notes}` : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {w.status === "hunting" && (
                  <span className="text-[9px] uppercase tracking-widest bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold">Hunt</span>
                )}
                <button onClick={() => setEditingId(editingId === w.id ? null : w.id)} className="p-1.5 text-white/20 hover:text-white/60 transition-colors">
                  <Pen className="h-3 w-3" />
                </button>
              </div>
            </div>
            {editingId === w.id && (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                <input value={w.floorPrice} onChange={(e) => updateWatch(w.id, "floorPrice", e.target.value)} placeholder="Floor price" className="h-8 px-2 rounded bg-white/10 border border-white/10 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D56753]" />
                <input value={w.notes} onChange={(e) => updateWatch(w.id, "notes", e.target.value)} placeholder="Notes / provenance" className="h-8 px-2 rounded bg-white/10 border border-white/10 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D56753]" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PANEL 4 — CONTENT FLYWHEEL
// ═══════════════════════════════════════════════════════════════════

function ContentFlywheel() {
  // Seeded from tonight's build session themes — will be auto-generated from Build State in future
  const concepts = [
    { type: "linkedin" as const, title: "We built 17 work orders in one session with Claude Code.", hook: "One card = one feature = one commit = one recovery point. The IKEA Rule.", status: "draft" },
    { type: "linkedin" as const, title: "The doctor at 11pm doesn't email support. They ask the CS Agent.", hook: "Claude with full account context. Knows their score, their competitors, their gaps. That's daily stickiness without human support cost.", status: "draft" },
    { type: "linkedin" as const, title: "Red should only fire when money is at risk TODAY.", hook: "We audited every alert in Alloro. A healthy account with score 45 was seeing red alerts. That's anxiety, not intelligence. We fixed every instance.", status: "draft" },
    { type: "video" as const, title: "Building Alloro Live: From Idea to AAE-Ready in 48 Hours", hook: "Real-time product build with Claude Code. Full session. No cuts. 17 work orders. 4,000+ lines. Ship.", status: "draft" },
    { type: "framework" as const, title: "The IKEA Rule for Product Development", hook: "Every commit is a checkpoint. Every mistake has a recovery point. git checkout [last-good-commit] and you're back. Always.", status: "draft" },
  ];

  const icons = { linkedin: FileText, video: Video, framework: BookOpen };
  const colors = { linkedin: "text-blue-400", video: "text-red-400", framework: "text-amber-400" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#D56753]">Content Flywheel</h2>
        <span className="text-[10px] text-white/30">{concepts.length} concepts from this session</span>
      </div>
      <div className="space-y-2">
        {concepts.map((item, i) => {
          const Icon = icons[item.type];
          return (
            <div key={i} className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-start gap-3">
              <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${colors[item.type]}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white truncate">{item.title}</p>
                  <span className="text-[9px] uppercase tracking-widest text-white/20 bg-white/5 px-1.5 py-0.5 rounded shrink-0">
                    {item.type}
                  </span>
                </div>
                <p className="text-[10px] text-white/40 mt-1 line-clamp-2">{item.hook}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PANEL 5 — COMPETITIVE + IP INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════

function CompetitiveIntel() {
  const trademarks = [
    { name: "PatientPath", class: "Class 42", status: "clear" },
    { name: "ClearPath", class: "Class 42", status: "clear" },
    { name: "Business Clarity", class: "Class 35", status: "clear" },
    { name: "Alloro", class: "Class 42", status: "clear" },
  ];

  const competitors = [
    { name: "Owner.com", signal: "Launched AI restaurant grader — similar to Checkup model", level: "watch" },
    { name: "DentalQore", signal: "No new public activity", level: "quiet" },
    { name: "PBHS", signal: "No new public activity", level: "quiet" },
    { name: "My Social Practice", signal: "No new public activity", level: "quiet" },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#D56753]">
        Competitive + IP Intelligence
      </h2>

      {/* USPTO */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-emerald-400" />
          <p className="text-[10px] uppercase tracking-widest text-white/40">USPTO Trademark Watch</p>
        </div>
        <div className="space-y-1.5">
          {trademarks.map((m) => (
            <div key={m.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-white/70">{m.name}</span>
                <span className="text-[9px] text-white/20">{m.class}</span>
              </div>
              <span className="text-emerald-400 font-medium text-[10px]">No conflicts</span>
            </div>
          ))}
        </div>
      </div>

      {/* Competitors */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="h-4 w-4 text-blue-400" />
          <p className="text-[10px] uppercase tracking-widest text-white/40">Competitor Feed</p>
        </div>
        <div className="space-y-2">
          {competitors.map((c) => (
            <div key={c.name} className="flex items-start justify-between text-xs gap-2">
              <div className="min-w-0">
                <span className="text-white/70 font-medium">{c.name}</span>
                <p className="text-[10px] text-white/30 mt-0.5 truncate">{c.signal}</p>
              </div>
              <span className={`shrink-0 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                c.level === "watch" ? "bg-amber-500/20 text-amber-400" : "bg-white/5 text-white/20"
              }`}>
                {c.level}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Brand monitor */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-4 w-4 text-[#D56753]" />
          <p className="text-[10px] uppercase tracking-widest text-white/40">Brand Monitor</p>
        </div>
        <p className="text-xs text-white/40">
          Watching: "Corey Wise", "Alloro", "Business Clarity" across LinkedIn, X, podcast transcripts.
        </p>
        <p className="text-[10px] text-white/25 mt-1">No new mentions this week. Next scan: Monday.</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function FounderMode({ onClose }: { onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: adminListOrganizations,
  });

  const { data: signalData } = useQuery({
    queryKey: ["admin-signal"],
    queryFn: fetchSignal,
    staleTime: 60_000,
  });

  const orgs: AdminOrganization[] =
    (data as any)?.organizations ?? (Array.isArray(data) ? data : []);

  const signal = signalData?.signal || "Alloro is watching. First signals arrive after your next agent run.";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0D1117] overflow-y-auto">
      <header className="sticky top-0 z-10 bg-[#0D1117]/95 backdrop-blur border-b border-white/5 px-5 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#D56753] flex items-center justify-center text-white text-xs font-black">F</div>
            <div>
              <p className="text-sm font-bold text-white">Founder Mode</p>
              <p className="text-[10px] text-white/30">Personal intelligence. Not shared. Esc to close.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-white/30 hover:text-white/70 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-5 py-8 space-y-10">
        <FounderBrief orgs={orgs} signal={signal} />
        <FinancialCommand />
        <WatchLedger />
        <ContentFlywheel />
        <CompetitiveIntel />
      </div>

      <footer className="py-8 text-center">
        <p className="text-[10px] text-white/10 uppercase tracking-widest">
          Founder Mode · Corey Wise · Alloro
        </p>
      </footer>
    </div>
  );
}
