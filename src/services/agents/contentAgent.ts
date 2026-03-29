/**
 * Content Agent -- Execution Service
 *
 * On-demand AEO-optimized content generator. Produces content mapped
 * to exact ICP search queries. Every piece answers a question a
 * specialist types at 10pm.
 *
 * Separate from CMO Agent (strategy) and Content Performance Agent
 * (measurement). This agent drafts. Corey ships.
 *
 * Export: generateContent() -- on-demand function, not a cron job.
 */

import { db } from "../../database/connection";

// -- Types ------------------------------------------------------------------

interface ContentInput {
  topic: string;
  keywords: string[];
  targetQueries: string[];
  contentType?: "faq" | "insight" | "case_study";
  orgId?: number;
  specialty?: string;
  city?: string;
}

interface ContentResult {
  title: string;
  body: string;
  metaDescription: string;
  targetQueries: string[];
  estimatedSearchVolume: string;
  contentType: string;
  schemaMarkup: string;
}

// -- Core -------------------------------------------------------------------

/**
 * Generate AEO-optimized content for a given topic and keywords.
 *
 * @param input - topic, keywords, targetQueries, optional contentType/orgId/specialty/city
 * @returns ContentResult with title, body, meta, schema markup, and target queries
 */
export async function generateContent(
  input: ContentInput,
): Promise<ContentResult> {
  const {
    topic,
    keywords,
    targetQueries,
    contentType = "faq",
    specialty,
    city,
  } = input;

  // Attempt Claude generation
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await generateWithClaude(input);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[ContentAgent] Claude generation failed, using template:`,
        message,
      );
    }
  }

  // Fallback to template
  return generateTemplateContent(input);
}

// -- Claude Generation ------------------------------------------------------

async function generateWithClaude(input: ContentInput): Promise<ContentResult> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  const {
    topic,
    keywords,
    targetQueries,
    contentType = "faq",
    specialty,
    city,
  } = input;

  const contentTypeInstructions: Record<string, string> = {
    faq: `FAQ Expansion:
- H1 is the question itself, exactly as a specialist would type it at 10pm
- First paragraph answers the question directly in 1-2 sentences
- Second paragraph provides 3 specific causes or factors
- Third paragraph gives one specific action the reader can take today
- Include FAQPage JSON-LD schema
- End with CTA: "Run your free Checkup to see where you stand."`,

    insight: `Weekly Insight Post (150-250 words):
- H1: the pattern as a question ("Why Did Three Practices Lose Referrals This Week?")
- First paragraph: answer the question directly
- Second paragraph: one specific example (anonymized)
- Third paragraph: one action the reader can take today
- End with CTA: "Run your free Checkup to see where you stand."`,

    case_study: `Case Study Draft:
- Lead with the transformation, not the credentials
- Structure: starting position, Alloro actions taken, result, timeline
- Include specific numbers: rank position, review counts, revenue impact
- Leave placeholders for practice name (needs permission) and human details (Corey fills in)`,
  };

  const prompt = `You are the Content Agent for Alloro, a business clarity platform for licensed specialists.

Generate AEO-optimized content for this topic:

Topic: ${topic}
Keywords: ${keywords.join(", ")}
Target Queries: ${targetQueries.join("; ")}
Content Type: ${contentType}
${specialty ? `Specialty: ${specialty}` : ""}
${city ? `City: ${city}` : ""}

${contentTypeInstructions[contentType] || contentTypeInstructions.faq}

AEO Rules:
- Every piece answers a specific question in the first paragraph. No throat-clearing.
- H1 is the question. First sentence is the answer. Everything else is supporting evidence.
- Include one specific dollar figure in the first 100 words that makes inaction feel expensive.
- Target queries a specialist types at 10pm: "why are my referrals dropping," "is my practice competitive," "how to get more referrals"

Voice Rules:
- Direct, outcome-first, no hedging, no corporate language
- No em-dashes. Use commas, periods, or semicolons
- No "In today's competitive landscape" or any generic opener
- No "leverage," "optimize," "empower," "solution," "platform," "dashboard"
- The reader is skeptical of agencies and software vendors. They want proof, not promises.

Return a JSON object with:
- title: the H1 (max 80 chars)
- body: the full content in markdown
- metaDescription: SEO meta description (max 155 chars, includes the answer)
- targetQueries: array of 3-5 search queries this content targets
- estimatedSearchVolume: rough estimate ("low", "medium", "high")
- contentType: "${contentType}"
- schemaMarkup: appropriate JSON-LD schema as a string

Return ONLY the JSON object, no markdown fences.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    return {
      title: String(parsed.title || topic),
      body: String(parsed.body || ""),
      metaDescription: String(parsed.metaDescription || ""),
      targetQueries: Array.isArray(parsed.targetQueries)
        ? parsed.targetQueries.map(String)
        : targetQueries,
      estimatedSearchVolume: String(parsed.estimatedSearchVolume || "medium"),
      contentType: String(parsed.contentType || contentType),
      schemaMarkup: String(parsed.schemaMarkup || ""),
    };
  } catch {
    // Fall through to template
  }

  return generateTemplateContent(input);
}

// -- Template Fallback ------------------------------------------------------

function generateTemplateContent(input: ContentInput): ContentResult {
  const {
    topic,
    keywords,
    targetQueries,
    contentType = "faq",
    specialty,
    city,
  } = input;

  const specialtyText = specialty || "specialist";
  const cityText = city ? ` in ${city}` : "";

  const faqSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: topic,
        acceptedAnswer: {
          "@type": "Answer",
          text: `This is a common concern for ${specialtyText} practices${cityText}. The answer depends on your specific market position, review velocity, and referral patterns.`,
        },
      },
    ],
  });

  return {
    title: topic,
    body: `# ${topic}

${topic.endsWith("?") ? "The short answer:" : "Here is what you need to know:"} your market position matters more than most ${specialtyText} practices${cityText} realize. The average specialist loses 3-4 new cases per month to a competitor ranking above them. That is $${(1200 * 3.5).toFixed(0)} in monthly revenue, invisible until you measure it.

## Why This Matters

${keywords.map((k) => `- **${k}**: a key factor in your competitive position`).join("\n")}

## What You Can Do Today

Start by understanding where you stand. Your ranking, review count, and referral velocity are the three numbers that determine your growth trajectory.

Run your free Checkup to see where you stand.`,
    metaDescription: `${topic.replace(/\?$/, "")} for ${specialtyText} practices${cityText}. Free Checkup shows your competitive position.`,
    targetQueries,
    estimatedSearchVolume: "medium",
    contentType,
    schemaMarkup: faqSchema,
  };
}

// -- Event Writer -----------------------------------------------------------

/**
 * Log content generation to behavioral_events.
 */
export async function logContentGeneration(
  orgId: number | null,
  result: ContentResult,
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "content.draft_generated",
      org_id: orgId,
      properties: JSON.stringify({
        title: result.title,
        content_type: result.contentType,
        target_queries: result.targetQueries,
        estimated_search_volume: result.estimatedSearchVolume,
      }),
      created_at: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ContentAgent] Failed to log event:`, message);
  }
}
