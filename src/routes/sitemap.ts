/**
 * Dynamic Sitemap Generator -- GET /sitemap.xml
 *
 * Includes all static marketing routes, blog posts, content pages,
 * foundation pages, legal pages, programmatic pages, and published content.
 * Priority: homepage 1.0, checkup 1.0, pricing 0.9, content 0.8, blog 0.7, programmatic 0.6
 */

import { Router, Request, Response } from "express";
import { db } from "../database/connection";

const router = Router();

const BASE_URL = "https://getalloro.com";

interface SitemapEntry {
  loc: string;
  lastmod: string;
  priority: number;
  changefreq: string;
}

function toXmlEntry(entry: SitemapEntry): string {
  return `  <url>
    <loc>${entry.loc}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority.toFixed(1)}</priority>
  </url>`;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    const now = today();

    // Static routes
    const staticEntries: SitemapEntry[] = [
      // Homepage + Checkup (priority 1.0)
      { loc: `${BASE_URL}/`, lastmod: now, priority: 1.0, changefreq: "weekly" },
      { loc: `${BASE_URL}/checkup`, lastmod: now, priority: 1.0, changefreq: "weekly" },

      // Pricing (priority 0.9)
      { loc: `${BASE_URL}/pricing`, lastmod: now, priority: 0.9, changefreq: "monthly" },

      // Marketing pages (priority 0.8)
      { loc: `${BASE_URL}/product`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/how-it-works`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/who-its-for`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/rise`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/about`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/story`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/compare`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/changelog`, lastmod: now, priority: 0.8, changefreq: "weekly" },
      { loc: `${BASE_URL}/referral-program`, lastmod: now, priority: 0.8, changefreq: "monthly" },

      // Content pages (priority 0.8)
      { loc: `${BASE_URL}/business-clarity`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/business-clarity/what-is`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/endodontist-marketing`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/gp-referral-intelligence`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/law-firm-marketing`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/financial-advisor-marketing`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/optometrist-marketing`, lastmod: now, priority: 0.8, changefreq: "monthly" },

      // Foundation pages (priority 0.8)
      { loc: `${BASE_URL}/foundation`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/foundation/heroes`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/foundation/founders`, lastmod: now, priority: 0.8, changefreq: "monthly" },
      { loc: `${BASE_URL}/foundation/apply`, lastmod: now, priority: 0.8, changefreq: "monthly" },

      // Legal pages (priority 0.8)
      { loc: `${BASE_URL}/terms`, lastmod: now, priority: 0.8, changefreq: "yearly" },
      { loc: `${BASE_URL}/privacy`, lastmod: now, priority: 0.8, changefreq: "yearly" },

      // Blog index (priority 0.7)
      { loc: `${BASE_URL}/blog`, lastmod: now, priority: 0.7, changefreq: "weekly" },
    ];

    // Static blog posts (priority 0.7)
    const blogEntries: SitemapEntry[] = [
      { loc: `${BASE_URL}/blog/the-second-job-problem`, lastmod: "2026-03-26", priority: 0.7, changefreq: "monthly" },
      { loc: `${BASE_URL}/blog/google-business-profile-score`, lastmod: "2026-03-26", priority: 0.7, changefreq: "monthly" },
      { loc: `${BASE_URL}/blog/why-your-competitor-keeps-showing-up`, lastmod: "2026-03-26", priority: 0.7, changefreq: "monthly" },
    ];

    // Dynamic: published content from published_content table (priority 0.7)
    let publishedContentEntries: SitemapEntry[] = [];
    try {
      const publishedContent = await db("published_content")
        .where("status", "published")
        .select("slug", "updated_at", "published_at");
      publishedContentEntries = publishedContent.map((pc: any) => ({
        loc: `${BASE_URL}/blog/${pc.slug}`,
        lastmod: (pc.updated_at || pc.published_at || new Date()).toISOString().split("T")[0],
        priority: 0.7,
        changefreq: "monthly" as const,
      }));
    } catch {
      // Table may not exist yet
    }

    // Dynamic: programmatic pages (priority 0.6)
    let programmaticEntries: SitemapEntry[] = [];
    try {
      const pages = await db("programmatic_pages")
        .where("status", "published")
        .select("specialty_slug", "city_slug", "updated_at");
      programmaticEntries = pages.map((p: any) => ({
        loc: `${BASE_URL}/market/${p.specialty_slug}/${p.city_slug}`,
        lastmod: (p.updated_at || new Date()).toISOString().split("T")[0],
        priority: 0.6,
        changefreq: "weekly" as const,
      }));
    } catch {
      // Table may not exist yet
    }

    const allEntries = [
      ...staticEntries,
      ...blogEntries,
      ...publishedContentEntries,
      ...programmaticEntries,
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allEntries.map(toXmlEntry).join("\n")}
</urlset>`;

    res.set("Content-Type", "application/xml");
    res.set("Cache-Control", "public, max-age=3600");
    return res.send(xml);
  } catch (err) {
    console.error("[Sitemap] Generation error:", err);
    return res.status(500).send("Sitemap generation failed");
  }
});

export default router;
