import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Enable pgvector extension
  await knex.raw("CREATE EXTENSION IF NOT EXISTS vector");

  await knex.raw(`
    CREATE TABLE minds.mind_brain_chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mind_id UUID NOT NULL REFERENCES minds.minds(id) ON DELETE CASCADE,
      version_id UUID NOT NULL REFERENCES minds.mind_versions(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      section_heading TEXT,
      embedding vector(1536) NOT NULL,
      embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
      char_count INTEGER NOT NULL,
      is_summary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // HNSW index for fast cosine similarity search
  await knex.raw(`
    CREATE INDEX idx_brain_chunks_mind_embedding
      ON minds.mind_brain_chunks
      USING hnsw (embedding vector_cosine_ops)
  `);

  // Lookup by version for cleanup
  await knex.raw(`
    CREATE INDEX idx_brain_chunks_version
      ON minds.mind_brain_chunks(version_id)
  `);

  // Lookup active chunks by mind
  await knex.raw(`
    CREATE INDEX idx_brain_chunks_mind_id
      ON minds.mind_brain_chunks(mind_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS minds.mind_brain_chunks CASCADE");
}
