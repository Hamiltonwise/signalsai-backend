import express from "express";
import * as googleAuthController from "../controllers/googleauth/GoogleAuthController";

const googleAuthRoutes = express.Router();

// OAuth2 authorization routes
googleAuthRoutes.get("/url", googleAuthController.generateAuthUrl);
googleAuthRoutes.post("/callback", googleAuthController.handleCallback);
googleAuthRoutes.get("/web-callback", googleAuthController.handleWebCallback);
googleAuthRoutes.get("/validate", googleAuthController.validateToken);
googleAuthRoutes.get("/scopes", googleAuthController.getScopeInfo);

export default googleAuthRoutes;
