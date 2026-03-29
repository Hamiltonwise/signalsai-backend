/**
 * Champion Client Routes (Heroes & Founders Foundation)
 *
 * GET  /api/user/champion       -- get champion status
 * POST /api/user/champion/opt-in  -- opt into Champion ($50/month funds a Heroes seat)
 * POST /api/user/champion/opt-out -- opt out
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";

const championRoutes = express.Router();

championRoutes.get(
  "/champion",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    const orgId = req.organizationId;
    if (!orgId) return res.json({ success: true, isChampion: false });

    const org = await db("organizations").where({ id: orgId }).first("is_champion", "champion_since", "champion_hero_org_name");
    return res.json({
      success: true,
      isChampion: !!org?.is_champion,
      championSince: org?.champion_since || null,
      heroOrgName: org?.champion_hero_org_name || null,
    });
  }
);

championRoutes.post(
  "/champion/opt-in",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ success: false });

    await db("organizations").where({ id: orgId }).update({
      is_champion: true,
      champion_since: new Date(),
    });

    // Log behavioral event
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "champion.opted_in",
      org_id: orgId,
      properties: JSON.stringify({}),
      created_at: new Date(),
    }).catch(() => {});

    return res.json({
      success: true,
      message: "You're a Champion. $50/month funds a Heroes seat for a veteran or first responder business owner.",
    });
  }
);

championRoutes.post(
  "/champion/opt-out",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ success: false });

    await db("organizations").where({ id: orgId }).update({
      is_champion: false,
      champion_since: null,
    });

    return res.json({ success: true });
  }
);

export default championRoutes;
