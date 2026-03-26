/**
 * Route Handler: Programmatic SEO Pages
 *
 * Serves programmatic SEO pages at /api/programmatic-pages/*
 * and provides data for the frontend to render.
 */

import express, { Request, Response } from "express";
import db from "../database/connection";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { generatePage } from "../services/programmaticSEO";
import { SPECIALTIES, CITY_BY_SLUG } from "../data/cityData";

const router = express.Router();

/**
 * GET /api/programmatic-pages
 * Returns list of all published pages (for sitemap generation).
 * Paginated: ?page=1&limit=50
 * No auth required.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const offset = (page - 1) * limit;

    const [pages, countResult] = await Promise.all([
      db("programmatic_pages")
        .where({ status: "published" })
        .select("page_slug as slug", "title", "specialty_slug", "city_slug", "updated_at")
        .orderBy("updated_at", "desc")
        .limit(limit)
        .offset(offset),
      db("programmatic_pages")
        .where({ status: "published" })
        .count("* as total")
        .first(),
    ]);

    const total = Number(countResult?.total || 0);

    return res.json({
      pages,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Programmatic pages list error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/programmatic-pages/generate
 * Triggers page generation (admin only).
 * Body: { specialty_slug, city_slug }
 */
router.post("/generate", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { specialty_slug, city_slug } = req.body;

    if (!specialty_slug || !city_slug) {
      return res.status(400).json({ error: "specialty_slug and city_slug are required" });
    }

    // Find the specialty config
    const specialty = SPECIALTIES.find((s) => s.slug === specialty_slug);
    if (!specialty) {
      return res.status(400).json({ error: `Unknown specialty: ${specialty_slug}` });
    }

    // Look up city from known city data
    const city = CITY_BY_SLUG.get(city_slug);
    if (!city) {
      return res.status(400).json({ error: `Unknown city: ${city_slug}` });
    }

    await generatePage(specialty, city);

    // Fetch the created/updated page to return it
    const created = await db("programmatic_pages")
      .where({ specialty_slug, city_slug })
      .orderBy("created_at", "desc")
      .first();

    return res.status(201).json({ page: created });
  } catch (error) {
    console.error("Programmatic page generation error:", error);
    return res.status(500).json({ error: "Failed to generate page" });
  }
});

/**
 * GET /api/programmatic-pages/:slug/schema
 * Returns just the JSON-LD schema for a page (for embedding in page head).
 * No auth required.
 */
router.get("/:slug/schema", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const page = await db("programmatic_pages")
      .where({ page_slug: slug, status: "published" })
      .select("schema_markup")
      .first();

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    const schema = typeof page.schema_markup === "string"
      ? JSON.parse(page.schema_markup)
      : page.schema_markup;

    return res.json(schema);
  } catch (error) {
    console.error("Programmatic page schema error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/programmatic-pages/:slug
 * Returns page data for a given slug (e.g., "endodontist-salt-lake-city").
 * No auth required.
 */
router.get("/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const page = await db("programmatic_pages")
      .where({ page_slug: slug, status: "published" })
      .first();

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    // Increment page_views counter (fire-and-forget)
    db("programmatic_pages")
      .where({ page_slug: slug })
      .increment("page_views", 1)
      .catch(() => {});

    // Log behavioral_event if table exists (fire-and-forget)
    db.schema.hasTable("behavioral_events").then((exists) => {
      if (exists) {
        db("behavioral_events")
          .insert({
            event_type: "programmatic_page.viewed",
            properties: JSON.stringify({ slug }),
            created_at: new Date(),
          })
          .catch(() => {});
      }
    }).catch(() => {});

    // Parse stored JSON fields
    const competitors = typeof page.competitors_snapshot === "string"
      ? JSON.parse(page.competitors_snapshot)
      : page.competitors_snapshot;

    const schemaMarkup = typeof page.schema_markup === "string"
      ? JSON.parse(page.schema_markup)
      : page.schema_markup;

    // Parse content sections
    const contentSections = typeof page.content_sections === "string"
      ? JSON.parse(page.content_sections)
      : page.content_sections;

    return res.json({
      title: page.title,
      metaDescription: page.meta_description,
      contentSections,
      competitors,
      schemaMarkup,
      openGraph: {
        title: page.title,
        description: page.meta_description,
        url: `https://getalloro.com/${slug}`,
        type: "website",
        siteName: "Alloro",
        image: "https://getalloro.com/logo.png",
      },
      specialtySlug: page.specialty_slug,
      citySlug: page.city_slug,
      cityName: page.city_name,
      stateAbbr: page.state_abbr,
      competitorCount: competitors ? competitors.length : 0,
      lastUpdated: page.competitors_refreshed_at,
    });
  } catch (error) {
    console.error("Programmatic page error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
