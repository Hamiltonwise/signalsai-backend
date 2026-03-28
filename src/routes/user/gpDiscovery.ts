/**
 * GP Discovery -- WO-56
 *
 * GET  /api/user/referrals/discover      -- find GPs not in referral history
 * POST /api/user/referrals/introduction  -- generate introduction letter
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";
import { generateOutreach, type OutreachContext } from "../../services/outreachEngine";

const gpDiscoveryRoutes = express.Router();

gpDiscoveryRoutes.get(
  "/referrals/discover",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.json({ success: true, gps: [], gated: true });

      // Check if org has PMS data (Stage 3 gate)
      const hasPMS = await db("pms_jobs").where({ organization_id: orgId }).first();
      if (!hasPMS) {
        return res.json({
          success: true,
          gps: [],
          gated: true,
          gate_message: "Upload your scheduling data to discover referral sources in your area who have never sent you a case.",
        });
      }

      // Get existing referral source names for this org
      const hasTable = await db.schema.hasTable("referral_sources");
      const existingSources = new Set<string>();
      if (hasTable) {
        const sources = await db("referral_sources")
          .where({ organization_id: orgId })
          .select("gp_name", "name");
        for (const s of sources) {
          const name = (s.gp_name || s.name || "").toLowerCase().trim();
          if (name) existingSources.add(name);
        }
      }

      // In production: query Places API for nearby GPs/primary care
      // For now: return empty with instructions
      return res.json({
        success: true,
        gps: [],
        gated: false,
        existing_count: existingSources.size,
        message: "GP discovery requires Places API. Results will appear when the API is live.",
      });
    } catch (error: any) {
      console.error("[GPDiscovery] Error:", error.message);
      return res.json({ success: true, gps: [], gated: false });
    }
  },
);

gpDiscoveryRoutes.post(
  "/referrals/introduction",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const { gpName, gpAddress, distance } = req.body;
      if (!gpName) return res.status(400).json({ success: false, error: "gpName required" });

      const org = await db("organizations").where({ id: orgId }).first("name", "research_brief");
      const senderName = org?.name || "Doctor";

      // Extract irreplaceable_thing from research brief if available
      let irreplaceableThing: string | undefined;
      if (org?.research_brief) {
        try {
          const brief = typeof org.research_brief === "string" ? JSON.parse(org.research_brief) : org.research_brief;
          irreplaceableThing = brief?.irreplaceable_thing || brief?.differentiator || undefined;
        } catch { /* ignore */ }
      }

      const ctx: OutreachContext = {
        sender_name: senderName,
        sender_role: "Specialist",
        sender_location: gpAddress || "your area",
        target_name: `Dr. ${gpName}`,
        target_type: "gp",
        intelligence: {
          irreplaceable_thing: irreplaceableThing,
        },
        purpose: "gp_introduction",
        tone: "warm",
        max_words: 120,
      };

      const result = await generateOutreach(ctx);

      return res.json({ success: true, letter: result });
    } catch (error: any) {
      console.error("[GPDiscovery] Introduction error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to generate introduction" });
    }
  },
);

export default gpDiscoveryRoutes;
