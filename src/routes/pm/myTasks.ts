import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { getMyTasks } from "../../controllers/pm/PmMyTasksController";

const router = express.Router();

router.get("/mine", authenticateToken, superAdminMiddleware, getMyTasks);

export default router;
