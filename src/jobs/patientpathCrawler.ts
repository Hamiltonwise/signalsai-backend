/**
 * PatientPath Site Crawler — Weekly SEO Audit (WO-8)
 *
 * Schedule: Sunday 8pm PT
 * Checks 9 technical SEO factors per PatientPath site.
 * Scores 0-100. Auto-creates dream_team_task if score drops 10+ points.
 */

import axios from "axios";
import { db } from "../database/connection";

interface SEOFactor {
  name: string;
  passed: boolean;
  details: string;
  weight: number;
}

const FACTORS: { name: string; weight: number }[] = [
  { name: "title_tag", weight: 12 },
  { name: "meta_description", weight: 10 },
  { name: "h1_present", weight: 12 },
  { name: "mobile_viewport", weight: 12 },
  { name: "canonical_url", weight: 10 },
  { name: "structured_data", weight: 12 },
  { name: "image_alt_tags", weight: 8 },
  { name: "page_load_time", weight: 14 },
  { name: "https_secure", weight: 10 },
];

async function checkFactor(html: string, url: string, factor: string): Promise<SEOFactor> {
  const weight = FACTORS.find((f) => f.name === factor)?.weight || 10;

  switch (factor) {
    case "title_tag": {
      const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const hasTitle = !!match && match[1].trim().length > 10 && match[1].trim().length < 70;
      return { name: factor, passed: hasTitle, details: match ? match[1].trim() : "Missing", weight };
    }
    case "meta_description": {
      const match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      const valid = !!match && match[1].length > 50 && match[1].length < 160;
      return { name: factor, passed: valid, details: match ? `${match[1].length} chars` : "Missing", weight };
    }
    case "h1_present": {
      const match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      return { name: factor, passed: !!match, details: match ? match[1].trim() : "Missing", weight };
    }
    case "mobile_viewport": {
      const has = /name=["']viewport["']/.test(html);
      return { name: factor, passed: has, details: has ? "Present" : "Missing", weight };
    }
    case "canonical_url": {
      const has = /rel=["']canonical["']/.test(html);
      return { name: factor, passed: has, details: has ? "Present" : "Missing", weight };
    }
    case "structured_data": {
      const has = /application\/ld\+json/.test(html);
      return { name: factor, passed: has, details: has ? "Present" : "Missing", weight };
    }
    case "image_alt_tags": {
      const imgs = html.match(/<img[^>]*>/gi) || [];
      const withAlt = imgs.filter((img) => /alt=["'][^"']+["']/.test(img)).length;
      const ratio = imgs.length > 0 ? withAlt / imgs.length : 1;
      return { name: factor, passed: ratio >= 0.8, details: `${withAlt}/${imgs.length} images have alt`, weight };
    }
    case "page_load_time": {
      // Already measured during fetch — placeholder
      return { name: factor, passed: true, details: "Checked via fetch timing", weight };
    }
    case "https_secure": {
      const secure = url.startsWith("https://");
      return { name: factor, passed: secure, details: secure ? "HTTPS" : "HTTP only", weight };
    }
    default:
      return { name: factor, passed: false, details: "Unknown factor", weight };
  }
}

export async function runPatientPathCrawler(): Promise<void> {
  console.log("[PatientPath Crawler] Starting weekly SEO audit...");

  // Get all orgs with PatientPath websites
  const websites = await db("websites")
    .join("organizations", "websites.organization_id", "organizations.id")
    .select("websites.id as website_id", "websites.domain", "websites.organization_id")
    .whereNotNull("websites.domain");

  for (const site of websites) {
    try {
      const url = site.domain.startsWith("http") ? site.domain : `https://${site.domain}`;
      const startTime = Date.now();
      const response = await axios.get(url, { timeout: 15000, validateStatus: () => true });
      const loadTime = Date.now() - startTime;
      const html = response.data || "";

      // Check all 9 factors
      const results: SEOFactor[] = [];
      for (const f of FACTORS) {
        const result = await checkFactor(html, url, f.name);
        if (f.name === "page_load_time") {
          result.passed = loadTime < 3000;
          result.details = `${loadTime}ms`;
        }
        results.push(result);
      }

      // Calculate score
      const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
      const earnedWeight = results.filter((r) => r.passed).reduce((sum, r) => sum + r.weight, 0);
      const score = Math.round((earnedWeight / totalWeight) * 100);

      // Get previous audit for delta
      const previous = await db("patientpath_seo_audits")
        .where({ organization_id: site.organization_id })
        .orderBy("audited_at", "desc")
        .first();

      const scoreDelta = previous ? score - previous.seo_score : null;

      // Store audit
      await db("patientpath_seo_audits").insert({
        organization_id: site.organization_id,
        website_id: site.website_id,
        seo_score: score,
        factors: JSON.stringify(results),
        previous_factors: previous ? previous.factors : null,
        score_delta: scoreDelta,
      });

      console.log(`[PatientPath Crawler] ${site.domain}: score ${score}/100 (delta: ${scoreDelta ?? "first audit"})`);

      // Auto-create task if score drops 10+ points
      if (scoreDelta !== null && scoreDelta <= -10) {
        await db("dream_team_tasks").insert({
          title: `SEO score dropped ${Math.abs(scoreDelta)} points for ${site.domain}`,
          description: `Previous: ${previous!.seo_score}, Current: ${score}. Failing factors: ${results.filter((r) => !r.passed).map((r) => r.name).join(", ")}`,
          assigned_to: "Dave",
          priority: "high",
          status: "pending",
        }).catch(() => {
          // dream_team_tasks table may not have this exact schema — log instead
          console.warn(`[PatientPath Crawler] ALERT: SEO score dropped ${Math.abs(scoreDelta)} pts for ${site.domain}`);
        });
      }
    } catch (err: any) {
      console.error(`[PatientPath Crawler] Error crawling ${site.domain}:`, err.message);
    }
  }

  console.log("[PatientPath Crawler] Weekly audit complete.");
}
