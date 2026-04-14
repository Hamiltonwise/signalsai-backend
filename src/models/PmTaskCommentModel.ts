import { BaseModel } from "./BaseModel";

/**
 * PmTaskCommentModel — flat markdown comments on a PM task.
 *
 * `mentions` is a native PG INTEGER[] column (see migration
 * 20260414000002_pm_comments_and_notification_types.ts) — Knex round-trips
 * it as a JS number[] with no serialization, so it is NOT registered as a
 * jsonField.
 */
export class PmTaskCommentModel extends BaseModel {
  protected static tableName = "pm_task_comments";
  protected static jsonFields: string[] = [];
}
