/**
 * Owner Archetype Detection -- Lemonis Protocol
 *
 * Detects one of four archetypes from the owner profile answers.
 * Internal only. Never exposed to the doctor.
 *
 * Craftsman: wants to protect the craft and have time
 * Builder: wants to scale, expand, grow
 * Survivor: low confidence, fear of losing everything
 * Legacy: thinking about exit, succession, retirement
 */

import { db } from "../database/connection";

export type OwnerArchetype = "craftsman" | "builder" | "survivor" | "legacy";

interface OwnerProfile {
  vision_3yr?: string | null;
  sunday_fear?: string | null;
  personal_goal?: string | null;
  confidence_score?: number | null;
  confidence_threat?: string | null;
}

interface ArchetypeResult {
  archetype: OwnerArchetype;
  confidence: number;
}

const BUILDER_KEYWORDS = ["second location", "expand", "grow", "scale", "more clients", "franchise", "team", "hire", "bigger", "multiple"];
const SURVIVOR_KEYWORDS = ["lose", "debt", "close", "survive", "bills", "afraid", "bankrupt", "fail", "shut down"];
const LEGACY_KEYWORDS = ["sell", "exit", "retire", "succession", "hand off", "legacy", "my kids", "pass it on", "step away"];
const CRAFTSMAN_KEYWORDS = ["time with family", "slow down", "enjoy", "craft", "quality", "clients", "customers", "balance", "freedom", "tuesdays", "weekends"];

function containsAny(text: string | null | undefined, keywords: string[]): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw)).length;
}

export function detectArchetype(profile: OwnerProfile): ArchetypeResult {
  const allText = [profile.vision_3yr, profile.sunday_fear, profile.personal_goal, profile.confidence_threat]
    .filter(Boolean)
    .join(" ");

  // Score each archetype
  const scores: Record<OwnerArchetype, number> = {
    craftsman: containsAny(allText, CRAFTSMAN_KEYWORDS),
    builder: containsAny(allText, BUILDER_KEYWORDS),
    survivor: containsAny(allText, SURVIVOR_KEYWORDS),
    legacy: containsAny(allText, LEGACY_KEYWORDS),
  };

  // Survivor gets a boost from low confidence score
  if (profile.confidence_score != null && profile.confidence_score <= 5) {
    scores.survivor += 2;
  }
  if (profile.confidence_score != null && profile.confidence_score <= 3) {
    scores.survivor += 2;
  }

  // Builder gets a boost from high confidence + scale language
  if (profile.confidence_score != null && profile.confidence_score >= 8) {
    scores.builder += 1;
  }

  // Find the winner
  const entries = Object.entries(scores) as [OwnerArchetype, number][];
  entries.sort((a, b) => b[1] - a[1]);

  const best = entries[0];
  const second = entries[1];
  const total = entries.reduce((sum, [, s]) => sum + s, 0);

  // If no signals at all, default to craftsman
  if (total === 0) return { archetype: "craftsman", confidence: 0.5 };

  // Confidence is how much the winner dominates
  const confidence = total > 0 ? Math.min(0.99, best[1] / Math.max(1, total)) : 0.5;

  return { archetype: best[0], confidence: Math.round(confidence * 100) / 100 };
}

/**
 * Detect and persist archetype for an organization.
 * Called after owner_profile is saved.
 */
export async function detectAndPersistArchetype(orgId: number): Promise<ArchetypeResult> {
  const org = await db("organizations").where({ id: orgId }).first("owner_profile");
  if (!org?.owner_profile) return { archetype: "craftsman", confidence: 0.5 };

  const profile = typeof org.owner_profile === "string"
    ? JSON.parse(org.owner_profile)
    : org.owner_profile;

  const result = detectArchetype(profile);

  await db("organizations").where({ id: orgId }).update({
    owner_archetype: result.archetype,
    archetype_confidence: result.confidence,
  });

  return result;
}
