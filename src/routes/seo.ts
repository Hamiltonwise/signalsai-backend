import { Router, Request, Response } from "express";
import {
  ProgrammaticPageModel,
  IProgrammaticPage,
} from "../models/ProgrammaticPageModel";
import { getInternalLinks } from "../services/programmaticSEO";
import { getSpokeLinks, renderSpokeLinksHtml } from "../services/aeoLinking";
import { BehavioralEventModel } from "../models/BehavioralEventModel";

const router = Router();

/**
 * GET /api/seo/pages/:slug
 * Serve a programmatic SEO page by slug.
 * Returns frontend-ready camelCase shape with openGraph, spokeLinksHtml, etc.
 */
router.get("/pages/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const page = await ProgrammaticPageModel.findBySlug(slug);

    if (!page || page.status !== "published") {
      return res.status(404).json({ error: "Page not found" });
    }

    // Increment page views (fire-and-forget)
    ProgrammaticPageModel.incrementViews(slug).catch(() => {});

    // Log behavioral event (fire-and-forget)
    BehavioralEventModel.create({
      event_type: "seo_page.viewed",
      properties: {
        page_slug: slug,
        specialty: page.specialty_slug,
        city: page.city_name,
        state: page.state_abbr,
      },
    }).catch(() => {});

    // Build spoke links HTML
    const spokeLinks = getSpokeLinks(
      page.specialty_slug,
      page.city_slug,
      page.state_abbr
    );
    const spokeLinksHtml = renderSpokeLinksHtml(spokeLinks);

    const pageUrl = `https://getalloro.com/${page.page_slug}`;

    // Return frontend-ready camelCase shape
    return res.json({
      title: page.title,
      metaDescription: page.meta_description || "",
      contentSections: page.content_sections || [],
      spokeLinksHtml,
      competitors: page.competitors_snapshot || [],
      schemaMarkup: page.schema_markup || null,
      openGraph: {
        title: page.title,
        description: page.meta_description || "",
        url: pageUrl,
        type: "website",
        siteName: "Alloro",
        image: "https://getalloro.com/og-market-intel.png",
      },
      specialtySlug: page.specialty_slug,
      citySlug: page.city_slug,
      cityName: page.city_name,
      stateAbbr: page.state_abbr,
      competitorCount: page.competitors_snapshot?.length || 0,
      lastUpdated: page.competitors_refreshed_at,
      canonical: pageUrl,
    });
  } catch (err) {
    console.error("SEO page error:", err);
    return res.status(500).json({ error: "Failed to load page" });
  }
});

/**
 * GET /api/seo/pages
 * List published programmatic pages with optional filters.
 */
router.get("/pages", async (req: Request, res: Response) => {
  try {
    const { specialty, city, limit = "50", offset = "0" } = req.query;

    let pages: IProgrammaticPage[];
    if (specialty) {
      pages = await ProgrammaticPageModel.findBySpecialty(specialty as string);
    } else if (city) {
      pages = await ProgrammaticPageModel.findByCity(city as string);
    } else {
      pages = await ProgrammaticPageModel.findPublished();
    }

    const start = parseInt(offset as string, 10);
    const end = start + parseInt(limit as string, 10);
    const paginated = pages.slice(start, end);

    return res.json({
      pages: paginated,
      total: pages.length,
      limit: parseInt(limit as string, 10),
      offset: start,
    });
  } catch (err) {
    console.error("SEO pages list error:", err);
    return res.status(500).json({ error: "Failed to list pages" });
  }
});

/**
 * GET /api/seo/stats
 * Dashboard stats for programmatic SEO performance.
 */
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await ProgrammaticPageModel.getStats();
    return res.json(stats);
  } catch (err) {
    console.error("SEO stats error:", err);
    return res.status(500).json({ error: "Failed to get stats" });
  }
});

/**
 * POST /api/seo/pages/:slug/checkup-start
 * Track when a visitor starts a Checkup from a programmatic page.
 */
router.post("/pages/:slug/checkup-start", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    await ProgrammaticPageModel.incrementCheckupStarts(slug);

    BehavioralEventModel.create({
      event_type: "seo_page.checkup_started",
      properties: { page_slug: slug },
    }).catch(() => {});

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to track" });
  }
});

/**
 * GET /api/seo/hub/:type/:slug
 * Hub pages for AEO internal linking.
 * Types: "specialty" (all cities for one specialty) or "city" (all specialties for one city)
 */
router.get("/hub/:type/:slug", async (req: Request, res: Response) => {
  try {
    const { type, slug } = req.params;

    let pages: IProgrammaticPage[];
    if (type === "specialty") {
      pages = await ProgrammaticPageModel.findBySpecialty(slug);
    } else if (type === "city") {
      pages = await ProgrammaticPageModel.findByCity(slug);
    } else {
      return res.status(400).json({ error: "Invalid hub type. Use 'specialty' or 'city'." });
    }

    return res.json({
      hubType: type,
      slug,
      pages: pages.map((p) => ({
        page_slug: p.page_slug,
        title: p.title,
        specialty_name: p.specialty_name,
        city_name: p.city_name,
        state_abbr: p.state_abbr,
        competitor_count: p.competitors_snapshot?.length || 0,
        page_views: p.page_views,
      })),
      total: pages.length,
    });
  } catch (err) {
    console.error("SEO hub error:", err);
    return res.status(500).json({ error: "Failed to load hub" });
  }
});

export default router;
