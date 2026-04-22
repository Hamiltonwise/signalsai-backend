/**
 * Manifest v2 Card 5 Run 3 — Factory Activation.
 *
 * Activates the agentic factory for every active client:
 *   1. Enable recognition_score_enabled, watcher_agent_enabled feature flags
 *   2. Seed baseline Recognition Tri-Score
 *   3. Register with Watcher Agent for hourly + daily scans
 *   4. Persist baseline with timestamp for delta comparison
 *
 * Idempotent. Logs per-practice completion status.
 */

import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";
import { scoreRecognition } from "../checkup/recognitionScorer";
import type { RecognitionScorerResult } from "../checkup/recognitionScorer";

// ── Types ────────────────────────────────────────────────────────────

export type ActivationStatus =
  | "activated"
  | "already_active"
  | "pending_activation"
  | "failed"
  | "skipped";

export interface PracticeActivationResult {
  orgId: number;
  orgName: string;
  status: ActivationStatus;
  flags: { recognition_score_enabled: boolean; watcher_agent_enabled: boolean };
  baseline?: {
    seo: number | null;
    aeo: number | null;
    cro: number | null;
    composite: number | null;
    reviewCount: number;
    missingExamples: number;
    rubricVersionId: string | null;
  };
  notes: string[];
  activatedAt: string;
}

export interface ActivationRosterResult {
  totalOrgs: number;
  activated: number;
  alreadyActive: number;
  pendingActivation: number;
  failed: number;
  skipped: number;
  roster: PracticeActivationResult[];
  durationMs: number;
}

// ── Pending activation list ──────────────────────────────────────────
// Orgs queued but not yet live (manual gate before first build).

const PENDING_ACTIVATION_NAMES = [
  "coastal endodontic studio",
  "advanced root canal specialists",
];

function isPendingActivation(orgName: string): boolean {
  return PENDING_ACTIVATION_NAMES.some(
    (name) => orgName.toLowerCase().includes(name.toLowerCase())
  );
}

// ── Feature flag enablement ──────────────────────────��───────────────

async function enableFlagForOrg(
  flagName: string,
  orgId: number
): Promise<boolean> {
  try {
    const flag = await db("feature_flags")
      .where({ flag_name: flagName })
      .first();

    if (!flag) {
      // Create the flag if it doesn't exist
      await db("feature_flags").insert({
        flag_name: flagName,
        is_enabled: false,
        enabled_for_orgs: JSON.stringify([orgId]),
      });
      return true;
    }

    let enabledOrgs: number[] = [];
    if (flag.enabled_for_orgs) {
      const parsed =
        typeof flag.enabled_for_orgs === "string"
          ? JSON.parse(flag.enabled_for_orgs)
          : flag.enabled_for_orgs;
      if (Array.isArray(parsed)) enabledOrgs = parsed;
    }

    if (enabledOrgs.includes(orgId)) return false; // Already enabled

    enabledOrgs.push(orgId);
    await db("feature_flags")
      .where({ flag_name: flagName })
      .update({ enabled_for_orgs: JSON.stringify(enabledOrgs) });
    return true;
  } catch (err) {
    console.warn(
      `[FACTORY-ACTIVATION] Failed to enable ${flagName} for org ${orgId}:`,
      err
    );
    return false;
  }
}

// ── Baseline scoring ─────────────────────────────────────────────────

async function seedBaseline(
  orgId: number,
  orgName: string,
  websiteUrl: string | null,
  specialty: string | null,
  location: string | null,
  placeId: string | null
): Promise<{
  result: RecognitionScorerResult | null;
  baselineId: string | null;
}> {
  if (!websiteUrl) {
    return { result: null, baselineId: null };
  }

  // Check for existing baseline (idempotent)
  const existing = await db("recognition_baselines")
    .where({ org_id: orgId })
    .orderBy("created_at", "desc")
    .first();

  if (existing) {
    const parsed =
      typeof existing.result_json === "string"
        ? JSON.parse(existing.result_json)
        : existing.result_json;
    return { result: parsed, baselineId: existing.id };
  }

  try {
    const result = await scoreRecognition({
      practiceUrl: websiteUrl,
      specialty: specialty ?? undefined,
      location: location ?? undefined,
      placeId: placeId ?? undefined,
    });

    const [row] = await db("recognition_baselines")
      .insert({
        org_id: orgId,
        seo_composite: result.practice.seo_composite,
        aeo_composite: result.practice.aeo_composite,
        cro_composite: result.practice.cro_composite,
        review_count: result.practice.review_count,
        missing_example_count: result.practice.missing_examples.length,
        rubric_version_id: result.rubric_version_id,
        result_json: JSON.stringify(result),
      })
      .returning("id");

    const baselineId = typeof row === "string" ? row : row?.id ?? null;

    await BehavioralEventModel.create({
      event_type: "factory.baseline_seeded",
      org_id: orgId,
      properties: {
        seo: result.practice.seo_composite,
        aeo: result.practice.aeo_composite,
        cro: result.practice.cro_composite,
        review_count: result.practice.review_count,
        missing_examples: result.practice.missing_examples.length,
        rubric_version_id: result.rubric_version_id,
      },
    }).catch(() => {});

    return { result, baselineId };
  } catch (err) {
    console.warn(
      `[FACTORY-ACTIVATION] Baseline scoring failed for ${orgName}:`,
      err
    );
    return { result: null, baselineId: null };
  }
}

// ── Extract practice metadata from org ───────────────────────────────

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

// ── Main activation runner ───────────────────────────────────────────

export async function runFactoryActivation(): Promise<ActivationRosterResult> {
  const start = Date.now();
  const roster: PracticeActivationResult[] = [];

  // Pull active clients: active subscription OR active trial
  const orgs = await db("organizations")
    .where(function () {
      this.where("subscription_status", "active")
        .orWhere("subscription_status", "trial")
        .orWhere("account_type", "paying")
        .orWhere("account_type", "case_study")
        .orWhere("account_type", "internal");
    })
    .whereNull("deleted_at")
    .select("*");

  console.log(
    `[FACTORY-ACTIVATION] Found ${orgs.length} active/trial orgs to activate`
  );

  await BehavioralEventModel.create({
    event_type: "factory.activation_started",
    properties: { org_count: orgs.length },
  }).catch(() => {});

  for (const org of orgs) {
    const notes: string[] = [];
    let status: ActivationStatus = "activated";

    // Check pending activation
    if (isPendingActivation(org.name ?? "")) {
      status = "pending_activation";
      notes.push("Queued but not yet live per activation schedule");
      roster.push({
        orgId: org.id,
        orgName: org.name ?? `Org ${org.id}`,
        status,
        flags: { recognition_score_enabled: false, watcher_agent_enabled: false },
        notes,
        activatedAt: new Date().toISOString(),
      });
      continue;
    }

    // Enable feature flags
    const recogNew = await enableFlagForOrg("recognition_score_enabled", org.id);
    const watcherNew = await enableFlagForOrg("watcher_agent_enabled", org.id);

    if (!recogNew && !watcherNew) {
      notes.push("Flags already enabled");
    }
    if (recogNew) notes.push("Enabled recognition_score_enabled");
    if (watcherNew) notes.push("Enabled watcher_agent_enabled");

    // Determine if newly signed or existing
    const createdRecently =
      org.created_at &&
      Date.now() - new Date(org.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;
    if (createdRecently) {
      notes.push("New client (signed within last 7 days)");
    }

    // Seed baseline Recognition Tri-Score
    const meta = extractOrgMetadata(org);
    const { result: baseline } = await seedBaseline(
      org.id,
      org.name ?? `Org ${org.id}`,
      meta.websiteUrl,
      meta.specialty,
      meta.location,
      meta.placeId
    );

    let baselineData: PracticeActivationResult["baseline"];
    if (baseline) {
      const p = baseline.practice;
      baselineData = {
        seo: p.seo_composite,
        aeo: p.aeo_composite,
        cro: p.cro_composite,
        composite:
          p.seo_composite != null && p.aeo_composite != null && p.cro_composite != null
            ? Math.round((p.seo_composite + p.aeo_composite + p.cro_composite) / 3)
            : null,
        reviewCount: p.review_count,
        missingExamples: p.missing_examples.length,
        rubricVersionId: baseline.rubric_version_id,
      };
      notes.push(
        `Baseline: SEO ${p.seo_composite ?? "n/a"}, AEO ${p.aeo_composite ?? "n/a"}, CRO ${p.cro_composite ?? "n/a"}`
      );
    } else if (!meta.websiteUrl) {
      notes.push("No website URL — baseline skipped");
      status = "skipped";
    } else {
      notes.push("Baseline scoring returned no result");
    }

    roster.push({
      orgId: org.id,
      orgName: org.name ?? `Org ${org.id}`,
      status,
      flags: { recognition_score_enabled: true, watcher_agent_enabled: true },
      baseline: baselineData,
      notes,
      activatedAt: new Date().toISOString(),
    });

    console.log(
      `[FACTORY-ACTIVATION] ${org.name} (${org.id}): ${status} — ${notes.join("; ")}`
    );
  }

  const counts = {
    activated: roster.filter((r) => r.status === "activated").length,
    alreadyActive: roster.filter((r) => r.status === "already_active").length,
    pendingActivation: roster.filter((r) => r.status === "pending_activation").length,
    failed: roster.filter((r) => r.status === "failed").length,
    skipped: roster.filter((r) => r.status === "skipped").length,
  };

  await BehavioralEventModel.create({
    event_type: "factory.activation_completed",
    properties: {
      total: orgs.length,
      ...counts,
      duration_ms: Date.now() - start,
    },
  }).catch(() => {});

  return {
    totalOrgs: orgs.length,
    ...counts,
    roster,
    durationMs: Date.now() - start,
  };
}
