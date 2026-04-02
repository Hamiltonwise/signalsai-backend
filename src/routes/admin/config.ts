/**
 * Admin Config API -- View and edit all business configuration values.
 *
 * GET  /api/admin/config         -- all config values + registry
 * GET  /api/admin/config/:key    -- single value
 * PUT  /api/admin/config/:key    -- update a value
 * DELETE /api/admin/config/:key  -- reset to default
 */

import { Router, Request, Response } from "express";
import {
  getConfig,
  setConfig,
  deleteConfig,
  getAllConfig,
  CONFIG_REGISTRY,
} from "../../services/configStore";

const router = Router();

// GET /api/admin/config -- all values with registry metadata
router.get("/", async (_req: Request, res: Response) => {
  try {
    const stored = await getAllConfig();

    // Merge registry with stored values
    const entries = CONFIG_REGISTRY.map((def) => ({
      ...def,
      currentValue: stored[def.key] !== undefined ? stored[def.key] : def.defaultValue,
      isCustom: stored[def.key] !== undefined,
    }));

    res.json({ success: true, entries });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/config/:key -- single value
router.get("/:key", async (req: Request, res: Response) => {
  try {
    const def = CONFIG_REGISTRY.find((d) => d.key === req.params.key);
    if (!def) {
      return res.status(404).json({ success: false, error: `Unknown config key: ${req.params.key}` });
    }
    const value = await getConfig(def.key, def.defaultValue);
    res.json({ success: true, key: def.key, value, definition: def });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/config/:key -- update a value
router.put("/:key", async (req: Request, res: Response) => {
  try {
    const def = CONFIG_REGISTRY.find((d) => d.key === req.params.key);
    if (!def) {
      return res.status(404).json({ success: false, error: `Unknown config key: ${req.params.key}` });
    }

    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ success: false, error: "Missing 'value' in request body" });
    }

    await setConfig(def.key, value);
    console.log(`[Config] Updated "${def.key}" to:`, value);

    res.json({ success: true, key: def.key, value });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/config/:key -- reset to default
router.delete("/:key", async (req: Request, res: Response) => {
  try {
    const def = CONFIG_REGISTRY.find((d) => d.key === req.params.key);
    if (!def) {
      return res.status(404).json({ success: false, error: `Unknown config key: ${req.params.key}` });
    }

    await deleteConfig(def.key);
    console.log(`[Config] Reset "${def.key}" to default:`, def.defaultValue);

    res.json({ success: true, key: def.key, value: def.defaultValue, isDefault: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
