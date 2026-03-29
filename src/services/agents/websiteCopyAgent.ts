/**
 * Website Copy Agent -- On-demand Service
 *
 * Called when website copy is needed. Accepts business details
 * and generates copy sections using Claude API (claude-sonnet-4-6).
 * Falls back to template-based copy if API key is not available.
 *
 * Export: generateWebsiteCopy() function, not a cron job.
 */

import Anthropic from "@anthropic-ai/sdk";

// -- Types ------------------------------------------------------------------

interface CopySection {
  name: string;
  headline: string;
  body: string;
}

interface WebsiteCopyInput {
  businessName: string;
  specialty: string;
  city: string;
  targetAudience?: string;
  tone?: string;
}

interface WebsiteCopyResult {
  sections: CopySection[];
}

// -- Core -------------------------------------------------------------------

/**
 * Generate website copy sections for a business.
 *
 * @param input - business name, specialty, city, optional targetAudience and tone
 * @returns WebsiteCopyResult with an array of copy sections
 */
export async function generateWebsiteCopy(
  input: WebsiteCopyInput
): Promise<WebsiteCopyResult> {
  const { businessName, specialty, city, targetAudience, tone } = input;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn(
      "[WebsiteCopy] No ANTHROPIC_API_KEY set. Using template fallbacks."
    );
    return generateTemplateCopy(input);
  }

  try {
    const client = new Anthropic({ apiKey });

    const audienceDesc = targetAudience || `${specialty} patients in ${city}`;
    const toneDesc =
      tone || "Direct, warm, specific, peer-to-peer. Not vendor-to-customer.";

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: `Generate website copy for a specialist practice. Return ONLY valid JSON with no additional text.

Business: ${businessName}
Specialty: ${specialty}
City: ${city}
Target Audience: ${audienceDesc}
Tone: ${toneDesc}

Rules:
- Direct. Say what you mean in the first sentence.
- Warm. The reader trained for years and bought a business to have freedom.
- Specific. No generic claims. Name the specialty and city.
- No jargon: no "leverage," "optimize," "empower," "solution," "platform," "dashboard."
- No em-dashes. Use commas, periods, or semicolons only.
- Every claim should feel credible to a skeptical professional.
- One clear CTA per section.
- The first sentence of each section should make the reader feel seen.

Generate these sections:
1. "hero" - The above-the-fold section. Headline (max 10 words) + body (2-3 sentences).
2. "problem" - Name the reader's real problem. Not a generic pain point.
3. "solution" - How this business solves it. Specific, not feature-listy.
4. "proof" - Social proof framing (placeholder for real testimonials).
5. "cta" - Final call to action. One clear action.

Return as JSON array:
[{"name": "hero", "headline": "...", "body": "..."}, ...]`,
        },
      ],
    });

    const contentBlock = message.content[0];
    if (contentBlock.type === "text") {
      try {
        const sections = JSON.parse(contentBlock.text) as CopySection[];
        return { sections };
      } catch {
        console.error(
          "[WebsiteCopy] Failed to parse Claude response as JSON. Using templates."
        );
        return generateTemplateCopy(input);
      }
    }

    return generateTemplateCopy(input);
  } catch (err: any) {
    console.error("[WebsiteCopy] Claude API call failed:", err.message);
    return generateTemplateCopy(input);
  }
}

// -- Template Fallback ------------------------------------------------------

function generateTemplateCopy(input: WebsiteCopyInput): WebsiteCopyResult {
  const { businessName, specialty, city } = input;

  return {
    sections: [
      {
        name: "hero",
        headline: `${specialty} care built around you`,
        body: `${businessName} in ${city}. You trained for years in a craft you love. Your patients deserve a practice that reflects that commitment, and so do you.`,
      },
      {
        name: "problem",
        headline: "You did not train for this part",
        body: `You spent years mastering ${specialty.toLowerCase()}. Nobody taught you how to see your own market, track referral patterns, or know which competitors are gaining ground while you focus on patient care.`,
      },
      {
        name: "solution",
        headline: "Clarity, not more software",
        body: `${businessName} deserves to know what is happening in ${city} before it becomes a problem. We surface the patterns that matter: who is referring, who stopped, and what your market looks like this week.`,
      },
      {
        name: "proof",
        headline: "Real results from real practices",
        body: `Practices using these insights have identified missed referral patterns and competitive shifts before they became costly. The data speaks for itself.`,
      },
      {
        name: "cta",
        headline: "See what you have been missing",
        body: `Get a free checkup of your practice's market position in ${city}. No commitment, no sales pitch. Just clarity.`,
      },
    ],
  };
}
