import express from "express";
import * as controller from "../controllers/pms/PmsController";
import { upload } from "../controllers/pms/pms-utils/file-upload.config";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware } from "../middleware/rbac";

const pmsRoutes = express.Router();

// =====================================================================
// CLIENT ENDPOINTS (Organization-scoped via JWT + RBAC)
// =====================================================================

// Upload & Processing
pmsRoutes.post("/upload", authenticateToken, rbacMiddleware, upload.single("csvFile"), controller.uploadPmsData);
pmsRoutes.post("/parse-paste", authenticateToken, rbacMiddleware, controller.parsePaste);
pmsRoutes.post("/summary", authenticateToken, rbacMiddleware, controller.getPmsSummary);

// Data Retrieval
pmsRoutes.get("/keyData", authenticateToken, rbacMiddleware, controller.getKeyData);

// Client approval
pmsRoutes.patch("/jobs/:id/client-approval", authenticateToken, rbacMiddleware, controller.clientApproveJob);

// Automation status (client polls this)
pmsRoutes.get("/jobs/:id/automation-status", authenticateToken, rbacMiddleware, controller.getAutomationStatus);
pmsRoutes.get("/automation/active", authenticateToken, rbacMiddleware, controller.getActiveAutomations);

// =====================================================================
// ADMIN ENDPOINTS (No auth — accessed from admin dashboard)
// =====================================================================

pmsRoutes.get("/jobs", controller.listJobs);
pmsRoutes.patch("/jobs/:id/approval", controller.approveJob);
pmsRoutes.patch("/jobs/:id/response", controller.updateResponseLog);
pmsRoutes.delete("/jobs/:id", controller.deleteJob);
pmsRoutes.post("/jobs/:id/retry", controller.retryJob);

export default pmsRoutes;
