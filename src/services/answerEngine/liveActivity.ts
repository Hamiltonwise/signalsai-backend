/**
 * Live Activity Feed (Continuous Answer Engine Loop, Phase 1).
 *
 * Persistence + retrieval layer for the doctor-facing feed. The feed
 * itself is a future Phase 4 UI; Phase 1 just stores entries and exposes
 * a GET endpoint.
 *
 * The doctor_facing_text is currently composed deterministically by the
 * caller (see triggerRouter.composeDoctorFacingText). Phase 4 swaps that
 * for a Haiku-rendered, voice-validated sentence; the Phase 1 helper
 * `renderDoctorFacingText` exists here so that downstream callers can
 * depend on a single function and Phase 4 only needs to swap the body.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../../database/connection";
import { checkVoice } from "../narrator/voiceConstraints";
import type { LiveActivityEntryType } from "./types";

// ── DB writer ──────────────────────────────────────────────────────

export interface WriteLiveActivityInput {
  practice_id: number;
  entry_type: LiveActivityEntryType;
  entry_data: Record<string, unknown> | null;
  doctor_facing_text: string;
  linked_signal_event_id: string | null;
  linked_state_transition_id: string | null;
  visible_to_doctor?: boolean;
  /** Card 7 (May 4 2026) — optional per-query demonstration receipt fields. */
  patient_question?: string | null;
  /** Structured snapshot persisted as JSONB. Any object shape is accepted; the renderer pulls the `display` string for the timeline. */
  visibility_snapshot?: Record<string, unknown> | { [key: string]: unknown } | null | unknown;
  action_taken?: string | null;
}

export async function writeLiveActivityEntry(
  input: WriteLiveActivityInput,
): Promise<string> {
  const validated = enforceVoiceOrFallback(input.doctor_facing_text);

  // Card 7: gate action_taken through Voice Constraints. On fail, log
  // a behavioral_event and persist NULL rather than write banned-phrase
  // text into the receipts surface. Other receipt fields (patient
  // question, visibility snapshot) are not voice-gated because they
  // contain literal data, not narrative.
  let actionTaken: string | null = input.action_taken ?? null;
  if (actionTaken !== null && actionTaken.length > 0) {
    const v = checkVoice(actionTaken);
    if (!v.passed) {
      try {
        await db("behavioral_events").insert({
          id: db.raw("gen_random_uuid()"),
          event_type: "action_taken_voice_constraints_fail",
          org_id: input.practice_id,
          properties: db.raw("?::jsonb", [
            JSON.stringify({
              practice_id: input.practice_id,
              entry_type: input.entry_type,
              action_taken: actionTaken,
              violations: v.violations,
            }),
          ]),
          created_at: db.fn.now(),
        });
      } catch {
        /* best effort */
      }
      actionTaken = null;
    }
  }

  const [row] = await db("live_activity_entries")
    .insert({
      practice_id: input.practice_id,
      entry_type: input.entry_type,
      entry_data: input.entry_data ? JSON.stringify(input.entry_data) : null,
      doctor_facing_text: validated,
      linked_signal_event_id: input.linked_signal_event_id,
      linked_state_transition_id: input.linked_state_transition_id,
      visible_to_doctor: input.visible_to_doctor !== false,
      patient_question: input.patient_question ?? null,
      visibility_snapshot:
        input.visibility_snapshot !== null && input.visibility_snapshot !== undefined
          ? JSON.stringify(input.visibility_snapshot)
          : null,
      action_taken: actionTaken,
    })
    .returning(["id"]);
  return (row as { id: string }).id;
}

/**
 * Pass the proposed doctor-facing text through the Voice Constraints
 * checker. If it fails, fall back to a sanitized version: strip the
 * banned phrases, replace em-dashes with periods.
 */
export function enforceVoiceOrFallback(text: string): string {
  const result = checkVoice(text);
  if (result.passed) return text;
  return sanitize(text);
}

function sanitize(text: string): string {
  let s = text;
  // Replace em-dashes with commas.
  s = s.replace(/—/g, ", ");
  // Strip the "Alloro-as-hero" framings.
  s = s.replace(/\bwe\s+saved\s+(?:you|your)\b/gi, "we observed for you");
  s = s.replace(/\bwe\s+rescued\b/gi, "we observed");
  // Remove banned standalone words.
  s = s.replace(/\b(strategy|growth|leverage|synergy|unlock|supercharge|elevate|cutting-edge|state-of-the-art|world-class|best-in-class|game-changing|revolutionary|industry-leading|turnkey)\b/gi, "");
  // Collapse double spaces.
  s = s.replace(/\s+/g, " ").trim();
  // Final sanity: if still empty, return a deterministic fallback.
  if (!s) return "Alloro is watching.";
  return s;
}

// ── DB reader ──────────────────────────────────────────────────────

export interface LiveActivityEntryRow {
  id: string;
  practice_id: number;
  entry_type: LiveActivityEntryType;
  entry_data: Record<string, unknown> | null;
  doctor_facing_text: string;
  linked_signal_event_id: string | null;
  linked_state_transition_id: string | null;
  visible_to_doctor: boolean;
  /** Card 6 — anchor entries pin to the bottom of the timeline. */
  is_anchor_entry: boolean;
  /** Card 7 — per-query demonstration receipt fields (NULL on legacy + anchor rows). */
  patient_question: string | null;
  visibility_snapshot: Record<string, unknown> | null;
  action_taken: string | null;
  created_at: string;
}

export interface ListLiveActivityInput {
  practice_id: number;
  limit?: number;
  /** Default true (caller must pass false to surface internal entries). */
  visibleOnly?: boolean;
}

export async function listLiveActivityEntries(
  input: ListLiveActivityInput,
): Promise<LiveActivityEntryRow[]> {
  const limit = Math.min(input.limit ?? 50, 200);
  const visibleOnly = input.visibleOnly !== false;

  const SELECT_COLS = [
    "id",
    "practice_id",
    "entry_type",
    "entry_data",
    "doctor_facing_text",
    "linked_signal_event_id",
    "linked_state_transition_id",
    "visible_to_doctor",
    "is_anchor_entry",
    "patient_question",
    "visibility_snapshot",
    "action_taken",
    "created_at",
  ];

  // Card 6: the anchor entry must ALWAYS be visible at the bottom of the
  // timeline once a practice has flipped to preview_ready, even when the
  // limit is full of more recent signal rows. Two queries: the (single)
  // anchor row via the partial index, and (limit - 1) newest non-anchor
  // rows. Concatenate with anchor at the end. Keeps total rows ≤ limit.
  const anchorQ = db("live_activity_entries")
    .select(SELECT_COLS)
    .where("practice_id", input.practice_id)
    .andWhere("is_anchor_entry", true)
    .limit(1);
  if (visibleOnly) anchorQ.andWhere("visible_to_doctor", true);

  const anchorRows = await anchorQ;
  const anchorRow = anchorRows[0] ?? null;
  const signalLimit = anchorRow ? Math.max(0, limit - 1) : limit;

  const signalQ = db("live_activity_entries")
    .select(SELECT_COLS)
    .where("practice_id", input.practice_id)
    .andWhere("is_anchor_entry", false)
    .orderBy("created_at", "desc")
    .limit(signalLimit);
  if (visibleOnly) signalQ.andWhere("visible_to_doctor", true);

  const signalRows = await signalQ;

  const combined = anchorRow ? [...signalRows, anchorRow] : signalRows;

  return combined.map((r: any) => ({
    ...r,
    entry_data:
      typeof r.entry_data === "string"
        ? JSON.parse(r.entry_data)
        : (r.entry_data as Record<string, unknown> | null),
    visibility_snapshot:
      typeof r.visibility_snapshot === "string"
        ? JSON.parse(r.visibility_snapshot)
        : (r.visibility_snapshot as Record<string, unknown> | null),
  })) as LiveActivityEntryRow[];
}

// ── Haiku-rendered doctor-facing text (forward-compat hook) ─────────

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

/**
 * Render a doctor-facing sentence via Haiku (per AR-003). Returns the
 * deterministic fallback if no API key or if the call fails. Voice is
 * post-validated by checkVoice; failure routes to the deterministic
 * fallback.
 *
 * Phase 1 callers (triggerRouter) currently compose deterministic text
 * inline; this helper exists for callers that want LLM-generated copy
 * and Phase 4 will switch to it everywhere.
 */
export async function renderDoctorFacingText(input: {
  context: string;
  fallback: string;
}): Promise<{ text: string; source: "haiku" | "fallback_no_api_key" | "fallback_voice_fail" | "fallback_error" }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { text: input.fallback, source: "fallback_no_api_key" };

  const client = new Anthropic({ apiKey });
  const prompt = [
    "You write one sentence for a doctor's Live Activity feed inside Alloro.",
    "Constraints:",
    "- One sentence. No more, no less.",
    "- Patient is the audience for the underlying work. Doctor is the audience for this sentence.",
    "- Be specific to this practice. Use the doctor's actual data.",
    "- Never use em-dashes.",
    "- Never use \"state-of-the-art\" or \"world-class.\"",
    "- Never use \"strategy,\" \"growth,\" \"leverage,\" or AI buzzwords.",
    "- Never invent a fact.",
    "",
    `Context: ${input.context}`,
    "",
    "Output the single sentence and nothing else.",
  ].join("\n");

  try {
    const message = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") {
      return { text: input.fallback, source: "fallback_error" };
    }
    const text = block.text.trim();
    const voice = checkVoice(text);
    if (!voice.passed) {
      return { text: input.fallback, source: "fallback_voice_fail" };
    }
    return { text, source: "haiku" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[LiveActivity] Haiku render failed: ${message}`);
    return { text: input.fallback, source: "fallback_error" };
  }
}
