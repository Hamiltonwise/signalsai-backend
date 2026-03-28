/**
 * Outreach Intelligence Engine -- WO-57
 *
 * Shared service for generating personalized outreach copy.
 * Used by: Partner Campaigns (WO-55), GP Discovery (WO-56),
 * Referral Thank-You (WO-47), Review Responses (WO-49).
 *
 * Four purposes: cold_outreach, gp_introduction, win_back, follow_up.
 * Each has a specific system prompt calibrated to the audience.
 */

export interface OutreachContext {
  sender_name: string;
  sender_role: string;
  sender_location: string;
  target_name: string;
  target_type: "prospect" | "gp" | "client" | "patient";
  intelligence: {
    rank?: number;
    total_in_market?: number;
    top_competitor?: string;
    review_gap?: number;
    score?: number;
    specific_finding?: string;
    days_silent?: number;
    last_interaction?: string;
    estimated_value?: number;
    irreplaceable_thing?: string;
  };
  purpose: "cold_outreach" | "gp_introduction" | "win_back" | "follow_up";
  tone: "professional" | "warm" | "direct";
  max_words: number;
}

export interface OutreachResult {
  subject: string;
  body: string;
  confidence_score: number;
  data_quality: "high" | "medium" | "low";
  missing_data: string[];
}

const SYSTEM_PROMPTS: Record<string, string> = {
  cold_outreach:
    "You write prospecting emails for a business intelligence sales representative. Audience: local service business owners (specialists, attorneys, CPAs, veterinarians). Goal: book a 20-minute call. Open with the specific finding about their business. One CTA: run a free Business Clarity Checkup or book a brief call. Never say 'I hope this email finds you well.' Write as a person, not software.",
  gp_introduction:
    "You write introduction letters from a specialist to a referring source they have never met. Warm, collegial, specific. Include a specific reason for reaching out (proximity, specialty gap, shared demographics). End with a low-friction offer. Never open with 'I am reaching out to introduce myself.'",
  win_back:
    "You write personalized win-back messages to a client or referral source who has gone quiet. Warm, personal, zero sales pressure. One question: how are they doing. One sentence: we noticed you haven't been back. One low-friction invite.",
  follow_up:
    "You write follow-up messages after a prior interaction. Reference the specific prior interaction. Move the conversation forward by one step.",
};

/**
 * Calculate confidence score based on available data.
 */
function calculateConfidence(ctx: OutreachContext): { score: number; quality: "high" | "medium" | "low"; missing: string[] } {
  let score = 100;
  const missing: string[] = [];

  if (!ctx.intelligence.rank) { score -= 15; missing.push("market rank"); }
  if (!ctx.intelligence.top_competitor) { score -= 10; missing.push("competitor name"); }
  if (!ctx.intelligence.specific_finding) { score -= 20; missing.push("specific finding"); }
  if (!ctx.intelligence.score) { score -= 10; missing.push("business score"); }
  if (!ctx.target_name || ctx.target_name === "Unknown") { score -= 15; missing.push("target name"); }
  if (!ctx.intelligence.review_gap && ctx.purpose === "cold_outreach") { score -= 10; missing.push("review gap"); }
  if (!ctx.intelligence.irreplaceable_thing && ctx.purpose === "gp_introduction") { score -= 10; missing.push("differentiator"); }

  score = Math.max(10, score);
  const quality = score >= 70 ? "high" : score >= 40 ? "medium" : "low";

  return { score, quality, missing };
}

/**
 * Build the user prompt from context.
 */
function buildPrompt(ctx: OutreachContext): string {
  const intel = ctx.intelligence;
  const lines = [
    `From: ${ctx.sender_name}, ${ctx.sender_role} in ${ctx.sender_location}`,
    `To: ${ctx.target_name} (${ctx.target_type})`,
    `Purpose: ${ctx.purpose}`,
    `Tone: ${ctx.tone}`,
    `Max words: ${ctx.max_words}`,
    "",
    "Available intelligence:",
  ];

  if (intel.rank) lines.push(`- Market rank: #${intel.rank} of ${intel.total_in_market || "?"}`);
  if (intel.top_competitor) lines.push(`- Top competitor: ${intel.top_competitor}`);
  if (intel.review_gap) lines.push(`- Review gap: ${intel.review_gap} reviews behind`);
  if (intel.score) lines.push(`- Business score: ${intel.score}/100`);
  if (intel.specific_finding) lines.push(`- Key finding: ${intel.specific_finding}`);
  if (intel.days_silent) lines.push(`- Days since last interaction: ${intel.days_silent}`);
  if (intel.estimated_value) lines.push(`- Estimated value: $${intel.estimated_value.toLocaleString()}/year`);
  if (intel.irreplaceable_thing) lines.push(`- Differentiator: ${intel.irreplaceable_thing}`);

  lines.push("");
  lines.push("Rules:");
  lines.push("- No em-dashes");
  lines.push("- No generic filler ('I hope this finds you well', 'Thank you for your time')");
  lines.push("- Open with the most specific piece of intelligence available");
  lines.push("- One clear CTA");
  lines.push(`- Under ${ctx.max_words} words`);
  lines.push("");
  lines.push("Return format: first line is the subject line, then a blank line, then the body.");

  return lines.join("\n");
}

/**
 * Generate outreach copy using Claude API.
 */
export async function generateOutreach(ctx: OutreachContext): Promise<OutreachResult> {
  const { score, quality, missing } = calculateConfidence(ctx);

  const systemPrompt = SYSTEM_PROMPTS[ctx.purpose] || SYSTEM_PROMPTS.cold_outreach;
  const userPrompt = buildPrompt(ctx);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback template when no API key
    return {
      subject: `Quick note about your ${ctx.sender_location} market`,
      body: `${ctx.target_name}, I noticed something about your competitive position in ${ctx.sender_location} that I think you should see. Would you have 20 minutes this week? -- ${ctx.sender_name}`,
      confidence_score: Math.min(score, 30),
      data_quality: "low",
      missing_data: [...missing, "AI generation (no API key)"],
    };
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const lines = text.split("\n");

    // First non-empty line is subject, rest is body
    const subject = lines.find((l) => l.trim().length > 0)?.trim() || "Following up";
    const bodyStart = lines.findIndex((l) => l.trim().length > 0);
    const body = lines.slice(bodyStart + 1).join("\n").trim() || text;

    return {
      subject,
      body,
      confidence_score: score,
      data_quality: quality,
      missing_data: missing,
    };
  } catch (error: any) {
    console.error("[OutreachEngine] Claude API error:", error.message);
    return {
      subject: `About your business in ${ctx.sender_location}`,
      body: `${ctx.target_name}, I have some specific intelligence about your market that I think would be valuable. Can we connect briefly? -- ${ctx.sender_name}`,
      confidence_score: Math.min(score, 20),
      data_quality: "low",
      missing_data: [...missing, `AI error: ${error.message}`],
    };
  }
}
