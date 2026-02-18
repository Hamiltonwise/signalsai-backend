import express from "express";
import { tokenRefreshMiddleware } from "../middleware/tokenRefresh";
import { rbacMiddleware } from "../middleware/rbac";
import * as profileController from "../controllers/profile/profile.controller";

const profileRoutes = express.Router();

profileRoutes.get("/get", tokenRefreshMiddleware, rbacMiddleware, profileController.getProfile);
profileRoutes.put("/update", tokenRefreshMiddleware, rbacMiddleware, profileController.updateProfile);

export default profileRoutes;
