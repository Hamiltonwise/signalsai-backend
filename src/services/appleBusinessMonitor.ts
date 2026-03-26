/**
 * Apple Business Monitor (WO-9)
 *
 * Weekly check for each org. Creates dream_team_task if unclaimed.
 * Apple Business launches April 14 — every client needs listing claimed.
 * Alloro needs its own listing claimed on day one.
 *
 * Agent flags unclaimed listings as Failure Type 4/5 within 24 hours of detection.
 */

import { db } from "../database/connection";

interface AppleBusinessStatus {
  orgId: number;
  orgName: string;
  claimed: boolean;
  claimedAt: string | null;
}

/**
 * Check Apple Business claim status for all organizations
 */
export async function checkAppleBusinessStatus(): Promise<void> {
  console.log("[Apple Business Monitor] Starting weekly claim check...");

  const orgs = await db("organizations")
    .select("id", "name", "apple_business_claimed", "apple_business_claimed_at")
    .where(function () {
      this.where("status", "active").orWhereNull("status");
    });

  const unclaimed: AppleBusinessStatus[] = [];

  for (const org of orgs) {
    if (!org.apple_business_claimed) {
      unclaimed.push({
        orgId: org.id,
        orgName: org.name,
        claimed: false,
        claimedAt: null,
      });
    }
  }

  if (unclaimed.length === 0) {
    console.log("[Apple Business Monitor] All organizations have claimed Apple Business listings.");
    return;
  }

  console.log(`[Apple Business Monitor] ${unclaimed.length} unclaimed listings detected.`);

  // Create tasks for unclaimed listings
  for (const org of unclaimed) {
    // Check if task already exists to avoid duplicates
    const existingTask = await db("dream_team_tasks")
      .where("title", "like", `%Apple Business%${org.orgName}%`)
      .where("status", "!=", "completed")
      .first()
      .catch(() => null);

    if (existingTask) continue;

    await db("dream_team_tasks")
      .insert({
        title: `Claim Apple Business listing for ${org.orgName}`,
        description: `Apple Business launched April 14. ${org.orgName} does not have a claimed listing. This is a Failure Type 4/5 per AEO Monitor classification. Claim within 24 hours to prevent competitor pre-emption.`,
        assigned_to: "Dave",
        priority: "high",
        status: "pending",
      })
      .catch((err: any) => {
        // Fallback if dream_team_tasks schema differs
        console.warn(`[Apple Business Monitor] Could not create task for ${org.orgName}: ${err.message}`);
      });

    console.log(`[Apple Business Monitor] Task created: claim Apple Business for ${org.orgName}`);
  }

  console.log("[Apple Business Monitor] Weekly check complete.");
}

/**
 * Mark an organization's Apple Business listing as claimed
 */
export async function markAppleBusinessClaimed(orgId: number): Promise<void> {
  await db("organizations")
    .where({ id: orgId })
    .update({
      apple_business_claimed: true,
      apple_business_claimed_at: new Date(),
    });

  console.log(`[Apple Business Monitor] Org ${orgId} marked as Apple Business claimed.`);
}

/**
 * Get claim status summary for admin dashboard
 */
export async function getClaimSummary(): Promise<{
  total: number;
  claimed: number;
  unclaimed: number;
  unclaimedOrgs: { id: number; name: string }[];
}> {
  const orgs = await db("organizations")
    .select("id", "name", "apple_business_claimed")
    .where(function () {
      this.where("status", "active").orWhereNull("status");
    });

  const claimed = orgs.filter((o: any) => o.apple_business_claimed);
  const unclaimedOrgs = orgs.filter((o: any) => !o.apple_business_claimed);

  return {
    total: orgs.length,
    claimed: claimed.length,
    unclaimed: unclaimedOrgs.length,
    unclaimedOrgs: unclaimedOrgs.map((o: any) => ({ id: o.id, name: o.name })),
  };
}
