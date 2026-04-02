import { Router } from "express";
import { AdminSettingsController } from "../../controllers/admin-settings/admin-settings.controller";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

const router = Router();

router.use(authenticateToken, superAdminMiddleware);

router.get("/", AdminSettingsController.getAllSettings);
router.get("/:category/:key", AdminSettingsController.getSetting);
router.put("/:category/:key", AdminSettingsController.upsertSetting);

export default router;
