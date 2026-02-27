import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export interface IMindBrainChunk {
  id: string;
  mind_id: string;
  version_id: string;
  chunk_index: number;
  chunk_text: string;
  section_heading: string | null;
  embedding: number[];
  embedding_model: string;
  char_count: number;
  is_summary: boolean;
  created_at: Date;
}

export class MindBrainChunkModel extends BaseModel {
  protected static tableName = "minds.mind_brain_chunks";

  static async bulkInsert(
    chunks: Array<{
      mind_id: string;
      version_id: string;
      chunk_index: number;
      chunk_text: string;
      section_heading: string | null;
      embedding: number[];
      embedding_model: string;
      char_count: number;
      is_summary?: boolean;
    }>,
    trx?: QueryContext
  ): Promise<void> {
    if (chunks.length === 0) return;

    const conn = trx || db;
    const values = chunks.map((c) => ({
      mind_id: c.mind_id,
      version_id: c.version_id,
      chunk_index: c.chunk_index,
      chunk_text: c.chunk_text,
      section_heading: c.section_heading,
      embedding: conn.raw("?::vector", [JSON.stringify(c.embedding)]),
      embedding_model: c.embedding_model,
      char_count: c.char_count,
      is_summary: c.is_summary || false,
      created_at: new Date(),
    }));

    await conn("minds.mind_brain_chunks").insert(values);
  }

  static async deleteByMind(mindId: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ mind_id: mindId }).del();
  }

  static async deleteByVersion(versionId: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ version_id: versionId }).del();
  }

  static async searchSimilar(
    mindId: string,
    queryEmbedding: number[],
    topK: number = 7,
    trx?: QueryContext
  ): Promise<Array<IMindBrainChunk & { similarity: number }>> {
    const conn = trx || db;
    const embeddingStr = JSON.stringify(queryEmbedding);

    const rows = await conn.raw(
      `SELECT *,
              1 - (embedding <=> ?::vector) AS similarity
       FROM minds.mind_brain_chunks
       WHERE mind_id = ?
         AND is_summary = FALSE
       ORDER BY embedding <=> ?::vector
       LIMIT ?`,
      [embeddingStr, mindId, embeddingStr, topK]
    );

    return rows.rows || rows;
  }

  static async getSummaryChunk(
    mindId: string,
    trx?: QueryContext
  ): Promise<IMindBrainChunk | undefined> {
    return this.table(trx)
      .where({ mind_id: mindId, is_summary: true })
      .first();
  }

  static async getByVersion(versionId: string, trx?: QueryContext): Promise<IMindBrainChunk[]> {
    return this.table(trx)
      .where({ version_id: versionId })
      .orderBy("chunk_index", "asc");
  }

  static async countByMind(mindId: string, trx?: QueryContext): Promise<number> {
    return this.count({ mind_id: mindId }, trx);
  }
}
