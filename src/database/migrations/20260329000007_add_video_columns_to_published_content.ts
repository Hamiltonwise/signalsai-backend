import type { Knex } from "knex";

/**
 * Add video generation columns to published_content.
 * Supports HeyGen AI avatar video pipeline.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("published_content", (table) => {
    table.string("video_id", 255).nullable();
    table.text("video_url").nullable();
    table
      .string("video_status", 20)
      .nullable()
      .comment("pending | processing | completed | failed");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("published_content", (table) => {
    table.dropColumn("video_id");
    table.dropColumn("video_url");
    table.dropColumn("video_status");
  });
}
