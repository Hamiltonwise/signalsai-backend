/**
 * What Alloro Did This Week -- the retention mechanic competitors don't have.
 *
 * Shows a visible list of everything the 47 agents did without the
 * owner lifting a finger. ServiceTitan's stickiness comes from
 * "everything runs through one system." This card creates that feeling.
 *
 * Compact. No interaction needed. Just proof the system is working.
 */

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../api/index";
import { TailorText } from "../TailorText";

// Map event types to human-readable descriptions
function describeEvent(type: string, meta: Record<string, any>): string | null {
  switch (type) {
    case "ranking.scanned":
      return `Scanned ${meta.competitors || "your"} market competitors`;
    case "ranking.position_changed":
      return `Your market position changed (${meta.new_position} of ${meta.total || "?"} competitors)`;
    case "competitor.review_surge":
      return `${meta.competitor || "A competitor"} added ${meta.reviews_added || "several"} reviews`;
    case "gbp.post_published":
      return "Published a Google Business Profile post";
    case "gbp.qa_updated":
      return "Updated Q&A on your Google profile";
    case "patientpath.built":
    case "patientpath.updated":
      return "Updated your website with fresh content";
    case "seo.page_indexed":
      return "Got a new page indexed by Google";
    case "seo.aeo_block_published":
      return "Published content to help you show up in AI search results";
    case "review.draft_generated":
      return "Drafted a response to a new review";
    case "review.response_posted":
      return "Posted a review response on your behalf";
    case "referral.thank_you_sent":
      return `Sent a thank-you note to ${meta.gp_name || "a referral source"}`;
    case "referral.drift_detected":
      return `Detected a change in referral patterns from ${meta.gp_name || "a source"}`;
    case "monday_email.sent":
      return "Sent your Monday intelligence brief";
    case "monday_email.opened":
      return "Monday brief opened";
    case "one_action.completed":
      return `Action completed: ${meta.action || "recommendation followed"}`;
    case "first_win.achieved":
      return meta.detail || "A referral relationship recovered";
    case "nap.corrected":
      return "Corrected a directory listing inconsistency";
    case "welcome.intelligence_sent":
      return "Sent your welcome intelligence report";
    default:
      return null;
  }
}

export default function AlloroActivityCard() {
  const { data } = useQuery({
    queryKey: ["alloro-activity"],
    queryFn: async () => {
      const res = await apiGet({ path: "/user/activity" });
      return res?.success ? res : null;
    },
    staleTime: 10 * 60_000,
  });

  const events: { type: string; properties: Record<string, any>; created_at: string }[] = data?.events || [];
  if (events.length === 0) return null;

  // Deduplicate and take the 5 most interesting
  const described = events
    .map((e) => {
      const props = typeof e.properties === "string" ? JSON.parse(e.properties) : (e.properties || {});
      return { text: describeEvent(e.type, props), time: e.created_at };
    })
    .filter((e): e is { text: string; time: string } => e.text !== null)
    .slice(0, 5);

  if (described.length === 0) return null;

  return (
    <div className="card-supporting">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" style={{ animationDuration: '3s' }} />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D56753]/40">
          <TailorText editKey="dashboard.activity.title" defaultText="What happened this week" as="span" className="" />
        </p>
      </div>
      <div className="space-y-2.5">
        {described.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5" style={{ animation: `fade-in-up 0.3s ease-out ${i * 0.06}s both` }}>
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#D56753]/30 mt-1.5" />
            <p className="text-xs text-[#1A1D23]/60 leading-relaxed">{item.text}</p>
          </div>
        ))}
      </div>
      {events.length > 5 && (
        <p className="text-xs text-[#D56753]/30 mt-4 font-heading italic">
          +{events.length - 5} more this week. You didn't do any of this. They did.
        </p>
      )}
    </div>
  );
}
