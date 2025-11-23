import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. Create organizations table
  await knex.schema.createTable("organizations", (table) => {
    table.increments("id").primary();
    table.string("name").notNullable();
    table.string("domain").nullable();
    table.timestamps(true, true);
  });

  // 2. Create organization_users table
  await knex.schema.createTable("organization_users", (table) => {
    table.increments("id").primary();
    table.integer("organization_id").references("id").inTable("organizations").onDelete("CASCADE");
    table.integer("user_id").references("id").inTable("users").onDelete("CASCADE");
    table.string("role").notNullable().defaultTo("viewer"); // admin, manager, viewer
    table.timestamps(true, true);
    table.unique(["organization_id", "user_id"]);
  });

  // 3. Create invitations table
  await knex.schema.createTable("invitations", (table) => {
    table.increments("id").primary();
    table.string("email").notNullable();
    table.integer("organization_id").references("id").inTable("organizations").onDelete("CASCADE");
    table.string("role").notNullable().defaultTo("viewer");
    table.string("token").notNullable().unique();
    table.timestamp("expires_at").notNullable();
    table.string("status").notNullable().defaultTo("pending"); // pending, accepted, expired
    table.timestamps(true, true);
  });

  // 4. Add organization_id to google_accounts
  await knex.schema.alterTable("google_accounts", (table) => {
    table.integer("organization_id").nullable().references("id").inTable("organizations").onDelete("SET NULL");
  });

  // 5. Data Migration: Create organizations for existing users
  const users = await knex("users").select("id", "email", "name");
  
  for (const user of users) {
    const orgName = user.name ? `${user.name}'s Organization` : "My Organization";
    
    // Create organization
    const [org] = await knex("organizations")
      .insert({
        name: orgName,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning("id");
      
    // Link user to organization as admin
    await knex("organization_users").insert({
      organization_id: org.id,
      user_id: user.id,
      role: "admin",
      created_at: new Date(),
      updated_at: new Date()
    });

    // Link user's google accounts to organization
    await knex("google_accounts")
      .where({ user_id: user.id })
      .update({ organization_id: org.id });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("google_accounts", (table) => {
    table.dropColumn("organization_id");
  });
  await knex.schema.dropTable("invitations");
  await knex.schema.dropTable("organization_users");
  await knex.schema.dropTable("organizations");
}
