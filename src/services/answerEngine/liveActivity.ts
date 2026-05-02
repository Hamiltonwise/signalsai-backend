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
}

export async function writeLiveActivityEntry(
  input: WriteLiveActivityInput,
): Promise<string> {
  const validated = enforceVoiceOrFallback(input.doctor_facing_text);

  const [row] = await db("live_activity_entries")
    .insert({
      practice_id: input.practice_id,
      entry_type: input.entry_type,
      entry_data: input.entry_data ? JSON.stringify(input.entry_data) : null,
      doctor_facing_text: validated,
      linked_signal_event_id: input.linked_signal_event_id,
      linked_state_transition_id: input.linked_state_transition_id,
      visible_to_doctor: input.visible_to_doctor !== false,
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

  const q = db("live_activity_entries")
    .select(
      "id",
      "practice_id",
      "entry_type",
      "entry_data",
      "doctor_facing_text",
      "linked_signal_event_id",
      "linked_state_transition_id",
      "visible_to_doctor",
      "created_at",
    )
    .where("practice_id", input.practice_id)
    .orderBy("created_at", "desc")
    .limit(limit);

  if (visibleOnly) q.andWhere("visible_to_doctor", true);

  const rows = await q;
  return rows.map((r: LiveActivityEntryRow & { entry_data: unknown }) => ({
    ...r,
    entry_data:
      typeof r.entry_data === "string"
        ? JSON.parse(r.entry_data as unknown as string)
        : (r.entry_data as Record<string, unknown> | null),
  }));
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
