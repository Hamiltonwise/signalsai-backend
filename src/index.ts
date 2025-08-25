import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";

import { Router } from "express";

const app = express();
const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";
const router = Router();
app.use(router);

router.get("/api/hello", (req, res) => {
  res.send("hello world");
});

if (isProd) {
  app.use(express.static(path.join(__dirname, "../public")));
  app.get("*", (_req, res) => {
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
