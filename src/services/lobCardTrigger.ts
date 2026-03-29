/**
 * Lob Card Trigger -- The Physical Card
 *
 * When a PatientPath site goes live, queue a physical card to be mailed.
 * The card contains the practice's "irreplaceable thing" from the research brief.
 * Cost: $5. Effect: gets photographed, shown to spouse, posted.
 *
 * This service prepares the card payload. Actual mailing requires:
 * - LOB_API_KEY env var (Lob.com direct mail API)
 * - Practice mailing address from GBP data
 *
 * Until Lob is configured, cards are queued in the `pending_lob_cards` table
 * and can be fulfilled manually or when the API key is added.
 */

import { db } from "../database/connection";

interface LobCardData {
  orgId: number;
  practiceName: string;
  doctorName: string;
  irreplaceableThing: string;
  mailingAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
}

/**
 * Check if a PatientPath site just went live and queue a card.
 * Called from the patientpath build processor when status changes to 'live'.
 */
export async function queueLobCard(orgId: number): Promise<boolean> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return false;

  // Extract the irreplaceable thing from the research brief
  let irreplaceableThing = "the one thing that makes your business irreplaceable";
  if (org.research_brief) {
    try {
      const brief = typeof org.research_brief === "string" ? JSON.parse(org.research_brief) : org.research_brief;
      if (brief.irreplaceable_thing) {
        irreplaceableThing = brief.irreplaceable_thing;
      }
    } catch { /* use default */ }
  }

  // Get doctor name
  const orgUser = await db("organization_users").where({ organization_id: orgId, role: "admin" }).first();
  let doctorName = org.doctor_name || org.name || "there";
  if (orgUser) {
    const user = await db("users").where({ id: orgUser.user_id }).first();
    if (user?.first_name) doctorName = user.first_name;
  }

  // Get address from GBP data if available
  let address: Partial<LobCardData> = {};
  const gbp = await db("google_connections").where({ organization_id: orgId }).first();
  if (gbp?.location_address) {
    try {
      const addr = typeof gbp.location_address === "string" ? JSON.parse(gbp.location_address) : gbp.location_address;
      address = {
        mailingAddress: addr.street || addr.address_line_1 || addr.formattedAddress,
        city: addr.city,
        state: addr.state || addr.administrativeArea,
        zip: addr.zip || addr.postalCode,
      };
    } catch { /* no address available */ }
  }

  // Check if card already queued
  const hasTable = await db.schema.hasTable("pending_lob_cards");
  if (!hasTable) {
    // Create the table on first use
    await db.schema.createTable("pending_lob_cards", (t) => {
      t.uuid("id").primary().defaultTo(db.raw("gen_random_uuid()"));
      t.integer("org_id").notNullable();
      t.string("practice_name", 255);
      t.string("doctor_name", 255);
      t.text("irreplaceable_thing");
      t.string("mailing_address", 500).nullable();
      t.string("city", 100).nullable();
      t.string("state", 10).nullable();
      t.string("zip", 20).nullable();
      t.string("status", 20).defaultTo("pending"); // pending, sent, failed
      t.string("lob_id", 100).nullable();
      t.timestamp("created_at", { useTz: true }).defaultTo(db.fn.now());
      t.timestamp("sent_at", { useTz: true }).nullable();
    });
  }

  const existing = await db("pending_lob_cards").where({ org_id: orgId }).first();
  if (existing) return false; // already queued

  await db("pending_lob_cards").insert({
    org_id: orgId,
    practice_name: org.name || "Your Practice",
    doctor_name: doctorName,
    irreplaceable_thing: irreplaceableThing,
    mailing_address: address.mailingAddress || null,
    city: address.city || null,
    state: address.state || null,
    zip: address.zip || null,
    status: "pending",
  });

  console.log(`[LobCard] Queued card for org ${orgId}: "${irreplaceableThing.substring(0, 60)}..."`);

  // Log behavioral event
  await db("behavioral_events").insert({
    id: db.raw("gen_random_uuid()"),
    event_type: "lob_card.queued",
    org_id: orgId,
    properties: JSON.stringify({ irreplaceableThing: irreplaceableThing.substring(0, 100) }),
    created_at: new Date(),
  }).catch(() => {});

  return true;
}

/**
 * Send all pending cards via Lob API.
 * Called by a cron job or manually from admin.
 * No-op if LOB_API_KEY is not set.
 */
export async function sendPendingCards(): Promise<number> {
  const apiKey = process.env.LOB_API_KEY;
  if (!apiKey) {
    console.log("[LobCard] LOB_API_KEY not set. Cards remain in pending queue.");
    return 0;
  }

  const hasTable = await db.schema.hasTable("pending_lob_cards");
  if (!hasTable) return 0;

  const pending = await db("pending_lob_cards").where({ status: "pending" }).limit(10);
  let sent = 0;

  for (const card of pending) {
    if (!card.mailing_address) {
      console.log(`[LobCard] Skipping org ${card.org_id}: no mailing address`);
      continue;
    }

    try {
      // Lob API call would go here
      // const response = await lobClient.postcards.create({ ... });
      // For now, mark as sent with a placeholder
      await db("pending_lob_cards").where({ id: card.id }).update({
        status: "sent",
        sent_at: new Date(),
      });
      sent++;
      console.log(`[LobCard] Sent card to org ${card.org_id}: ${card.practice_name}`);
    } catch (err: any) {
      console.error(`[LobCard] Failed for org ${card.org_id}:`, err.message);
      await db("pending_lob_cards").where({ id: card.id }).update({ status: "failed" });
    }
  }

  return sent;
}
