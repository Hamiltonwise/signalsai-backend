import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. agent_results — add location_id
  await knex.schema.alterTable("agent_results", (table) => {
    table
      .integer("location_id")
      .nullable()
      .references("id")
      .inTable("locations")
      .onDelete("SET NULL");
  });

  // 2. tasks — add location_id
  await knex.schema.alterTable("tasks", (table) => {
    table
      .integer("location_id")
      .nullable()
      .references("id")
      .inTable("locations")
      .onDelete("SET NULL");
  });

  // 3. pms_jobs — add BOTH organization_id AND location_id
  await knex.schema.alterTable("pms_jobs", (table) => {
    table
      .integer("organization_id")
      .nullable()
      .references("id")
      .inTable("organizations")
      .onDelete("SET NULL");
    table
      .integer("location_id")
      .nullable()
      .references("id")
      .inTable("locations")
      .onDelete("SET NULL");
  });

  // 4. practice_rankings — add location_id
  await knex.schema.alterTable("practice_rankings", (table) => {
    table
      .integer("location_id")
      .nullable()
      .references("id")
      .inTable("locations")
      .onDelete("SET NULL");
  });

  // 5. notifications — add organization_id AND location_id
  await knex.schema.alterTable("notifications", (table) => {
    table
      .integer("organization_id")
      .nullable()
      .references("id")
      .inTable("organizations")
      .onDelete("SET NULL");
    table
      .integer("location_id")
      .nullable()
      .references("id")
      .inTable("locations")
      .onDelete("SET NULL");
  });

  // Indexes for the new columns
  await knex.raw(
    `CREATE INDEX idx_agent_results_location_id ON agent_results(location_id)`
  );
  await knex.raw(`CREATE INDEX idx_tasks_location_id ON tasks(location_id)`);
  await knex.raw(
    `CREATE INDEX idx_pms_jobs_organization_id ON pms_jobs(organization_id)`
  );
  await knex.raw(
    `CREATE INDEX idx_pms_jobs_location_id ON pms_jobs(location_id)`
  );
  await knex.raw(
    `CREATE INDEX idx_practice_rankings_location_id ON practice_rankings(location_id)`
  );
  await knex.raw(
    `CREATE INDEX idx_notifications_organization_id ON notifications(organization_id)`
  );
  await knex.raw(
    `CREATE INDEX idx_notifications_location_id ON notifications(location_id)`
  );
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes first
  await knex.raw(`DROP INDEX IF EXISTS idx_notifications_location_id`);
  await knex.raw(`DROP INDEX IF EXISTS idx_notifications_organization_id`);
  await knex.raw(`DROP INDEX IF EXISTS idx_practice_rankings_location_id`);
  await knex.raw(`DROP INDEX IF EXISTS idx_pms_jobs_location_id`);
  await knex.raw(`DROP INDEX IF EXISTS idx_pms_jobs_organization_id`);
  await knex.raw(`DROP INDEX IF EXISTS idx_tasks_location_id`);
  await knex.raw(`DROP INDEX IF EXISTS idx_agent_results_location_id`);

  // Drop columns
  await knex.schema.alterTable("notifications", (table) => {
    table.dropColumn("location_id");
    table.dropColumn("organization_id");
  });
  await knex.schema.alterTable("practice_rankings", (table) => {
    table.dropColumn("location_id");
  });
  await knex.schema.alterTable("pms_jobs", (table) => {
    table.dropColumn("location_id");
    table.dropColumn("organization_id");
  });
  await knex.schema.alterTable("tasks", (table) => {
    table.dropColumn("location_id");
  });
  await knex.schema.alterTable("agent_results", (table) => {
    table.dropColumn("location_id");
  });
}
