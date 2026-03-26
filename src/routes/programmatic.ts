/**
 * WO-7 Component 4: Programmatic SEO Route Handler
 *
 * Serves /[specialty]-[city] pages with full schema, Open Graph,
 * and behavioral_events logging.
 */

import express, { Request, Response } from "express";
import {
  getPageBySlug,
  getPublishedPages,
} from "../services/programmaticSEO";
import db from "../database/connection";

const programmaticRoutes = express.Router();

/**
 * GET /api/programmatic/page/:slug
 *
 * Returns rendered page data for a programmatic SEO page.
 * Frontend fetches this and renders the page.
 */
programmaticRoutes.get("/page/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const page = await getPageBySlug(slug);

    if (!page) {
      return res.status(404).json({ success: false, error: "Page not found" });
    }

    // Log page view event (fire-and-forget, never blocks)
    logPageView(slug, req).catch(() => {});

    // Increment view counter
    const knex = db.getKnex();
    await knex("programmatic_pages")
      .where({ page_slug: slug })
      .increment("organic_visits_30d", 1);

    return res.json({
      success: true,
      page: {
        title: page.title,
        meta_description: page.meta_description,
        h1: page.h1,
        body_html: page.body_html,
        specialty_slug: page.specialty_slug,
        specialty_name: page.specialty_name,
        city_slug: page.city_slug,
        city_name: page.city_name,
        state_abbr: page.state_abbr,
        competitors_snapshot: page.competitors_snapshot,
        schema_markup: page.schema_markup,
        hub_spoke_links: page.hub_spoke_links,
        og: {
          title: page.title,
          description: page.meta_description,
          url: `https://getalloro.com/${slug}`,
          type: "website",
          site_name: "Alloro",
        },
      },
    });
  } catch (error: any) {
    console.error("[Programmatic] Page fetch error:", error.message);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

/**
 * GET /api/programmatic/pages
 *
 * Returns list of all published programmatic pages (for sitemap, hub pages).
 */
programmaticRoutes.get("/pages", async (_req: Request, res: Response) => {
  try {
    const pages = await getPublishedPages();
    return res.json({ success: true, pages });
  } catch (error: any) {
    console.error("[Programmatic] Pages list error:", error.message);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

/**
 * GET /api/programmatic/hub/:specialtySlug
 *
 * Returns a hub page with all published city pages for a specialty.
 * Hub-and-spoke AEO architecture.
 */
programmaticRoutes.get(
  "/hub/:specialtySlug",
  async (req: Request, res: Response) => {
    try {
      const { specialtySlug } = req.params;
      const knex = db.getKnex();

      const pages = await knex("programmatic_pages")
        .where({ specialty_slug: specialtySlug, published: true })
        .select(
          "page_slug",
          "city_name",
          "state_abbr",
          "competitors_snapshot",
          "title"
        )
        .orderBy("city_name");

      if (pages.length === 0) {
        return res
          .status(404)
          .json({ success: false, error: "No pages for this specialty" });
      }

      return res.json({
        success: true,
        hub: {
          specialty_slug: specialtySlug,
          total_cities: pages.length,
          pages: pages.map((p: any) => ({
            slug: p.page_slug,
            city: p.city_name,
            state: p.state_abbr,
            title: p.title,
            competitor_count: Array.isArray(p.competitors_snapshot)
              ? p.competitors_snapshot.length
              : JSON.parse(p.competitors_snapshot || "[]").length,
          })),
        },
      });
    } catch (error: any) {
      console.error("[Programmatic] Hub page error:", error.message);
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  }
);

/**
 * Fire-and-forget behavioral event logging for page views.
 * No PII. No blocking.
 */
async function logPageView(slug: string, req: Request): Promise<void> {
  try {
    const knex = db.getKnex();
    await knex("behavioral_events").insert({
      event_type: "programmatic_page.viewed",
      session_id: req.headers["x-session-id"] || null,
      properties: JSON.stringify({
        page_slug: slug,
        referrer: req.headers.referer || null,
        user_agent: req.headers["user-agent"]?.substring(0, 200) || null,
      }),
      created_at: new Date(),
    });
  } catch {
    // Silent fail. Never block user flow.
  }
}

export default programmaticRoutes;
