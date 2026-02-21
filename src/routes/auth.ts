import express, { Request, Response, NextFunction } from "express";
import * as controller from "../controllers/auth/AuthController";

const router = express.Router();

// Test endpoint
router.get("/ttim", (_req: Request, res: Response) => {
  return res.json("hello");
});

// OAuth flow
router.get("/google", controller.getGoogleAuthUrl);
router.get("/callback", controller.handleOAuthCallback);
router.get("/google/callback", controller.handleOAuthCallback);

// Token management
router.get("/google/validate/:connectionId", controller.validateToken);

// Scope management
router.get("/google/scopes", controller.getScopeInfo);
router.get("/google/reconnect", controller.getReconnectUrl);

// Error handling middleware
router.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error("[AUTH] Unhandled route error:", error);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
  next(error);
});

export default router;
