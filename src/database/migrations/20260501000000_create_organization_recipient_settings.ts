import type { Knex } from "knex";

const TABLE_NAME = "organization_recipient_settings";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.increments("id").primary();
    table
      .integer("organization_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table.string("channel", 64).notNullable();
    table.jsonb("recipients").notNullable().defaultTo("[]");
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(["organization_id", "channel"], "uniq_org_recipient_channel");
    table.index(["organization_id"], "idx_org_recipient_settings_org");
  });

  await knex.raw(`
    ALTER TABLE ${TABLE_NAME}
      ADD CONSTRAINT organization_recipient_settings_channel_check
      CHECK (channel IN ('website_form', 'agent_notifications'))
  `);

  await knex.raw(`
    INSERT INTO ${TABLE_NAME}
      (organization_id, channel, recipients, created_at, updated_at)
    SELECT DISTINCT ON (organization_id)
      organization_id,
      'website_form',
      CASE
        WHEN jsonb_typeof(recipients) = 'array' THEN recipients
        ELSE '[]'::jsonb
      END,
      NOW(),
      NOW()
    FROM website_builder.projects
    WHERE organization_id IS NOT NULL
    ORDER BY organization_id, updated_at DESC
    ON CONFLICT (organization_id, channel) DO NOTHING
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TABLE_NAME);
}

