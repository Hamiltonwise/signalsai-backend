/**
 * Manifest v2 Card 2 — Copy stage.
 *
 * Wraps generatePatientPathCopy() from src/services/agents/patientpathCopy.ts.
 * Reads the research brief, produces the seven-page PatientPath copy JSON,
 * persists to copy_outputs. Emits copy.draft_ready.
 */

import { db } from "../../../database/connection";
import { BehavioralEventModel } from "../../../models/BehavioralEventModel";
import { generatePatientPathCopy } from "../../agents/patientpathCopy";

export interface CopyStageInput {
  orgId: number;
  briefId: string;
  brief: any;
  idempotencyKey: string;
  existingCopyId?: string;
}

export interface CopyStageResult {
  copyId: string;
  copy: any;
  durationMs: number;
  reused: boolean;
}

export async function runCopyStage(
  input: CopyStageInput
): Promise<CopyStageResult> {
  const start = Date.now();

  if (!input.existingCopyId) {
    const existing = await db("copy_outputs")
      .where({ idempotency_key: input.idempotencyKey })
      .first();
    if (existing) {
      return {
        copyId: existing.id,
        copy: typeof existing.copy_json === "string"
          ? JSON.parse(existing.copy_json)
          : existing.copy_json,
        durationMs: Date.now() - start,
        reused: true,
      };
    }
  }

  const practice = input.brief.practiceProfile ?? {};
  const direction = input.brief.copyDirection ?? {};

  const copy = await generatePatientPathCopy({
    orgId: input.orgId,
    practiceName: practice.name ?? "",
    specialty: practice.specialty ?? "",
    city: practice.city ?? "",
    irreplaceableThing: direction.irreplaceableThing ?? "",
    heroHeadline: direction.heroHeadline ?? "",
    problemStatement: direction.problemStatement ?? "",
    socialProofQuotes: Array.isArray(direction.socialProofQuotes)
      ? direction.socialProofQuotes
      : [],
    faqTopics: Array.isArray(direction.faqTopics) ? direction.faqTopics : [],
    toneGuidance: direction.toneGuidance ?? "warm",
    fearCategories: Array.isArray(direction.fearCategories)
      ? direction.fearCategories
      : [],
    praisePatterns: Array.isArray(direction.praisePatterns)
      ? direction.praisePatterns
      : [],
    practicePersonality: direction.practicePersonality ?? "caring",
    totalReviews: practice.totalReviews ?? 0,
    averageRating: practice.averageRating ?? null,
  });

  let copyId: string;

  if (input.existingCopyId) {
    await db("copy_outputs")
      .where({ id: input.existingCopyId })
      .update({
        copy_json: JSON.stringify(copy),
        status: "pending",
        updated_at: new Date(),
      });
    copyId = input.existingCopyId;
  } else {
    const [row] = await db("copy_outputs")
      .insert({
        org_id: input.orgId,
        research_brief_id: input.briefId,
        idempotency_key: input.idempotencyKey,
        copy_json: JSON.stringify(copy),
        status: "pending",
        qa_attempts: 0,
      })
      .returning("id");
    copyId = typeof row === "string" ? row : row.id;
  }

  await BehavioralEventModel.create({
    event_type: "copy.draft_ready",
    org_id: input.orgId,
    properties: {
      copy_id: copyId,
      brief_id: input.briefId,
      section_count: Array.isArray(copy.sections) ? copy.sections.length : 0,
      idempotency_key: input.idempotencyKey,
    },
  }).catch(() => {});

  return { copyId, copy, durationMs: Date.now() - start, reused: false };
}
