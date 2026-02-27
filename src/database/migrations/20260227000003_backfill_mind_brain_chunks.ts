import { Knex } from "knex";
import axios from "axios";

const EMBEDDING_MODEL = process.env.MINDS_EMBEDDING_MODEL || "text-embedding-3-small";
const RAG_THRESHOLD_CHARS = parseInt(process.env.MINDS_RAG_THRESHOLD_CHARS || "8000", 10);

/**
 * Backfill migration: generates embeddings for all existing published minds.
 * This runs once on deploy. If OPENAI_API_KEY is not set, it skips silently.
 */
export async function up(knex: Knex): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("[MINDS-BACKFILL] OPENAI_API_KEY not set — skipping embedding backfill");
    return;
  }

  // Get all minds with published versions
  const minds = await knex.raw(`
    SELECT m.id AS mind_id, m.name, m.published_version_id, v.brain_markdown
    FROM minds.minds m
    JOIN minds.mind_versions v ON v.id = m.published_version_id
    WHERE m.published_version_id IS NOT NULL
  `);

  const rows = minds.rows || minds;
  if (rows.length === 0) {
    console.log("[MINDS-BACKFILL] No published minds found — nothing to backfill");
    return;
  }

  for (const mind of rows) {
    const brainSize = mind.brain_markdown.length;

    if (brainSize < RAG_THRESHOLD_CHARS) {
      console.log(
        `[MINDS-BACKFILL] Mind "${mind.name}" brain is ${brainSize} chars — below threshold, skipping`
      );
      continue;
    }

    console.log(
      `[MINDS-BACKFILL] Processing mind "${mind.name}" (${brainSize} chars)...`
    );

    try {
      // Simple chunking by ## headings for backfill
      const sections = mind.brain_markdown.split(/(?=^## )/m).filter((s: string) => s.trim());
      const chunks: Array<{ text: string; heading: string | null }> = [];

      for (const section of sections) {
        const headingMatch = section.match(/^## (.+)$/m);
        const heading = headingMatch ? headingMatch[1].trim() : null;

        if (section.length <= 2048) {
          chunks.push({ text: section.trim(), heading });
        } else {
          // Split large sections by paragraph
          const paragraphs = section.split(/\n\n+/);
          let current = "";
          for (const p of paragraphs) {
            if (current.length + p.length + 2 > 2048) {
              if (current) chunks.push({ text: current.trim(), heading });
              current = p;
            } else {
              current += (current ? "\n\n" : "") + p;
            }
          }
          if (current) chunks.push({ text: current.trim(), heading });
        }
      }

      if (chunks.length === 0) continue;

      // Generate embeddings in batch
      const texts = chunks.map((c) => c.text);
      const embResponse = await axios.post(
        "https://api.openai.com/v1/embeddings",
        { model: EMBEDDING_MODEL, input: texts },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const embeddings = embResponse.data.data
        .sort((a: any, b: any) => a.index - b.index)
        .map((d: any) => d.embedding);

      // Insert chunks
      for (let i = 0; i < chunks.length; i++) {
        await knex.raw(
          `INSERT INTO minds.mind_brain_chunks
            (mind_id, version_id, chunk_index, chunk_text, section_heading, embedding, embedding_model, char_count, is_summary, created_at)
           VALUES (?, ?, ?, ?, ?, ?::vector, ?, ?, FALSE, NOW())`,
          [
            mind.mind_id,
            mind.published_version_id,
            i,
            chunks[i].text,
            chunks[i].heading,
            JSON.stringify(embeddings[i]),
            EMBEDDING_MODEL,
            chunks[i].text.length,
          ]
        );
      }

      console.log(
        `[MINDS-BACKFILL] Mind "${mind.name}": stored ${chunks.length} chunks`
      );
    } catch (err: any) {
      console.error(
        `[MINDS-BACKFILL] Failed to backfill mind "${mind.name}":`,
        err.message
      );
      // Continue with other minds — don't fail the migration
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Backfill data is derived — just clear all chunks
  await knex.raw("DELETE FROM minds.mind_brain_chunks");
}
