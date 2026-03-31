/**
 * Bootstrap -- one-time team account setup
 * POST /api/bootstrap/team
 * Idempotent: creates missing accounts, sets passwords on existing ones.
 */

import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../database/connection";

const bootstrapRoutes = express.Router();

const TEAM = [
  { email: "corey@getalloro.com", firstName: "Corey", lastName: "Wise", role: "admin" },
  { email: "jordan@getalloro.com", firstName: "Jordan", lastName: "Caballero", role: "admin" },
  { email: "dave@getalloro.com", firstName: "Dave", lastName: "Santos", role: "admin" },
  { email: "info@getalloro.com", firstName: "Alloro", lastName: "Admin", role: "admin" },
];

bootstrapRoutes.post("/team", async (req, res) => {
  const results: string[] = [];
  try {
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
        const hash = await bcrypt.hash("alloro2026", 12);
        await db("users").where({ id: user.id }).update({ email_verified: true, password_hash: hash });
        results.push(`User exists, password set: ${member.email} (id: ${user.id})`);
      }

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

    console.log(`[Bootstrap] Complete:`, results);
    return res.json({ success: true, results });
  } catch (error: any) {
    console.error("[Bootstrap] Error:", error.message);
    return res.status(500).json({ success: false, error: error.message, results });
  }
});

export default bootstrapRoutes;
