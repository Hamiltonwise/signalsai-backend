/**
 * Public Content API -- GET /api/content/:slug
 *
 * Returns published content by slug for the DynamicArticle frontend page.
 * No authentication required.
 */

import { Router, Request, Response } from "express";
import { db } from "../database/connection";

const router = Router();

// GET /api/content/:slug
router.get("/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const content = await db("published_content")
      .where({ slug, status: "published" })
      .first();

    if (!content) {
      return res.status(404).json({ success: false, error: "Content not found" });
    }

    return res.json({
      success: true,
      id: content.id,
      slug: content.slug,
      title: content.title,
      body: content.body,
      metaDescription: content.meta_description,
      faqItems:
        typeof content.faq_items === "string"
          ? JSON.parse(content.faq_items)
          : content.faq_items || [],
      category: content.category,
      authorName: content.author_name,
      publishedAt: content.published_at,
      updatedAt: content.updated_at,
    });
  } catch (err) {
    console.error("[Content] Fetch error:", err);
    return res.status(500).json({ success: false, error: "Failed to load content" });
  }
});

export default router;
