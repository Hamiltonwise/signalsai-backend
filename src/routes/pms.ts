import express from "express";
import * as controller from "../controllers/pms/PmsController";
import { upload } from "../controllers/pms/pms-utils/file-upload.config";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware } from "../middleware/rbac";
import { superAdminMiddleware } from "../middleware/superAdmin";

const pmsRoutes = express.Router();

// =====================================================================
// CLIENT ENDPOINTS (Organization-scoped via JWT + RBAC)
// =====================================================================

// Upload & Processing
pmsRoutes.post("/upload", authenticateToken, rbacMiddleware, upload.single("csvFile"), controller.uploadPmsData);
pmsRoutes.post("/upload/confirm-mapping", authenticateToken, rbacMiddleware, controller.confirmReferralMapping);
pmsRoutes.get("/system-notifications", authenticateToken, rbacMiddleware, controller.getSystemNotifications);
pmsRoutes.post("/system-notifications/:id/dismiss", authenticateToken, rbacMiddleware, controller.dismissSystemNotification);
pmsRoutes.post("/parse-paste", authenticateToken, rbacMiddleware, controller.parsePaste);
pmsRoutes.post("/sanitize-paste", authenticateToken, rbacMiddleware, controller.sanitizePaste);
pmsRoutes.post("/summary", authenticateToken, rbacMiddleware, controller.getPmsSummary);

// Data Retrieval
pmsRoutes.get("/keyData", authenticateToken, rbacMiddleware, controller.getKeyData);

// Client approval
pmsRoutes.patch("/jobs/:id/client-approval", authenticateToken, rbacMiddleware, controller.clientApproveJob);

// Automation status (client polls this)
pmsRoutes.get("/jobs/:id/automation-status", authenticateToken, rbacMiddleware, controller.getAutomationStatus);
pmsRoutes.get("/automation/active", authenticateToken, rbacMiddleware, controller.getActiveAutomations);

// =====================================================================
// ADMIN ENDPOINTS (Require superAdmin auth)
// =====================================================================

pmsRoutes.get("/jobs", authenticateToken, superAdminMiddleware, controller.listJobs);
pmsRoutes.patch("/jobs/:id/approval", authenticateToken, superAdminMiddleware, controller.approveJob);
pmsRoutes.patch("/jobs/:id/response", authenticateToken, superAdminMiddleware, controller.updateResponseLog);
pmsRoutes.delete("/jobs/:id", authenticateToken, superAdminMiddleware, controller.deleteJob);
pmsRoutes.post("/jobs/:id/retry", authenticateToken, superAdminMiddleware, controller.retryJob);
pmsRoutes.post("/jobs/:id/restart", authenticateToken, superAdminMiddleware, controller.restartJob);

export default pmsRoutes;
