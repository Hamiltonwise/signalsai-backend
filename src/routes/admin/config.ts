/**
 * Admin Config API -- View and edit all business configuration values.
 */

import { Router, Request, Response } from "express";
import { getConfig, setConfig, deleteConfig, getAllConfig, CONFIG_REGISTRY } from "../../services/configStore";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

const router = Router();

router.use(authenticateToken, superAdminMiddleware);

router.get("/", async (_req: Request, res: Response) => {
  try {
    const stored = await getAllConfig();
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

router.get("/:key", async (req: Request, res: Response) => {
  try {
    const def = CONFIG_REGISTRY.find((d) => d.key === req.params.key);
    if (!def) return res.status(404).json({ success: false, error: `Unknown key: ${req.params.key}` });
    const value = await getConfig(def.key, def.defaultValue);
    res.json({ success: true, key: def.key, value, definition: def });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put("/:key", async (req: Request, res: Response) => {
  try {
    const def = CONFIG_REGISTRY.find((d) => d.key === req.params.key);
    if (!def) return res.status(404).json({ success: false, error: `Unknown key: ${req.params.key}` });
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ success: false, error: "Missing 'value'" });
    await setConfig(def.key, value);
    res.json({ success: true, key: def.key, value });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/:key", async (req: Request, res: Response) => {
  try {
    const def = CONFIG_REGISTRY.find((d) => d.key === req.params.key);
    if (!def) return res.status(404).json({ success: false, error: `Unknown key: ${req.params.key}` });
    await deleteConfig(def.key);
    res.json({ success: true, key: def.key, value: def.defaultValue, isDefault: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
