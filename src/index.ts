import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";

import { Router } from "express";

import ga4Routes from "./routes/ga4";
import gscRoutes from "./routes/gsc";
import googleAuthRoutes from "./routes/googleauth";
import gbpRoutes from "./routes/gbp";

const app = express();
const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";
const router = Router();

// Add JSON body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(router);
app.use("/api/ga4", ga4Routes);
app.use("/api/gsc", gscRoutes);
app.use("/api/auth", googleAuthRoutes);
app.use("/api/gbp", gbpRoutes);

if (isProd) {
  app.use(express.static(path.join(__dirname, "../public")));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
  });
} else {
  // ✅ FIXED — valid Express path, NOT a full URL
  app.use(
    "/", // or "*"
    createProxyMiddleware({
      target: "http://localhost:5174", // ✅ proxy target
      changeOrigin: true,
      ws: true,
    })
  );
}

app.listen(port, () => {
  console.log(
    `Server running in ${
      isProd ? "production" : "development"
    } mode at http://localhost:${port}`
  );
});
