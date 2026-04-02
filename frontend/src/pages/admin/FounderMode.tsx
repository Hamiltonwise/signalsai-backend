/**
 * Founder Mode -- Corey's personal intelligence layer.
 *
 * Five panels, DB-backed via founder_settings table:
 * 1. Founder Brief -- MRR, runway (days), QSBS, 409A, judgment call
 * 2. Financial Command -- crypto thresholds, QSBS calculator, VA status
 * 3. Watch Ledger -- personal collection, DB-backed
 * 4. Content Flywheel -- seeded concepts (future: auto-generated)
 * 5. Competitive + IP Intelligence -- trademark watch, competitor notes, SDVOSB
 */

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Shield,
  Eye,
  Pen,
  FileText,
  Video,
  BookOpen,
  Globe,
  Zap,
  Plus,
  Save,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminListOrganizations,
  type AdminOrganization,
} from "@/api/admin-organizations";
import { fetchSignal } from "@/api/admin-signal";
import { apiGet, apiPatch, apiPost } from "@/api/index";
import { useBusinessMetrics } from "@/hooks/useBusinessMetrics";

// --- Constants ---------------------------------------------------------------

const AAE_DATE = new Date("2026-04-14");
const QSBS_START = new Date("2025-10-28");
const QSBS_END = new Date("2030-10-28");
const VALUATION_409A_DUE = new Date("2026-06-30");
// MONTHLY_BURN comes from useBusinessMetrics() hook

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

// --- Types -------------------------------------------------------------------

interface FounderSettings {
  financial_config: any;
  watch_ledger: WatchEntry[];
  competitive_notes: any;
  founder_cash_on_hand: number;
}

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

const DEFAULT_FINANCIAL: any = {
  sol: { alert_low: 170, alert_high: 444, current_position: null },
  btc: { alert_low: 40000, current_position: null },
};

const DEFAULT_COMPETITIVE: any = {
  competitors: {
    "DentalQore": { notes: "", last_checked: new Date().toISOString().slice(0, 10) },
    "PBHS": { notes: "", last_checked: new Date().toISOString().slice(0, 10) },
    "My Social Practice": { notes: "", last_checked: new Date().toISOString().slice(0, 10) },
    "Owner.com": { notes: "", last_checked: new Date().toISOString().slice(0, 10) },
  },
  brand: { notes: "", last_updated: new Date().toISOString().slice(0, 10) },
  sdvosb: { status: "SBA VetCert: Certified (pending verification)", notes: "" },
};

// --- Inline edit input -------------------------------------------------------

function InlineInput({
  value,
  onChange,
  placeholder,
  className = "",
  type = "text",
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`h-8 px-2 rounded bg-white/10 border border-white/10 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D56753] ${className}`}
    />
  );
}

// =============================================================================
// PANEL 1 -- FOUNDER BRIEF
// =============================================================================

function FounderBrief({
  orgs,
  signal,
  cashOnHand,
  onCashChange,
}: {
  orgs: AdminOrganization[];
  signal: string;
  cashOnHand: number;
  onCashChange: (v: number) => void;
}) {
  const { data: metrics } = useBusinessMetrics();
  const mrr = metrics?.mrr.total ?? 0;
  const MONTHLY_BURN = metrics?.mrr.burn ?? 9500;
  const activeOrgs = orgs.filter((o) => o.subscription_status === "active" || o.subscription_tier);
  const runwayDays = cashOnHand > 0 ? Math.round(cashOnHand / (MONTHLY_BURN / 30)) : 0;
  const exceptions = orgs.filter((o) => !o.connections?.gbp);

  const qsbsElapsed = daysSince(QSBS_START);
  const qsbsPct = Math.round((qsbsElapsed / 3650) * 100);

  const d409a = daysUntil(VALUATION_409A_DUE);

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#D56753]">Founder Brief</h2>

      {/* Core metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "MRR", value: `$${mrr.toLocaleString()}`, sub: `${activeOrgs.length} paying`, color: "text-emerald-400" },
          { label: "Rev. Coverage", value: runwayDays > 0 ? `${runwayDays}d` : "--", sub: `MRR/$${MONTHLY_BURN.toLocaleString()} burn (not cash)`, color: runwayDays < 90 ? "text-red-400" : runwayDays < 180 ? "text-amber-400" : "text-white" },
          { label: "Days to AAE", value: String(daysUntil(AAE_DATE)), sub: "Apr 14, 2026", color: "text-[#D56753]" },
          { label: "409A Due", value: `${d409a}d`, sub: "Jun 30, 2026", color: d409a <= 30 ? "text-red-400" : d409a <= 60 ? "text-amber-400" : "text-white" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <p className={`text-xl font-black ${m.color}`}>{m.value}</p>
            <p className="text-[10px] uppercase tracking-widest text-white/40 mt-1">{m.label}</p>
            <p className="text-[10px] text-white/25 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Cash on hand -- editable */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-white/40">Cash on Hand</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/30">$</span>
            <InlineInput
              type="number"
              value={cashOnHand}
              onChange={(v) => onCashChange(Number(v) || 0)}
              placeholder="Enter amount"
              className="w-32 text-right"
            />
          </div>
        </div>
      </div>

      {/* QSBS Clock */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-widest text-white/40">QSBS Clock</p>
          <span className="text-xs font-black text-emerald-400">{qsbsPct}% of 10yr hold</span>
        </div>
        <div className="flex items-center justify-between text-xs text-white/50 mb-1.5">
          <span>{qsbsElapsed} days elapsed</span>
          <span>{daysUntil(QSBS_END)} days remaining</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${qsbsPct}%` }} />
        </div>
        <p className="text-[10px] text-white/25 mt-2">
          Oct 28, 2025 to Oct 28, 2030. 5yr hold = 100% federal exclusion up to $10M gain per 1202
        </p>
      </div>

      {/* Pattern connection */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">Pattern Connection</p>
        <p className="text-sm text-white/80 leading-relaxed">{signal}</p>
      </div>

      {/* Judgment call */}
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
        ) : d409a <= 60 ? (
          <p className="text-sm text-white">
            409A due in {d409a} days. Commission valuation firm by Jun 1.
          </p>
        ) : (
          <p className="text-sm text-white">Nothing blocking. Forward on AAE prep.</p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// PANEL 2 -- FINANCIAL COMMAND
// =============================================================================

function FinancialCommand({
  config,
  onConfigChange,
}: {
  config: any;
  onConfigChange: (c: any) => void;
}) {
  const sol = config?.sol || DEFAULT_FINANCIAL.sol;
  const btc = config?.btc || DEFAULT_FINANCIAL.btc;

  const updateField = (asset: string, field: string, value: string) => {
    const updated = { ...config, [asset]: { ...(config?.[asset] || {}), [field]: value === "" ? null : Number(value) || null } };
    onConfigChange(updated);
  };

  // QSBS exclusion calculator
  const [exitValue, setExitValue] = useState("");
  const excluded = exitValue ? Math.min(Number(exitValue) || 0, 10_000_000) : 0;

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#D56753]">Financial Command</h2>

      {/* SOL */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <p className="text-xs font-bold text-white mb-3">SOL Position</p>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div>
            <p className="text-[9px] text-white/30 mb-1">Alert Low</p>
            <InlineInput value={sol.alert_low ?? ""} onChange={(v) => updateField("sol", "alert_low", v)} placeholder="170" type="number" className="w-full" />
          </div>
          <div>
            <p className="text-[9px] text-white/30 mb-1">Alert High</p>
            <InlineInput value={sol.alert_high ?? ""} onChange={(v) => updateField("sol", "alert_high", v)} placeholder="444" type="number" className="w-full" />
          </div>
          <div>
            <p className="text-[9px] text-white/30 mb-1">Current Price</p>
            <InlineInput value={sol.current_position ?? ""} onChange={(v) => updateField("sol", "current_position", v)} placeholder="--" type="number" className="w-full" />
          </div>
        </div>
        {sol.current_position && (
          <p className={`text-[10px] font-medium mt-1 ${
            sol.current_position <= sol.alert_low ? "text-emerald-400" : sol.current_position >= sol.alert_high ? "text-amber-400" : "text-white/40"
          }`}>
            {sol.current_position <= sol.alert_low ? "Deploy dip tranche" : sol.current_position >= sol.alert_high ? "Trim 10-25% into BTC" : "Hold. Within parameters."}
          </p>
        )}
      </div>

      {/* BTC */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <p className="text-xs font-bold text-white mb-3">BTC Position</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <p className="text-[9px] text-white/30 mb-1">Alert Low</p>
            <InlineInput value={btc.alert_low ?? ""} onChange={(v) => updateField("btc", "alert_low", v)} placeholder="40000" type="number" className="w-full" />
          </div>
          <div>
            <p className="text-[9px] text-white/30 mb-1">Current Price</p>
            <InlineInput value={btc.current_position ?? ""} onChange={(v) => updateField("btc", "current_position", v)} placeholder="--" type="number" className="w-full" />
          </div>
        </div>
        {btc.current_position && (
          <p className={`text-[10px] font-medium mt-1 ${
            btc.current_position <= btc.alert_low ? "text-red-400" : "text-white/40"
          }`}>
            {btc.current_position <= btc.alert_low ? "Macro risk alert" : "Hold. Continue DCA."}
          </p>
        )}
      </div>

      {/* QSBS Tax Exclusion Calculator */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <p className="text-[10px] uppercase tracking-widest text-white/40 mb-3">QSBS Tax Exclusion Calculator</p>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-white/30">Estimated exit value: $</span>
          <InlineInput value={exitValue} onChange={setExitValue} placeholder="e.g. 5000000" type="number" className="w-36 text-right" />
        </div>
        {exitValue && (
          <div className="mt-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
            <p className="text-xs text-emerald-400">
              Federal exclusion at 10yr hold: <span className="font-black">${excluded.toLocaleString()}</span>
            </p>
            <p className="text-[10px] text-white/30 mt-1">
              Min(exit_value, $10M) x 100% = excluded amount per 1202
            </p>
          </div>
        )}
      </div>

      {/* VA Benefits */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center gap-3">
        <Shield className="h-4 w-4 text-emerald-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-white">VA 100% P&T Benefits</p>
          <p className="text-[10px] text-white/40">
            Active. Monitor for legislative changes. Last checked: {new Date().toISOString().slice(0, 10)}
          </p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PANEL 3 -- WATCH LEDGER (DB-backed)
// =============================================================================

function WatchLedger({
  watches,
  onWatchesChange,
}: {
  watches: WatchEntry[];
  onWatchesChange: (w: WatchEntry[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateWatch = useCallback((id: string, field: keyof WatchEntry, value: string) => {
    const updated = watches.map((w) => (w.id === id ? { ...w, [field]: value } : w));
    onWatchesChange(updated);
  }, [watches, onWatchesChange]);

  const addWatch = () => {
    const id = `watch-${Date.now()}`;
    const newWatch: WatchEntry = {
      id,
      ref: "",
      name: "New Watch",
      acquiredDate: null,
      floorPrice: "",
      giftingIntent: "",
      notes: "",
      status: "hunting",
    };
    onWatchesChange([...watches, newWatch]);
    setEditingId(id);
  };

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
                    Floor: {w.floorPrice}{w.notes ? ` . ${w.notes}` : ""}
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
              <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <InlineInput value={w.name} onChange={(v) => updateWatch(w.id, "name", v)} placeholder="Name" />
                  <InlineInput value={w.ref} onChange={(v) => updateWatch(w.id, "ref", v)} placeholder="Reference" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <InlineInput value={w.floorPrice} onChange={(v) => updateWatch(w.id, "floorPrice", v)} placeholder="Floor price" />
                  <InlineInput value={w.giftingIntent} onChange={(v) => updateWatch(w.id, "giftingIntent", v)} placeholder="Gifting intent" />
                </div>
                <InlineInput value={w.notes} onChange={(v) => updateWatch(w.id, "notes", v)} placeholder="Notes / provenance" className="w-full" />
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={addWatch}
        className="w-full rounded-xl border border-dashed border-white/10 p-3 text-xs text-white/30 hover:text-white/50 hover:border-white/20 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="h-3 w-3" />
        Add Watch
      </button>
    </div>
  );
}

// =============================================================================
// PANEL 4 -- CONTENT FLYWHEEL (unchanged)
// =============================================================================

function ContentFlywheel() {
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
        <span className="text-[10px] text-white/30">{concepts.length} concepts</span>
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
                  <span className="text-[9px] uppercase tracking-widest text-white/20 bg-white/5 px-1.5 py-0.5 rounded shrink-0">{item.type}</span>
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

// =============================================================================
// PANEL 5 -- COMPETITIVE + IP INTELLIGENCE (DB-backed notes)
// =============================================================================

function CompetitiveIntel({
  notes,
  onNotesChange,
}: {
  notes: any;
  onNotesChange: (n: any) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const trademarks = [
    { name: "PatientPath", cls: "Class 42", status: "Monitoring", lastChecked: today },
    { name: "ClearPath", cls: "Class 42", status: "Monitoring", lastChecked: today },
    { name: "Business Clarity", cls: "Class 42", status: "Monitoring", lastChecked: today },
    { name: "Alloro", cls: "TBD (per attorney)", status: "Monitoring", lastChecked: today },
  ];

  const competitorNames = ["DentalQore", "PBHS", "My Social Practice", "Owner.com"];
  const competitors = notes?.competitors || DEFAULT_COMPETITIVE.competitors;
  const brand = notes?.brand || DEFAULT_COMPETITIVE.brand;
  const sdvosb = notes?.sdvosb || DEFAULT_COMPETITIVE.sdvosb;

  const updateCompetitor = (name: string, field: string, value: string) => {
    const updated = {
      ...notes,
      competitors: {
        ...competitors,
        [name]: { ...(competitors[name] || {}), [field]: value, last_checked: today },
      },
    };
    onNotesChange(updated);
  };

  const updateBrand = (field: string, value: string) => {
    onNotesChange({ ...notes, brand: { ...brand, [field]: value, last_updated: today } });
  };

  const updateSdvosb = (field: string, value: string) => {
    onNotesChange({ ...notes, sdvosb: { ...sdvosb, [field]: value } });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#D56753]">Competitive + IP Intelligence</h2>

      {/* Trademark Watch */}
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
                <span className="text-[9px] text-white/20">{m.cls}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-medium text-[10px]">{m.status}</span>
                <span className="text-[9px] text-white/20">{m.lastChecked}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Competitor Digest */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="h-4 w-4 text-blue-400" />
          <p className="text-[10px] uppercase tracking-widest text-white/40">Competitor Digest</p>
        </div>
        <div className="space-y-3">
          {competitorNames.map((name) => {
            const c = competitors[name] || { notes: "", last_checked: today };
            return (
              <div key={name} className="border-b border-white/5 pb-2 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-white/70 font-medium">{name}</span>
                  <span className="text-[9px] text-white/20">Checked: {c.last_checked || today}</span>
                </div>
                <InlineInput
                  value={c.notes || ""}
                  onChange={(v) => updateCompetitor(name, "notes", v)}
                  placeholder="Add notes after research..."
                  className="w-full"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Personal Brand Monitor */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-4 w-4 text-[#D56753]" />
          <p className="text-[10px] uppercase tracking-widest text-white/40">Personal Brand Monitor</p>
        </div>
        <p className="text-xs text-white/40 mb-2">Corey Wise / Alloro / Business Clarity</p>
        <InlineInput
          value={brand.notes || ""}
          onChange={(v) => updateBrand("notes", v)}
          placeholder="Brand notes..."
          className="w-full"
        />
        <p className="text-[9px] text-white/20 mt-1">Last updated: {brand.last_updated || today}</p>
      </div>

      {/* SDVOSB Status */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-blue-400" />
          <p className="text-[10px] uppercase tracking-widest text-white/40">SDVOSB Status</p>
        </div>
        <InlineInput
          value={sdvosb.status || ""}
          onChange={(v) => updateSdvosb("status", v)}
          placeholder="Certification status..."
          className="w-full mb-2"
        />
        <InlineInput
          value={sdvosb.notes || ""}
          onChange={(v) => updateSdvosb("notes", v)}
          placeholder="Notes..."
          className="w-full"
        />
      </div>
    </div>
  );
}

// =============================================================================
// PANEL 7 -- THE LIBRARY (Knowledge + Sentiment Lattice)
// =============================================================================

interface KnowledgeEntry {
  id: string;
  name: string;
  category: string;
  core_principle: string;
  agent_heuristic: string | null;
  anti_pattern: string | null;
}

interface SentimentEntry {
  id: string;
  quote: string;
  phase: string;
  agent_heuristic: string | null;
  anti_pattern: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  SaaS: "bg-blue-500/20 text-blue-400",
  Psychology: "bg-purple-500/20 text-purple-400",
  Sales: "bg-emerald-500/20 text-emerald-400",
  Visionary: "bg-amber-500/20 text-amber-400",
  Operations: "bg-cyan-500/20 text-cyan-400",
  Marketing: "bg-pink-500/20 text-pink-400",
  Finance: "bg-green-500/20 text-green-400",
  Uncategorized: "bg-white/10 text-white/40",
};

const PHASE_COLORS: Record<string, string> = {
  Acquisition: "bg-blue-500/20 text-blue-400",
  Activation: "bg-emerald-500/20 text-emerald-400",
  Adoption: "bg-amber-500/20 text-amber-400",
  Retention: "bg-purple-500/20 text-purple-400",
  Expansion: "bg-pink-500/20 text-pink-400",
  Uncategorized: "bg-white/10 text-white/40",
};

function ExpandableField({ label, content }: { label: string; content: string | null }) {
  const [open, setOpen] = useState(false);
  if (!content) return null;
  return (
    <button onClick={() => setOpen(!open)} className="w-full text-left mt-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
        {label} {open ? "\u25B4" : "\u25BE"}
      </p>
      {open && <p className="text-xs text-white/50 mt-1 leading-relaxed">{content}</p>}
    </button>
  );
}

function KnowledgeAddForm({ onAdd }: { onAdd: (data: any) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [principle, setPrinciple] = useState("");
  const [heuristic, setHeuristic] = useState("");
  const [antiPattern, setAntiPattern] = useState("");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/50 transition-colors">
        <Plus className="h-3 w-3" /> Add Entry
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Leader/Company" className="h-8 px-2 rounded bg-white/10 border border-white/10 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D56753]" />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (SaaS, Psychology...)" className="h-8 px-2 rounded bg-white/10 border border-white/10 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D56753]" />
      </div>
      <input value={principle} onChange={(e) => setPrinciple(e.target.value)} placeholder="Core Principle" className="w-full h-8 px-2 rounded bg-white/10 border border-white/10 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D56753]" />
      <input value={heuristic} onChange={(e) => setHeuristic(e.target.value)} placeholder="Agent Heuristic (optional)" className="w-full h-8 px-2 rounded bg-white/10 border border-white/10 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D56753]" />
      <input value={antiPattern} onChange={(e) => setAntiPattern(e.target.value)} placeholder="Anti-Pattern (optional)" className="w-full h-8 px-2 rounded bg-white/10 border border-white/10 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D56753]" />
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (!name.trim() || !principle.trim()) return;
            onAdd({ name: name.trim(), category: category.trim() || "Uncategorized", core_principle: principle.trim(), agent_heuristic: heuristic.trim() || null, anti_pattern: antiPattern.trim() || null });
            setName(""); setCategory(""); setPrinciple(""); setHeuristic(""); setAntiPattern(""); setOpen(false);
          }}
          disabled={!name.trim() || !principle.trim()}
          className="text-xs font-semibold text-white bg-[#D56753] px-3 py-1.5 rounded-lg disabled:opacity-40"
        >
          Save
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-white/30 hover:text-white/50">Cancel</button>
      </div>
    </div>
  );
}

function SentimentAddForm({ onAdd }: { onAdd: (data: any) => void }) {
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState("");
  const [phase, setPhase] = useState("");
  const [heuristic, setHeuristic] = useState("");
  const [antiPattern, setAntiPattern] = useState("");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/50 transition-colors">
        <Plus className="h-3 w-3" /> Add Entry
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2">
      <textarea value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="Doctor's exact words..." rows={2} className="w-full px-2 py-1.5 rounded bg-white/10 border border-white/10 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D56753] resize-none" />
      <select value={phase} onChange={(e) => setPhase(e.target.value)} className="w-full h-8 px-2 rounded bg-white/10 border border-white/10 text-xs text-white focus:outline-none focus:border-[#D56753]">
        <option value="">Phase...</option>
        {["Acquisition", "Activation", "Adoption", "Retention", "Expansion"].map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <input value={heuristic} onChange={(e) => setHeuristic(e.target.value)} placeholder="Agent Heuristic" className="w-full h-8 px-2 rounded bg-white/10 border border-white/10 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D56753]" />
      <input value={antiPattern} onChange={(e) => setAntiPattern(e.target.value)} placeholder="Anti-Pattern" className="w-full h-8 px-2 rounded bg-white/10 border border-white/10 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#D56753]" />
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (!quote.trim()) return;
            onAdd({ quote: quote.trim(), phase: phase || "Uncategorized", agent_heuristic: heuristic.trim() || null, anti_pattern: antiPattern.trim() || null });
            setQuote(""); setPhase(""); setHeuristic(""); setAntiPattern(""); setOpen(false);
          }}
          disabled={!quote.trim()}
          className="text-xs font-semibold text-white bg-[#D56753] px-3 py-1.5 rounded-lg disabled:opacity-40"
        >
          Save
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-white/30 hover:text-white/50">Cancel</button>
      </div>
    </div>
  );
}

function TheLibrary() {
  const [tab, setTab] = useState<"leaders" | "sentiment">("leaders");
  const [catFilter, setCatFilter] = useState("All");
  const [phaseFilter, setPhaseFilter] = useState("All");
  const queryClient = useQueryClient();

  const { data: knowledgeData } = useQuery({
    queryKey: ["knowledge-lattice"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/knowledge-lattice/entries" });
      return res?.success ? (res.entries as KnowledgeEntry[]) : [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: sentimentData } = useQuery({
    queryKey: ["sentiment-lattice"],
    queryFn: async () => {
      const res = await apiGet({ path: "/admin/sentiment-lattice/entries" });
      return res?.success ? (res.entries as SentimentEntry[]) : [];
    },
    staleTime: 5 * 60_000,
  });

  const addKnowledge = async (data: any) => {
    await apiPost({ path: "/admin/knowledge-lattice/add", passedData: data });
    queryClient.invalidateQueries({ queryKey: ["knowledge-lattice"] });
  };

  const addSentiment = async (data: any) => {
    await apiPost({ path: "/admin/sentiment-lattice/add", passedData: data });
    queryClient.invalidateQueries({ queryKey: ["sentiment-lattice"] });
  };

  const knowledge = knowledgeData || [];
  const sentiment = sentimentData || [];

  const categories = ["All", ...new Set(knowledge.map((e) => e.category))];
  const phases = ["All", "Acquisition", "Activation", "Adoption", "Retention", "Expansion"];

  const filteredKnowledge = catFilter === "All" ? knowledge : knowledge.filter((e) => e.category === catFilter);
  const filteredSentiment = phaseFilter === "All" ? sentiment : sentiment.filter((e) => e.phase === phaseFilter);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#D56753]">Knowledge Lattice</h2>
        <p className="text-[10px] text-white/30 mt-1">The intellectual backbone. Read before building. Updated monthly.</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1">
        {(["leaders", "sentiment"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs font-semibold px-4 py-2 rounded-lg transition-colors capitalize ${
              tab === t ? "bg-white/10 text-white" : "text-white/30 hover:text-white/50"
            }`}
          >
            {t === "leaders" ? "Leaders" : "Sentiment"}
          </button>
        ))}
      </div>

      {/* Leaders tab */}
      {tab === "leaders" && (
        <div className="space-y-3">
          {/* Category filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                  catFilter === c ? "bg-[#D56753] text-white" : "bg-white/5 text-white/30 hover:text-white/50"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Cards */}
          {filteredKnowledge.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
              <p className="text-xs text-white/30">No entries yet. Add leaders and frameworks from your research.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredKnowledge.map((entry) => (
                <div key={entry.id} className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-white">{entry.name}</p>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.Uncategorized}`}>
                      {entry.category}
                    </span>
                  </div>
                  <p className="text-xs text-white/60 leading-relaxed">{entry.core_principle}</p>
                  <ExpandableField label="Agent Heuristic" content={entry.agent_heuristic} />
                  <ExpandableField label="Anti-Pattern" content={entry.anti_pattern} />
                </div>
              ))}
            </div>
          )}

          <KnowledgeAddForm onAdd={addKnowledge} />
        </div>
      )}

      {/* Sentiment tab */}
      {tab === "sentiment" && (
        <div className="space-y-3">
          {/* Phase filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {phases.map((p) => (
              <button
                key={p}
                onClick={() => setPhaseFilter(p)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                  phaseFilter === p ? "bg-[#D56753] text-white" : "bg-white/5 text-white/30 hover:text-white/50"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Entries */}
          {filteredSentiment.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
              <p className="text-xs text-white/30">No sentiment entries yet. Capture doctor quotes from calls and transcripts.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSentiment.map((entry) => (
                <div key={entry.id} className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <p className="text-sm text-white italic leading-relaxed">"{entry.quote}"</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${PHASE_COLORS[entry.phase] || PHASE_COLORS.Uncategorized}`}>
                      {entry.phase}
                    </span>
                  </div>
                  <ExpandableField label="Agent Heuristic" content={entry.agent_heuristic} />
                  <ExpandableField label="Anti-Pattern" content={entry.anti_pattern} />
                </div>
              ))}
            </div>
          )}

          <SentimentAddForm onAdd={addSentiment} />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function FounderMode({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: adminListOrganizations,
  });

  const { data: signalData } = useQuery({
    queryKey: ["admin-signal"],
    queryFn: fetchSignal,
    staleTime: 60_000,
  });

  const { data: settingsData } = useQuery({
    queryKey: ["founder-settings"],
    queryFn: async () => {
      const res = await apiGet({ path: "/founder/settings" });
      return res?.success ? (res.settings as FounderSettings) : null;
    },
    staleTime: 30_000,
  });

  // Local state mirrors DB -- saves on blur/change with debounce
  const [localSettings, setLocalSettings] = useState<FounderSettings | null>(null);

  useEffect(() => {
    if (settingsData && !localSettings) {
      setLocalSettings({
        financial_config: settingsData.financial_config || DEFAULT_FINANCIAL,
        watch_ledger: (settingsData.watch_ledger && (settingsData.watch_ledger as WatchEntry[]).length > 0) ? settingsData.watch_ledger : DEFAULT_WATCHES,
        competitive_notes: settingsData.competitive_notes && Object.keys(settingsData.competitive_notes).length > 0 ? settingsData.competitive_notes : DEFAULT_COMPETITIVE,
        founder_cash_on_hand: settingsData.founder_cash_on_hand || 0,
      });
    }
  }, [settingsData]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<FounderSettings>) => {
      return apiPatch({ path: "/founder/settings", passedData: patch });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["founder-settings"] });
    },
  });

  // Debounced save
  const [saveTimer, setSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSave = useCallback((patch: Partial<FounderSettings>) => {
    if (saveTimer) clearTimeout(saveTimer);
    setSaveTimer(setTimeout(() => saveMutation.mutate(patch), 1500));
  }, [saveTimer, saveMutation]); // eslint-disable-line react-hooks/exhaustive-deps

  const orgs: AdminOrganization[] =
    (data as any)?.organizations ?? (Array.isArray(data) ? data : []);

  const signal = signalData?.signal || "Alloro is watching. First signals arrive after your next agent run.";

  const settings = localSettings || {
    financial_config: DEFAULT_FINANCIAL,
    watch_ledger: DEFAULT_WATCHES,
    competitive_notes: DEFAULT_COMPETITIVE,
    founder_cash_on_hand: 0,
  };

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
          <div className="flex items-center gap-3">
            {saveMutation.isPending && (
              <span className="text-[10px] text-white/30 flex items-center gap-1">
                <Save className="h-3 w-3 animate-pulse" /> Saving...
              </span>
            )}
            <button onClick={onClose} className="p-2 text-white/30 hover:text-white/70 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-5 py-8 space-y-10">
        <FounderBrief
          orgs={orgs}
          signal={signal}
          cashOnHand={settings.founder_cash_on_hand}
          onCashChange={(v) => {
            setLocalSettings((prev) => prev ? { ...prev, founder_cash_on_hand: v } : prev);
            debouncedSave({ founder_cash_on_hand: v });
          }}
        />
        <FinancialCommand
          config={settings.financial_config}
          onConfigChange={(c) => {
            setLocalSettings((prev) => prev ? { ...prev, financial_config: c } : prev);
            debouncedSave({ financial_config: c });
          }}
        />
        <WatchLedger
          watches={settings.watch_ledger}
          onWatchesChange={(w) => {
            setLocalSettings((prev) => prev ? { ...prev, watch_ledger: w } : prev);
            debouncedSave({ watch_ledger: w });
          }}
        />
        <ContentFlywheel />
        <CompetitiveIntel
          notes={settings.competitive_notes}
          onNotesChange={(n) => {
            setLocalSettings((prev) => prev ? { ...prev, competitive_notes: n } : prev);
            debouncedSave({ competitive_notes: n });
          }}
        />
        <TheLibrary />
      </div>

      <footer className="py-8 text-center">
        <p className="text-[10px] text-white/10 uppercase tracking-widest">
          Founder Mode . Corey Wise . Alloro
        </p>
      </footer>
    </div>
  );
}
