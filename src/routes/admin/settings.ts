/**
 * Admin Settings API
 * Generic key-value settings stored in website_builder.admin_settings
 */

import { Router, type Request, type Response } from "express";
import { db } from "../../database/connection";

const router = Router();
const SETTINGS_TABLE = "website_builder.admin_settings";

/**
 * GET /api/admin/settings
 * Fetch all settings grouped by category
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const rows = await db(SETTINGS_TABLE).select(
      "category",
      "key",
      "value",
      "updated_at"
    );

    // Group by category
    const data: Record<string, Record<string, string>> = {};
    for (const row of rows) {
      if (!data[row.category]) data[row.category] = {};
      data[row.category][row.key] = row.value;
    }

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error("[Admin Settings] Error fetching settings:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch settings",
    });
  }
});

/**
 * GET /api/admin/settings/:category/:key
 * Fetch a single setting
 */
router.get("/:category/:key", async (req: Request, res: Response) => {
  try {
    const { category, key } = req.params;

    const row = await db(SETTINGS_TABLE)
      .where({ category, key })
      .first();

    if (!row) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `Setting ${category}/${key} not found`,
      });
    }

    return res.json({ success: true, data: row });
  } catch (error: any) {
    console.error("[Admin Settings] Error fetching setting:", error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch setting",
    });
  }
});

/**
 * PUT /api/admin/settings/:category/:key
 * Upsert a setting value
 */
router.put("/:category/:key", async (req: Request, res: Response) => {
  try {
    const { category, key } = req.params;
    const { value } = req.body;

    if (typeof value !== "string") {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "value must be a string",
      });
    }

    const [row] = await db(SETTINGS_TABLE)
      .insert({
        category,
        key,
        value,
      })
      .onConflict(["category", "key"])
      .merge({
        value,
        updated_at: db.fn.now(),
      })
      .returning("*");

    console.log(`[Admin Settings] Updated ${category}/${key}`);

    return res.json({ success: true, data: row });
  } catch (error: any) {
    console.error("[Admin Settings] Error updating setting:", error);
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message || "Failed to update setting",
    });
  }
});

export default router;
