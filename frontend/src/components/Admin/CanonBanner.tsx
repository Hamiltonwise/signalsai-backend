/**
 * Canon Status Banner -- Agent Governance at a Glance
 *
 * Shows at the top of the Dream Team board on every tab.
 * If any critical agent is not PASS, this is in your face.
 * Same philosophy as the kill switch banner: if something
 * needs attention, you see it before anything else.
 */

import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, ShieldQuestion, ChevronRight } from "lucide-react";
import { fetchCanonAgents, type CanonAgent } from "@/api/agent-canon";

// The 5 agents that matter most
const CRITICAL_SLUGS = [
  "client_monitor",
  "monday_email",
  "intelligence_agent",
  "dreamweaver",
  "cs_agent",
];

interface CanonBannerProps {
  onNavigateToCanon: () => void;
}

export function CanonBanner({ onNavigateToCanon }: CanonBannerProps) {
  const { data } = useQuery({
    queryKey: ["canon-agents"],
    queryFn: fetchCanonAgents,
    retry: 1,
    refetchInterval: 30_000,
  });

  const agents = data?.agents || [];
  if (agents.length === 0) return null;

  const critical = agents.filter((a: CanonAgent) => CRITICAL_SLUGS.includes(a.slug));
  const passed = critical.filter((a: CanonAgent) => a.gate_verdict === "PASS");
  const failed = critical.filter((a: CanonAgent) => a.gate_verdict === "FAIL");
  const pending = critical.filter((a: CanonAgent) => a.gate_verdict === "PENDING");

  // Check for expiring soon (within 14 days)
  const expiringSoon = critical.filter((a: CanonAgent) => {
    if (a.gate_verdict !== "PASS" || !a.gate_expires) return false;
    const daysLeft = Math.ceil((new Date(a.gate_expires).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 14 && daysLeft > 0;
  });

  // All critical agents passed and none expiring = green, minimal banner
  if (passed.length === critical.length && expiringSoon.length === 0) {
    return (
      <button
        onClick={onNavigateToCanon}
        className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between mb-6 hover:bg-emerald-100 transition-colors group"
      >
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-4.5 w-4.5 text-emerald-600" />
          <span className="text-sm font-semibold text-emerald-700">
            {passed.length} of {critical.length} critical agents validated
          </span>
          <div className="flex gap-1 ml-1">
            {critical.map((a: CanonAgent) => (
              <div key={a.slug} className="h-2 w-2 rounded-full bg-emerald-500" title={a.display_name} />
            ))}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
      </button>
    );
  }

  // Any failures = red banner
  if (failed.length > 0) {
    return (
      <button
        onClick={onNavigateToCanon}
        className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between mb-6 hover:bg-red-100 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-red-600" />
          <div>
            <span className="text-sm font-semibold text-red-700">
              {failed.length} critical agent{failed.length !== 1 ? "s" : ""} FAILED governance
            </span>
            <span className="text-sm text-red-500 ml-2">
              {failed.map((a: CanonAgent) => a.display_name).join(", ")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex gap-1">
            {critical.map((a: CanonAgent) => (
              <div
                key={a.slug}
                className={`h-2 w-2 rounded-full ${
                  a.gate_verdict === "PASS"
                    ? "bg-emerald-500"
                    : a.gate_verdict === "FAIL"
                      ? "bg-red-500"
                      : "bg-amber-400"
                }`}
                title={`${a.display_name}: ${a.gate_verdict}`}
              />
            ))}
          </div>
          <ChevronRight className="h-4 w-4 text-red-400 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </button>
    );
  }

  // Pending agents = amber banner (observe mode, still learning)
  return (
    <button
      onClick={onNavigateToCanon}
      className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between mb-6 hover:bg-amber-100 transition-colors group"
    >
      <div className="flex items-center gap-3">
        <ShieldQuestion className="h-5 w-5 text-amber-600" />
        <div>
          <span className="text-sm font-semibold text-amber-700">
            {passed.length} of {critical.length} critical agents validated.{" "}
            {pending.length} PENDING.
          </span>
          {pending.length > 0 && (
            <span className="text-sm text-amber-500 ml-2">
              {pending.map((a: CanonAgent) => a.display_name).join(", ")}
              {" "}running in observe mode
            </span>
          )}
          {expiringSoon.length > 0 && (
            <span className="text-sm text-amber-500 ml-2">
              {" "}| {expiringSoon.length} expiring soon
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex gap-1">
          {critical.map((a: CanonAgent) => (
            <div
              key={a.slug}
              className={`h-2 w-2 rounded-full ${
                a.gate_verdict === "PASS"
                  ? "bg-emerald-500"
                  : a.gate_verdict === "FAIL"
                    ? "bg-red-500"
                    : "bg-amber-400"
              }`}
              title={`${a.display_name}: ${a.gate_verdict}`}
            />
          ))}
        </div>
        <ChevronRight className="h-4 w-4 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </button>
  );
}
