/**
 * Content Publishing Admin Endpoint
 *
 * POST /api/admin/content/publish
 * Accepts a content brief + generated draft and creates a new blog page
 * in the published_content table.
 */

import express, { Request, Response } from "express";
import { db } from "../../database/connection";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

const router = express.Router();

interface PublishRequest {
  title: string;
  slug: string;
  body: string;
  metaDescription?: string;
  faqItems?: { question: string; answer: string }[];
  category?: string;
  authorName?: string;
}

// POST /api/admin/content/publish
router.post(
  "/publish",
  authenticateToken,
  superAdminMiddleware,
  async (req: Request, res: Response) => {
    try {
      const {
        title,
        slug,
        body,
        metaDescription,
        faqItems,
        category,
        authorName,
      } = req.body as PublishRequest;

      if (!title || !slug || !body) {
        return res.status(400).json({
          success: false,
          error: "title, slug, and body are required",
        });
      }

      // Validate slug format (lowercase, hyphens, no spaces)
      const cleanSlug = slug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      // Check for duplicate slug
      const existing = await db("published_content")
        .where("slug", cleanSlug)
        .first();
      if (existing) {
        return res.status(409).json({
          success: false,
          error: `Slug "${cleanSlug}" already exists`,
        });
      }

      const [record] = await db("published_content")
        .insert({
          title,
          slug: cleanSlug,
          body,
          meta_description: metaDescription || null,
          faq_items: JSON.stringify(faqItems || []),
          category: category || null,
          author_name: authorName || "Alloro Intelligence",
          status: "published",
          published_at: new Date(),
        })
        .returning("*");

      const publishedUrl = `https://getalloro.com/blog/${cleanSlug}`;

      return res.json({
        success: true,
        url: publishedUrl,
        content: {
          id: record.id,
          slug: record.slug,
          title: record.title,
          status: record.status,
          publishedAt: record.published_at,
        },
      });
    } catch (err: any) {
      console.error("[ContentPublish] Error:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  },
);

export default router;
