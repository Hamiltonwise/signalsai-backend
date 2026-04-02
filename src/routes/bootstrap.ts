/**
 * Bootstrap -- one-time team account setup
 * POST /api/bootstrap/team
 *
 * SECURITY: Requires superAdmin authentication + BOOTSTRAP_SECRET env var.
 * Without both, this route returns 403. Passwords are read from env vars,
 * never hardcoded in source. If env vars are not set, uses secure random
 * passwords and logs them to the console (one-time setup).
 */

import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../database/connection";
import { authenticateToken } from "../middleware/auth";
import { superAdminMiddleware } from "../middleware/superAdmin";

const bootstrapRoutes = express.Router();

const TEAM = [
  { email: "corey@getalloro.com", firstName: "Corey", lastName: "Wise", role: "admin" },
  { email: "jordan@getalloro.com", firstName: "Jordan", lastName: "Caballero", role: "admin" },
  { email: "dave@getalloro.com", firstName: "Dave", lastName: "Santos", role: "admin" },
  { email: "info@getalloro.com", firstName: "Alloro", lastName: "Admin", role: "admin" },
];

bootstrapRoutes.post("/team", authenticateToken, superAdminMiddleware, async (req, res) => {
  // Double-gate: require BOOTSTRAP_SECRET in addition to superAdmin auth
  const secret = req.headers["x-bootstrap-secret"] || req.body?.bootstrapSecret;
  if (!process.env.BOOTSTRAP_SECRET || secret !== process.env.BOOTSTRAP_SECRET) {
    return res.status(403).json({
      success: false,
      error: "BOOTSTRAP_SECRET required. Set it in .env and pass it in x-bootstrap-secret header.",
    });
  }

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
      // Read password from env var (BOOTSTRAP_PASSWORD_COREY, etc.) or generate secure random
      const envKey = `BOOTSTRAP_PASSWORD_${member.firstName.toUpperCase()}`;
      const password = process.env[envKey] || crypto.randomBytes(16).toString("hex");
      const isGenerated = !process.env[envKey];

      let user = await db("users").where({ email: member.email }).first();
      if (!user) {
        const hash = await bcrypt.hash(password, 12);
        [user] = await db("users").insert({
          email: member.email,
          password_hash: hash,
          first_name: member.firstName,
          last_name: member.lastName,
          email_verified: true,
        }).returning("*");
        results.push(`Created user: ${member.email} (id: ${user.id})`);
      } else {
        const hash = await bcrypt.hash(password, 12);
        await db("users").where({ id: user.id }).update({ email_verified: true, password_hash: hash });
        results.push(`User exists, password reset: ${member.email} (id: ${user.id})`);
      }

      if (isGenerated) {
        // Log generated password to console only (never in response)
        console.log(`[Bootstrap] Generated password for ${member.email}: ${password}`);
        results.push(`  Password generated (check server logs)`);
      } else {
        results.push(`  Password set from ${envKey} env var`);
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
