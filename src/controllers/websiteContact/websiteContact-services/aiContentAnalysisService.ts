/**
 * AI Content Analysis Service
 *
 * Uses Anthropic Haiku to classify form submissions.
 * Fail-open: if the AI call fails, submissions are not flagged.
 */

import Anthropic from "@anthropic-ai/sdk";

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

const MODEL = "claude-haiku-4-5-20251001";

export interface AnalysisResult {
  flagged: boolean;
  category: string;
  reason: string;
}

const SYSTEM_PROMPT = `You are a form submission classifier for business websites. Analyze the submission and classify it into exactly one category.

Categories:
- legitimate: A real inquiry from a potential customer, client, or interested person.
- spam: Automated/bulk/bot-generated content, gibberish, or mass marketing.
- sales: Vendor pitch, partnership offer, affiliate proposal, SEO/marketing service offer.
- low_quality: Test submission, placeholder text ("asdf", "test"), mostly blank, or gibberish.
- malicious: SQL injection, XSS attempts, phishing links, or other attack patterns.
- irrelevant: Wrong company, wrong form, job application on a contact form, completely off-topic.
- abusive: Harassment, threats, profanity-laden rants, hate speech.

Respond with ONLY a JSON object:
{"flagged": boolean, "category": "category_name", "reason": "one sentence explanation"}

Set flagged=false ONLY for "legitimate". All other categories set flagged=true.
Do not include any text outside the JSON object.`;

export async function analyzeContent(
  formName: string,
  contents: Record<string, string>,
): Promise<AnalysisResult> {
  try {
    const client = getClient();

    const userMessage = JSON.stringify({ formName, fields: contents });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    const parsed = JSON.parse(text);

    if (
      typeof parsed.flagged !== "boolean" ||
      typeof parsed.category !== "string" ||
      typeof parsed.reason !== "string"
    ) {
      throw new Error("Invalid AI response shape");
    }

    return {
      flagged: parsed.flagged,
      category: parsed.category,
      reason: parsed.reason,
    };
  } catch (err) {
    // Fail-open: don't block legitimate submissions if AI fails
    console.error("[AI Content Analysis] Error:", err);
    return { flagged: false, category: "unknown", reason: "AI analysis unavailable" };
  }
}
