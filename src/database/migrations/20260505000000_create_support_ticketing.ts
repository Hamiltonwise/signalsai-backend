import { Knex } from "knex";

const TICKETS_TABLE = "support_tickets";
const MESSAGES_TABLE = "support_ticket_messages";
const EVENTS_TABLE = "support_ticket_events";
const SEQUENCE_NAME = "support_ticket_public_id_seq";
const TRIGGER_FUNCTION = "support_update_timestamp";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE SEQUENCE IF NOT EXISTS ${SEQUENCE_NAME}`);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION ${TRIGGER_FUNCTION}()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.schema.createTable(TICKETS_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("public_id", 32).notNullable().unique();
    table
      .integer("organization_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table
      .integer("location_id")
      .references("id")
      .inTable("locations")
      .onDelete("SET NULL");
    table
      .integer("created_by_user_id")
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table
      .integer("assigned_to_user_id")
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table
      .enu("type", ["bug_report", "feature_request", "website_edit"], {
        useNative: true,
        enumName: "support_ticket_type",
      })
      .notNullable();
    table
      .enu(
        "status",
        [
          "new",
          "triaged",
          "in_progress",
          "waiting_on_client",
          "resolved",
          "wont_fix",
        ],
        {
          useNative: true,
          enumName: "support_ticket_status",
        }
      )
      .notNullable()
      .defaultTo("new");
    table
      .enu("severity", ["low", "medium", "high", "urgent"], {
        useNative: true,
        enumName: "support_ticket_severity",
      })
      .notNullable()
      .defaultTo("medium");
    table
      .enu("priority", ["low", "normal", "high", "urgent"], {
        useNative: true,
        enumName: "support_ticket_priority",
      })
      .notNullable()
      .defaultTo("normal");
    table.string("category", 80);
    table.string("target_sprint", 120);
    table.string("title", 255).notNullable();
    table.text("current_page_url");
    table.date("requested_completion_date");
    table.jsonb("guided_answers").notNullable().defaultTo("{}");
    table.text("internal_notes");
    table.text("resolution_notes");
    table.timestamp("ack_email_sent_at", { useTz: true });
    table.timestamp("resolved_email_sent_at", { useTz: true });
    table.timestamp("resolved_at", { useTz: true });
    table.timestamps(true, true);

    table.index(["organization_id", "status", "created_at"]);
    table.index(["type", "status", "created_at"]);
    table.index(["assigned_to_user_id", "status"]);
    table.index(["created_by_user_id", "created_at"]);
  });

  await knex.raw(`
    CREATE TRIGGER ${TICKETS_TABLE}_updated_at
    BEFORE UPDATE ON ${TICKETS_TABLE}
    FOR EACH ROW EXECUTE FUNCTION ${TRIGGER_FUNCTION}();
  `);

  await knex.schema.createTable(MESSAGES_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("ticket_id")
      .notNullable()
      .references("id")
      .inTable(TICKETS_TABLE)
      .onDelete("CASCADE");
    table
      .integer("author_user_id")
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table
      .enu("author_role", ["client", "admin", "system"], {
        useNative: true,
        enumName: "support_message_author_role",
      })
      .notNullable();
    table
      .enu("visibility", ["client_visible", "internal"], {
        useNative: true,
        enumName: "support_message_visibility",
      })
      .notNullable()
      .defaultTo("client_visible");
    table.text("body").notNullable();
    table.timestamps(true, true);

    table.index(["ticket_id", "created_at"]);
    table.index(["visibility", "created_at"]);
  });

  await knex.raw(`
    CREATE TRIGGER ${MESSAGES_TABLE}_updated_at
    BEFORE UPDATE ON ${MESSAGES_TABLE}
    FOR EACH ROW EXECUTE FUNCTION ${TRIGGER_FUNCTION}();
  `);

  await knex.schema.createTable(EVENTS_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("ticket_id")
      .notNullable()
      .references("id")
      .inTable(TICKETS_TABLE)
      .onDelete("CASCADE");
    table
      .integer("actor_user_id")
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.string("event_type", 80).notNullable();
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["ticket_id", "created_at"]);
    table.index(["event_type", "created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(EVENTS_TABLE);
  await knex.schema.dropTableIfExists(MESSAGES_TABLE);
  await knex.schema.dropTableIfExists(TICKETS_TABLE);

  await knex.raw("DROP TYPE IF EXISTS support_message_visibility");
  await knex.raw("DROP TYPE IF EXISTS support_message_author_role");
  await knex.raw("DROP TYPE IF EXISTS support_ticket_priority");
  await knex.raw("DROP TYPE IF EXISTS support_ticket_severity");
  await knex.raw("DROP TYPE IF EXISTS support_ticket_status");
  await knex.raw("DROP TYPE IF EXISTS support_ticket_type");
  await knex.raw(`DROP FUNCTION IF EXISTS ${TRIGGER_FUNCTION}()`);
  await knex.raw(`DROP SEQUENCE IF EXISTS ${SEQUENCE_NAME}`);
}
