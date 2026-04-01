/**
 * Website Compliance Scanner
 *
 * Scans a website for marketing claims that may overstate product capabilities.
 * Surfaces findings as actionable intelligence. Designed for software companies
 * like DentalEMR who need to ensure FTC compliance on marketing pages.
 *
 * GET /api/compliance/scan       -- trigger a scan for the org's website
 * GET /api/compliance/findings   -- list latest findings
 */

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../middleware/rbac";
import { db } from "../database/connection";

const complianceRoutes = express.Router();

let llm: Anthropic | null = null;
function getLLM(): Anthropic {
  if (!llm) llm = new Anthropic();
  return llm;
}

interface ComplianceFinding {
  page: string;
  claim: string;
  concern: string;
  severity: "high" | "medium" | "low";
  suggestion: string;
}

/**
 * GET /api/compliance/scan -- Trigger a compliance scan
 *
 * Fetches the org's website pages, sends content to Claude for analysis,
 * and stores findings. Returns results immediately.
 */
complianceRoutes.get(
  "/scan",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      // Get org info and website
      const org = await db("organizations").where({ id: orgId }).first();
      const website = await db("website_builder.projects")
        .where({ organization_id: orgId })
        .first();

      if (!website) {
        return res.status(404).json({ success: false, error: "No website connected" });
      }

      const domain = website.custom_domain || `${website.generated_hostname}.getalloro.com`;

      // Fetch website pages from the builder
      const pages = await db("website_builder.pages")
        .where({ project_id: website.id })
        .select("id", "slug", "display_name", "content");

      if (pages.length === 0) {
        return res.json({
          success: true,
          findings: [],
          message: "No pages found to scan",
        });
      }

      // Build page content for analysis
      const pageContents = pages.map((p: any) => {
        // Extract text content from HTML/JSON
        let textContent = "";
        if (typeof p.content === "string") {
          textContent = p.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        } else if (p.content) {
          textContent = JSON.stringify(p.content).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        }
        return {
          page: p.display_name || p.slug || "Unknown",
          slug: p.slug,
          content: textContent.slice(0, 3000), // Cap per page to avoid token limits
        };
      }).filter((p: any) => p.content.length > 50); // Skip near-empty pages

      if (pageContents.length === 0) {
        return res.json({ success: true, findings: [], message: "Pages have no scannable content" });
      }

      const anthropic = getLLM();
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: `You are a marketing compliance analyst. You review website content for claims that may be inaccurate, unverifiable, or potentially in violation of FTC guidelines. Focus on:

1. "Best" or "leading" claims without substantiation
2. AI/technology capability claims that may overstate what the product actually does
3. Integration claims that may reference partner features as native capabilities
4. Performance claims without data sources
5. Testimonial or review implications that could be misleading

For each finding, provide: the specific page, the exact claim, why it's a concern, severity (high/medium/low), and a concrete suggestion for how to fix it.

IMPORTANT: Only flag genuine concerns. Do not flag every marketing superlative. Focus on claims that could actually cause problems if challenged.

Return ONLY a JSON array of findings. Each finding:
{"page":"page name","claim":"the exact text","concern":"why this is flagged","severity":"high|medium|low","suggestion":"how to fix it"}

If the content is clean, return an empty array [].`,
        messages: [{
          role: "user",
          content: `Scan the following website pages for ${org?.name || domain} (${domain}):

${pageContents.map((p: any) => `--- PAGE: ${p.page} (/${p.slug}) ---\n${p.content}`).join("\n\n")}`,
        }],
      });

      const text = response.content[0]?.type === "text" ? response.content[0].text : "[]";
      let findings: ComplianceFinding[] = [];
      try {
        const cleaned = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        findings = JSON.parse(cleaned);
        if (!Array.isArray(findings)) findings = [];
        findings = findings.slice(0, 20).map((f) => ({
          page: String(f.page || "Unknown"),
          claim: String(f.claim || ""),
          concern: String(f.concern || ""),
          severity: (["high", "medium", "low"].includes(f.severity) ? f.severity : "medium") as ComplianceFinding["severity"],
          suggestion: String(f.suggestion || ""),
        }));
      } catch {
        console.error("[Compliance] Parse error:", text.slice(0, 200));
        findings = [];
      }

      // Store scan results
      await db("compliance_scans").insert({
        organization_id: orgId,
        domain,
        pages_scanned: pageContents.length,
        findings_count: findings.length,
        findings: JSON.stringify(findings),
        scanned_at: new Date(),
      });

      console.log(`[Compliance] Scanned ${pageContents.length} pages for ${domain}, found ${findings.length} concerns`);

      return res.json({
        success: true,
        domain,
        pagesScanned: pageContents.length,
        findings,
      });
    } catch (error: any) {
      console.error("[Compliance] Scan error:", error.message);
      return res.status(500).json({ success: false, error: "Scan failed" });
    }
  }
);

/**
 * GET /api/compliance/findings -- Latest scan findings
 */
complianceRoutes.get(
  "/findings",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const latest = await db("compliance_scans")
        .where({ organization_id: orgId })
        .orderBy("scanned_at", "desc")
        .first();

      if (!latest) {
        return res.json({ success: true, findings: [], lastScan: null });
      }

      const findings = typeof latest.findings === "string"
        ? JSON.parse(latest.findings)
        : latest.findings;

      return res.json({
        success: true,
        domain: latest.domain,
        pagesScanned: latest.pages_scanned,
        findingsCount: latest.findings_count,
        findings,
        lastScan: latest.scanned_at,
      });
    } catch (error: any) {
      console.error("[Compliance] Findings error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load findings" });
    }
  }
);

export default complianceRoutes;
