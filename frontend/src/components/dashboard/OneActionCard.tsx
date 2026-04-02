/**
 * One Action Card — Deterministic Rule Engine
 *
 * Six rules in exact priority order. First match fires. Only one action ever shows.
 * No randomness. No "pick two." The system tells the doctor the single most
 * important thing to do right now.
 *
 * Priority:
 * 1. BILLING FAILURE (Red)
 * 2. GP GONE DARK (Red)
 * 3. RANKING DROP (Amber)
 * 4. REVIEW VELOCITY GAP (Amber)
 * 5. HEALTHY STATE (Default)
 *
 * GBP connection is an optional enhancement, not a gate.
 */

import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CreditCard,
  TrendingDown,
  MessageSquare,
  Star,
  ChevronRight,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

type ActionSeverity = "red" | "amber" | "default";

interface OneAction {
  severity: ActionSeverity;
  title: string;
  detail: string;
  cta: string;
  ctaLink?: string;
  icon: React.ComponentType<{ className?: string }>;
  rule: string; // for debugging / analytics
}

interface ServerCard {
  headline: string;
  body: string;
  action_text: string | null;
  action_url: string | null;
  priority_level: 1 | 2 | 3 | 4 | 5;
}

interface OneActionCardProps {
  // Backend intelligence (overrides local rules when present)
  serverCard?: ServerCard | null;
  // Intelligence mode drives which rules fire
  intelligenceMode?: "referral_based" | "direct_acquisition" | "hybrid";
  // Rule 1: Billing
  billingActive: boolean;
  // Rule 2: GP Gone Dark (skipped for direct_acquisition)
  driftGP?: {
    name: string;
    practice: string;
    monthsConsistent: number;
  } | null;
  // Rule 3: Ranking drop
  rankingDrop?: {
    previousPosition: number;
    currentPosition: number;
    keyword?: string;
  } | null;
  // Rule 4: Review velocity gap
  competitorVelocity?: {
    competitorName: string;
    competitorReviewsThisMonth: number;
    clientReviewsThisMonth: number;
  } | null;
  // Rule 5: GBP connected (optional, no longer gates actions)
  gbpConnected?: boolean;
  // Rule 5: Healthy state fallback
  topCompetitorName?: string;
}

// ─── Rule Engine ────────────────────────────────────────────────────

const PRIORITY_SEVERITY: Record<number, ActionSeverity> = {
  1: "red",
  2: "amber",
  3: "amber",
  4: "default",
  5: "default",
};

const PRIORITY_ICON: Record<number, React.ComponentType<{ className?: string }>> = {
  1: AlertTriangle,
  2: MessageSquare,
  3: TrendingDown,
  4: Star,
  5: Star,
};

function resolveAction(props: OneActionCardProps): OneAction {
  // Backend intelligence overrides local rules (except billing)
  if (props.billingActive && props.serverCard) {
    const sc = props.serverCard;
    return {
      severity: PRIORITY_SEVERITY[sc.priority_level] || "default",
      title: sc.headline,
      detail: sc.body,
      cta: sc.action_text || "",
      ctaLink: sc.action_url || undefined,
      icon: PRIORITY_ICON[sc.priority_level] || Star,
      rule: `server_p${sc.priority_level}`,
    };
  }

  // Rule 1: BILLING FAILURE
  if (!props.billingActive) {
    return {
      severity: "red",
      title: "Your billing has an issue.",
      detail: "Your subscription is not active. Alloro agents are paused until this is resolved.",
      cta: "Fix billing",
      ctaLink: "/settings/billing",
      icon: CreditCard,
      rule: "billing_failure",
    };
  }

  // Rule 2: GP GONE DARK (only for referral_based and hybrid verticals)
  if (props.driftGP && props.intelligenceMode !== "direct_acquisition") {
    const gp = props.driftGP;
    return {
      severity: "red",
      title: `${gp.name} at ${gp.practice} referred 0 cases this month after ${gp.monthsConsistent} months of consistent referrals.`,
      detail: "A top referral source going dark costs you revenue every week it continues. This needs attention today.",
      cta: "See what changed",
      ctaLink: "/dashboard/referrals",
      icon: AlertTriangle,
      rule: "gp_gone_dark",
    };
  }

  // Rule 3: RANKING DROP
  if (props.rankingDrop) {
    const drop = props.rankingDrop;
    const positions = drop.currentPosition - drop.previousPosition;
    if (positions >= 2) {
      return {
        severity: "amber",
        title: `You dropped from #${drop.previousPosition} to #${drop.currentPosition}${drop.keyword ? ` for ${drop.keyword}` : ""} this week.`,
        detail: "A 2+ position drop means a competitor made a move or your profile lost a signal. Check what changed.",
        cta: "See why",
        ctaLink: "/rankings",
        icon: TrendingDown,
        rule: "ranking_drop",
      };
    }
  }

  // Rule 4: REVIEW VELOCITY GAP
  if (props.competitorVelocity) {
    const cv = props.competitorVelocity;
    if (cv.competitorReviewsThisMonth >= 2 * Math.max(cv.clientReviewsThisMonth, 1)) {
      return {
        severity: "amber",
        title: `${cv.competitorName} added ${cv.competitorReviewsThisMonth} reviews this month. You added ${cv.clientReviewsThisMonth}.`,
        detail: "When a competitor collects reviews at 2x your pace, the gap widens every week. Match their pace to hold your position.",
        cta: "Close the gap",
        icon: MessageSquare,
        rule: "review_velocity_gap",
      };
    }
  }

  // Rule 5: DEFAULT ACTION (review request)
  // GBP connection is an optional enhancement, not a gate.
  // Show the same healthy-state action whether or not GBP is connected.

  // Rule 6: HEALTHY STATE
  const compName = props.topCompetitorName || "your nearest competitor";
  return {
    severity: "default",
    title: `Ask your next 3 customers for a Google review.`,
    detail: `Each review closes the gap with ${compName}. Text the link right after their visit, they remember you best in the first hour.`,
    cta: "Send a review request",
    ctaLink: "/dashboard/reviews",
    icon: Star,
    rule: "healthy_state",
  };
}

// ─── Severity Styles ────────────────────────────────────────────────

const SEVERITY_STYLES: Record<ActionSeverity, {
  border: string;
  bg: string;
  iconBg: string;
  iconColor: string;
  ctaColor: string;
}> = {
  red: {
    border: "border-red-200",
    bg: "bg-red-50",
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    ctaColor: "text-red-600",
  },
  amber: {
    border: "border-amber-200",
    bg: "bg-amber-50",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    ctaColor: "text-amber-700",
  },
  default: {
    border: "border-[#D56753]/20",
    bg: "bg-[#D56753]/[0.03]",
    iconBg: "bg-[#D56753]/10",
    iconColor: "text-[#D56753]",
    ctaColor: "text-[#D56753]",
  },
};

// ─── Component ──────────────────────────────────────────────────────

export default function OneActionCard(props: OneActionCardProps) {
  const action = resolveAction(props);
  const styles = SEVERITY_STYLES[action.severity];

  return (
    <div className={`rounded-2xl border ${styles.border} ${styles.bg} p-5 transition-all duration-300 shadow-sm hover:shadow-warm`}>
      <div className="flex items-start gap-4">
        <div className={`shrink-0 w-11 h-11 rounded-xl ${styles.iconBg} flex items-center justify-center`}>
          <action.icon className={`h-5 w-5 ${styles.iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#1A1D23] leading-snug">
            {action.title}
          </p>
          <p className="text-xs text-gray-500 leading-relaxed mt-1.5">
            {action.detail}
          </p>
          {action.ctaLink ? (
            <Link
              to={action.ctaLink}
              className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold ${styles.ctaColor} hover:underline`}
            >
              {action.cta}
              <ChevronRight className="h-3 w-3" />
            </Link>
          ) : (
            <button
              className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold ${styles.ctaColor} hover:underline`}
            >
              {action.cta}
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
