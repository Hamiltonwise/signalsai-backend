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
  purpose: "cold_outreach" | "gp_introduction" | "win_back" | "follow_up";
  recipientName: string;
  recipientRole?: string;
  businessName: string;
  senderName: string;
  senderSpecialty?: string;
  dataPoints?: string[];
  city?: string;
  existingRelationship?: boolean;
}

export interface OutreachResult {
  success: boolean;
  subject: string;
  body: string;
  confidence: number;
  dataQuality: number;
  warnings?: string[];
}

/**
 * Calculate data quality score (0-100) based on optional field population.
 * Each optional field adds to the score. All required fields are assumed present.
 */
function calculateDataQuality(ctx: OutreachContext): { score: number; warnings: string[] } {
  const warnings: string[] = [];

  // Required fields (purpose, recipientName, businessName, senderName) give a baseline of 40
  let score = 40;

  // Each optional field adds points
  if (ctx.recipientRole) {
    score += 10;
  } else {
    warnings.push("Missing recipientRole, message will be less targeted");
  }

  if (ctx.senderSpecialty) {
    score += 10;
  } else {
    warnings.push("Missing senderSpecialty, cannot highlight expertise");
  }

  if (ctx.dataPoints && ctx.dataPoints.length > 0) {
    // Up to 20 points for data points (5 per point, max 4 counted)
    const pointScore = Math.min(ctx.dataPoints.length, 4) * 5;
    score += pointScore;
  } else {
    warnings.push("No dataPoints provided, output will be generic");
  }

  if (ctx.city) {
    score += 10;
  } else {
    warnings.push("Missing city, cannot localize message");
  }

  if (ctx.existingRelationship !== undefined) {
    score += 10;
  }

  return { score: Math.min(score, 100), warnings };
}

/**
 * System prompts tuned per outreach purpose.
 */
const SYSTEM_PROMPTS: Record<string, string> = {
  cold_outreach: [
    "You write prospecting emails for a business intelligence platform.",
    "Audience: local service business owners (specialists, attorneys, CPAs, veterinarians).",
    "Goal: book a 20-minute call.",
    "Open with the most specific data point available about their business.",
    "One CTA: run a free Business Clarity Checkup or book a brief call.",
    "Never say 'I hope this email finds you well.'",
    "Write as a person, not software.",
    "Under 100 words for the body.",
    "No em-dashes. Use commas or periods instead.",
    "HIPAA compliant: no patient names, use initials only if referencing individuals.",
    "Sign with the sender's name.",
    "Return format: first line is SUBJECT: followed by the subject line.",
    "Then a blank line, then the body text.",
  ].join(" "),
  gp_introduction: [
    "You write introduction letters from a specialist to a referring source they have never met.",
    "Warm, collegial, specific.",
    "Include a specific reason for reaching out (proximity, specialty gap, shared demographics).",
    "End with a low-friction offer (lunch, brief call, office visit).",
    "Never open with 'I am reaching out to introduce myself.'",
    "Under 100 words for the body.",
    "No em-dashes. Use commas or periods instead.",
    "HIPAA compliant: no patient names, use initials only if referencing individuals.",
    "Sign with the sender's name.",
    "Return format: first line is SUBJECT: followed by the subject line.",
    "Then a blank line, then the body text.",
  ].join(" "),
  win_back: [
    "You write personalized win-back messages to a client or referral source who has gone quiet.",
    "Warm, personal, zero sales pressure.",
    "One question: how are they doing.",
    "One sentence: we noticed you haven't been back.",
    "One low-friction invite.",
    "Under 100 words for the body.",
    "No em-dashes. Use commas or periods instead.",
    "HIPAA compliant: no patient names, use initials only if referencing individuals.",
    "Sign with the sender's name.",
    "Return format: first line is SUBJECT: followed by the subject line.",
    "Then a blank line, then the body text.",
  ].join(" "),
  follow_up: [
    "You write follow-up messages after a prior interaction.",
    "Reference the specific prior interaction if data points mention one.",
    "Move the conversation forward by one step.",
    "Warm and professional.",
    "Under 100 words for the body.",
    "No em-dashes. Use commas or periods instead.",
    "HIPAA compliant: no patient names, use initials only if referencing individuals.",
    "Sign with the sender's name.",
    "Return format: first line is SUBJECT: followed by the subject line.",
    "Then a blank line, then the body text.",
  ].join(" "),
};

/**
 * Template fallbacks when ANTHROPIC_API_KEY is not available.
 */
const TEMPLATE_FALLBACKS: Record<string, { subject: string; body: (ctx: OutreachContext) => string }> = {
  cold_outreach: {
    subject: "Something stood out about your practice",
    body: (ctx) =>
      `${ctx.recipientName},\n\nI came across ${ctx.businessName}${ctx.city ? ` in ${ctx.city}` : ""} and noticed something interesting about your competitive position that I think you should see.\n\nWould you have 20 minutes this week for a quick call?\n\n${ctx.senderName}`,
  },
  gp_introduction: {
    subject: "Introduction from a nearby colleague",
    body: (ctx) =>
      `${ctx.recipientName},\n\nI'm ${ctx.senderName}${ctx.senderSpecialty ? `, a ${ctx.senderSpecialty},` : ""} practicing${ctx.city ? ` in ${ctx.city}` : " nearby"}. I wanted to introduce myself and see if there's an opportunity for us to collaborate on patient care.\n\nWould you be open to a brief call or coffee?\n\n${ctx.senderName}`,
  },
  win_back: {
    subject: "Checking in",
    body: (ctx) =>
      `${ctx.recipientName},\n\nIt's been a while since we connected, and I wanted to check in. How are things going at ${ctx.businessName}?\n\nNo agenda here. Just wanted to say hello and see if there's anything we can help with.\n\n${ctx.senderName}`,
  },
  follow_up: {
    subject: "Following up on our conversation",
    body: (ctx) =>
      `${ctx.recipientName},\n\nI wanted to follow up on our recent conversation. I have some additional thoughts I think would be valuable for ${ctx.businessName}.\n\nDo you have a few minutes this week?\n\n${ctx.senderName}`,
  },
};

/**
 * Build the user prompt from context for the Claude API call.
 */
function buildUserPrompt(ctx: OutreachContext): string {
  const lines = [
    `Sender: ${ctx.senderName}${ctx.senderSpecialty ? `, ${ctx.senderSpecialty}` : ""}`,
    `Recipient: ${ctx.recipientName}${ctx.recipientRole ? ` (${ctx.recipientRole})` : ""}`,
    `Business: ${ctx.businessName}`,
    `Purpose: ${ctx.purpose}`,
  ];

  if (ctx.city) lines.push(`City: ${ctx.city}`);
  if (ctx.existingRelationship !== undefined) {
    lines.push(`Existing relationship: ${ctx.existingRelationship ? "yes" : "no"}`);
  }

  if (ctx.dataPoints && ctx.dataPoints.length > 0) {
    lines.push("");
    lines.push("Data points:");
    for (const point of ctx.dataPoints) {
      lines.push(`- ${point}`);
    }
  }

  lines.push("");
  lines.push("Write the outreach message now.");

  return lines.join("\n");
}

/**
 * Parse Claude's response into subject and body.
 */
function parseResponse(text: string): { subject: string; body: string } {
  const lines = text.split("\n");

  // Look for SUBJECT: prefix
  const subjectLine = lines.find((l) => l.trim().toUpperCase().startsWith("SUBJECT:"));
  if (subjectLine) {
    const subject = subjectLine.replace(/^subject:\s*/i, "").trim();
    const subjectIndex = lines.indexOf(subjectLine);
    const body = lines
      .slice(subjectIndex + 1)
      .join("\n")
      .trim();
    return { subject, body };
  }

  // Fallback: first non-empty line is subject, rest is body
  const firstNonEmpty = lines.findIndex((l) => l.trim().length > 0);
  if (firstNonEmpty === -1) {
    return { subject: "Following up", body: text };
  }

  const subject = lines[firstNonEmpty].trim();
  const body = lines
    .slice(firstNonEmpty + 1)
    .join("\n")
    .trim();

  return { subject, body: body || text };
}

/**
 * Generate personalized outreach copy.
 *
 * Calculates data quality from optional field population.
 * If quality < 40, returns early with insufficient-data warning.
 * Uses Claude API (claude-sonnet-4-6) when ANTHROPIC_API_KEY is set.
 * Falls back to purpose-specific templates when the key is missing.
 */
export async function generateOutreach(ctx: OutreachContext): Promise<OutreachResult> {
  const { score: dataQuality, warnings } = calculateDataQuality(ctx);

  // Bail early if we don't have enough data for a personalized message
  if (dataQuality < 40) {
    return {
      success: false,
      subject: "",
      body: "",
      confidence: 0,
      dataQuality,
      warnings: [...warnings, "Insufficient data for personalized outreach"],
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // No API key: return template fallback
  if (!apiKey) {
    const template = TEMPLATE_FALLBACKS[ctx.purpose] || TEMPLATE_FALLBACKS.cold_outreach;
    return {
      success: true,
      subject: template.subject,
      body: template.body(ctx),
      confidence: Math.round(dataQuality * 0.5),
      dataQuality,
      warnings: [...warnings, "Generated from template (no ANTHROPIC_API_KEY)"],
    };
  }

  // Call Claude API
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });

    const systemPrompt = SYSTEM_PROMPTS[ctx.purpose] || SYSTEM_PROMPTS.cold_outreach;
    const userPrompt = buildUserPrompt(ctx);

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const { subject, body } = parseResponse(text);

    // Confidence scales with data quality: high quality data + AI generation = high confidence
    const confidence = Math.round(dataQuality * 0.9);

    return {
      success: true,
      subject,
      body,
      confidence,
      dataQuality,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[OutreachEngine] Claude API error:", message);

    // Fall back to template on API failure
    const template = TEMPLATE_FALLBACKS[ctx.purpose] || TEMPLATE_FALLBACKS.cold_outreach;
    return {
      success: true,
      subject: template.subject,
      body: template.body(ctx),
      confidence: Math.round(dataQuality * 0.4),
      dataQuality,
      warnings: [...warnings, `AI generation failed: ${message}, using template fallback`],
    };
  }
}
