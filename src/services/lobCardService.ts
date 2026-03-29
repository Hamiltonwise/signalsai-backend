/**
 * Lob Card Service -- The Will Guidara Moment (Unicorn Playbook Play 3)
 *
 * When a PatientPath site goes live, Alloro mails the owner a physical
 * card. $5 cost. Business name, the one thing that makes their business
 * irreplaceable, signed by Corey. No SaaS product does this.
 *
 * It gets shown to the spouse. It gets photographed and posted.
 * It creates a tribal moment that no dashboard can replicate.
 *
 * Requires: LOB_API_KEY environment variable.
 * Falls back to logging the intent if Lob is not configured.
 */

import { db } from "../database/connection";

interface CardData {
  orgId: number;
  recipientName: string;
  recipientAddress: {
    line1: string;
    city: string;
    state: string;
    zip: string;
  };
  businessName: string;
  irreplaceableThing: string;
}

/**
 * Send a physical card via Lob API when a PatientPath site goes live.
 */
export async function sendPatientPathCard(orgId: number): Promise<boolean> {
  try {
    const org = await db("organizations").where({ id: orgId }).first(
      "name", "operational_jurisdiction", "research_brief"
    );
    if (!org) return false;

    // Extract the irreplaceable thing from research brief
    let irreplaceableThing = "the way you serve your community";
    if (org.research_brief) {
      try {
        const brief = typeof org.research_brief === "string"
          ? JSON.parse(org.research_brief)
          : org.research_brief;
        if (brief?.irreplaceable_thing) {
          irreplaceableThing = brief.irreplaceable_thing;
        } else if (brief?.findings && brief.findings.length > 0) {
          irreplaceableThing = brief.findings[0];
        }
      } catch { /* use default */ }
    }

    const LOB_API_KEY = process.env.LOB_API_KEY;

    if (!LOB_API_KEY) {
      // Log intent for when Lob is configured
      console.log(`[LobCard] Would send card to ${org.name} (org ${orgId})`);
      console.log(`[LobCard] Irreplaceable thing: ${irreplaceableThing}`);

      // Log as behavioral event for tracking
      const hasTable = await db.schema.hasTable("behavioral_events");
      if (hasTable) {
        await db("behavioral_events").insert({
          organization_id: orgId,
          event_type: "lob.card_queued",
          metadata: JSON.stringify({
            business_name: org.name,
            irreplaceable_thing: irreplaceableThing,
            reason: "LOB_API_KEY not configured",
          }),
        }).catch(() => {});
      }

      return false;
    }

    // Card copy -- the Will Guidara moment
    const frontCopy = org.name;
    const backCopy = [
      `${org.name},`,
      "",
      `What makes you irreplaceable:`,
      irreplaceableThing,
      "",
      "We built your site around this.",
      "Nobody else in your market can say it.",
      "",
      "Corey Wise",
      "Alloro",
    ].join("\n");

    // Send via Lob API
    const response = await fetch("https://api.lob.com/v1/postcards", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(LOB_API_KEY + ":").toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description: `PatientPath launch card for ${org.name}`,
        to: {
          name: org.name,
          address_line1: org.operational_jurisdiction || "Business Owner",
          address_city: org.operational_jurisdiction?.split(",")[0]?.trim() || "",
          address_state: org.operational_jurisdiction?.split(",")[1]?.trim() || "",
          address_zip: "00000", // Would need real address from GBP data
        },
        front: `<html><body style="font-family: Georgia, serif; padding: 40px; text-align: center;"><h1 style="color: #212D40; font-size: 28px;">${frontCopy}</h1><p style="color: #D56753; font-size: 14px; margin-top: 20px;">Business Clarity by Alloro</p></body></html>`,
        back: `<html><body style="font-family: Georgia, serif; padding: 30px; font-size: 13px; color: #212D40; line-height: 1.6;"><p>${backCopy.replace(/\n/g, "<br>")}</p></body></html>`,
        size: "4x6",
      }),
    });

    const result = await response.json();

    if (result.id) {
      console.log(`[LobCard] Sent card ${result.id} to ${org.name}`);

      // Log success
      const hasTable = await db.schema.hasTable("behavioral_events");
      if (hasTable) {
        await db("behavioral_events").insert({
          organization_id: orgId,
          event_type: "lob.card_sent",
          metadata: JSON.stringify({
            lob_id: result.id,
            business_name: org.name,
            irreplaceable_thing: irreplaceableThing,
          }),
        }).catch(() => {});
      }

      return true;
    }

    console.error(`[LobCard] Failed for ${org.name}:`, result);
    return false;
  } catch (error: any) {
    console.error(`[LobCard] Error for org ${orgId}:`, error.message);
    return false;
  }
}
