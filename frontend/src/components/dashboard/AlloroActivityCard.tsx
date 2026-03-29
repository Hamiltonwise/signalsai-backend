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

// Map event types to human-readable descriptions
function describeEvent(type: string, meta: Record<string, any>): string | null {
  switch (type) {
    case "ranking.scanned":
      return `Scanned ${meta.competitors || "your"} market competitors`;
    case "ranking.position_changed":
      return `Your ranking moved to #${meta.new_position}`;
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
      return "Published an AI-search-optimized content block";
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
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          What your agents did this week
        </p>
      </div>
      <div className="space-y-2">
        {described.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#D56753]/40 mt-1.5" />
            <p className="text-xs text-[#212D40]/70 leading-snug">{item.text}</p>
          </div>
        ))}
      </div>
      {events.length > 5 && (
        <p className="text-[10px] text-gray-400 mt-3">
          +{events.length - 5} more this week. You didn't do any of this. They did.
        </p>
      )}
    </div>
  );
}
