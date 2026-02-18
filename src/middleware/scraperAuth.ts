/**
 * Authentication middleware for the scraper API.
 *
 * Validates the `x-scraper-key` header against the `SCRAPER_API_KEY`
 * environment variable. Used by the POST /scraper/homepage endpoint.
 *
 * Responses:
 * - 500 if SCRAPER_API_KEY env var is not configured
 * - 401 if the key is missing or does not match
 * - Calls next() on success
 */

import { Request, Response, NextFunction } from "express";

export const validateScraperKey = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const apiKey = req.headers["x-scraper-key"];
  const validKey = process.env.SCRAPER_API_KEY;

  if (!validKey) {
    return res.status(500).json({
      success: false,
      error: "Scraper API key not configured on server",
    });
  }

  if (apiKey !== validKey) {
    return res.status(401).json({
      success: false,
      error: "Invalid or missing API key",
    });
  }

  next();
};
