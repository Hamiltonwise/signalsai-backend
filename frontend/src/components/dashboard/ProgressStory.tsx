/**
 * Progress Story -- the narrative arc of your business.
 *
 * Replaces static numbers with a story. Instead of "Reviews: 47",
 * you see "Week 6. You started with 31 reviews. You're at 47 now.
 * That's 2.7 per week. At this pace, you pass [competitor] in 8 weeks."
 *
 * The story adapts to tenure, velocity, and competitive context.
 * Early accounts get encouragement. Established accounts get trajectory.
 * Everyone gets something specific to them.
 */

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, ChevronRight } from "lucide-react";

interface ProgressStoryProps {
  /** When this org was created */
  orgCreatedAt: string | null;
  /** Review count at signup (from checkup snapshot) */
  startReviews: number | null;
  /** Current review count */
  currentReviews: number;
  /** Current star rating */
  currentRating: number | null;
  /** Top competitor name */
  competitorName: string | null;
  /** Top competitor review count */
  competitorReviews: number | null;
  /** Navigate to full progress page */
  onViewMore?: () => void;
}

function buildStoryParagraphs(props: ProgressStoryProps): string[] {
  const {
    orgCreatedAt,
    startReviews,
    currentReviews,
    competitorName,
    competitorReviews,
  } = props;

  const paragraphs: string[] = [];

  // Tenure calculation
  const daysActive = orgCreatedAt
    ? Math.max(1, Math.floor((Date.now() - new Date(orgCreatedAt).getTime()) / 86_400_000))
    : null;
  const weeksActive = daysActive ? Math.max(1, Math.floor(daysActive / 7)) : null;

  // Review delta
  const reviewDelta = startReviews != null ? currentReviews - startReviews : null;
  const weeklyRate = reviewDelta != null && weeksActive
    ? Math.round((reviewDelta / weeksActive) * 10) / 10
    : null;

  // Opening: tenure context
  if (weeksActive != null && weeksActive <= 1) {
    paragraphs.push("You just got here. Alloro is building your baseline right now.");
  } else if (weeksActive != null) {
    paragraphs.push(`Week ${weeksActive} of watching your market.`);
  }

  // Middle: the delta story
  if (reviewDelta != null && reviewDelta > 0 && startReviews != null) {
    const velocityNote = weeklyRate != null && weeklyRate > 0
      ? ` That's ${weeklyRate} per week.`
      : "";
    paragraphs.push(
      `You started with ${startReviews} review${startReviews !== 1 ? "s" : ""}. You're at ${currentReviews} now.${velocityNote}`
    );
  } else if (reviewDelta === 0 && startReviews != null) {
    paragraphs.push(
      `You've been at ${currentReviews} review${currentReviews !== 1 ? "s" : ""} since you joined. Each new one has outsized impact at this volume.`
    );
  } else if (currentReviews > 0) {
    paragraphs.push(`${currentReviews} review${currentReviews !== 1 ? "s" : ""} on Google right now.`);
  }

  // Closing: competitive context (the part that creates stakes)
  if (competitorName && competitorReviews != null) {
    const gap = competitorReviews - currentReviews;
    if (gap > 0 && weeklyRate != null && weeklyRate > 0) {
      const weeksToClose = Math.ceil(gap / weeklyRate);
      const timeframe = weeksToClose <= 4
        ? `${weeksToClose} week${weeksToClose !== 1 ? "s" : ""}`
        : weeksToClose <= 52
          ? `${Math.ceil(weeksToClose / 4)} month${Math.ceil(weeksToClose / 4) !== 1 ? "s" : ""}`
          : "over a year";
      paragraphs.push(
        `${competitorName} is ${gap} reviews ahead. At your current pace, you close that gap in ${timeframe}.`
      );
    } else if (gap > 0) {
      paragraphs.push(
        `${competitorName} has ${gap} more review${gap !== 1 ? "s" : ""}. Consistent effort closes this.`
      );
    } else if (gap < 0) {
      const lead = Math.abs(gap);
      if (lead > 100) {
        paragraphs.push(`You lead ${competitorName} by ${lead} reviews. That gap compounds.`);
      } else if (lead > 0) {
        paragraphs.push(`You're ${lead} review${lead !== 1 ? "s" : ""} ahead of ${competitorName}. Keep the pace.`);
      }
    } else {
      paragraphs.push(`Tied with ${competitorName}. Next review tips the balance.`);
    }
  }

  return paragraphs;
}

function getDirection(startReviews: number | null, currentReviews: number): "up" | "down" | "flat" {
  if (startReviews == null) return "flat";
  if (currentReviews > startReviews) return "up";
  if (currentReviews < startReviews) return "down";
  return "flat";
}

export default function ProgressStory(props: ProgressStoryProps) {
  const paragraphs = buildStoryParagraphs(props);
  const direction = getDirection(props.startReviews, props.currentReviews);

  if (paragraphs.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl bg-stone-50/80 border border-stone-200/60 p-5"
    >
      <div className="flex items-center gap-2 mb-3">
        {direction === "up" && <TrendingUp className="w-4 h-4 text-emerald-500" />}
        {direction === "down" && <TrendingDown className="w-4 h-4 text-red-500" />}
        {direction === "flat" && <Minus className="w-4 h-4 text-gray-400" />}
        <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Your Arc</span>
      </div>

      <div className="space-y-2">
        {paragraphs.map((p, i) => (
          <p key={i} className={i === 0 ? "text-sm font-semibold text-[#1A1D23]" : "text-sm text-gray-500"}>
            {p}
          </p>
        ))}
      </div>

      {props.onViewMore && (
        <button
          onClick={props.onViewMore}
          className="mt-3 inline-flex items-center gap-1 text-xs text-[#D56753] font-semibold hover:underline"
        >
          Full progress report <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </motion.div>
  );
}
