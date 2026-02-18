import { BaseModel, QueryContext } from "./BaseModel";

export interface IKnowledgebaseEmbedding {
  page_id: string;
  database_id: string;
  chunk_index: number;
  text: string;
  embedding: number[];
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export class KnowledgebaseEmbeddingModel extends BaseModel {
  protected static tableName = "knowledgebase_embeddings";
  protected static jsonFields = ["embedding", "metadata"];

  static async bulkInsert(
    data: Partial<IKnowledgebaseEmbedding>[],
    trx?: QueryContext
  ): Promise<void> {
    const serialized = data.map((item) =>
      this.serializeJsonFields({
        ...item,
        created_at: new Date(),
      })
    );
    await this.table(trx).insert(serialized);
  }

  static async truncate(trx?: QueryContext): Promise<void> {
    await this.table(trx).del();
  }
}
