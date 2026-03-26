/**
 * WO-7 Component 4: Route Handler for /[specialty]-[city]
 *
 * Serves programmatic SEO pages with full schema markup,
 * Open Graph tags, and behavioral_events logging.
 */

import express, { Request, Response } from "express";
import knex from "../database/connection";
import { SPECIALTIES } from "../data/cityData";
import { getSpokeLinks, renderSpokeLinksHtml } from "../services/aeoLinking";

const programmaticPagesRoutes = express.Router();

const VALID_SPECIALTY_SLUGS = new Set(SPECIALTIES.map((s) => s.slug));

/**
 * GET /:pageSlug
 * Renders a programmatic SEO page for a specialty-city combination.
 */
programmaticPagesRoutes.get("/:pageSlug", async (req: Request, res: Response) => {
  try {
    const { pageSlug } = req.params;

    // Validate slug format: specialty-city-state
    const parts = pageSlug.split("-");
    if (parts.length < 3) {
      return res.status(404).json({ error: "Page not found" });
    }

    // Find the specialty prefix
    let specialtySlug = "";
    for (const s of SPECIALTIES) {
      if (pageSlug.startsWith(s.slug + "-")) {
        specialtySlug = s.slug;
        break;
      }
    }

    if (!specialtySlug || !VALID_SPECIALTY_SLUGS.has(specialtySlug)) {
      return res.status(404).json({ error: "Page not found" });
    }

    const page = await knex("programmatic_pages")
      .where({ page_slug: pageSlug, published: true })
      .first();

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    // Log behavioral event for page view
    await knex("behavioral_events")
      .insert({
        event_type: "programmatic_page_view",
        session_id: req.headers["x-session-id"] as string || null,
        properties: JSON.stringify({
          page_slug: pageSlug,
          specialty_slug: page.specialty_slug,
          city_slug: page.city_slug,
          state_abbr: page.state_abbr,
          referrer: req.headers.referer || null,
          user_agent: req.headers["user-agent"] || null,
        }),
      })
      .catch(() => {
        // Non-blocking: don't fail the page render if event logging fails
      });

    // Build spoke links
    const spokeLinks = getSpokeLinks(
      page.specialty_slug,
      page.city_slug,
      page.state_abbr
    );
    const spokeLinksHtml = renderSpokeLinksHtml(spokeLinks);

    // Parse stored JSON
    const competitors = typeof page.competitors_snapshot === "string"
      ? JSON.parse(page.competitors_snapshot)
      : page.competitors_snapshot;
    const schemaMarkup = typeof page.schema_markup === "string"
      ? JSON.parse(page.schema_markup)
      : page.schema_markup;

    // Return full page data (frontend renders the template)
    return res.json({
      title: page.title,
      metaDescription: page.meta_description,
      h1: page.h1,
      bodyHtml: page.body_html,
      spokeLinksHtml,
      competitors,
      schemaMarkup,
      openGraph: {
        title: page.title,
        description: page.meta_description,
        url: `https://getalloro.com/${pageSlug}`,
        type: "website",
        siteName: "Alloro",
        image: "https://getalloro.com/logo.png",
      },
      specialtySlug: page.specialty_slug,
      citySlug: page.city_slug,
      cityName: page.city_name,
      stateAbbr: page.state_abbr,
      competitorCount: competitors.length,
      lastUpdated: page.competitors_fetched_at,
    });
  } catch (error) {
    console.error("Programmatic page error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /hub/:specialtySlug
 * Returns hub page data for a specialty (links to all city pages).
 */
programmaticPagesRoutes.get(
  "/hub/:specialtySlug",
  async (req: Request, res: Response) => {
    try {
      const { specialtySlug } = req.params;

      if (!VALID_SPECIALTY_SLUGS.has(specialtySlug)) {
        return res.status(404).json({ error: "Specialty not found" });
      }

      const specialty = SPECIALTIES.find((s) => s.slug === specialtySlug);
      const pages = await knex("programmatic_pages")
        .where({ specialty_slug: specialtySlug, published: true })
        .select(
          "page_slug",
          "city_name",
          "state_abbr",
          "competitors_snapshot"
        )
        .orderBy("city_name");

      const cityPages = pages.map((p) => {
        const competitors = typeof p.competitors_snapshot === "string"
          ? JSON.parse(p.competitors_snapshot)
          : p.competitors_snapshot;
        return {
          slug: p.page_slug,
          cityName: p.city_name,
          stateAbbr: p.state_abbr,
          competitorCount: competitors.length,
          url: `/${p.page_slug}`,
        };
      });

      return res.json({
        specialty: specialty?.name,
        specialtySlug,
        totalCities: cityPages.length,
        cities: cityPages,
      });
    } catch (error) {
      console.error("Hub page error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default programmaticPagesRoutes;
