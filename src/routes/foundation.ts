/**
 * Foundation Application API (WO-11 completion)
 *
 * POST /api/foundation/apply   -- submit application
 * GET  /api/foundation/applications -- list applications (admin)
 */

import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "../database/connection";
import { authenticateToken } from "../middleware/auth";
import { superAdminMiddleware } from "../middleware/superAdmin";
import { BehavioralEventModel } from "../models/BehavioralEventModel";

const foundationRoutes = express.Router();

/**
 * POST /api/foundation/apply
 * Public endpoint. Accepts foundation applications from /foundation/apply.
 */
foundationRoutes.post("/apply", async (req, res) => {
  try {
    const {
      program,
      name,
      email,
      phone,
      practiceName,
      specialty,
      city,
      state,
      veteranStatus,
      story,
    } = req.body;

    // Validate required fields
    if (!program || !name || !email || !practiceName || !specialty || !city || !state) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields.",
      });
    }

    if (!["heroes", "founders"].includes(program)) {
      return res.status(400).json({
        success: false,
        error: "Invalid program. Must be 'heroes' or 'founders'.",
      });
    }

    // Heroes program requires veteran status
    if (program === "heroes" && !veteranStatus) {
      return res.status(400).json({
        success: false,
        error: "Veteran status is required for the Heroes Initiative.",
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    const nameParts = cleanName.split(" ");
    const firstName = nameParts[0] || cleanName;
    const lastName = nameParts.slice(1).join(" ") || "";

    const [application] = await db("foundation_applications")
      .insert({
        program,
        name: cleanName,
        email: cleanEmail,
        phone: phone?.trim() || null,
        practice_name: practiceName.trim(),
        specialty: specialty.trim(),
        city: city.trim(),
        state: state.trim(),
        veteran_status: veteranStatus || null,
        story: story?.trim() || null,
        status: "approved", // Honor system. Immediate access. Post-hoc verification.
      })
      .returning("id");

    console.log(
      `[Foundation] New ${program} application from ${cleanName} (${cleanEmail}), ID: ${application.id}`
    );

    // Auto-create account: the Foundation is the soul of Alloro.
    // A veteran who found the courage to apply should not wait.
    let token: string | null = null;
    try {
      // Check if user already exists
      const existingUser = await db("users").where({ email: cleanEmail }).first();

      if (existingUser) {
        // Existing user: update their org to foundation type
        const orgUser = await db("organization_users").where({ user_id: existingUser.id }).first();
        if (orgUser) {
          const hasCol = await db.schema.hasColumn("organizations", "account_type");
          if (hasCol) {
            await db("organizations").where({ id: orgUser.organization_id }).update({ account_type: "foundation" });
          }
        }
        token = jwt.sign(
          { userId: existingUser.id, email: cleanEmail },
          process.env.JWT_SECRET || "dev-secret",
          { expiresIn: "30d" }
        );
      } else {
        // New user: create account with temporary password
        const tempPassword = crypto.randomBytes(4).toString("hex"); // 8 char hex
        const passwordHash = await bcrypt.hash(tempPassword, 12);

        const [user] = await db("users")
          .insert({
            email: cleanEmail,
            password_hash: passwordHash,
            first_name: firstName,
            last_name: lastName,
            force_password_change: true,
          })
          .returning("*");

        const [org] = await db("organizations")
          .insert({
            name: practiceName.trim(),
            owner_user_id: user.id,
            ...(await db.schema.hasColumn("organizations", "account_type") ? { account_type: "foundation" } : {}),
          })
          .returning("*");

        await db("organization_users").insert({
          user_id: user.id,
          organization_id: org.id,
          role: "admin",
        });

        token = jwt.sign(
          { userId: user.id, email: cleanEmail },
          process.env.JWT_SECRET || "dev-secret",
          { expiresIn: "30d" }
        );

        // Log the moment
        await BehavioralEventModel.create({
          event_type: "foundation.account_created",
          org_id: org.id,
          properties: {
            program,
            veteran_status: veteranStatus || null,
            application_id: application.id,
          },
        }).catch(() => {});

        console.log(`[Foundation] Account created for ${cleanName} (${cleanEmail}), org ${org.id}`);
      }
    } catch (accountErr: any) {
      console.error(`[Foundation] Account creation failed (application saved): ${accountErr.message}`);
      // Application is saved even if account creation fails
    }

    return res.json({
      success: true,
      id: application.id,
      token, // Frontend can use this to auto-login
    });
  } catch (error: any) {
    console.error("[Foundation] Application error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Application submission failed. Please try again.",
    });
  }
});

/**
 * GET /api/foundation/applications
 * Admin-only. List all foundation applications.
 */
foundationRoutes.get(
  "/applications",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { status, program } = req.query;

      let query = db("foundation_applications").orderBy("created_at", "desc");
      if (status) query = query.where({ status });
      if (program) query = query.where({ program });

      const applications = await query;
      return res.json({ success: true, applications });
    } catch (error: any) {
      console.error("[Foundation] List error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to list applications" });
    }
  }
);

export default foundationRoutes;
