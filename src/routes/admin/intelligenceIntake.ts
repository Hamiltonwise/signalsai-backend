/**
 * Intelligence Intake API — Founder Mode
 *
 * POST /api/admin/intelligence/ingest  — submit source (URL, file, text)
 * GET  /api/admin/intelligence         — list knowledge sources
 * GET  /api/admin/intelligence/:id     — single source with full brief
 */

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const intelligenceRoutes = express.Router();

let anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

const LLM_MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";

// ─── Domain tags ────────────────────────────────────────────────────

const VALID_DOMAINS = ["product", "gtm", "operations", "personal", "legal_financial"] as const;

// ─── Claude extraction prompt ───────────────────────────────────────

const EXTRACTION_SYSTEM = `You are an intelligence analyst for Alloro, a dental/medical practice intelligence company. You extract actionable intelligence from source material.

Alloro's context:
- Sells business intelligence to local service businesses
- $2,000/month DFY product: website + competitive intelligence + referral tracking
- Currently pre-revenue, approaching AAE conference (April 14, 2026)
- Founder: Corey (vision/sales), Jo (operations), Dave (engineering)
- Key insight: practices buy freedom from the second job they accidentally created

For the given source material, extract:

1. **frameworks**: Array of frameworks/mental models applicable to Alloro. Each: { name, description, application }
2. **tactics**: Array of specific tactics worth testing. Each: { tactic, context, effort_level: "low"|"medium"|"high", domain: "product"|"gtm"|"operations"|"personal"|"legal_financial" }
3. **quotes**: Array of notable quotes. Each: { quote, speaker, context }
4. **key_insight**: The single most important takeaway for Alloro right now (one paragraph)
5. **domain_tags**: Array of applicable domains from: product, gtm, operations, personal, legal_financial
6. **source_summary**: What this source is (one sentence: author, format, topic)
7. **test_immediately**: The one thing to test this week (specific, actionable)
8. **content_flywheel**: One idea for Alloro's content strategy derived from this source

Return valid JSON with these exact keys.`;

// ─── Intelligence brief generator ───────────────────────────────────

function generateBrief(
  sourceTitle: string,
  sourceAuthor: string,
  extracted: any,
): string {
  const frameworks = extracted.frameworks?.slice(0, 3) || [];
  const testNow = extracted.test_immediately || "No immediate test identified.";
  const flywheel = extracted.content_flywheel || "No content idea identified.";
  const insight = extracted.key_insight || "";

  let brief = `# Intelligence Brief: ${sourceTitle}\n`;
  brief += `**Source:** ${sourceAuthor || "Unknown"}\n\n`;

  if (insight) {
    brief += `## Key Insight\n${insight}\n\n`;
  }

  if (frameworks.length > 0) {
    brief += `## Top Frameworks for Alloro\n`;
    frameworks.forEach((f: any, i: number) => {
      brief += `${i + 1}. **${f.name}** — ${f.description}\n   *Application:* ${f.application}\n\n`;
    });
  }

  brief += `## Test This Week\n${testNow}\n\n`;
  brief += `## Content Flywheel\n${flywheel}\n`;

  return brief;
}

// ─── POST /ingest — submit source ───────────────────────────────────

intelligenceRoutes.post(
  "/ingest",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { source_type, source_url, source_title, source_author, content_type, raw_content } = req.body;

      if (!raw_content?.trim() && !source_url?.trim()) {
        return res.status(400).json({
          success: false,
          error: "Provide raw_content or source_url",
        });
      }

      // Create pending record
      const [record] = await db("knowledge_sources")
        .insert({
          source_type: source_type || "text",
          source_url: source_url || null,
          source_title: source_title || "Untitled Source",
          source_author: source_author || null,
          content_type: content_type || "article",
          raw_content: raw_content || null,
          status: "processing",
          created_by: "corey",
        })
        .returning("*");

      console.log(`[Intelligence] Processing: ${source_title || source_url}`);

      // Process async
      processSource(record.id, raw_content || "", source_title || "", source_author || "").catch(
        (err) => console.error(`[Intelligence] Failed:`, err.message),
      );

      return res.json({
        success: true,
        id: record.id,
        status: "processing",
      });
    } catch (error: any) {
      console.error("[Intelligence] Ingest error:", error.message);
      return res.status(500).json({ success: false, error: "Ingest failed" });
    }
  },
);

// ─── GET / — list sources ───────────────────────────────────────────

intelligenceRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { domain, status, limit = "30" } = req.query;

      let query = db("knowledge_sources")
        .select("id", "source_type", "source_url", "source_title", "source_author",
          "content_type", "domain_tags", "status", "created_at", "intelligence_brief")
        .orderBy("created_at", "desc")
        .limit(Number(limit));

      if (status) query = query.where({ status });
      if (domain) query = query.whereRaw("domain_tags @> ?", [JSON.stringify([domain])]);

      const sources = await query;
      return res.json({ success: true, sources });
    } catch (error: any) {
      console.error("[Intelligence] List error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to list sources" });
    }
  },
);

// ─── GET /:id — single source with full extraction ──────────────────

intelligenceRoutes.get(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const source = await db("knowledge_sources").where({ id }).first();
      if (!source) {
        return res.status(404).json({ success: false, error: "Not found" });
      }

      // Parse JSONB fields
      source.extracted_intelligence = typeof source.extracted_intelligence === "string"
        ? JSON.parse(source.extracted_intelligence)
        : source.extracted_intelligence;
      source.domain_tags = typeof source.domain_tags === "string"
        ? JSON.parse(source.domain_tags)
        : source.domain_tags;
      source.decision_cross_refs = typeof source.decision_cross_refs === "string"
        ? JSON.parse(source.decision_cross_refs)
        : source.decision_cross_refs;

      return res.json({ success: true, source });
    } catch (error: any) {
      console.error("[Intelligence] Detail error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to fetch source" });
    }
  },
);

// ─── Background processor ───────────────────────────────────────────

async function processSource(
  id: string,
  rawContent: string,
  title: string,
  author: string,
): Promise<void> {
  try {
    const client = getAnthropic();

    // Truncate to 80k chars for Claude context
    const content = rawContent.slice(0, 80000);

    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 4000,
      system: EXTRACTION_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Source: "${title}" by ${author || "Unknown"}\n\nContent:\n${content}`,
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";

    // Parse JSON from response
    let extracted: any = {};
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("[Intelligence] Failed to parse extraction JSON");
      extracted = { key_insight: text, frameworks: [], tactics: [], quotes: [] };
    }

    // Generate brief
    const brief = generateBrief(title, author, extracted);

    // Domain tags
    const domainTags = extracted.domain_tags || [];

    // Cross-reference Decision Log (if table exists)
    let crossRefs: any[] = [];
    try {
      const decisions = await db("decision_log").select("id", "title", "status", "domain").limit(50);
      if (decisions.length > 0 && extracted.frameworks?.length > 0) {
        for (const framework of extracted.frameworks) {
          const matching = decisions.filter(
            (d: any) => framework.domain === d.domain || framework.application?.toLowerCase().includes(d.title?.toLowerCase()),
          );
          for (const d of matching) {
            crossRefs.push({
              decision_id: d.id,
              decision_title: d.title,
              relationship: d.status === "locked" ? "strengthens" : "relates_to",
              framework: framework.name,
            });
          }
        }
      }
    } catch {
      // Decision Log table doesn't exist yet — that's fine
    }

    // Update record
    await db("knowledge_sources").where({ id }).update({
      extracted_intelligence: JSON.stringify(extracted),
      intelligence_brief: brief,
      domain_tags: JSON.stringify(domainTags),
      decision_cross_refs: JSON.stringify(crossRefs),
      status: "complete",
      updated_at: new Date(),
    });

    console.log(`[Intelligence] Complete: ${title} — ${extracted.frameworks?.length || 0} frameworks, ${extracted.tactics?.length || 0} tactics`);

    // ─── Knowledge Lattice Candidate Generation ───────────────────
    // If the source mentions a named individual or company AND is a
    // podcast/article/video, generate a lattice candidate entry.
    const contentType = await db("knowledge_sources").where({ id }).select("content_type").first();
    const isLatticeEligible = ["podcast", "article", "video"].includes(contentType?.content_type || "");

    if (isLatticeEligible && (author || extracted.quotes?.length > 0)) {
      try {
        const latticeResponse = await client.messages.create({
          model: LLM_MODEL,
          max_tokens: 1000,
          system: `You extract Knowledge Lattice entries from source material for Alloro's agent system.

A Knowledge Lattice entry captures one leader's or company's core principle and translates it into an actionable heuristic for Alloro's AI agents.

Extract from the source material:
1. leader_name: The primary person or company discussed
2. core_principle: Their core teaching in one sentence
3. agent_heuristic: One actionable question Alloro agents should ask themselves (starts with "Before...")
4. anti_pattern: What to avoid (specific to Alloro's context)
5. why_alloro_cares: One sentence connecting this to Alloro's mission
6. category: One of: Ops/Customer Success, Sales, Psychology, SaaS, AI Innovator, Visionary, Healthcare, Failure

Return valid JSON with these exact keys. If the source doesn't contain a clear leader/principle, return {"skip": true}.`,
          messages: [
            {
              role: "user",
              content: `Source: "${title}" by ${author || "Unknown"}\n\nKey insight: ${extracted.key_insight || ""}\n\nFrameworks: ${JSON.stringify(extracted.frameworks?.slice(0, 3) || [])}`,
            },
          ],
        });

        const latticeText = latticeResponse.content[0]?.type === "text" ? latticeResponse.content[0].text : "";
        let latticeCandidate: any = null;

        try {
          const jsonMatch = latticeText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (!parsed.skip) {
              latticeCandidate = parsed;
            }
          }
        } catch {
          // Failed to parse lattice candidate, that's fine
        }

        if (latticeCandidate) {
          await db("knowledge_sources").where({ id }).update({
            candidate_lattice_entry: JSON.stringify(latticeCandidate),
          });
          console.log(`[Intelligence] Lattice candidate generated: ${latticeCandidate.leader_name}`);
        }
      } catch (latticeErr: any) {
        console.error(`[Intelligence] Lattice candidate generation failed:`, latticeErr.message);
        // Non-fatal, main extraction already saved
      }
    }
  } catch (err: any) {
    console.error(`[Intelligence] Processing failed for ${id}:`, err.message);
    await db("knowledge_sources").where({ id }).update({
      status: "failed",
      updated_at: new Date(),
    });
  }
}

// T2 registers POST /api/admin/knowledge-lattice/add

export default intelligenceRoutes;
