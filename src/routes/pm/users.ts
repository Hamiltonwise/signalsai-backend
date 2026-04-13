/**
 * PM Users API -- Admin user list for assignment dropdowns.
 *
 * GET /api/pm/users - List admin users available for task assignment.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as pm from "../../controllers/pm/PmController";

const router = express.Router();

// GET /api/pm/users — list admin users (for assignment dropdowns)
router.get("/", authenticateToken, superAdminMiddleware, pm.listUsers);

export default router;
