/**
 * Copy Rewrite Service — config loader.
 *
 * Loads the Notion page "Copy Rewrite Config v1" and parses the fenced
 * JSON block `alloro:copy-rewrite-config`. Falls back to a local copy when
 * Notion is unavailable. 24h cache.
 *
 * The Notion page is authoritative; the local fallback exists so the service
 * stays runnable without network access (and so tests don't need live Notion
 * credentials).
 */

import axios from "axios";

const NOTION_API_VERSION = "2022-06-28";
const CONFIG_PAGE_SEARCH_QUERY = "Copy Rewrite Config v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface SectionPromptTemplate {
  purpose: string;
  promptTemplate: string;
  lengthWords?: [number, number];
  defaultTone?: string;
}

export interface CopyRewriteConfig {
  versionId: string;
  source: "notion" | "fallback";
  defaultTargetSections: string[];
  maxRetries: number;
  toneVariants: Record<string, string>;
  sectionPromptTemplates: Record<string, SectionPromptTemplate>;
  targetDimensionMap: Record<string, string>;
  escalationPolicy: {
    onThirdFailure: string;
    taskType: string;
    priority: string;
  };
  loadedAt: string;
}

interface CacheEntry {
  value: CopyRewriteConfig;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;

export function _resetCopyRewriteConfigCache(): void {
  cache = null;
}

export async function loadCopyRewriteConfig(): Promise<CopyRewriteConfig> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.value;
  }
  const value = await fetchFromNotion();
  cache = { value, fetchedAt: Date.now() };
  return value;
}

async function fetchFromNotion(): Promise<CopyRewriteConfig> {
  const token = process.env.NOTION_TOKEN;
  if (!token) return fallbackConfig();

  try {
    const searchResp = await axios.post(
      "https://api.notion.com/v1/search",
      {
        query: CONFIG_PAGE_SEARCH_QUERY,
        filter: { property: "object", value: "page" },
        page_size: 5,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_API_VERSION,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      }
    );

    const pageId: string | undefined = searchResp.data?.results?.[0]?.id;
    if (!pageId) return fallbackConfig();

    const blocksResp = await axios.get(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_API_VERSION,
        },
        timeout: 8000,
      }
    );

    const blocks: any[] = blocksResp.data?.results ?? [];
    let body = "";
    for (const b of blocks) {
      if (b.type === "code" && Array.isArray(b.code?.rich_text)) {
        body += b.code.rich_text.map((r: any) => r.plain_text ?? "").join("") + "\n";
      }
      const data = b?.[b.type];
      if (data && Array.isArray(data.rich_text)) {
        body += data.rich_text.map((r: any) => r.plain_text ?? "").join("") + "\n";
      }
    }

    const match = body.match(/alloro:copy-rewrite-config\s+([\s\S]+?)(?=```|$)/);
    if (!match) return fallbackConfig();

    const parsed = JSON.parse(match[1]);
    return {
      versionId: parsed.versionId ?? "copy-rewrite-config-notion-unknown",
      source: "notion",
      defaultTargetSections: Array.isArray(parsed.defaultTargetSections)
        ? parsed.defaultTargetSections
        : fallbackConfig().defaultTargetSections,
      maxRetries: typeof parsed.maxRetries === "number" ? parsed.maxRetries : 3,
      toneVariants: parsed.toneVariants ?? fallbackConfig().toneVariants,
      sectionPromptTemplates:
        parsed.sectionPromptTemplates ?? fallbackConfig().sectionPromptTemplates,
      targetDimensionMap:
        parsed.targetDimensionMap ?? fallbackConfig().targetDimensionMap,
      escalationPolicy:
        parsed.escalationPolicy ?? fallbackConfig().escalationPolicy,
      loadedAt: new Date().toISOString(),
    };
  } catch {
    return fallbackConfig();
  }
}

function fallbackConfig(): CopyRewriteConfig {
  return {
    versionId: "copy-rewrite-config-v1-local-fallback",
    source: "fallback",
    defaultTargetSections: ["hero", "proofline_carousel", "doctor_story", "about_intro"],
    maxRetries: 3,
    toneVariants: {
      warm:
        "Lead with what the recipient feels before what they need. Concrete, specific, no marketing language.",
      direct:
        "Plain statement of what this practice does for someone in their specific situation. No softeners.",
      calm:
        "Acknowledge the common fear — anxiety, prior bad experience, cost worry — then factual what-happens-next without reassurance-speak.",
    },
    sectionPromptTemplates: {
      // Section keys (hero, proofline_carousel, doctor_story, about_intro)
      // are intentionally unchanged — renaming them is a separate design
      // decision. The per-vertical vocabulary is injected via placeholders.
      hero: {
        purpose:
          "First sentence the visitor reads. Must acknowledge their emotional state before listing anything the business does.",
        promptTemplate:
          "Rewrite the hero for {practiceName} in {specialty} in {location}. Open by acknowledging what a {customerTerm} in pain, scared, or distrustful of past providers is feeling. Then in one sentence name the irreplaceable thing about this business: {differentiator}. Use one concrete detail pulled from these actual {customerTerm} words ({hipaaInstruction}): {patientQuotes}. Banned: 'advanced', 'state-of-the-art', 'comprehensive', 'cutting-edge', 'world-class', 'utilizing', 'best-in-class'. Target rubric dimensions to improve: {targetDimensions}. Target tone: {tone}.",
        lengthWords: [35, 85],
        defaultTone: "warm",
      },
      proofline_carousel: {
        purpose:
          "3-5 short proof statements, each anchored in one customer's actual words. First name only. No aggregate review count.",
        promptTemplate:
          "Write 3-5 proofline statements for {practiceName}. Each statement is 1-2 short sentences, anchored in one {customerTerm}'s actual words from these quotes: {patientQuotes}. Attribute with {hipaaInstruction}. Never aggregate ('our {customerTermPlural} love us') — always one voice at a time. Target rubric dimensions: {targetDimensions}. Target tone: {tone}.",
        lengthWords: [80, 200],
        defaultTone: "direct",
      },
      doctor_story: {
        purpose:
          "Two-paragraph story of the {providerTerm} that a longtime {customerTerm} or spouse would read and say 'that's them'. Not a CV.",
        promptTemplate:
          "Write a two-paragraph story about the {providerTerm} at {practiceName} — not a CV. The goal: someone who knows this {providerTerm} intimately reads it and says 'that's exactly them'. Facts to draw from: {doctorBackground}. {hipaaInstruction} {customerTermPlural} descriptions of the {providerTerm}: {patientQuotes}. Target rubric dimensions: {targetDimensions}. Target tone: {tone}. Banned: 'board-certified', 'expert', 'leading', 'renowned', any credential string without context.",
        lengthWords: [120, 250],
        defaultTone: "warm",
      },
      about_intro: {
        purpose:
          "Opening of the about section that frames the business's point of view on the work, not the services.",
        promptTemplate:
          "Write the opening of {practiceName}'s about section. Frame their point of view on the work — not a services list. Ground in {differentiator} and the community context: {location}. Reference {customerTerm} language ({hipaaInstruction}): {patientQuotes}. Target rubric dimensions: {targetDimensions}. Target tone: {tone}.",
        lengthWords: [80, 180],
        defaultTone: "warm",
      },
    },
    targetDimensionMap: {
      meta_question: "feels understood before informed",
      recognition_test: "spouse/front-desk/longtime-patient recognizability",
      patient_voice_match: "uses words actual patients used in reviews",
      mom_test: "9th-grade reading level, no jargon",
      fear_acknowledged: "acknowledges the emotional state before services",
    },
    escalationPolicy: {
      onThirdFailure: "dream_team_task",
      taskType: "copy_rewrite_failed",
      priority: "high",
    },
    loadedAt: new Date().toISOString(),
  };
}
