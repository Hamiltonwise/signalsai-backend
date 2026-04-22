/**
 * Checkup Recognition Section — bridges the Recognition Tri-Score into
 * the existing Checkup output.
 *
 * Given an organization, this service loads the practice URL (from
 * business_data / checkup_data), pulls up to 3 competitor URLs from the
 * same market (GBP/checkup-resolved), calls scoreRecognition, and merges
 * the result back into organizations.checkup_data.recognition.
 *
 * Feature flag: recognition_score_enabled. Shadow mode: scoring runs, but
 * the UI layer gates surfacing on the flag.
 */

import { db } from "../../database/connection";
import { scoreRecognition } from "./recognitionScorer";
import type { RecognitionScorerResult } from "./recognitionScorer";
import { isRecognitionScoreEnabled } from "../rubric/gateFlag";

export interface ComputeRecognitionInput {
  orgId?: number;
  practiceUrl?: string;
  specialty?: string;
  location?: string;
  competitorUrls?: string[];
  placeId?: string;
}

export interface ComputeRecognitionOutput {
  result: RecognitionScorerResult | null;
  persisted: boolean;
  shadow: boolean;
  reason?: string;
}

export async function computeRecognitionSection(
  input: ComputeRecognitionInput
): Promise<ComputeRecognitionOutput> {
  const flagOn = await isRecognitionScoreEnabled(input.orgId);
  const context = await resolveContext(input);
  if (!context) {
    return {
      result: null,
      persisted: false,
      shadow: !flagOn,
      reason: "no_practice_url_available",
    };
  }

  const result = await scoreRecognition({
    practiceUrl: context.practiceUrl,
    specialty: context.specialty ?? input.specialty,
    location: context.location ?? input.location,
    competitorUrls: context.competitorUrls ?? input.competitorUrls,
    placeId: context.placeId ?? input.placeId,
  });

  let persisted = false;
  if (input.orgId != null) {
    persisted = await persistRecognition(input.orgId, result).catch(() => false);
  }

  return {
    result,
    persisted,
    shadow: !flagOn,
  };
}

async function resolveContext(
  input: ComputeRecognitionInput
): Promise<{
  practiceUrl: string;
  specialty?: string;
  location?: string;
  competitorUrls?: string[];
  placeId?: string;
} | null> {
  if (input.practiceUrl) {
    return {
      practiceUrl: input.practiceUrl,
      specialty: input.specialty,
      location: input.location,
      competitorUrls: input.competitorUrls,
      placeId: input.placeId,
    };
  }
  if (!input.orgId) return null;

  try {
    const org = await db("organizations")
      .where({ id: input.orgId })
      .first("id", "name", "checkup_data", "business_data");
    if (!org) return null;

    const checkup = parseJsonField(org.checkup_data);
    const business = parseJsonField(org.business_data);
    const place = checkup?.place ?? business?.place ?? null;
    const practiceUrl = place?.websiteUri ?? place?.website ?? business?.website;
    if (!practiceUrl) return null;

    const competitorUrls: string[] = Array.isArray(checkup?.competitors)
      ? checkup.competitors
          .map((c: any) => c?.websiteUri ?? c?.website)
          .filter((u: any): u is string => typeof u === "string" && u.length > 0)
          .slice(0, 3)
      : [];

    const specialty: string | undefined =
      checkup?.specialty ?? business?.specialty ?? place?.primaryType ?? undefined;
    const cityState = [business?.city, business?.state].filter(Boolean).join(", ");
    const location: string | undefined =
      (place?.formattedAddress as string | undefined) ??
      (cityState || undefined);

    return {
      practiceUrl,
      specialty,
      location,
      competitorUrls,
      placeId: place?.id ?? place?.placeId,
    };
  } catch {
    return null;
  }
}

function parseJsonField(val: unknown): any {
  if (!val) return null;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  return val;
}

async function persistRecognition(
  orgId: number,
  result: RecognitionScorerResult
): Promise<boolean> {
  try {
    const row = await db("organizations").where({ id: orgId }).first("checkup_data");
    const existing = parseJsonField(row?.checkup_data) ?? {};
    existing.recognition = {
      ...result,
      computed_at: result.run_timestamp,
    };
    await db("organizations")
      .where({ id: orgId })
      .update({ checkup_data: JSON.stringify(existing) });
    return true;
  } catch {
    return false;
  }
}
