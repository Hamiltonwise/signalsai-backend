import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/pm/PmStatsController";

const router = express.Router();

router.get("/", authenticateToken, superAdminMiddleware, controller.getStats);
router.get("/velocity", authenticateToken, superAdminMiddleware, controller.getVelocity);

export default router;
