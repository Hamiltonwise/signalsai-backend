import express from "express";
import * as auditController from "../controllers/audit/audit.controller";
import { authenticateToken } from "../middleware/auth";
import { superAdminMiddleware } from "../middleware/superAdmin";

const auditRoutes = express.Router();

auditRoutes.use(authenticateToken, superAdminMiddleware);

auditRoutes.post("/start", auditController.startAudit);
auditRoutes.get("/:auditId/status", auditController.getAuditStatus);
auditRoutes.get("/:auditId", auditController.getAuditDetails);
auditRoutes.patch("/:auditId", auditController.updateAudit);

export default auditRoutes;
