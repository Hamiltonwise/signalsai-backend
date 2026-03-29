/**
 * CMO Agent -- Execution Service
 *
 * Runs weekly Monday 6am PT.
 * Three modes: Content Strategy, Copy Production, Web Copy.
 * Queries behavioral_events for content performance data and
 * checkup conversion sources. Uses Claude API to generate
 * 3 content topic recommendations with titles, angles, and
 * target keywords. Falls back to template topics if no API key.
 *
 * Writes "cmo.content_brief" event to behavioral_events.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../../database/connection";

// -- Types ------------------------------------------------------------------

interface ContentBrief {
  topic: string;
  title: string;
  angle: string;
  targetKeywords: string[];
  platform: string;
  format: string;
  publishDay: string;
  cta: string;
  woundAddressed: string;
  economicContext: string;
}

interface CMOResult {
  briefs: ContentBrief[];
  mode: "ai" | "template";
  generatedAt: string;
}

// -- Template Fallbacks -----------------------------------------------------

const TEMPLATE_BRIEFS: ContentBrief[] = [
  {
    topic: "Referral network visibility",
    title: "Your referral sources are shifting. Here is what the data says.",
    angle: "Use real Checkup data patterns to show how referral networks change without the specialist knowing",
    targetKeywords: ["specialist referrals", "referral tracking", "practice growth"],
    platform: "LinkedIn",
    format: "Native video (90 seconds)",
    publishDay: "Tuesday",
    cta: "Run a free Checkup to see your referral landscape",
    woundAddressed: "Safety: fear of invisible loss as referral sources shift to competitors",
    economicContext: "Average specialist loses 3-4 referrals per month to competitors ranking above them. At $1,200 per patient, that is $4,800 walking out the door monthly.",
  },
  {
    topic: "Online presence gap",
    title: "Your patients Google you before they call. Here is what they find.",
    angle: "The 55-second trust window: what happens when a potential patient lands on your profile",
    targetKeywords: ["online reputation", "Google Business Profile", "patient trust"],
    platform: "YouTube",
    format: "Long-form (5-8 minutes)",
    publishDay: "Wednesday",
    cta: "See your online presence score with a free Checkup",
    woundAddressed: "Status: the gap between clinical excellence and online visibility",
    economicContext: "77% of patients check online reviews before booking. A profile with fewer reviews than competitors costs 2-3 new patients per week.",
  },
  {
    topic: "Practice owner freedom",
    title: "You did not buy a practice to spend evenings Googling yourself.",
    angle: "The second-job reality: trained for years in a craft, ended up running a marketing department",
    targetKeywords: ["practice management", "business owner freedom", "specialist practice"],
    platform: "LinkedIn",
    format: "Text post with image",
    publishDay: "Thursday",
    cta: "Get clarity on your business in 2 minutes",
    woundAddressed: "Purpose: the gap between why they bought the practice and what they actually do all day",
    economicContext: "Practice owners spend an average of 8 hours per week on marketing tasks they were never trained for. At their clinical hourly rate, that is $2,400/week in opportunity cost.",
  },
];

// -- Core -------------------------------------------------------------------

/**
 * Run the CMO Agent in Content Strategy mode.
 * Queries recent behavioral data, generates 3 content briefs.
 */
export async function runCMOAgent(): Promise<CMOResult> {
  // Gather behavioral intelligence
  const recentEvents = await getRecentContentEvents();
  const conversionSources = await getConversionSources();
  const trendTopics = await getTrendScoutTopics();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[CMOAgent] No ANTHROPIC_API_KEY set. Using template fallbacks.");
    const result: CMOResult = {
      briefs: TEMPLATE_BRIEFS,
      mode: "template",
      generatedAt: new Date().toISOString(),
    };
    await writeBriefEvents(result.briefs);
    await writeSummaryEvent(result);
    return result;
  }

  try {
    const client = new Anthropic({ apiKey });

    const contextBlock = buildContextBlock(recentEvents, conversionSources, trendTopics);

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `You are the CMO Agent for Alloro, a business clarity platform for licensed specialists.

Generate exactly 3 content briefs for this week. Return ONLY valid JSON, no additional text.

${contextBlock}

Rules:
- Every piece must show a specific before/after, not generic advice
- The Checkup IS the content. Share outputs, not descriptions
- Optimize for shareability, not publishing frequency
- No em-dashes. Use commas, periods, or semicolons
- No jargon: no "leverage," "optimize," "empower," "solution," "platform," "dashboard"
- Lead with the wound (pain), then the medicine (insight)
- Include a specific dollar figure or time figure in the economic context
- Declarative openings, not questions

Return JSON in this exact format:
{
  "briefs": [
    {
      "topic": "string",
      "title": "string",
      "angle": "string",
      "targetKeywords": ["string"],
      "platform": "LinkedIn | YouTube | Blog | Email",
      "format": "string",
      "publishDay": "string",
      "cta": "string",
      "woundAddressed": "string",
      "economicContext": "string"
    }
  ]
}`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const parsed = JSON.parse(text);
    const briefs: ContentBrief[] = parsed.briefs || [];

    const result: CMOResult = {
      briefs,
      mode: "ai",
      generatedAt: new Date().toISOString(),
    };

    await writeBriefEvents(result.briefs);
    await writeSummaryEvent(result);

    // Generate a full draft for the highest-priority brief
    if (briefs.length > 0) {
      await generateDraftForTopBrief(client, briefs[0]);
    }

    console.log(
      `[CMOAgent] Generated ${briefs.length} content briefs (AI mode)`
    );
    return result;
  } catch (err: any) {
    console.error("[CMOAgent] Claude API failed, falling back to templates:", err.message);
    const result: CMOResult = {
      briefs: TEMPLATE_BRIEFS,
      mode: "template",
      generatedAt: new Date().toISOString(),
    };
    await writeBriefEvents(result.briefs);
    await writeSummaryEvent(result);
    return result;
  }
}

// -- Data Queries -----------------------------------------------------------

async function getRecentContentEvents(): Promise<any[]> {
  try {
    return await db("behavioral_events")
      .whereIn("event_type", [
        "cmo.content_brief",
        "cmo.content_produced",
        "content.performance_report",
        "content.script_produced",
      ])
      .where("created_at", ">=", db.raw("NOW() - INTERVAL '7 days'"))
      .orderBy("created_at", "desc")
      .limit(20);
  } catch {
    return [];
  }
}

async function getConversionSources(): Promise<any[]> {
  try {
    return await db("behavioral_events")
      .where("event_type", "checkup.submitted")
      .where("created_at", ">=", db.raw("NOW() - INTERVAL '30 days'"))
      .orderBy("created_at", "desc")
      .limit(50);
  } catch {
    return [];
  }
}

async function getTrendScoutTopics(): Promise<any[]> {
  try {
    return await db("behavioral_events")
      .where("event_type", "content.trend_detected")
      .where("created_at", ">=", db.raw("NOW() - INTERVAL '7 days'"))
      .orderBy("created_at", "desc")
      .limit(10);
  } catch {
    return [];
  }
}

function buildContextBlock(
  recentEvents: any[],
  conversionSources: any[],
  trendTopics: any[]
): string {
  const parts: string[] = [];

  if (recentEvents.length > 0) {
    parts.push(
      `Recent content events (last 7 days): ${recentEvents.length} events found. ` +
        `Types: ${[...new Set(recentEvents.map((e) => e.event_type))].join(", ")}`
    );
  } else {
    parts.push("No recent content events found. This is the first content calendar.");
  }

  if (conversionSources.length > 0) {
    parts.push(
      `Checkup submissions (last 30 days): ${conversionSources.length} submissions tracked.`
    );
  }

  if (trendTopics.length > 0) {
    const topics = trendTopics
      .map((t) => {
        const props = typeof t.properties === "string" ? JSON.parse(t.properties) : t.properties;
        return props?.topic || "unknown";
      })
      .join(", ");
    parts.push(`Trend Scout topics this week: ${topics}`);
  }

  return parts.join("\n");
}

// -- Writers ----------------------------------------------------------------

async function writeBriefEvents(briefs: ContentBrief[]): Promise<void> {
  for (const brief of briefs) {
    try {
      await db("behavioral_events").insert({
        event_type: "cmo.content_brief",
        properties: JSON.stringify({
          topic: brief.topic,
          title: brief.title,
          angle: brief.angle,
          target_keywords: brief.targetKeywords,
          platform: brief.platform,
          format: brief.format,
          publish_day: brief.publishDay,
          cta: brief.cta,
          wound_addressed: brief.woundAddressed,
          economic_context: brief.economicContext,
        }),
      });
    } catch (err: any) {
      console.error("[CMOAgent] Failed to write brief event:", err.message);
    }
  }
}

async function writeSummaryEvent(result: CMOResult): Promise<void> {
  try {
    await db("behavioral_events").insert({
      event_type: "cmo.weekly_calendar",
      properties: JSON.stringify({
        brief_count: result.briefs.length,
        mode: result.mode,
        generated_at: result.generatedAt,
        topics: result.briefs.map((b) => b.topic),
        platforms: result.briefs.map((b) => b.platform),
      }),
    });
  } catch (err: any) {
    console.error("[CMOAgent] Failed to write summary event:", err.message);
  }
}

// -- Draft Generation ---------------------------------------------------------

/**
 * Generate a full article draft for the highest-priority content brief.
 * Stores as status='draft' in published_content so admin can review before publishing.
 */
async function generateDraftForTopBrief(
  client: Anthropic,
  brief: ContentBrief,
): Promise<void> {
  try {
    const slug = brief.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 200);

    // Check if slug already exists
    const existing = await db("published_content").where("slug", slug).first();
    if (existing) {
      console.log(`[CMOAgent] Draft slug "${slug}" already exists, skipping.`);
      return;
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 6000,
      messages: [
        {
          role: "user",
          content: `You are the Content Agent for Alloro, a business clarity platform for licensed specialists.

Write a full blog article based on this content brief. Return ONLY valid JSON.

Brief:
- Topic: ${brief.topic}
- Title: ${brief.title}
- Angle: ${brief.angle}
- Target keywords: ${brief.targetKeywords.join(", ")}
- Wound addressed: ${brief.woundAddressed}
- Economic context: ${brief.economicContext}
- CTA: ${brief.cta}

Rules:
- Write in markdown format (use ## for headings, **bold**, *italic*)
- 800-1200 words
- No em-dashes. Use commas, periods, or semicolons
- No jargon: no "leverage," "optimize," "empower," "solution," "platform," "dashboard"
- Lead with the wound (pain), then the medicine (insight)
- Include specific numbers and data points
- End with a clear call to action
- Write 2-4 FAQ items related to the topic

Return JSON in this exact format:
{
  "body": "markdown article text",
  "metaDescription": "150 char SEO description",
  "faqItems": [
    { "question": "string", "answer": "string" }
  ]
}`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const parsed = JSON.parse(text);

    await db("published_content").insert({
      slug,
      title: brief.title,
      body: parsed.body || "",
      meta_description: parsed.metaDescription || "",
      faq_items: JSON.stringify(parsed.faqItems || []),
      category: brief.topic,
      author_name: "Alloro Intelligence",
      status: "draft",
    });

    // Log behavioral event
    await db("behavioral_events").insert({
      event_type: "content.draft_created",
      properties: JSON.stringify({
        slug,
        title: brief.title,
        topic: brief.topic,
        platform: brief.platform,
        word_count: (parsed.body || "").split(/\s+/).length,
      }),
    });

    console.log(`[CMOAgent] Draft created for: ${brief.title} (slug: ${slug})`);
  } catch (err: any) {
    console.error("[CMOAgent] Draft generation failed:", err.message);
  }
}
