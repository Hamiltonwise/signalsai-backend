import express from "express";
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

export default onboardingRoutes;
