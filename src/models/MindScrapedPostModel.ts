import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export interface IMindScrapedPost {
  id: string;
  mind_id: string;
  source_id: string;
  url: string;
  title: string | null;
  raw_html_hash: string | null;
  markdown_content: string;
  scraped_at: Date;
  sync_run_id: string;
}

export class MindScrapedPostModel extends BaseModel {
  protected static tableName = "minds.mind_scraped_posts";

  static async upsertByUrl(
    data: {
      mind_id: string;
      source_id: string;
      url: string;
      title?: string;
      raw_html_hash?: string;
      markdown_content: string;
      sync_run_id: string;
    },
    trx?: QueryContext
  ): Promise<IMindScrapedPost> {
    const conn = trx || db;
    const result = await conn.raw(
      `INSERT INTO minds.mind_scraped_posts (mind_id, source_id, url, title, raw_html_hash, markdown_content, scraped_at, sync_run_id)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
       ON CONFLICT (mind_id, url)
       DO UPDATE SET
         title = EXCLUDED.title,
         raw_html_hash = EXCLUDED.raw_html_hash,
         markdown_content = EXCLUDED.markdown_content,
         scraped_at = NOW(),
         sync_run_id = EXCLUDED.sync_run_id
       RETURNING *`,
      [data.mind_id, data.source_id, data.url, data.title || null, data.raw_html_hash || null, data.markdown_content, data.sync_run_id]
    );
    return result.rows[0];
  }
}
