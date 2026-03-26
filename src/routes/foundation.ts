/**
 * Foundation Application API (WO-11 completion)
 *
 * POST /api/foundation/apply   -- submit application
 * GET  /api/foundation/applications -- list applications (admin)
 */

import express from "express";
import { db } from "../database/connection";
import { authenticateToken } from "../middleware/auth";
import { superAdminMiddleware } from "../middleware/superAdmin";

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

    const [application] = await db("foundation_applications")
      .insert({
        program,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        practice_name: practiceName.trim(),
        specialty: specialty.trim(),
        city: city.trim(),
        state: state.trim(),
        veteran_status: veteranStatus || null,
        story: story?.trim() || null,
        status: "pending",
      })
      .returning("id");

    console.log(
      `[Foundation] New ${program} application from ${name} (${email}), ID: ${application.id}`
    );

    return res.json({
      success: true,
      id: application.id,
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
