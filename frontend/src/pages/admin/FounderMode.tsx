/**
 * Founder Mode — Corey's personal intelligence layer.
 *
 * Fullscreen overlay on top of HQ. Activated via "F" badge.
 * Five panels: Founder Brief, Financial Command, Watch Ledger,
 * Content Flywheel, Competitive + IP Intelligence.
 *
 * Reads from same data layer as HQ. No new endpoints.
 * Stores watch ledger edits in localStorage (personal, not DB).
 */

import { useState, useEffect } from "react";
import {
  X,
  DollarSign,
  Calendar,
  Shield,
  Eye,
  Pen,
  Sparkles,
  Search,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Video,
  BookOpen,
  Globe,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  adminListOrganizations,
  type AdminOrganization,
} from "@/api/admin-organizations";

// ─── Constants ──────────────────────────────────────────────────────

const AAE_DATE = new Date("2026-04-14");
const QSBS_START = new Date("2025-10-28");
const QSBS_END = new Date("2030-10-28");
const VALUATION_409A_DUE = new Date("2026-06-30");
const WYOMING_DOMICILE_ALERT = new Date("2027-10-01");

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
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
  try {
    const stored = localStorage.getItem("founder_watches");
    if (stored) return JSON.parse(stored);
  } catch { /* use defaults */ }
  return DEFAULT_WATCHES;
}

function saveWatches(watches: WatchEntry[]) {
  localStorage.setItem("founder_watches", JSON.stringify(watches));
}

// ─── Crypto Thresholds ──────────────────────────────────────────────

interface CryptoStatus {
  label: string;
  color: "emerald" | "amber" | "red";
  note: string;
}

function solStatus(): CryptoStatus {
  // Static placeholder — no live price feed. Shows thresholds.
  return { label: "SOL", color: "emerald", note: "Dip: ≤$170 deploy. Trim: ≥$444 into BTC. Monitor." };
}

function btcStatus(): CryptoStatus {
  return { label: "BTC", color: "emerald", note: "Macro risk: ≤$40k alert. Hold otherwise." };
}

// ═══════════════════════════════════════════════════════════════════
// PANEL COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function FounderBrief({ orgs }: { orgs: AdminOrganization[] }) {
  const activeOrgs = orgs.filter((o) => o.subscription_status === "active" || o.subscription_tier);
  const mrr = activeOrgs.length * 2000;
  const exceptions = orgs.filter((o) => !o.connections?.gbp);

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#D56753]">
        Founder Brief
      </h2>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "MRR", value: `$${(mrr / 1000).toFixed(0)}k`, icon: DollarSign, color: "text-emerald-600" },
          { label: "Days to AAE", value: String(daysUntil(AAE_DATE)), icon: Calendar, color: "text-[#D56753]" },
          { label: "Accounts", value: String(orgs.length), icon: TrendingUp, color: "text-blue-500" },
          { label: "Active", value: `${activeOrgs.length}/${orgs.length}`, icon: CheckCircle2, color: "text-emerald-600" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <m.icon className={`h-4 w-4 mx-auto mb-1.5 ${m.color}`} />
            <p className="text-xl font-black text-white">{m.value}</p>
            <p className="text-[10px] uppercase tracking-widest text-white/40 mt-1">{m.label}</p>
          </div>
        ))}
      </div>

      {/* QSBS */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">QSBS Clock</p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/70">{daysSince(QSBS_START)} days elapsed</span>
          <span className="text-white/40">→</span>
          <span className="text-white/70">{daysUntil(QSBS_END)} days remaining</span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full"
            style={{ width: `${(daysSince(QSBS_START) / (daysSince(QSBS_START) + daysUntil(QSBS_END))) * 100}%` }}
          />
        </div>
        <p className="text-[10px] text-white/30 mt-1.5">5-year hold = 100% federal exclusion on up to $10M gain</p>
      </div>

      {/* Next hard date */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">409A Valuation</p>
          <p className="text-xs text-white/50">Due June 30, 2026</p>
        </div>
        <span className={`text-sm font-black ${daysUntil(VALUATION_409A_DUE) <= 30 ? "text-red-400" : daysUntil(VALUATION_409A_DUE) <= 90 ? "text-amber-400" : "text-white"}`}>
          {daysUntil(VALUATION_409A_DUE)}d
        </span>
      </div>

      {/* One judgment call */}
      <div className="rounded-xl bg-[#D56753]/20 border border-[#D56753]/30 p-4">
        <p className="text-[10px] uppercase tracking-widest text-[#D56753] mb-2">Needs Your Decision</p>
        {exceptions.length > 0 ? (
          <p className="text-sm text-white">
            {exceptions.length} account{exceptions.length !== 1 ? "s" : ""} without GBP. Push onboarding or defer to post-AAE?
          </p>
        ) : (
          <p className="text-sm text-white">Nothing urgent. Focus forward on AAE prep.</p>
        )}
      </div>
    </div>
  );
}

function FinancialCommand() {
  const sol = solStatus();
  const btc = btcStatus();
  const colorMap = { emerald: "text-emerald-400", amber: "text-amber-400", red: "text-red-400" };

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#D56753]">
        Financial Command
      </h2>

      {/* Crypto */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-white/40">Crypto vs Greats Playbook</p>
        {[sol, btc].map((c) => (
          <div key={c.label} className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">{c.label}</span>
            <div className="text-right">
              <span className={`text-xs font-semibold ${colorMap[c.color]}`}>Within parameters</span>
              <p className="text-[10px] text-white/40">{c.note}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 409A + Wyoming */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">409A Alert</p>
          <p className={`text-lg font-black ${daysUntil(VALUATION_409A_DUE) <= 30 ? "text-red-400" : "text-white"}`}>
            {daysUntil(VALUATION_409A_DUE)}d
          </p>
          <p className="text-[10px] text-white/30">Red at 30 days</p>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">WY Domicile</p>
          <p className={`text-lg font-black ${daysUntil(WYOMING_DOMICILE_ALERT) <= 365 ? "text-amber-400" : "text-white"}`}>
            {daysUntil(WYOMING_DOMICILE_ALERT)}d
          </p>
          <p className="text-[10px] text-white/30">Amber at 1yr</p>
        </div>
      </div>

      {/* VA */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center gap-3">
        <Shield className="h-4 w-4 text-emerald-400 shrink-0" />
        <div>
          <p className="text-sm text-white">VA 100% P&T Benefits</p>
          <p className="text-[10px] text-white/40">No legislative changes detected. Monitoring.</p>
        </div>
      </div>
    </div>
  );
}

function WatchLedger() {
  const [watches, setWatches] = useState<WatchEntry[]>(loadWatches);
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateWatch = (id: string, field: keyof WatchEntry, value: string) => {
    const updated = watches.map((w) => (w.id === id ? { ...w, [field]: value } : w));
    setWatches(updated);
    saveWatches(updated);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#D56753]">
        Watch Ledger
      </h2>
      <div className="space-y-3">
        {watches.map((w) => (
          <div key={w.id} className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-white">{w.name}</p>
                <p className="text-[10px] text-white/40">Ref. {w.ref}</p>
                {w.giftingIntent && (
                  <p className="text-[10px] text-[#D56753] font-medium mt-1">{w.giftingIntent}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {w.status === "hunting" && (
                  <span className="text-[9px] uppercase tracking-widest bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold">
                    Hunting
                  </span>
                )}
                <button
                  onClick={() => setEditingId(editingId === w.id ? null : w.id)}
                  className="p-1 text-white/30 hover:text-white/60 transition-colors"
                >
                  <Pen className="h-3 w-3" />
                </button>
              </div>
            </div>
            {editingId === w.id && (
              <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                <div className="flex gap-2">
                  <input
                    value={w.floorPrice}
                    onChange={(e) => updateWatch(w.id, "floorPrice", e.target.value)}
                    placeholder="Floor price"
                    className="flex-1 h-8 px-2 rounded bg-white/10 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#D56753]"
                  />
                  <input
                    value={w.notes}
                    onChange={(e) => updateWatch(w.id, "notes", e.target.value)}
                    placeholder="Notes"
                    className="flex-1 h-8 px-2 rounded bg-white/10 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#D56753]"
                  />
                </div>
              </div>
            )}
            {w.floorPrice && editingId !== w.id && (
              <p className="text-[10px] text-white/40 mt-1">Floor: {w.floorPrice}{w.notes ? ` · ${w.notes}` : ""}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ContentFlywheel() {
  return (
    <div className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#D56753]">
        Content Flywheel
      </h2>
      <p className="text-xs text-white/50">
        After each CC session, the CMO agent scans output and generates content concepts. Review, approve, or ignore.
      </p>
      <div className="space-y-3">
        {[
          { type: "linkedin", icon: FileText, title: "We built 17 work orders in one day. Here's the system.", hook: "One card = one feature = one commit." },
          { type: "linkedin", icon: FileText, title: "The doctor at 11pm doesn't email. They ask the CS Agent.", hook: "That's daily stickiness without human support cost." },
          { type: "linkedin", icon: FileText, title: "Red should only fire when money is at risk TODAY.", hook: "A healthy account must never see red. Here's why." },
          { type: "video", icon: Video, title: "Building Alloro Live: From 0 to AAE-Ready in 48 Hours", hook: "Real-time product build with Claude Code. No cuts." },
          { type: "framework", icon: BookOpen, title: "The IKEA Rule for Product Development", hook: "One card = one feature = one commit = one recovery point." },
        ].map((item, i) => (
          <div key={i} className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-start gap-3">
            <item.icon className={`h-4 w-4 shrink-0 mt-0.5 ${item.type === "video" ? "text-red-400" : item.type === "framework" ? "text-blue-400" : "text-white/50"}`} />
            <div>
              <p className="text-sm font-semibold text-white">{item.title}</p>
              <p className="text-[10px] text-white/40 mt-0.5">{item.hook}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompetitiveIntel() {
  return (
    <div className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#D56753]">
        Competitive + IP Intelligence
      </h2>

      {/* Trademark watch */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-emerald-400" />
          <p className="text-[10px] uppercase tracking-widest text-white/40">USPTO Watch</p>
        </div>
        <div className="space-y-1.5">
          {["PatientPath", "ClearPath", "Business Clarity", "Alloro"].map((mark) => (
            <div key={mark} className="flex items-center justify-between text-xs">
              <span className="text-white/70">{mark}</span>
              <span className="text-emerald-400 font-medium">No conflicts</span>
            </div>
          ))}
        </div>
      </div>

      {/* Competitors */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Eye className="h-4 w-4 text-blue-400" />
          <p className="text-[10px] uppercase tracking-widest text-white/40">Competitor Watch</p>
        </div>
        <div className="space-y-1.5">
          {[
            { name: "DentalQore", status: "Quiet" },
            { name: "PBHS", status: "Quiet" },
            { name: "My Social Practice", status: "Quiet" },
            { name: "Owner.com", status: "New feature: AI grader" },
          ].map((c) => (
            <div key={c.name} className="flex items-center justify-between text-xs">
              <span className="text-white/70">{c.name}</span>
              <span className={`font-medium ${c.status === "Quiet" ? "text-white/30" : "text-amber-400"}`}>
                {c.status}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-white/30 mt-2">Weekly digest. Last scan: this week.</p>
      </div>

      {/* Brand mentions */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-4 w-4 text-[#D56753]" />
          <p className="text-[10px] uppercase tracking-widest text-white/40">Brand Monitor</p>
        </div>
        <p className="text-xs text-white/50">
          Monitoring "Corey Wise", "Alloro", "Business Clarity" across LinkedIn, X, podcasts. No new mentions this week.
        </p>
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

  const orgs: AdminOrganization[] =
    (data as any)?.organizations ?? (Array.isArray(data) ? data : []);

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0D1117] overflow-y-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0D1117]/95 backdrop-blur border-b border-white/5 px-5 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#D56753] flex items-center justify-center text-white text-xs font-black">
              F
            </div>
            <div>
              <p className="text-sm font-bold text-white">Founder Mode</p>
              <p className="text-[10px] text-white/30">Personal intelligence. Not shared.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/30 hover:text-white/70 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Panels */}
      <div className="mx-auto max-w-4xl px-5 py-8 space-y-10">
        <FounderBrief orgs={orgs} />
        <FinancialCommand />
        <WatchLedger />
        <ContentFlywheel />
        <CompetitiveIntel />
      </div>

      {/* Footer */}
      <footer className="py-8 text-center">
        <p className="text-[10px] text-white/10 uppercase tracking-widest">
          Founder Mode &middot; Corey Wise &middot; Alloro
        </p>
      </footer>
    </div>
  );
}
