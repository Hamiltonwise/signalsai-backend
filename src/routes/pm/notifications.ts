import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { getNotifications, markAllRead, deleteAll } from "../../controllers/pm/PmNotificationsController";

const router = express.Router();

router.get("/", authenticateToken, superAdminMiddleware, getNotifications);
router.put("/read-all", authenticateToken, superAdminMiddleware, markAllRead);
router.delete("/", authenticateToken, superAdminMiddleware, deleteAll);

export default router;
