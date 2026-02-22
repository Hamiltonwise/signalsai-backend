import { Knex } from "knex";

/**
 * Fix foreign key constraints to enable clean organization deletion.
 *
 * Problem: Several tables have organization_id FKs with NO ACTION/RESTRICT,
 * which blocks DELETE FROM organizations. Other tables use SET NULL, which
 * orphans records instead of cleaning them up.
 *
 * Solution: Change all org/location FKs to CASCADE so that deleting an
 * organization automatically removes ALL associated data.
 */
export async function up(knex: Knex): Promise<void> {
  // Helper: format schema-qualified table name for SQL
  function sqlTable(table: string): string {
    if (table.includes(".")) {
      const [schema, name] = table.split(".");
      return `"${schema}"."${name}"`;
    }
    return `"${table}"`;
  }

  function tableName(table: string): string {
    return table.split(".").pop()!;
  }

  function tableSchema(table: string): string | null {
    return table.includes(".") ? table.split(".")[0] : null;
  }

  // Helper: drop FK constraint by column, then re-add with CASCADE
  async function setFKCascade(
    table: string,
    column: string,
    refTable: string,
    refColumn: string = "id"
  ) {
    const schema = tableSchema(table);
    const constraintResult = await knex.raw(`
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
      WHERE rel.relname = '${tableName(table)}'
        AND att.attname = '${column}'
        AND con.contype = 'f'
        ${schema ? `AND nsp.nspname = '${schema}'` : ""}
    `);

    for (const row of constraintResult.rows) {
      await knex.raw(`ALTER TABLE ${sqlTable(table)} DROP CONSTRAINT "${row.conname}"`);
    }

    await knex.raw(`
      ALTER TABLE ${sqlTable(table)}
      ADD CONSTRAINT "fk_${tableName(table)}_${column}"
      FOREIGN KEY ("${column}")
      REFERENCES "${refTable}"("${refColumn}")
      ON DELETE CASCADE
    `);
  }

  // ---------------------------------------------------------------
  // Tables referencing organizations.id
  // ---------------------------------------------------------------

  // google_connections.organization_id — currently NO ACTION
  await setFKCascade("google_connections", "organization_id", "organizations");

  // agent_results.organization_id — currently NO ACTION
  await setFKCascade("agent_results", "organization_id", "organizations");

  // tasks.organization_id — currently NO ACTION
  await setFKCascade("tasks", "organization_id", "organizations");

  // practice_rankings.organization_id — currently NO ACTION
  await setFKCascade("practice_rankings", "organization_id", "organizations");

  // pms_jobs.organization_id — currently SET NULL → CASCADE
  await setFKCascade("pms_jobs", "organization_id", "organizations");

  // notifications.organization_id — currently SET NULL → CASCADE
  await setFKCascade("notifications", "organization_id", "organizations");

  // organization_users.organization_id — unknown, ensure CASCADE
  await setFKCascade("organization_users", "organization_id", "organizations");

  // invitations.organization_id — unknown, ensure CASCADE
  await setFKCascade("invitations", "organization_id", "organizations");

  // website_builder.projects.organization_id — currently SET NULL → CASCADE
  await setFKCascade("website_builder.projects", "organization_id", "organizations");

  // ---------------------------------------------------------------
  // Tables referencing locations.id (SET NULL → CASCADE)
  // ---------------------------------------------------------------

  // agent_results.location_id
  await setFKCascade("agent_results", "location_id", "locations");

  // tasks.location_id
  await setFKCascade("tasks", "location_id", "locations");

  // practice_rankings.location_id
  await setFKCascade("practice_rankings", "location_id", "locations");

  // pms_jobs.location_id
  await setFKCascade("pms_jobs", "location_id", "locations");

  // notifications.location_id
  await setFKCascade("notifications", "location_id", "locations");

  console.log("[Migration] All FK constraints updated to CASCADE for organization deletion support.");
}

export async function down(knex: Knex): Promise<void> {
  function sqlTable(table: string): string {
    if (table.includes(".")) {
      const [schema, name] = table.split(".");
      return `"${schema}"."${name}"`;
    }
    return `"${table}"`;
  }

  function tableName(table: string): string {
    return table.split(".").pop()!;
  }

  function tableSchema(table: string): string | null {
    return table.includes(".") ? table.split(".")[0] : null;
  }

  async function revertFK(
    table: string,
    column: string,
    refTable: string,
    refColumn: string = "id",
    onDelete: string = "NO ACTION"
  ) {
    const schema = tableSchema(table);
    const constraintResult = await knex.raw(`
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
      WHERE rel.relname = '${tableName(table)}'
        AND att.attname = '${column}'
        AND con.contype = 'f'
        ${schema ? `AND nsp.nspname = '${schema}'` : ""}
    `);

    for (const row of constraintResult.rows) {
      await knex.raw(`ALTER TABLE ${sqlTable(table)} DROP CONSTRAINT "${row.conname}"`);
    }

    await knex.raw(`
      ALTER TABLE ${sqlTable(table)}
      ADD CONSTRAINT "fk_${tableName(table)}_${column}"
      FOREIGN KEY ("${column}")
      REFERENCES "${refTable}"("${refColumn}")
      ON DELETE ${onDelete}
    `);
  }

  // Revert organization_id FKs to original behavior
  await revertFK("google_connections", "organization_id", "organizations", "id", "NO ACTION");
  await revertFK("agent_results", "organization_id", "organizations", "id", "NO ACTION");
  await revertFK("tasks", "organization_id", "organizations", "id", "NO ACTION");
  await revertFK("practice_rankings", "organization_id", "organizations", "id", "NO ACTION");
  await revertFK("pms_jobs", "organization_id", "organizations", "id", "SET NULL");
  await revertFK("notifications", "organization_id", "organizations", "id", "SET NULL");
  await revertFK("organization_users", "organization_id", "organizations", "id", "NO ACTION");
  await revertFK("invitations", "organization_id", "organizations", "id", "NO ACTION");
  await revertFK("website_builder.projects", "organization_id", "organizations", "id", "SET NULL");

  // Revert location_id FKs to SET NULL
  await revertFK("agent_results", "location_id", "locations", "id", "SET NULL");
  await revertFK("tasks", "location_id", "locations", "id", "SET NULL");
  await revertFK("practice_rankings", "location_id", "locations", "id", "SET NULL");
  await revertFK("pms_jobs", "location_id", "locations", "id", "SET NULL");
  await revertFK("notifications", "location_id", "locations", "id", "SET NULL");

  console.log("[Migration] FK constraints reverted to original behavior.");
}
