/**
 * Market Data API -- GET /api/market/:specialty/:city
 *
 * Returns cached market stats for programmatic city pages.
 * Falls back to programmatic_pages table data.
 */

import express from "express";
import { db } from "../database/connection";

const marketRoutes = express.Router();

/**
 * GET /api/market/:specialty/:city
 *
 * Returns market data for a specialty + city combination.
 * Used by the MarketPage frontend component for programmatic SEO pages.
 */
marketRoutes.get("/:specialty/:city", async (req, res) => {
  try {
    const { specialty, city } = req.params;

    if (!specialty || !city) {
      return res.status(400).json({ success: false, error: "Missing specialty or city" });
    }

    // Look up in programmatic_pages table
    const page = await db("programmatic_pages")
      .where({ specialty_slug: specialty, city_slug: city })
      .first();

    if (page) {
      // Parse competitors snapshot for aggregate stats
      let competitors: Array<{ rating: number; reviewCount: number }> = [];
      try {
        competitors =
          typeof page.competitors_snapshot === "string"
            ? JSON.parse(page.competitors_snapshot)
            : page.competitors_snapshot || [];
      } catch {
        competitors = [];
      }

      const avgRating =
        competitors.length > 0
          ? competitors.reduce((sum: number, c: { rating: number }) => sum + (c.rating || 0), 0) / competitors.length
          : 0;
      const avgReviews =
        competitors.length > 0
          ? Math.round(
              competitors.reduce((sum: number, c: { reviewCount: number }) => sum + (c.reviewCount || 0), 0) /
                competitors.length
            )
          : 0;

      return res.json({
        success: true,
        data: {
          specialtyName: page.specialty_name,
          cityName: page.city_name,
          state: page.state,
          stateAbbr: page.state_abbr,
          marketScore: page.checkup_starts > 0 ? Math.min(100, Math.round((page.conversion_rate || 0) * 100 + 50)) : null,
          competitorCount: competitors.length,
          averageRating: Math.round(avgRating * 10) / 10,
          averageReviews: avgReviews,
          lat: page.lat,
          lng: page.lng,
          competitors: competitors.slice(0, 10).map((c: any) => ({
            name: c.name,
            rating: c.rating,
            reviewCount: c.reviewCount,
            address: c.address,
          })),
        },
      });
    }

    // No cached data found
    return res.status(404).json({
      success: false,
      error: "Market data not yet available for this location",
    });
  } catch (error: any) {
    console.error("[Market] Error fetching market data:", error.message);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

export default marketRoutes;
