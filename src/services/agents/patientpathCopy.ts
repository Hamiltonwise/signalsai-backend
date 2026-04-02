/**
 * PatientPath Copy Agent -- Execution Service
 *
 * On-demand function triggered after the PatientPath Research Agent
 * completes its brief. Generates all 10 PatientPath website sections
 * using the research data.
 *
 * Differentiator from websiteCopyAgent.ts: that agent generates
 * generic 5-section website copy from business name/specialty/city.
 * This agent generates 10 research-backed, AEO-optimized sections
 * using real review language, fear patterns, and the irreplaceable_thing.
 *
 * Export: generatePatientPathCopy() -- on-demand, not a cron job.
 */

import { db } from "../../database/connection";

// -- Types ------------------------------------------------------------------

interface PatientPathSection {
  name: string;
  headline: string;
  body: string;
  imagePrompt: string;
}

interface ResearchBriefInput {
  orgId: number;
  practiceName: string;
  specialty: string;
  city: string;
  irreplaceableThing: string;
  heroHeadline: string;
  problemStatement: string;
  socialProofQuotes: string[];
  faqTopics: string[];
  toneGuidance: string;
  fearCategories: string[];
  praisePatterns: string[];
  practicePersonality: string;
  totalReviews: number;
  averageRating: number | null;
}

interface PatientPathCopyResult {
  sections: PatientPathSection[];
  schemaMarkup: {
    faqPage: string;
    localBusiness: string;
  };
}

// -- Core -------------------------------------------------------------------

/**
 * Generate all 10 PatientPath website sections from a research brief.
 */
export async function generatePatientPathCopy(
  input: ResearchBriefInput,
): Promise<PatientPathCopyResult> {
  // Attempt Claude generation
  if (process.env.ANTHROPIC_API_KEY && input.irreplaceableThing) {
    try {
      return await generateWithClaude(input);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[PatientPathCopy] Claude generation failed, using template:`,
        message,
      );
    }
  }

  // Fallback to template
  return generateTemplateCopy(input);
}

// -- Claude Generation ------------------------------------------------------

async function generateWithClaude(
  input: ResearchBriefInput,
): Promise<PatientPathCopyResult> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  const prompt = `You are the PatientPath Copy Agent for Alloro. Write all 10 sections of a PatientPath website from the research brief below. Every line of copy must sound like it was written by someone who spent a week inside this specific practice.

The standard: Dr. Kargoli said "It looks like just the AI copied something and put it there." That is the failure mode. Every sentence must pass the test: "Remove the practice name. Can this sentence still identify THIS practice?" If no, rewrite it.

PRACTICE: ${input.practiceName}
SPECIALTY: ${input.specialty}
CITY: ${input.city}
TOTAL REVIEWS: ${input.totalReviews}
AVERAGE RATING: ${input.averageRating || "N/A"}
TONE: ${input.toneGuidance}
PRACTICE PERSONALITY: ${input.practicePersonality}

THE IRREPLACEABLE THING (this is the single most important input):
${input.irreplaceableThing}

HERO HEADLINE (from research):
${input.heroHeadline}

PROBLEM STATEMENT (from patient fears):
${input.problemStatement}

FEAR CATEGORIES (what patients feared BEFORE coming here):
${input.fearCategories.join(", ") || "Unknown"}

PRAISE PATTERNS (what patients say AFTER coming here):
${input.praisePatterns.map((p) => `- ${p}`).join("\n") || "No patterns available"}

SOCIAL PROOF QUOTES (real review language, use verbatim):
${input.socialProofQuotes.map((q, i) => `${i + 1}. "${q}"`).join("\n") || "No quotes available"}

FAQ TOPICS (from real patient searches, NOT generic specialty questions):
${input.faqTopics.map((t) => `- ${t}`).join("\n")}

Generate all 10 sections as a JSON array. Each section has: name, headline, body (markdown), imagePrompt (description for a real photo, never stock).

SECTIONS:
1. "hero" - The irreplaceable_thing IS the headline. Not a summary of it. The actual thing that makes this practice unique, stated in patient language. If patients say "I didn't feel a thing," the headline is close to those words. Subheadline: "${input.specialty} in ${input.city}". CTA: one action, specific to this specialty.

2. "problem" - Uses EXACT words from the fear categories above. "I was terrified" is real. "Many patients experience anxiety" is generic. Quote the actual review language. Name the specific emotion. The person reading this should think "that's exactly how I feel."

3. "doctor" - First sentence is empathy: acknowledge what the patient is feeling. Second sentence is the irreplaceable thing applied to the doctor. Credentials come THIRD. Include specific numbers if available (years, procedures performed, patients treated).

4. "services" - NOT "When you are in pain / When you need answers / When you have been referred." Those are generic. Instead, organize by what THIS practice's patients actually come in for, based on the praise patterns and fear categories. Each service: the fear before, what happens, the relief after. Use the vocabulary of THIS practice's reviews.

5. "social_proof" - Real review quotes ONLY. Minimum 3 from the social proof quotes above. Let the patients speak in their own words. Curate by fear category: include at least one quote from a patient who was nervous, and one who was referred.

6. "technology" - What THIS practice has that is mentioned in reviews or differentiates from competitors. Framed as patient benefit: "You see exactly what we see on the screen" not "state-of-the-art CBCT imaging." If nothing specific is known, focus on the experience: "Modern, comfortable, designed for you."

7. "faq" - 5 questions generated from the fear categories and FAQ topics above. NOT generic specialty questions. Questions specific to ${input.city} and THIS practice. Answers in first person from the doctor. Each answer under 100 words, self-contained for AI citation.

8. "location" - Include the city name, nearby landmarks or neighborhoods if known, parking and accessibility notes. "Located on [Street] in [Neighborhood], [City]" is specific. "Conveniently located" is generic.

9. "insurance" - "We work with most PPO plans. No surprises. We discuss your investment before any procedure begins." If the practice has specific insurance info from GBP, include it. Never vague.

10. "cta" - One action. "Request your appointment" or "Call us today at [phone]". No competing buttons. No newsletter signup. No social icons. The only thing on this section is the path to becoming a patient.

ABSOLUTE RULES:
- No em-dashes. Use commas, periods, or semicolons.
- Every image prompt describes a REAL photo of THIS practice (from GBP), never stock.
- If the copy could apply to any ${input.specialty} in any city, it FAILS. Rewrite with specifics.
- No: "In today's competitive landscape," "leverage," "optimize," "empower," "solution," "platform," "Welcome to," "We are proud to," "Our team is dedicated to."
- Every section serves one of three patient needs: safety, belonging, or purpose.
- Typography: headlines are 5-8 words maximum. Body text uses short sentences. No walls of text.

Return ONLY the JSON array, no markdown fences.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const sections = JSON.parse(text) as PatientPathSection[];

    if (Array.isArray(sections) && sections.length >= 8) {
      const result: PatientPathCopyResult = {
        sections: sections.map((s) => ({
          name: String(s.name || ""),
          headline: String(s.headline || ""),
          body: String(s.body || ""),
          imagePrompt: String(s.imagePrompt || ""),
        })),
        schemaMarkup: buildSchemaMarkup(input, sections),
      };

      // Log the generation
      await logCopyGeneration(input.orgId, result);

      return result;
    }
  } catch {
    // Fall through to template
  }

  return generateTemplateCopy(input);
}

// -- Template Fallback ------------------------------------------------------

function generateTemplateCopy(
  input: ResearchBriefInput,
): PatientPathCopyResult {
  const {
    practiceName,
    specialty,
    city,
    irreplaceableThing,
    heroHeadline,
    problemStatement,
    socialProofQuotes,
    faqTopics,
    praisePatterns,
    totalReviews,
    averageRating,
  } = input;

  const sections: PatientPathSection[] = [
    {
      name: "hero",
      headline: heroHeadline || `${specialty} care built for you`,
      body:
        `${irreplaceableThing || `${practiceName} in ${city}.`}\n\n` +
        `[See what patients say](#social-proof)`,
      imagePrompt: `Front exterior of ${practiceName} in ${city}, welcoming entrance, natural lighting`,
    },
    {
      name: "problem",
      headline: "We understand what brought you here",
      body:
        problemStatement ||
        `Finding the right ${specialty.toLowerCase()} feels overwhelming. ` +
        `You have questions, and the answers you find online are vague. ` +
        `You deserve clarity before you walk through any door.`,
      imagePrompt: `Warm, well-lit waiting room at ${practiceName}, comfortable seating`,
    },
    {
      name: "doctor",
      headline: irreplaceableThing ? irreplaceableThing.split(".")[0] : `Your ${specialty.toLowerCase()}`,
      body:
        `${irreplaceableThing || `At ${practiceName}, every visit starts with listening.`}\n\n` +
        `The credentials support the experience: every procedure is performed with the precision ` +
        `that comes from years of focused practice in ${specialty.toLowerCase()}.`,
      imagePrompt: `Professional headshot of doctor at ${practiceName}, approachable expression, clinical setting`,
    },
    {
      name: "services",
      headline: "What we can help with",
      body:
        `Every patient arrives with a different concern. Here is how we approach the most common ones:\n\n` +
        `**When you are in pain:** Same-day evaluation, clear explanation of what we find, and a treatment plan that makes sense.\n\n` +
        `**When you need answers:** Comprehensive examination with imaging, honest assessment of your options.\n\n` +
        `**When you have been referred:** We coordinate with your referring provider so nothing falls through the cracks.`,
      imagePrompt: `Treatment room at ${practiceName}, modern equipment, patient-ready`,
    },
    {
      name: "social_proof",
      headline: "What patients say",
      body:
        socialProofQuotes.length > 0
          ? socialProofQuotes
              .map((q) => `> "${q}"`)
              .join("\n\n")
          : praisePatterns.length > 0
            ? praisePatterns
                .slice(0, 3)
                .map((p) => `> "${p}"`)
                .join("\n\n")
            : `> "${totalReviews > 0 ? `${totalReviews} patients have shared their experience` : "Patient reviews coming soon"}."` +
              (averageRating ? ` Average rating: ${averageRating}/5.` : ""),
      imagePrompt: `Smiling patient after appointment at ${practiceName}, natural candid moment`,
    },
    {
      name: "technology",
      headline: "You will see what we see",
      body:
        `We use advanced imaging so you can see exactly what we see. No guesswork. ` +
        `When you understand your situation, you make better decisions about your care.\n\n` +
        `Every tool in this practice exists for one reason: better outcomes for you.`,
      imagePrompt: `Modern imaging equipment at ${practiceName}, clean clinical environment`,
    },
    {
      name: "faq",
      headline: "Common questions",
      body: faqTopics
        .slice(0, 5)
        .map(
          (topic) =>
            `### ${topic}\n\nWe hear this question often. The answer depends on your specific situation, ` +
            `which is why we start every first visit with a thorough evaluation. Call us to discuss your case.`,
        )
        .join("\n\n"),
      imagePrompt: `Reception area at ${practiceName}, friendly staff member`,
    },
    {
      name: "location",
      headline: `Find us in ${city}`,
      body:
        `${practiceName}\n${city}\n\n` +
        `We are easy to find with convenient parking. Our office is accessible for all patients.`,
      imagePrompt: `Street view of ${practiceName} location in ${city}, clear signage visible`,
    },
    {
      name: "insurance",
      headline: "Insurance and payment",
      body:
        `We work with most PPO insurance plans. If you have questions about your specific coverage, ` +
        `call our office before your visit and we will verify your benefits.\n\n` +
        `For patients without insurance, we offer transparent pricing and payment options. No surprises.`,
      imagePrompt: `Front desk area at ${practiceName}, organized and welcoming`,
    },
    {
      name: "cta",
      headline: "Ready to schedule?",
      body:
        `Your next step is simple. Call us or request an appointment online.\n\n` +
        `[Request Appointment](#book) | [Call Now](#call)\n\n` +
        `We respond to appointment requests within one business day.`,
      imagePrompt: `Exterior of ${practiceName} at golden hour, inviting entrance`,
    },
  ];

  const result: PatientPathCopyResult = {
    sections,
    schemaMarkup: buildSchemaMarkup(input, sections),
  };

  return result;
}

// -- Schema Markup ----------------------------------------------------------

function buildSchemaMarkup(
  input: ResearchBriefInput,
  sections: PatientPathSection[],
): { faqPage: string; localBusiness: string } {
  const faqSection = sections.find((s) => s.name === "faq");
  const faqTopics = input.faqTopics || [];

  const faqPage = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqTopics.slice(0, 5).map((topic) => ({
      "@type": "Question",
      name: topic,
      acceptedAnswer: {
        "@type": "Answer",
        text: faqSection?.body
          ? `See our detailed answer about ${topic.toLowerCase()} at ${input.practiceName}.`
          : `Contact ${input.practiceName} for information about ${topic.toLowerCase()}.`,
      },
    })),
  });

  const localBusiness = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "MedicalBusiness",
    name: input.practiceName,
    "@id": `#${input.practiceName.toLowerCase().replace(/\s+/g, "-")}`,
    description: input.irreplaceableThing || `${input.specialty} practice in ${input.city}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: input.city,
    },
    medicalSpecialty: input.specialty,
    aggregateRating: input.averageRating
      ? {
          "@type": "AggregateRating",
          ratingValue: input.averageRating,
          reviewCount: input.totalReviews,
        }
      : undefined,
  });

  return { faqPage, localBusiness };
}

// -- Event Writer -----------------------------------------------------------

async function logCopyGeneration(
  orgId: number,
  result: PatientPathCopyResult,
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "patientpath.copy_produced",
      org_id: orgId,
      properties: JSON.stringify({
        section_count: result.sections.length,
        sections: result.sections.map((s) => s.name),
        has_faq_schema: !!result.schemaMarkup.faqPage,
        has_local_business_schema: !!result.schemaMarkup.localBusiness,
      }),
      created_at: new Date(),
    });

    // Create dream_team_task for Corey approval
    await db("dream_team_tasks")
      .insert({
        owner_name: "Corey",
        title: `PatientPath copy ready for review (org ${orgId})`,
        description: `The PatientPath Copy Agent has generated all ${result.sections.length} sections. Review and approve before deployment.`,
        status: "open",
        priority: "normal",
        source_type: "patientpath_copy",
      })
      .catch(() => {
        // dream_team_tasks may not have all columns; log and continue
        console.warn(
          `[PatientPathCopy] Could not create approval task for org ${orgId}`,
        );
      });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[PatientPathCopy] Failed to log event for org ${orgId}:`,
      message,
    );
  }
}
