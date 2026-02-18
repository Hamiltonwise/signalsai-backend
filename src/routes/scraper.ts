/**
 * Scraper route definitions.
 *
 * POST /scraper/homepage — captures desktop/mobile screenshots, HTML markup,
 * performance metrics, broken links, and NAP details for a given domain.
 *
 * Authentication: x-scraper-key header (validated by scraperAuth middleware).
 * All business logic lives in the controller and service layers.
 */

import { Router } from "express";
import { validateScraperKey } from "../middleware/scraperAuth";
import { captureHomepage } from "../controllers/scraper/ScraperController";

const scraperRoutes = Router();

scraperRoutes.post("/homepage", validateScraperKey, captureHomepage);

export default scraperRoutes;
