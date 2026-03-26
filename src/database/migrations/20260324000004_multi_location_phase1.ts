/**
 * Migration: Multi-Location + Role-Based Permissions — Phase 1
 *
 * The Kargoli Architecture: Account → Locations → Users → Roles
 *
 * Creates:
 *   1. accounts — billing entity above organizations
 *   2. Adds columns to locations — address, city, state, place_id, lat, lng, specialty, gbp_connected
 *   3. location_members — per-location role (owner/manager/staff/read_only)
 *
 * Converts:
 *   - Each existing organization → one account row
 *   - Enriches primary location with org business_data (city/state/address)
 *   - All existing users with org access → owner role on all their org's locations
 *
 * Non-destructive: existing tables stay intact. Additive only.
 */

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ─── 1. Create accounts table ───────────────────────────────────

  await knex.schema.createTable("accounts", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("name", 200).notNullable();
    t.integer("owner_user_id").references("id").inTable("users").onDelete("SET NULL");
    t.string("stripe_customer_id", 100);
    t.string("subscription_status", 50);
    t.boolean("baa_signed").defaultTo(false);
    t.timestamp("baa_signed_at", { useTz: true });
    // Link back to legacy org for backward compatibility during transition
    t.integer("legacy_organization_id").references("id").inTable("organizations").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX idx_accounts_owner ON accounts(owner_user_id)");
  await knex.raw("CREATE INDEX idx_accounts_legacy_org ON accounts(legacy_organization_id)");

  // ─── 2. Add columns to existing locations table ─────────────────

  await knex.schema.alterTable("locations", (t) => {
    t.text("address");
    t.string("city", 100);
    t.string("state", 50);
    t.string("place_id", 200);
    t.decimal("lat", 10, 7);
    t.decimal("lng", 10, 7);
    t.string("specialty", 100);
    t.boolean("gbp_connected").defaultTo(false);
    // Link to accounts table (nullable during transition — populated by migration)
    t.uuid("account_id").references("id").inTable("accounts").onDelete("SET NULL");
  });

  await knex.raw("CREATE INDEX idx_locations_account_id ON locations(account_id)");
  await knex.raw("CREATE INDEX idx_locations_place_id ON locations(place_id)");

  // ─── 3. Create location_members table ───────────────────────────

  await knex.schema.createTable("location_members", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("location_id").references("id").inTable("locations").onDelete("CASCADE");
    t.integer("user_id").references("id").inTable("users").onDelete("CASCADE");
    t.string("role", 50).notNullable(); // owner, manager, staff, read_only
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    t.unique(["location_id", "user_id"]);
  });

  await knex.raw("CREATE INDEX idx_location_members_user ON location_members(user_id)");
  await knex.raw("CREATE INDEX idx_location_members_role ON location_members(role)");

  // ─── 4. Migrate existing data ──────────────────────────────────

  // 4a. Each organization → one account
  const orgs = await knex("organizations").select("*");

  for (const org of orgs) {
    // Find the admin/owner user for this org
    const adminUser = await knex("organization_users")
      .where({ organization_id: org.id, role: "admin" })
      .first();

    const [account] = await knex("accounts")
      .insert({
        name: org.name,
        owner_user_id: adminUser?.user_id || null,
        stripe_customer_id: org.stripe_customer_id || null,
        subscription_status: org.subscription_status || null,
        legacy_organization_id: org.id,
      })
      .returning("*");

    // 4b. Enrich locations with account_id and business_data fields
    const locations = await knex("locations").where({ organization_id: org.id });

    for (const loc of locations) {
      const updates: Record<string, any> = { account_id: account.id };

      // Try to extract city/state/address from business_data if available
      const bd = loc.business_data
        ? typeof loc.business_data === "string"
          ? JSON.parse(loc.business_data)
          : loc.business_data
        : null;

      if (bd) {
        if (bd.city && !loc.city) updates.city = bd.city;
        if (bd.state && !loc.state) updates.state = bd.state;
        if (bd.address && !loc.address) updates.address = bd.address;
        if (bd.place_id && !loc.place_id) updates.place_id = bd.place_id;
        if (bd.latitude && !loc.lat) updates.lat = bd.latitude;
        if (bd.longitude && !loc.lng) updates.lng = bd.longitude;
        if (bd.specialty && !loc.specialty) updates.specialty = bd.specialty;
        if (bd.category && !loc.specialty) updates.specialty = bd.category;
      }

      // Check if GBP is connected via google_properties
      const gbpProp = await knex("google_properties")
        .where({ location_id: loc.id, type: "gbp" })
        .first()
        .catch(() => null); // table may not exist in all envs
      if (gbpProp) updates.gbp_connected = true;

      await knex("locations").where({ id: loc.id }).update(updates);
    }

    // 4c. All users with org access → owner role on all org locations
    const orgUsers = await knex("organization_users").where({
      organization_id: org.id,
    });

    for (const orgUser of orgUsers) {
      for (const loc of locations) {
        // Map existing roles: admin → owner, manager → manager, viewer → read_only
        let locationRole = "owner";
        if (orgUser.role === "manager") locationRole = "manager";
        if (orgUser.role === "viewer") locationRole = "read_only";

        await knex("location_members")
          .insert({
            location_id: loc.id,
            user_id: orgUser.user_id,
            role: locationRole,
          })
          .onConflict(["location_id", "user_id"])
          .ignore();
      }
    }
  }

  console.log(
    `[Migration] Multi-location Phase 1 complete: ${orgs.length} org(s) → accounts, locations enriched, location_members populated`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("location_members");

  await knex.schema.alterTable("locations", (t) => {
    t.dropColumn("account_id");
    t.dropColumn("gbp_connected");
    t.dropColumn("specialty");
    t.dropColumn("lng");
    t.dropColumn("lat");
    t.dropColumn("place_id");
    t.dropColumn("state");
    t.dropColumn("city");
    t.dropColumn("address");
  });

  await knex.schema.dropTableIfExists("accounts");
}
