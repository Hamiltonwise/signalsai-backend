/**
 * Card 6 — Anchor Live Activity entry on practice flip (May 4 2026).
 *
 * When a practice flips from `patientpath_status='pending'` to
 * `'preview_ready'`, this handler writes a single anchor row to
 * live_activity_entries:
 *
 *   "Alloro began watching {N} patient questions across 6 AI platforms
 *    for {practiceDisplayName} today."
 *
 * Fires exactly once per practice (idempotency check on
 * is_anchor_entry partial index). Voice Constraints PASS gates the
 * insert; on FAIL the handler logs a behavioral event and aborts
 * (Card 6 spec rejects the writeLiveActivityEntry sanitize-and-emit
 * fallback for anchor entries because the text is template-driven
 * and a violation indicates an upstream config drift).
 */

import { db } from "../../database/connection";
import { checkVoice } from "../narrator/voiceConstraints";

export type AnchorEntryResult =
  | { status: "inserted"; entryId: string; text: string; nQueries: number }
  | { status: "skipped_already_exists"; existingEntryId: string }
  | { status: "skipped_voice_constraints_fail"; violations: string[] }
  | { status: "skipped_no_practice" };

/**
 * Fire the anchor handler for a practice. Returns a result object so
 * the caller can log or surface the outcome. Never throws.
 */
export async function fireAnchorEntryForPractice(
  practiceId: number,
): Promise<AnchorEntryResult> {
  // 1. Resolve practice display name. organizations does not have a
  //    display_name column; the name column is the canonical display.
  const org = await db("organizations")
    .where({ id: practiceId })
    .first("id", "name");
  if (!org || !org.name) {
    return { status: "skipped_no_practice" };
  }
  const practiceDisplayName = String(org.name).trim();

  // 2. Idempotency: if any anchor entry already exists for this
  //    practice, skip and return its id. The partial index
  //    idx_live_activity_anchor makes this lookup O(1).
  const existing = await db("live_activity_entries")
    .where({ practice_id: practiceId, is_anchor_entry: true })
    .first("id");
  if (existing) {
    await db("behavioral_events")
      .insert({
        id: db.raw("gen_random_uuid()"),
        event_type: "anchor_entry_already_exists",
        org_id: practiceId,
        properties: db.raw("?::jsonb", [
          JSON.stringify({
            practice_id: practiceId,
            existing_entry_id: existing.id,
          }),
        ]),
        created_at: db.fn.now(),
      })
      .catch(() => {
        /* best effort */
      });
    return { status: "skipped_already_exists", existingEntryId: existing.id };
  }

  // 3. Resolve the practice's vertical (vocabulary_configs.vertical)
  //    and the count of vertical-matched aeo_test_queries rows. Per
  //    Card 6 we never fabricate the count; if the practice has no
  //    seeded queries (e.g., vertical with no Card 4 seed), N=0 and
  //    the text is composed honestly.
  const vocab = await db("vocabulary_configs")
    .where({ org_id: practiceId })
    .first("vertical");
  const vertical = vocab?.vertical ?? null;

  let nQueries = 0;
  if (vertical) {
    const r = await db("aeo_test_queries")
      .where({ vertical, active: true })
      .count<{ count: string }[]>("id as count")
      .first();
    nQueries = Number(r?.count ?? 0);
  }

  // 4. Compose the doctor-facing text from the locked Card 6 template.
  const text = `Alloro began watching ${nQueries} patient questions across 6 AI platforms for ${practiceDisplayName} today.`;

  // 5. Voice Constraints. Anchor entries do NOT use the sanitize-and-
  //    emit fallback in writeLiveActivityEntry because the template is
  //    locked and any violation indicates an upstream drift (e.g.,
  //    practice name contains an em-dash, banned phrase, etc.).
  const voice = checkVoice(text);
  if (!voice.passed) {
    await db("behavioral_events")
      .insert({
        id: db.raw("gen_random_uuid()"),
        event_type: "anchor_entry_voice_constraints_fail",
        org_id: practiceId,
        properties: db.raw("?::jsonb", [
          JSON.stringify({
            practice_id: practiceId,
            text,
            violations: voice.violations,
          }),
        ]),
        created_at: db.fn.now(),
      })
      .catch(() => {
        /* best effort */
      });
    return {
      status: "skipped_voice_constraints_fail",
      violations: voice.violations,
    };
  }

  // 6. Insert the anchor row. entry_type='signal_received' per Card 6
  //    spec (matches the existing LiveActivityEntryType union).
  const [row] = await db("live_activity_entries")
    .insert({
      practice_id: practiceId,
      entry_type: "signal_received",
      entry_data: JSON.stringify({
        anchor: true,
        n_queries: nQueries,
        vertical,
        practice_display_name: practiceDisplayName,
      }),
      doctor_facing_text: text,
      linked_signal_event_id: null,
      linked_state_transition_id: null,
      visible_to_doctor: true,
      is_anchor_entry: true,
    })
    .returning(["id"]);

  const entryId = (row as { id: string }).id;

  await db("behavioral_events")
    .insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "anchor_entry_inserted",
      org_id: practiceId,
      properties: db.raw("?::jsonb", [
        JSON.stringify({
          practice_id: practiceId,
          entry_id: entryId,
          n_queries: nQueries,
          vertical,
        }),
      ]),
      created_at: db.fn.now(),
    })
    .catch(() => {
      /* best effort */
    });

  return { status: "inserted", entryId, text, nQueries };
}
