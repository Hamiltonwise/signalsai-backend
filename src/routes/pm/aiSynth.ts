import express from "express";
import multer from "multer";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/pm/PmAiSynthController";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".txt", ".pdf", ".docx", ".eml"];
    const ext = "." + (file.originalname.split(".").pop()?.toLowerCase() || "");
    cb(null, allowed.includes(ext));
  },
});

const router = express.Router();

// POST /api/pm/ai-synth/extract — create batch + extract tasks
router.post("/extract", authenticateToken, superAdminMiddleware, upload.single("file"), controller.extractBatch);

// GET /api/pm/ai-synth/batches?project_id=X — list batches
router.get("/batches", authenticateToken, superAdminMiddleware, controller.listBatches);

// GET /api/pm/ai-synth/batches/:batchId — get batch with tasks
router.get("/batches/:batchId", authenticateToken, superAdminMiddleware, controller.getBatch);

// PUT /api/pm/ai-synth/batches/:batchId/tasks/:taskId/approve
router.put("/batches/:batchId/tasks/:taskId/approve", authenticateToken, superAdminMiddleware, controller.approveTask);

// PUT /api/pm/ai-synth/batches/:batchId/tasks/:taskId/reject
router.put("/batches/:batchId/tasks/:taskId/reject", authenticateToken, superAdminMiddleware, controller.rejectTask);

// DELETE /api/pm/ai-synth/batches/:batchId — delete batch
router.delete("/batches/:batchId", authenticateToken, superAdminMiddleware, controller.deleteBatch);

export default router;
