import { BaseModel, QueryContext } from "../BaseModel";

export interface IPostAttachment {
  id: string;
  post_id: string;
  url: string;
  filename: string;
  mime_type: string;
  file_size: number | null;
  order_index: number;
  created_at: Date;
}

export class PostAttachmentModel extends BaseModel {
  protected static tableName = "website_builder.post_attachments";

  static async findByPostId(
    postId: string,
    trx?: QueryContext
  ): Promise<IPostAttachment[]> {
    return this.table(trx)
      .where({ post_id: postId })
      .orderBy("order_index", "asc");
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IPostAttachment | undefined> {
    return super.findById(id, trx);
  }

  static async create(
    data: Partial<IPostAttachment>,
    trx?: QueryContext
  ): Promise<IPostAttachment> {
    // PostAttachments only have created_at, no updated_at
    const [result] = await this.table(trx)
      .insert({ ...data, created_at: new Date() })
      .returning("*");
    return result;
  }

  static async deleteById(
    id: string,
    trx?: QueryContext
  ): Promise<number> {
    return super.deleteById(id, trx);
  }

  static async deleteByPostId(
    postId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ post_id: postId }).del();
  }
}
