import type { Knex } from "knex";

/**
 * WO-ADMIN-USER-MANAGEMENT: Add role, is_active, last_login_at to users table.
 */
export async function up(knex: Knex): Promise<void> {
  const hasRole = await knex.schema.hasColumn("users", "role");
  const hasActive = await knex.schema.hasColumn("users", "is_active");
  const hasLastLogin = await knex.schema.hasColumn("users", "last_login_at");

  if (!hasRole || !hasActive || !hasLastLogin) {
    await knex.schema.alterTable("users", (t) => {
      if (!hasRole) t.string("role", 50).defaultTo("admin");
      if (!hasActive) t.boolean("is_active").defaultTo(true);
      if (!hasLastLogin) t.timestamp("last_login_at", { useTz: true }).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasRole = await knex.schema.hasColumn("users", "role");
  if (hasRole) {
    await knex.schema.alterTable("users", (t) => {
      t.dropColumn("role");
      t.dropColumn("is_active");
      t.dropColumn("last_login_at");
    });
  }
}
