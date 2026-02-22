import { Knex } from "knex";

interface GbpEntry {
  accountId: string;
  locationId: string;
  displayName: string;
}

export async function up(knex: Knex): Promise<void> {
  // Step 1: Get all organizations
  const organizations = await knex("organizations").select("id", "name", "domain");

  // Step 2: Get all google_connections with their property IDs
  const connections = await knex("google_connections").select(
    "id",
    "organization_id",
    "google_property_ids"
  );

  // Build a map: org_id → connections with GBP entries
  const orgConnectionMap = new Map<
    number,
    Array<{ connectionId: number; gbpEntries: GbpEntry[] }>
  >();

  for (const conn of connections) {
    if (!conn.organization_id) continue;

    let propertyIds = conn.google_property_ids;
    if (typeof propertyIds === "string") {
      try {
        propertyIds = JSON.parse(propertyIds);
      } catch {
        continue;
      }
    }

    const gbpEntries: GbpEntry[] = propertyIds?.gbp || [];
    if (gbpEntries.length === 0) continue;

    if (!orgConnectionMap.has(conn.organization_id)) {
      orgConnectionMap.set(conn.organization_id, []);
    }
    orgConnectionMap.get(conn.organization_id)!.push({
      connectionId: conn.id,
      gbpEntries,
    });
  }

  const now = new Date();

  for (const org of organizations) {
    const connectionData = orgConnectionMap.get(org.id);

    if (connectionData && connectionData.length > 0) {
      // Org has GBP properties — create a location per GBP entry
      let isFirst = true;

      for (const { connectionId, gbpEntries } of connectionData) {
        for (const entry of gbpEntries) {
          // Create the location
          const [location] = await knex("locations")
            .insert({
              organization_id: org.id,
              name: entry.displayName || org.name,
              domain: org.domain,
              is_primary: isFirst,
              created_at: now,
              updated_at: now,
            })
            .returning("id");

          const locationId =
            typeof location === "object" ? location.id : location;

          // Create the google_properties row linking location → GBP
          await knex("google_properties").insert({
            location_id: locationId,
            google_connection_id: connectionId,
            type: "gbp",
            external_id: entry.locationId,
            account_id: entry.accountId,
            display_name: entry.displayName,
            metadata: null,
            selected: true,
            created_at: now,
            updated_at: now,
          });

          isFirst = false;
        }
      }
    } else {
      // Org has no GBP properties — create a default primary location
      await knex("locations").insert({
        organization_id: org.id,
        name: org.name,
        domain: org.domain,
        is_primary: true,
        created_at: now,
        updated_at: now,
      });
    }
  }

  // Log summary
  const locationCount = await knex("locations").count("id as count").first();
  const propertyCount = await knex("google_properties")
    .count("id as count")
    .first();
  console.log(
    `[Seed] Created ${locationCount?.count} locations and ${propertyCount?.count} google_properties`
  );
}

export async function down(knex: Knex): Promise<void> {
  // Reverse order: properties depend on locations
  await knex("google_properties").del();
  await knex("locations").del();
}
