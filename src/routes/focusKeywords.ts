/**
 * Focus Keywords API
 *
 * GET    /api/focus-keywords           -- list active keywords for org
 * POST   /api/focus-keywords           -- add a custom keyword
 * DELETE /api/focus-keywords/:id       -- deactivate a keyword
 * GET    /api/focus-keywords/suggest   -- AI-suggested keywords based on org data
 */

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../middleware/rbac";
import { db } from "../database/connection";

const focusKeywordsRoutes = express.Router();

let llm: Anthropic | null = null;
function getLLM(): Anthropic {
  if (!llm) llm = new Anthropic();
  return llm;
}

/**
 * GET /api/focus-keywords
 */
focusKeywordsRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const keywords = await db("focus_keywords")
        .where({ organization_id: orgId, is_active: true })
        .orderBy("source", "asc")
        .orderBy("keyword", "asc");

      return res.json({
        success: true,
        keywords: keywords.map((k: any) => ({
          id: k.id,
          keyword: k.keyword,
          source: k.source,
          latestPosition: k.latest_position,
          previousPosition: k.previous_position,
          positionDelta: k.position_delta,
          trackedUrl: k.tracked_url,
          lastCheckedAt: k.last_checked_at,
        })),
      });
    } catch (error: any) {
      console.error("[Focus Keywords] List error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load keywords" });
    }
  }
);

/**
 * POST /api/focus-keywords
 * Body: { keyword: string }
 */
focusKeywordsRoutes.post(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const { keyword } = req.body;
      if (!keyword || typeof keyword !== "string" || keyword.trim().length === 0) {
        return res.status(400).json({ success: false, error: "Keyword is required" });
      }

      const trimmed = keyword.trim().toLowerCase();
      if (trimmed.length > 300) {
        return res.status(400).json({ success: false, error: "Keyword too long (max 300 chars)" });
      }

      // Check limit (max 25 active keywords per org)
      const count = await db("focus_keywords")
        .where({ organization_id: orgId, is_active: true })
        .count("* as count")
        .first();
      if (parseInt((count as any)?.count || "0", 10) >= 25) {
        return res.status(400).json({ success: false, error: "Maximum 25 active keywords reached" });
      }

      // Check for duplicate
      const existing = await db("focus_keywords")
        .where({ organization_id: orgId, keyword: trimmed, is_active: true })
        .first();
      if (existing) {
        return res.status(409).json({ success: false, error: "Keyword already tracked" });
      }

      const [row] = await db("focus_keywords")
        .insert({
          organization_id: orgId,
          keyword: trimmed,
          source: "custom",
          is_active: true,
        })
        .returning("*");

      return res.json({
        success: true,
        keyword: {
          id: row.id,
          keyword: row.keyword,
          source: row.source,
          latestPosition: null,
          previousPosition: null,
          positionDelta: null,
        },
      });
    } catch (error: any) {
      console.error("[Focus Keywords] Add error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to add keyword" });
    }
  }
);

/**
 * DELETE /api/focus-keywords/:id
 */
focusKeywordsRoutes.delete(
  "/:id",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const updated = await db("focus_keywords")
        .where({ id: req.params.id, organization_id: orgId })
        .update({ is_active: false, updated_at: new Date() });

      if (!updated) {
        return res.status(404).json({ success: false, error: "Keyword not found" });
      }

      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Focus Keywords] Delete error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to remove keyword" });
    }
  }
);

/**
 * GET /api/focus-keywords/suggest
 *
 * AI-generated keyword suggestions based on org specialty, location,
 * competitors, and existing keywords. Empowers without overwhelming.
 */
focusKeywordsRoutes.get(
  "/suggest",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      // Gather org context
      const org = await db("organizations").where({ id: orgId }).first();
      const location = await db("locations")
        .where({ organization_id: orgId, is_primary: true })
        .first();
      const existingKeywords = await db("focus_keywords")
        .where({ organization_id: orgId, is_active: true })
        .select("keyword");

      // Get competitor names if available
      const competitors = await db("practice_rankings")
        .where({ organization_id: orgId, status: "completed" })
        .orderBy("created_at", "desc")
        .first();

      const competitorNames: string[] = [];
      if (competitors?.competitor_data) {
        const data = typeof competitors.competitor_data === "string"
          ? JSON.parse(competitors.competitor_data)
          : competitors.competitor_data;
        if (Array.isArray(data)) {
          competitorNames.push(...data.slice(0, 5).map((c: any) => c.name || c.displayName).filter(Boolean));
        }
      }

      const specialty = location?.specialty || org?.organization_type || "business";
      const city = location?.city || "";
      const orgName = org?.name || "";
      const existingList = existingKeywords.map((k: any) => k.keyword);

      const anthropic = getLLM();
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        system: `You suggest search keywords for a ${specialty} business to track their visibility. Be specific and actionable. Never repeat keywords already tracked.`,
        messages: [{
          role: "user",
          content: `Business: ${orgName}
Specialty: ${specialty}
City: ${city}
Competitors: ${competitorNames.join(", ") || "unknown"}
Already tracking: ${existingList.join(", ") || "none"}

Suggest 5-8 keywords this business should track. Mix of:
- Local search terms people actually type
- "Near me" variations
- Competitor comparison terms
- Service-specific long-tail terms

Return ONLY a JSON array of strings. No markdown, no explanation.`,
        }],
      });

      const text = response.content[0]?.type === "text" ? response.content[0].text : "[]";
      let suggestions: string[] = [];
      try {
        const cleaned = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        suggestions = JSON.parse(cleaned);
        if (!Array.isArray(suggestions)) suggestions = [];
        suggestions = suggestions
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .map(s => s.trim().toLowerCase())
          .filter(s => !existingList.includes(s))
          .slice(0, 8);
      } catch {
        console.error("[Focus Keywords] Suggestion parse error");
        suggestions = [];
      }

      return res.json({ success: true, suggestions });
    } catch (error: any) {
      console.error("[Focus Keywords] Suggest error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to generate suggestions" });
    }
  }
);

export default focusKeywordsRoutes;
