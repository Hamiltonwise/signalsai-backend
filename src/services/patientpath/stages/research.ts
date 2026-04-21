/**
 * Manifest v2 Card 2 — Research stage.
 *
 * Wraps runPatientPathResearch() from src/services/agents/patientpathResearch.ts.
 * Persists the result to research_briefs. Emits research_brief.created.
 */

import { db } from "../../../database/connection";
import { BehavioralEventModel } from "../../../models/BehavioralEventModel";
import { runPatientPathResearch } from "../../agents/patientpathResearch";

export interface ResearchStageInput {
  orgId: number;
  idempotencyKey: string;
  refreshMode?: boolean;
}

export interface ResearchStageResult {
  briefId: string;
  brief: any;
  durationMs: number;
}

export async function runResearchStage(
  input: ResearchStageInput
): Promise<ResearchStageResult> {
  const start = Date.now();

  const existing = await db("research_briefs")
    .where({ idempotency_key: input.idempotencyKey })
    .first();
  if (existing) {
    return {
      briefId: existing.id,
      brief: typeof existing.brief_json === "string"
        ? JSON.parse(existing.brief_json)
        : existing.brief_json,
      durationMs: Date.now() - start,
    };
  }

  const brief = await runPatientPathResearch({
    orgId: input.orgId,
    refreshMode: input.refreshMode ?? false,
  });

  if (!brief) {
    throw new Error(
      `Research stage produced no brief for org ${input.orgId}`
    );
  }

  const [row] = await db("research_briefs")
    .insert({
      org_id: input.orgId,
      idempotency_key: input.idempotencyKey,
      brief_json: JSON.stringify(brief),
      confidence_level: brief.confidenceLevel ?? null,
    })
    .returning("id");

  const briefId = typeof row === "string" ? row : row.id;

  await BehavioralEventModel.create({
    event_type: "research_brief.created",
    org_id: input.orgId,
    properties: {
      brief_id: briefId,
      confidence_level: brief.confidenceLevel,
      irreplaceable_thing: brief.copyDirection?.irreplaceableThing ?? null,
      total_reviews: brief.practiceProfile?.totalReviews ?? 0,
      competitor_count: brief.practiceProfile?.competitorMap?.length ?? 0,
      idempotency_key: input.idempotencyKey,
    },
  }).catch(() => {});

  return { briefId, brief, durationMs: Date.now() - start };
}
