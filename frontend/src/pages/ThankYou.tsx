/**
 * AAE Thank You Page -- /thank-you
 *
 * Post-signup confirmation shown at AAE conference.
 * Designed for 10-second read on a phone in a noisy convention hall.
 * Every element serves one job: make the doctor feel smart for signing
 * up and certain about what happens Monday morning.
 */

import { CheckCircle2, ArrowRight, Calendar } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { isConferenceMode } from "./checkup/conferenceFallback";

/**
 * Generate an .ics calendar event for Monday 7:15 AM local time.
 * One-tap add from the thank you page drives 2-3x activation lift.
 */
function getNextMondayIcs(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
  monday.setHours(7, 15, 0, 0);

  const end = new Date(monday);
  end.setMinutes(end.getMinutes() + 15);

  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(monday)}`,
    `DTEND:${fmt(end)}`,
    "SUMMARY:Your Alloro Briefing Arrives",
    "DESCRIPTION:Check your inbox for your first Business Clarity briefing from Alloro.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function handleAddToCalendar() {
  const ics = getNextMondayIcs();
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "alloro-monday-briefing.ics";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ThankYou() {
  const [searchParams] = useSearchParams();
  const showBooth = isConferenceMode() || searchParams.get("source") === "aae2026";

  return (
    <div className="min-h-dvh bg-[#F7F8FA]">
      {/* Header */}
      <header className="bg-[#212D40] text-white py-4 px-5">
        <div className="mx-auto max-w-lg flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#D56753] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 14H2L8 2Z" fill="white" opacity="0.9" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">alloro</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-5 py-10 space-y-7">
        {/* P0: Confirmation + cognitive closure */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#1A1D23] tracking-tight font-heading">
            You're set.
          </h1>
          <p className="text-sm text-[#1A1D23]/40 mt-2">Alloro is watching your market now.</p>
        </div>

        {/* P0: Monday time anchor, the most important line on the page */}
        <div className="card-primary text-center">
          <p className="text-lg font-bold text-[#1A1D23] leading-snug font-heading">
            Monday at 7:15 AM, your first briefing
            lands in your inbox.
          </p>
          <p className="mt-3 text-sm text-[#1A1D23]/50 leading-relaxed">
            Something specific about your market that you didn't know.
            A name, a number, and one clear action. Before your day starts.
          </p>
        </div>

        {/* P0: Zero action required, breaks the "go set up your account" pattern */}
        <div className="flex items-start gap-3 px-1">
          <div className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-[#D56753]/10 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-[#D56753]" />
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            <span className="font-semibold text-[#1A1D23]">Nothing to set up.</span>{" "}
            No app to download. No password to create.
            We do the work. You see the results Monday.
          </p>
        </div>

        {/* P1: Single proof point, specific, dollar-figured */}
        <div
          className="rounded-2xl px-5 py-4"
          style={{ backgroundColor: "rgba(213, 103, 83, 0.05)" }}
        >
          <p className="text-sm text-[#1A1D23]/70 leading-relaxed">
            Last month, a business owner discovered their top referral
            source had gone quiet for 6 weeks. That single relationship
            was worth $27,000 a year. It was in their Monday briefing.
          </p>
        </div>

        {/* P1: Calendar add, optional micro-action */}
        <div className="text-center">
          <button
            onClick={handleAddToCalendar}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-[#1A1D23] px-5 py-3 shadow-sm hover:bg-slate-50 active:scale-[0.98] transition-all"
          >
            <Calendar className="w-4 h-4 text-[#D56753]" />
            Add Monday 7:15 AM to your calendar
          </button>
        </div>

        {/* Booth card -- only shown at AAE conference */}
        {showBooth && (
          <div className="rounded-2xl bg-[#212D40] p-5 text-center">
            <p className="text-base font-bold text-white">
              Come find us at booth #835.
            </p>
            <p className="text-sm text-white/60 mt-1.5 leading-relaxed">
              We'll show you what Monday looks like.
            </p>
          </div>
        )}

        {/* Dashboard CTA */}
        <div className="text-center">
          <Link
            to="/dashboard"
            className="btn-primary btn-press inline-flex items-center gap-2 text-base px-8 py-4"
          >
            See your dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* P2: Founder touch -- quiet, personal */}
        <p className="text-center text-xs text-[#D56753]/25 leading-relaxed pt-4 font-heading italic">
          See you Monday.
        </p>
      </div>
    </div>
  );
}
