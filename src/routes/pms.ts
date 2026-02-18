import express from "express";
import * as controller from "../controllers/pms/PmsController";
import { upload } from "../controllers/pms/pms-utils/file-upload.config";

const pmsRoutes = express.Router();

// Upload & Processing
pmsRoutes.post("/upload", upload.single("csvFile"), controller.uploadPmsData);
pmsRoutes.post("/summary", controller.getPmsSummary);

// Data Retrieval
pmsRoutes.get("/keyData", controller.getKeyData);
pmsRoutes.get("/jobs", controller.listJobs);

// Approval Workflows
pmsRoutes.patch("/jobs/:id/approval", controller.approveJob);
pmsRoutes.patch("/jobs/:id/client-approval", controller.clientApproveJob);

// Data Management
pmsRoutes.patch("/jobs/:id/response", controller.updateResponseLog);
pmsRoutes.delete("/jobs/:id", controller.deleteJob);

// Automation
pmsRoutes.get("/jobs/:id/automation-status", controller.getAutomationStatus);
pmsRoutes.get("/automation/active", controller.getActiveAutomations);
pmsRoutes.post("/jobs/:id/retry", controller.retryJob);

export default pmsRoutes;
