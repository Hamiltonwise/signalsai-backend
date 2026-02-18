import { Router } from "express";
import { AdminSettingsController } from "../../controllers/admin-settings/admin-settings.controller";

const router = Router();

router.get("/", AdminSettingsController.getAllSettings);
router.get("/:category/:key", AdminSettingsController.getSetting);
router.put("/:category/:key", AdminSettingsController.upsertSetting);

export default router;
