import express from "express";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware } from "../middleware/rbac";
import { tokenRefreshMiddleware } from "../middleware/tokenRefresh";
import * as onboardingController from "../controllers/onboarding/OnboardingController";

const onboardingRoutes = express.Router();

// All onboarding endpoints require JWT auth + RBAC
onboardingRoutes.get("/status", authenticateToken, rbacMiddleware, onboardingController.getOnboardingStatus);
onboardingRoutes.post("/save-profile", authenticateToken, rbacMiddleware, onboardingController.saveProfile);
onboardingRoutes.post("/complete", authenticateToken, rbacMiddleware, onboardingController.completeOnboardingFinal);
onboardingRoutes.post("/save-properties", authenticateToken, rbacMiddleware, onboardingController.completeOnboarding);
onboardingRoutes.get("/wizard/status", authenticateToken, rbacMiddleware, onboardingController.getWizardStatus);
onboardingRoutes.put("/wizard/complete", authenticateToken, rbacMiddleware, onboardingController.completeWizard);
onboardingRoutes.post("/wizard/restart", authenticateToken, rbacMiddleware, onboardingController.restartWizard);
onboardingRoutes.get("/setup-progress", authenticateToken, rbacMiddleware, onboardingController.getSetupProgress);
onboardingRoutes.put("/setup-progress", authenticateToken, rbacMiddleware, onboardingController.updateSetupProgress);
onboardingRoutes.patch("/setup-progress", authenticateToken, rbacMiddleware, onboardingController.patchSetupProgress);

// GBP onboarding endpoints — also require tokenRefreshMiddleware for OAuth2 client
onboardingRoutes.get("/available-gbp", authenticateToken, rbacMiddleware, tokenRefreshMiddleware, onboardingController.getAvailableGBP);
onboardingRoutes.post("/save-gbp", authenticateToken, rbacMiddleware, tokenRefreshMiddleware, onboardingController.saveGBP);
onboardingRoutes.post("/gbp-website", authenticateToken, rbacMiddleware, tokenRefreshMiddleware, onboardingController.getGBPWebsite);

// Domain validation — public endpoint, no auth needed
onboardingRoutes.post("/check-domain", onboardingController.checkDomain);

export default onboardingRoutes;
