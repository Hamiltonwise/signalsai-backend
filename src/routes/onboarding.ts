import express from "express";
import { tokenRefreshMiddleware } from "../middleware/tokenRefresh";
import * as onboardingController from "../controllers/onboarding/OnboardingController";

const onboardingRoutes = express.Router();

// Do NOT apply token middleware globally; only to routes that need Google APIs.
// These onboarding endpoints read the google account ID from the header directly.

onboardingRoutes.get("/status", onboardingController.getOnboardingStatus);
onboardingRoutes.post("/save-properties", onboardingController.completeOnboarding);
onboardingRoutes.get("/wizard/status", onboardingController.getWizardStatus);
onboardingRoutes.put("/wizard/complete", onboardingController.completeWizard);
onboardingRoutes.post("/wizard/restart", onboardingController.restartWizard);
onboardingRoutes.get("/setup-progress", onboardingController.getSetupProgress);
onboardingRoutes.put("/setup-progress", onboardingController.updateSetupProgress);

// GBP onboarding endpoints — require tokenRefreshMiddleware for OAuth2 client
onboardingRoutes.get("/available-gbp", tokenRefreshMiddleware, onboardingController.getAvailableGBP);
onboardingRoutes.post("/save-gbp", tokenRefreshMiddleware, onboardingController.saveGBP);
onboardingRoutes.post("/gbp-website", tokenRefreshMiddleware, onboardingController.getGBPWebsite);

// Domain validation — no token middleware needed
onboardingRoutes.post("/check-domain", onboardingController.checkDomain);

export default onboardingRoutes;
