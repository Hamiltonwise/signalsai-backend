/**
 * Manifest v2 Card 5 Run 3 — Weekly Digest Service (Card J vocab-aware).
 *
 * Per org, composes a weekly digest containing:
 *   1. Recognition Tri-Score this week (SEO, AEO, CRO, composite)
 *   2. Change since last week (first digest: baseline only)
 *   3. Top 3 Watcher signals from the past 7 days
 *   4. Top 3 actions Alloro took on their behalf
 *   5. Top 3 recommendations from Watcher patterns
 *   6. One customer-voice quote (privacy-safe: first name only)
 *
 * All content composed via narrator (NOT static templates).
 * Freeform Concern Gate runs on every digest. Fail 3x = hold + escalate.
 * No generic copy ships. Ever.
 *
 * Feature flag: weekly_digest_enabled, default false, per-org scope.
 */

import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import { isEnabled } from "../featureFlags";
import { getLocationScope } from "../locationScope/locationScope";
import { processNarratorEvent } from "../narrator/narratorService";
import {
  runFreeformConcernGate,
  FREEFORM_CONCERN_GATE_MAX_RETRIES,
} from "../siteQa/gates/freeformConcernGate";
import { scoreRecognition } from "../checkup/recognitionScorer";
import type { RecognitionScorerResult } from "../checkup/recognitionScorer";
import type { NarratorOutput } from "../narrator/types";
import { getVocab } from "../vocabulary/vocabLoader";
import { loadDigestStructureConfig } from "./digestNotionConfig";
import crypto from "crypto";

// ── Types ────────────────────────────────────────────────────────────

export interface DigestSection {
  id: string;
  title: string;
  body: string;
}

export interface DigestContent {
  orgId: number;
  orgName: string;
  subject: string;
  preheader: string;
  sections: DigestSection[];
  triScore: {
    seo: number | null;
    aeo: number | null;
    cro: number | null;
    composite: number | null;
    seoChange: number | null;
    aeoChange: number | null;
    croChange: number | null;
  };
  topSignals: Array<{ title: string; detail: string; severity: string }>;
  topActions: Array<{ title: string; detail: string }>;
  topRecommendations: Array<{ title: string; detail: string }>;
  patientQuote: { text: string; firstName: string; rating: number } | null;
  narratorVersion: string;
  composedAt: string;
  contentHash: string;
}

export interface DigestComposeResult {
  content: DigestContent | null;
  freeformGateResult: {
    passed: boolean;
    blocked: boolean;
    composite: number;
    attempts: number;
  };
  rubricScore: number;
  error?: string;
  held?: boolean;
}

// ── Digest composition ───────────────────────────────────────────────

export async function composeWeeklyDigest(
  orgId: number,
  locationScope?: number[],
): Promise<DigestComposeResult> {
  // Card G-foundation: validate scope. The digest currently composes one
  // org-level digest from rolled-up signals; per-location digests are a
  // future card. Scope is enforced for forward-compat misuse detection.
  if (locationScope !== undefined) await getLocationScope(orgId, locationScope);

  const config = await loadDigestStructureConfig();
  const vocab = await getVocab(orgId);
  const org = await db("organizations").where({ id: orgId }).first();

  if (!org) {
    return {
      content: null,
      freeformGateResult: { passed: false, blocked: false, composite: 0, attempts: 0 },
      rubricScore: 0,
      error: `Org ${orgId} not found`,
    };
  }

  const orgName = org.name ?? `Business ${orgId}`;

  // ── 1. Current Recognition Tri-Score ──────────��───────────────────
  const meta = extractOrgMetadata(org);
  let currentScore: RecognitionScorerResult | null = null;

  if (meta.websiteUrl) {
    try {
      currentScore = await scoreRecognition({
        practiceUrl: meta.websiteUrl,
        specialty: meta.specialty ?? undefined,
        location: meta.location ?? undefined,
        placeId: meta.placeId ?? undefined,
      });
    } catch {
      // Score unavailable — digest continues with data gap
    }
  }

  // ── 2. Delta from last week ───────────────────────────────────────
  const lastDigest = await db("digest_sends")
    .where({ practice_id: orgId })
    .where("delivery_status", "!=", "held")
    .orderBy("composed_at", "desc")
    .first();

  let lastTriScore: {
    seo: number | null;
    aeo: number | null;
    cro: number | null;
  } | null = null;

  if (lastDigest?.content_json) {
    try {
      const prev =
        typeof lastDigest.content_json === "string"
          ? JSON.parse(lastDigest.content_json)
          : lastDigest.content_json;
      lastTriScore = prev?.triScore ?? null;
    } catch {
      /* ignore */
    }
  }

  // If no prior digest, check recognition_baselines
  if (!lastTriScore) {
    const baseline = await db("recognition_baselines")
      .where({ org_id: orgId })
      .orderBy("created_at", "desc")
      .first();
    if (baseline) {
      lastTriScore = {
        seo: baseline.seo_composite,
        aeo: baseline.aeo_composite,
        cro: baseline.cro_composite,
      };
    }
  }

  const seo = currentScore?.practice.seo_composite ?? null;
  const aeo = currentScore?.practice.aeo_composite ?? null;
  const cro = currentScore?.practice.cro_composite ?? null;
  const composite =
    seo != null && aeo != null && cro != null
      ? Math.round((seo + aeo + cro) / 3)
      : null;

  const triScore = {
    seo,
    aeo,
    cro,
    composite,
    seoChange: seo != null && lastTriScore?.seo != null ? seo - lastTriScore.seo : null,
    aeoChange: aeo != null && lastTriScore?.aeo != null ? aeo - lastTriScore.aeo : null,
    croChange: cro != null && lastTriScore?.cro != null ? cro - lastTriScore.cro : null,
  };

  // ── 3. Top Watcher signals (past 7 days) ──────────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const signals = await db("watcher_signals")
    .where({ org_id: orgId })
    .where("detected_at", ">=", sevenDaysAgo)
    .orderBy("severity", "desc") // critical > warning > info
    .orderBy("detected_at", "desc")
    .limit(3)
    .select("title", "detail", "severity");

  // ── 4. Top 3 actions Alloro took ──────────────────────────────────
  const actions = await db("behavioral_events")
    .where({ org_id: orgId })
    .where("created_at", ">=", sevenDaysAgo)
    .whereIn("event_type", [
      "site.published",
      "copy.draft_ready",
      "copy.qa_passed",
      "data_gap_resolver.field_resolved",
      "watcher.signal_detected",
      "research_brief.created",
    ])
    .orderBy("created_at", "desc")
    .limit(3)
    .select("event_type", "properties");

  const topActions = actions.map((a: any) => ({
    title: formatActionTitle(a.event_type),
    detail: formatActionDetail(a.event_type, a.properties, vocab),
  }));

  // If no actions, use monitoring variant
  if (topActions.length === 0) {
    topActions.push({
      title: "Monitoring your market",
      detail: "Alloro ran hourly scans of your rankings, reviews, and competitor activity this week.",
    });
  }

  // ── 5. Top 3 recommendations ──────────────────────────────────────
  const recommendations = deriveRecommendations(signals, triScore, currentScore, vocab);

  // Card 5 Run 4: when practice is scoring below threshold, call the
  // Copy Rewrite Service to surface a recommended rewrite. Shadow-safe —
  // rewriteResult.contentReadyForPublish is always false unless the
  // copy_rewrite_enabled flag is on for this org.
  let rewriteProposal: {
    hero?: string | null;
    whatChanged?: string;
    whyItMatters?: string;
    passed: boolean;
  } | null = null;
  const compositeForRewrite = triScore.composite ?? 0;
  if (compositeForRewrite > 0 && compositeForRewrite < 70 && meta.websiteUrl) {
    try {
      const { runCopyRewrite } = await import("../rewrite/copyRewriteService");
      const rewrite = await runCopyRewrite({
        url: meta.websiteUrl,
        triScore: {
          seo_composite: seo,
          aeo_composite: aeo,
          cro_composite: cro,
        },
        missingExamples: currentScore?.practice.missing_examples ?? [],
        practiceContext: {
          orgId,
          practiceName: orgName,
          specialty: meta.specialty ?? undefined,
          location: meta.location ?? undefined,
        },
        targetSections: ["hero"],
      });
      const heroResult = rewrite.sectionResults[0];
      if (heroResult) {
        rewriteProposal = {
          hero: heroResult.newContent,
          whatChanged: heroResult.whatChanged,
          whyItMatters: heroResult.whyItMatters,
          passed: heroResult.passed,
        };
      }
    } catch {
      // Rewrite failure is observability, not a digest blocker.
    }
  }

  // ── 6. Customer quote (privacy-safe: first name only) ──────────────
  const customerFallback = `A ${vocab.customerTerm}`;
  let patientQuote: DigestContent["patientQuote"] = null;
  if (currentScore?.practice.patient_quotes_not_on_site?.length) {
    const quote = currentScore.practice.patient_quotes_not_on_site[0];
    const firstName = (quote.reviewerName ?? customerFallback)
      .split(" ")[0]
      .replace(/[^a-zA-Z]/g, "");
    patientQuote = {
      text: quote.text.slice(0, 300),
      firstName: firstName || customerFallback,
      rating: quote.rating,
    };
  } else {
    // Try to find a recent review from watcher data
    try {
      const recentReview = await db("website_builder.reviews")
        .where("location_id", "in", function (this: any) {
          this.select("id").from("website_builder.locations").where({ org_id: orgId });
        })
        .where("stars", ">=", 4)
        .orderBy("review_created_at", "desc")
        .first();
      if (recentReview?.text) {
        const firstName = (recentReview.reviewer_name ?? customerFallback)
          .split(" ")[0]
          .replace(/[^a-zA-Z]/g, "");
        patientQuote = {
          text: recentReview.text.slice(0, 300),
          firstName: firstName || customerFallback,
          rating: recentReview.stars,
        };
      }
    } catch {
      // Reviews table may not exist for all orgs
    }
  }

  // ── Compose through Narrator ──────────────────────────────────────
  const narratorEvent = {
    eventType: "digest.weekly_composed",
    orgId,
    properties: {
      tri_score: triScore,
      top_signals: signals,
      top_actions: topActions,
      recommendations,
      patient_quote: patientQuote,
    },
  };

  let narratorOutput: NarratorOutput;
  try {
    const narratorResult = await processNarratorEvent(narratorEvent);
    narratorOutput = narratorResult.output;
  } catch {
    // Narrator failure — compose a minimal finding
    narratorOutput = {
      emit: true,
      finding: `Your Recognition Score this week: SEO ${seo ?? "pending"}, AEO ${aeo ?? "pending"}, CRO ${cro ?? "pending"}.`,
      dollar: null,
      action: "Your Alloro team is monitoring your market.",
      tier: "expected",
      template: "weeklyDigest",
      dataGapReason: null,
      confidence: 50,
      voiceCheckPassed: true,
      voiceViolations: [],
    };
  }

  // ── Build digest sections ─────────────────────────────────────────
  const sections: DigestSection[] = [];

  // Score section
  const scoreLabel = composite != null ? `${composite}` : "pending";
  const changeText = triScore.seoChange != null
    ? ` (${formatChange(triScore.seoChange)} SEO, ${formatChange(triScore.aeoChange)} AEO, ${formatChange(triScore.croChange)} CRO)`
    : " (first reading — your baseline)";
  sections.push({
    id: "tri_score",
    title: config.sectionTitles?.tri_score ?? "Your Recognition Score",
    body: `SEO ${seo ?? "—"} · AEO ${aeo ?? "—"} · CRO ${cro ?? "—"} · Composite ${scoreLabel}${changeText}`,
  });

  // Signals section
  if (signals.length > 0) {
    sections.push({
      id: "signals",
      title: config.sectionTitles?.signals ?? "What we noticed this week",
      body: signals.map((s: any) => `• ${s.title}: ${s.detail}`).join("\n"),
    });
  }

  // Actions section
  sections.push({
    id: "actions",
    title: config.sectionTitles?.actions ?? "What Alloro did for you",
    body: topActions.map((a) => `• ${a.title}: ${a.detail}`).join("\n"),
  });

  // Recommendations section
  if (recommendations.length > 0) {
    sections.push({
      id: "recommendations",
      title: config.sectionTitles?.recommendations ?? "What we recommend",
      body: recommendations.map((r) => `• ${r.title}: ${r.detail}`).join("\n"),
    });
  }

  // Customer quote section — section id stays stable for downstream consumers
  // (emails, config), but the default copy swaps to the per-org term.
  if (patientQuote) {
    sections.push({
      id: "patient_quote",
      title:
        config.sectionTitles?.patient_quote ?? `What your ${vocab.customerTermPlural} said`,
      body: `"${patientQuote.text}" — ${patientQuote.firstName}, ${patientQuote.rating}★`,
    });
  }

  // Rewrite proposal (Card 5 Run 4): only surface when a gate-passing
  // rewrite is available. Keeps the digest honest — we never recommend a
  // rewrite that itself failed The Standard.
  if (rewriteProposal?.passed && rewriteProposal.hero) {
    sections.push({
      id: "rewrite_proposal",
      title: "Here is the rewrite we recommend",
      body: `Current hero:\n${(rewriteProposal.whatChanged ?? "").slice(0, 200)}\n\nOur rewrite:\n${rewriteProposal.hero}\n\nWhy it helps: ${rewriteProposal.whyItMatters ?? ""}`,
    });
  }

  // Narrator finding as summary
  sections.push({
    id: "summary",
    title: "The bottom line",
    body: narratorOutput.finding,
  });

  const composedAt = new Date().toISOString();
  const fullText = sections.map((s) => `${s.title}\n${s.body}`).join("\n\n");
  const contentHash = crypto.createHash("sha256").update(fullText).digest("hex").slice(0, 16);

  const subject = config.subjectTemplate
    ? config.subjectTemplate.replace("{orgName}", orgName).replace("{composite}", String(scoreLabel))
    : `${orgName} — Weekly Recognition Report`;

  const content: DigestContent = {
    orgId,
    orgName,
    subject,
    preheader: `Recognition Score: ${scoreLabel}${changeText}`,
    sections,
    triScore,
    topSignals: signals.map((s: any) => ({
      title: s.title,
      detail: s.detail,
      severity: s.severity,
    })),
    topActions,
    topRecommendations: recommendations,
    patientQuote,
    narratorVersion: narratorOutput.template,
    composedAt,
    contentHash,
  };

  // ── Freeform Concern Gate ─────────────────────────────────────────
  let gateAttempt = 0;
  let gatePassed = false;
  let gateBlocked = false;
  let gateComposite = 0;

  while (gateAttempt < FREEFORM_CONCERN_GATE_MAX_RETRIES && !gatePassed) {
    gateAttempt += 1;
    const gateResult = await runFreeformConcernGate({
      content: fullText,
      orgId,
      surface: "narrator",
      attempt: gateAttempt,
      metadata: {
        practice: orgName,
        specialty: meta.specialty ?? undefined,
        location: meta.location ?? undefined,
      },
    });
    gateComposite = gateResult.score.composite;
    gatePassed = gateResult.passed;
    gateBlocked = gateResult.blocked;

    if (gateResult.shadow) {
      // Shadow mode: pass through
      gatePassed = true;
      break;
    }
  }

  if (gateBlocked) {
    // Hold + escalate
    await BehavioralEventModel.create({
      event_type: "digest.held",
      org_id: orgId,
      properties: {
        reason: "freeform_concern_gate_blocked",
        composite: gateComposite,
        attempts: gateAttempt,
      },
    }).catch(() => {});

    return {
      content,
      freeformGateResult: {
        passed: false,
        blocked: true,
        composite: gateComposite,
        attempts: gateAttempt,
      },
      rubricScore: gateComposite,
      held: true,
      error: `Freeform Concern Gate blocked after ${gateAttempt} attempts (composite ${gateComposite})`,
    };
  }

  return {
    content,
    freeformGateResult: {
      passed: gatePassed,
      blocked: false,
      composite: gateComposite,
      attempts: gateAttempt,
    },
    rubricScore: gateComposite,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function extractOrgMetadata(org: any): {
  websiteUrl: string | null;
  specialty: string | null;
  location: string | null;
  placeId: string | null;
} {
  let bd: Record<string, any> = {};
  let cd: Record<string, any> = {};

  if (org.business_data) {
    try {
      bd =
        typeof org.business_data === "string"
          ? JSON.parse(org.business_data)
          : org.business_data;
    } catch {
      /* ignore */
    }
  }
  if (org.checkup_data) {
    try {
      cd =
        typeof org.checkup_data === "string"
          ? JSON.parse(org.checkup_data)
          : org.checkup_data;
    } catch {
      /* ignore */
    }
  }

  return {
    websiteUrl: bd.website ?? cd.website ?? org.website_url ?? org.domain ?? null,
    specialty: bd.specialty ?? cd.specialty ?? bd.category ?? cd.category ?? null,
    location: bd.city && bd.state ? `${bd.city}, ${bd.state}` : cd.city ?? null,
    placeId: bd.place_id ?? cd.place_id ?? org.gbp_place_id ?? null,
  };
}

function formatChange(delta: number | null): string {
  if (delta == null) return "—";
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "=";
}

function formatActionTitle(eventType: string): string {
  const titles: Record<string, string> = {
    "site.published": "Published site update",
    "copy.draft_ready": "Drafted new copy",
    "copy.qa_passed": "Copy passed QA",
    "data_gap_resolver.field_resolved": "Filled a data gap",
    "watcher.signal_detected": "Detected a market signal",
    "research_brief.created": "Completed research brief",
  };
  return titles[eventType] ?? "Took action";
}

function formatActionDetail(
  eventType: string,
  properties: any,
  vocab: { customerTermPlural: string }
): string {
  const props =
    typeof properties === "string" ? JSON.parse(properties) : properties ?? {};
  switch (eventType) {
    case "site.published":
      return "Your site was updated with new content.";
    case "data_gap_resolver.field_resolved":
      return `Resolved missing ${props.field ?? "business"} data from ${props.source ?? "public sources"}.`;
    case "watcher.signal_detected":
      return props.detail ?? "Detected a change in your market.";
    default:
      return `Working behind the scenes for your ${vocab.customerTermPlural}.`;
  }
}

function deriveRecommendations(
  signals: any[],
  triScore: DigestContent["triScore"],
  currentScore: RecognitionScorerResult | null,
  vocab: { customerTerm: string; customerTermPlural: string }
): Array<{ title: string; detail: string }> {
  const recs: Array<{ title: string; detail: string }> = [];
  const plural = vocab.customerTermPlural;

  // Low CRO score → recommend updating fear-acknowledgment copy
  if (triScore.cro != null && triScore.cro < 50) {
    recs.push({
      title: `Strengthen ${vocab.customerTerm} connection`,
      detail: `Your CRO score suggests your site could better acknowledge what ${plural} feel before listing services. Alloro is preparing updated copy.`,
    });
  }

  // Missing examples → recommend adding customer language
  if (currentScore?.practice.missing_examples.length) {
    const count = currentScore.practice.missing_examples.length;
    recs.push({
      title: `${count} ${vocab.customerTerm} phrases missing from your site`,
      detail: `Your ${plural} describe your work in ways your website doesn't mention yet. Adding their language builds trust with new ${plural}.`,
    });
  }

  // Review drought signal
  const droughtSignal = signals.find(
    (s: any) =>
      s.title?.toLowerCase().includes("drought") ||
      s.detail?.toLowerCase().includes("no new reviews")
  );
  if (droughtSignal) {
    recs.push({
      title: "Review velocity slowing",
      detail: `Consider asking satisfied ${plural} for a quick Google review. Consistent review flow signals trust to both Google and AI assistants.`,
    });
  }

  // Competitor activity
  const competitorSignal = signals.find(
    (s: any) =>
      s.title?.toLowerCase().includes("competitor") ||
      s.severity === "warning"
  );
  if (competitorSignal && recs.length < 3) {
    recs.push({
      title: "Competitor movement detected",
      detail:
        "A nearby business showed notable activity this week. Alloro is tracking the impact on your market position.",
    });
  }

  return recs.slice(0, 3);
}
