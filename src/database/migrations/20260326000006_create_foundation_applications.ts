import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("foundation_applications", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("program", 20).notNullable(); // heroes or founders
    t.string("name", 200).notNullable();
    t.string("email", 320).notNullable();
    t.string("phone", 30).nullable();
    t.string("practice_name", 300).notNullable();
    t.string("specialty", 100).notNullable();
    t.string("city", 100).notNullable();
    t.string("state", 50).notNullable();
    t.string("veteran_status", 30).nullable();
    t.text("story").nullable();
    t.string("status", 20).defaultTo("pending"); // pending, reviewed, approved, declined
    t.text("reviewer_notes").nullable();
    t.timestamps(true, true);
  });
  await knex.schema.raw(
    "CREATE INDEX idx_foundation_app_status ON foundation_applications(status)"
  );
  await knex.schema.raw(
    "CREATE INDEX idx_foundation_app_program ON foundation_applications(program)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("foundation_applications");
}
