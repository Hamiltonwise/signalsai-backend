/**
 * Knowledge Lattice + Sentiment Lattice API
 *
 * GET  /api/admin/knowledge-lattice/entries  -- cached knowledge lattice entries
 * GET  /api/admin/sentiment-lattice/entries  -- cached sentiment lattice entries
 * POST /api/admin/knowledge-lattice/add      -- add entry to knowledge lattice
 * POST /api/admin/sentiment-lattice/add      -- add entry to sentiment lattice
 *
 * Uses lattice_cache table as local cache. Notion sync is manual or future cron.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const knowledgeLatticeRoutes = express.Router();

// --- Knowledge Lattice -------------------------------------------------------

knowledgeLatticeRoutes.get(
  "/knowledge-lattice/entries",
  authenticateToken,
  superAdminMiddleware,
  async (_req: any, res) => {
    try {
      const row = await db("lattice_cache").where({ lattice_type: "knowledge" }).first();
      const entries = row?.entries
        ? (typeof row.entries === "string" ? JSON.parse(row.entries) : row.entries)
        : [];
      return res.json({ success: true, entries, updated_at: row?.updated_at });
    } catch (error: any) {
      console.error("[KnowledgeLattice] Fetch error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load entries" });
    }
  },
);

knowledgeLatticeRoutes.post(
  "/knowledge-lattice/add",
  authenticateToken,
  superAdminMiddleware,
  async (req: any, res) => {
    try {
      const { name, category, core_principle, agent_heuristic, anti_pattern } = req.body;
      if (!name?.trim() || !core_principle?.trim()) {
        return res.status(400).json({ success: false, error: "Name and core principle are required" });
      }

      const row = await db("lattice_cache").where({ lattice_type: "knowledge" }).first();
      const entries = row?.entries
        ? (typeof row.entries === "string" ? JSON.parse(row.entries) : row.entries)
        : [];

      entries.push({
        id: `kl-${Date.now()}`,
        name: name.trim(),
        category: category?.trim() || "Uncategorized",
        core_principle: core_principle.trim(),
        agent_heuristic: agent_heuristic?.trim() || null,
        anti_pattern: anti_pattern?.trim() || null,
        added_at: new Date().toISOString(),
      });

      await db("lattice_cache")
        .where({ lattice_type: "knowledge" })
        .update({ entries: JSON.stringify(entries), updated_at: db.fn.now() });

      return res.json({ success: true, entry: entries[entries.length - 1] });
    } catch (error: any) {
      console.error("[KnowledgeLattice] Add error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to add entry" });
    }
  },
);

// --- Sentiment Lattice -------------------------------------------------------

knowledgeLatticeRoutes.get(
  "/sentiment-lattice/entries",
  authenticateToken,
  superAdminMiddleware,
  async (_req: any, res) => {
    try {
      const row = await db("lattice_cache").where({ lattice_type: "sentiment" }).first();
      const entries = row?.entries
        ? (typeof row.entries === "string" ? JSON.parse(row.entries) : row.entries)
        : [];
      return res.json({ success: true, entries, updated_at: row?.updated_at });
    } catch (error: any) {
      console.error("[SentimentLattice] Fetch error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load entries" });
    }
  },
);

knowledgeLatticeRoutes.post(
  "/sentiment-lattice/add",
  authenticateToken,
  superAdminMiddleware,
  async (req: any, res) => {
    try {
      const { quote, phase, agent_heuristic, anti_pattern } = req.body;
      if (!quote?.trim()) {
        return res.status(400).json({ success: false, error: "Quote is required" });
      }

      const row = await db("lattice_cache").where({ lattice_type: "sentiment" }).first();
      const entries = row?.entries
        ? (typeof row.entries === "string" ? JSON.parse(row.entries) : row.entries)
        : [];

      entries.push({
        id: `sl-${Date.now()}`,
        quote: quote.trim(),
        phase: phase?.trim() || "Uncategorized",
        agent_heuristic: agent_heuristic?.trim() || null,
        anti_pattern: anti_pattern?.trim() || null,
        added_at: new Date().toISOString(),
      });

      await db("lattice_cache")
        .where({ lattice_type: "sentiment" })
        .update({ entries: JSON.stringify(entries), updated_at: db.fn.now() });

      return res.json({ success: true, entry: entries[entries.length - 1] });
    } catch (error: any) {
      console.error("[SentimentLattice] Add error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to add entry" });
    }
  },
);

export default knowledgeLatticeRoutes;

// T2 registers these routes at /api/admin in src/index.ts
