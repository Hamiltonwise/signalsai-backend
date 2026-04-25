// Knex migration scaffold — add website_blocked to audit_processes
//
// Repo convention: production migrations are .ts files placed at
// ~/Desktop/alloro/src/database/migrations/{YYYYMMDDHHMMSS}_add_website_blocked_to_audit_processes.ts
// (see existing analog: 20260418000000_add_retry_count_to_audit_processes.ts).
// This .js file is the spec-mandated scaffold per CLAUDE.md; the actual
// migration ships as TypeScript per the repo's existing pattern.

// TODO: fill during execution. Expected shape:
//
// import type { Knex } from "knex";
//
// export async function up(knex: Knex): Promise<void> {
//   await knex.schema.alterTable("audit_processes", (t) => {
//     t.boolean("website_blocked").notNullable().defaultTo(false);
//   });
//
//   // Partial index for efficient analytics queries on blocked audits.
//   // Defer if migration tooling can't run raw SQL alongside schema builder.
//   // await knex.raw(`
//   //   CREATE INDEX IF NOT EXISTS idx_audit_processes_website_blocked
//   //     ON audit_processes (website_blocked)
//   //     WHERE website_blocked = true
//   // `);
// }
//
// export async function down(knex: Knex): Promise<void> {
//   await knex.schema.alterTable("audit_processes", (t) => {
//     t.dropColumn("website_blocked");
//   });
// }
