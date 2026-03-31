/**
 * Bootstrap -- one-time team account setup
 *
 * POST /api/bootstrap/team
 *
 * Creates Corey, Jo, and Dave user accounts + a shared demo org.
 * Self-sealing: works without token on first run, locks after accounts exist.
 */

import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../database/connection";

const bootstrapRoutes = express.Router();

const TEAM = [
  { email: "corey@getalloro.com", firstName: "Corey", lastName: "Wise", role: "admin" },
  { email: "jo@getalloro.com", firstName: "Jo", lastName: "Wise", role: "admin" },
  { email: "dave@getalloro.com", firstName: "Dave", lastName: "Santos", role: "admin" },
  { email: "demo@getalloro.com", firstName: "Demo", lastName: "Doctor", role: "admin" },
  { email: "info@getalloro.com", firstName: "Alloro", lastName: "Admin", role: "admin" },
];

bootstrapRoutes.post("/team", async (req, res) => {
  const results: string[] = [];

  try {
    // Self-sealing gate
    const teamEmails = TEAM.map(t => t.email);
    const existingTeam = await db("users")
      .whereIn("email", teamEmails)
      .count("id as cnt")
      .first()
      .catch(() => ({ cnt: 0 }));
    const teamExists = Number(existingTeam?.cnt || 0) > 0;

    if (teamExists) {
      const token = req.headers["x-bootstrap-token"] || req.body.token;
      const expected = process.env.BOOTSTRAP_TOKEN;
      if (!expected || token !== expected) {
        return res.json({
          success: true,
          message: "Team accounts already exist. No action needed.",
          results: [`${existingTeam?.cnt} team accounts found.`],
        });
      }
    }

    // Create Alloro HQ org (minimal columns to avoid migration dependency)
    let alloroOrg = await db("organizations").where({ name: "Alloro HQ" }).first();
    if (!alloroOrg) {
      [alloroOrg] = await db("organizations").insert({
        name: "Alloro HQ",
        subscription_status: "active",
        onboarding_completed: true,
      }).returning("*");
      results.push(`Created org: Alloro HQ (id: ${alloroOrg.id})`);
    } else {
      results.push(`Org exists: Alloro HQ (id: ${alloroOrg.id})`);
    }

    // Create each team member
    for (const member of TEAM) {
      let user = await db("users").where({ email: member.email }).first();
      if (!user) {
        const hash = await bcrypt.hash("alloro2026", 12);
        [user] = await db("users").insert({
          email: member.email,
          password_hash: hash,
          first_name: member.firstName,
          last_name: member.lastName,
          email_verified: true,
        }).returning("*");
        results.push(`Created user: ${member.email} (id: ${user.id})`);
      } else {
        await db("users").where({ id: user.id }).update({ email_verified: true });
        results.push(`User exists: ${member.email} (id: ${user.id})`);
      }

      // Link to org
      const existing = await db("organization_users")
        .where({ user_id: user.id, organization_id: alloroOrg.id })
        .first();
      if (!existing) {
        await db("organization_users").insert({
          organization_id: alloroOrg.id,
          user_id: user.id,
          role: member.role,
        });
        results.push(`  Linked to Alloro HQ as ${member.role}`);
      }
    }

    console.log(`[Bootstrap] Team setup complete:`, results);
    return res.json({ success: true, results });
  } catch (error: any) {
    console.error("[Bootstrap] Error:", error.message, error.stack);
    return res.status(500).json({ success: false, error: error.message, results });
  }
});

export default bootstrapRoutes;
