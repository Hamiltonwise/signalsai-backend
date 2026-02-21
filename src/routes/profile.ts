import express from "express";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware } from "../middleware/rbac";
import * as profileController from "../controllers/profile/profile.controller";

const profileRoutes = express.Router();

profileRoutes.get("/get", authenticateToken, rbacMiddleware, profileController.getProfile);
profileRoutes.put("/update", authenticateToken, rbacMiddleware, profileController.updateProfile);

export default profileRoutes;
