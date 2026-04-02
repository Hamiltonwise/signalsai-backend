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

      // Try builder pages first, fall back to fetching the live website
      const builderPages = await db("website_builder.pages")
        .where({ project_id: website.id })
        .select("id", "slug", "display_name", "content")
        .catch(() => []);

      let pageContents: Array<{ page: string; slug: string; content: string }> = [];

      if (builderPages.length > 0) {
        // Use builder pages
        pageContents = builderPages.map((p: any) => {
          let textContent = "";
          if (typeof p.content === "string") {
            textContent = p.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          } else if (p.content) {
            textContent = JSON.stringify(p.content).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          }
          return {
            page: p.display_name || p.slug || "Unknown",
            slug: p.slug,
            content: textContent.slice(0, 3000),
          };
        }).filter((p: any) => p.content.length > 50);
      } else {
        // Fetch live website pages directly
        console.log(`[Compliance] No builder pages for ${domain}, fetching live site`);
        const pagePaths = ["/", "/features", "/about", "/pricing", "/integrations", "/contact"];
        const fetchResults = await Promise.allSettled(
          pagePaths.map(async (path) => {
            const url = `https://${domain}${path}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            try {
              const resp = await fetch(url, {
                signal: controller.signal,
                headers: { "User-Agent": "Alloro-Compliance-Scanner/1.0" },
              });
              clearTimeout(timeout);
              if (!resp.ok) return null;
              const html = await resp.text();
              // Extract text from HTML
              const text = html
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
                .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
                .replace(/<[^>]*>/g, " ")
                .replace(/\s+/g, " ")
                .trim();
              return { page: path === "/" ? "Homepage" : path.slice(1).charAt(0).toUpperCase() + path.slice(2), slug: path, content: text.slice(0, 3000) };
            } catch {
              clearTimeout(timeout);
              return null;
            }
          })
        );
        pageContents = fetchResults
          .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
          .map((r) => r.value)
          .filter((p) => p.content.length > 50);
      }

      if (pageContents.length === 0) {
        return res.json({ success: true, findings: [], message: "Could not access website pages for scanning" });
      }

      const anthropic = getLLM();
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: `You are a marketing compliance reviewer. You flag claims that MAY warrant a second look before a major event or campaign. You do NOT tell the business owner to change their copy. You surface claims worth confirming.

Your tone: "You wrote this intentionally. Here's why it caught my eye, and what an FTC reviewer might ask about it. You decide."

Focus on:
1. Performance or uptime guarantees that could be read as absolute promises
2. AI or technology capability claims that may overstate current functionality
3. Integration claims that reference partner features without clarifying the relationship
4. Comparative claims ("best", "leading", "#1") without cited evidence

For each finding, provide:
- page: which page
- claim: the exact text
- concern: why it caught your eye, framed as a QUESTION not a judgment (e.g., "Is this referring to architecture or an uptime guarantee? The distinction matters.")
- severity: high (FTC could ask for substantiation), medium (worth reviewing), low (minor, probably fine)
- suggestion: a question to ask, NOT an instruction to change (e.g., "Worth confirming whether this is positioned as architecture vs. guarantee before AAE")

CRITICAL: The business owner wrote this copy for a reason. You may be missing context. Never assume a claim is wrong. Ask if it's positioned the way they intend.

Return ONLY a JSON array. If the content is clean, return [].
Each finding: {"page":"...","claim":"...","concern":"...","severity":"high|medium|low","suggestion":"..."}`,
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
