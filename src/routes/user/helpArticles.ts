/**
 * Help Articles API
 *
 * GET /api/user/help-articles -- returns articles filtered by audience
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { HELP_ARTICLES } from "../../data/helpArticles";

const helpArticleRoutes = express.Router();

helpArticleRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    const isAdmin = req.role === "admin" || req.role === "super_admin";
    const category = req.query.category as string | undefined;
    const search = (req.query.q as string || "").toLowerCase().trim();

    let articles = HELP_ARTICLES.filter(a =>
      isAdmin ? true : a.audience !== "team"
    );

    if (category) {
      articles = articles.filter(a => a.category === category);
    }

    if (search) {
      articles = articles.filter(a =>
        a.title.toLowerCase().includes(search) ||
        a.summary.toLowerCase().includes(search) ||
        a.body.toLowerCase().includes(search)
      );
    }

    return res.json({
      success: true,
      articles: articles.map(a => ({
        id: a.id,
        title: a.title,
        category: a.category,
        summary: a.summary,
        body: a.body,
      })),
    });
  }
);

export default helpArticleRoutes;
