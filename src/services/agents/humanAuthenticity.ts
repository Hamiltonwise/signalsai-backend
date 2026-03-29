/**
 * Human Authenticity Agent -- On-demand Service
 *
 * Called before external content ships. Checks text for AI
 * fingerprints (filler phrases, structural patterns, epistemic
 * signals). Returns a score and flags. If score < 70, uses
 * Claude API to rewrite in human voice.
 *
 * Export: checkHumanAuthenticity() function, not a cron job.
 */

import Anthropic from "@anthropic-ai/sdk";

// -- Types ------------------------------------------------------------------

interface AuthenticityResult {
  authentic: boolean;
  score: number;
  flags: string[];
  rewrite?: string;
}

// -- AI Phrase Patterns -----------------------------------------------------

const AI_PHRASES: { pattern: RegExp; label: string }[] = [
  { pattern: /I['']d be happy to/gi, label: "\"I'd be happy to\" -- AI filler" },
  { pattern: /Certainly!/gi, label: "\"Certainly!\" -- AI filler" },
  { pattern: /It['']s important to note/gi, label: "\"It's important to note\" -- AI filler" },
  { pattern: /It is important to note/gi, label: "\"It is important to note\" -- AI filler" },
  { pattern: /\bdelve\b/gi, label: "\"delve\" -- AI vocabulary" },
  { pattern: /\bleverage\b/gi, label: "\"leverage\" -- AI vocabulary" },
  { pattern: /\butilize\b/gi, label: "\"utilize\" -- AI vocabulary" },
  { pattern: /I cannot\b/gi, label: "\"I cannot\" -- AI refusal pattern" },
  { pattern: /In the realm of/gi, label: "\"In the realm of\" -- AI filler" },
  { pattern: /It['']s worth noting/gi, label: "\"It's worth noting\" -- AI filler" },
  { pattern: /comprehensive\b/gi, label: "\"comprehensive\" -- empty AI descriptor" },
  { pattern: /\brobust\b/gi, label: "\"robust\" -- empty AI descriptor" },
  { pattern: /In conclusion/gi, label: "\"In conclusion\" -- AI structural habit" },
  { pattern: /This allows us to/gi, label: "\"This allows us to\" -- AI filler" },
  { pattern: /In today['']s fast-paced/gi, label: "\"In today's fast-paced\" -- AI cliche" },
  { pattern: /Navigate the complexities/gi, label: "\"Navigate the complexities\" -- AI cliche" },
  { pattern: /At the end of the day/gi, label: "\"At the end of the day\" -- AI cliche" },
  { pattern: /\bgame-changer\b/gi, label: "\"game-changer\" -- AI buzzword" },
  { pattern: /\bcutting-edge\b/gi, label: "\"cutting-edge\" -- AI buzzword" },
  { pattern: /\bseamless(ly)?\b/gi, label: "\"seamless\" -- AI buzzword" },
  { pattern: /Here['']s the thing/gi, label: "\"Here's the thing\" -- AI filler" },
  { pattern: /Let me break this down/gi, label: "\"Let me break this down\" -- AI filler" },
  { pattern: /When it comes to/gi, label: "\"When it comes to\" -- AI filler" },
  { pattern: /plays a crucial role/gi, label: "\"plays a crucial role\" -- AI filler" },
  { pattern: /It['']s no secret that/gi, label: "\"It's no secret that\" -- AI filler" },
  { pattern: /stands as a testament/gi, label: "\"stands as a testament\" -- AI filler" },
  { pattern: /take your .* to the next level/gi, label: "\"take X to the next level\" -- AI cliche" },
  { pattern: /\bempower(ing)?\b/gi, label: "\"empower\" -- AI buzzword" },
  { pattern: /\bstreamline\b/gi, label: "\"streamline\" -- AI buzzword" },
  { pattern: /\bholistic approach\b/gi, label: "\"holistic approach\" -- AI buzzword" },
  { pattern: /\brest assured\b/gi, label: "\"rest assured\" -- AI filler" },
  { pattern: /With that being said/gi, label: "\"With that being said\" -- AI filler" },
];

// Em-dash check (Unicode U+2014)
const EM_DASH_PATTERN = /\u2014/g;

// -- Structural Checks ------------------------------------------------------

/**
 * Detect list-heavy formatting: more than 40% of lines start with
 * a bullet, number, or dash.
 */
function checkListHeavy(text: string): string | null {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 4) return null;
  const listLines = lines.filter((l) =>
    /^\s*[-*\u2022]\s|^\s*\d+[.)]\s/.test(l)
  );
  const ratio = listLines.length / lines.length;
  if (ratio > 0.4) {
    return `List-heavy formatting: ${Math.round(ratio * 100)}% of lines are list items. Humans write in prose more often.`;
  }
  return null;
}

/**
 * Detect over-hedging: excessive qualifiers that weaken the message.
 */
function checkOverHedging(text: string): string | null {
  const hedges = [
    /\bmight\b/gi,
    /\bperhaps\b/gi,
    /\bpossibly\b/gi,
    /\bpotentially\b/gi,
    /\bit could be\b/gi,
    /\bit may be\b/gi,
    /\bthere is a chance\b/gi,
  ];
  let hedgeCount = 0;
  for (const h of hedges) {
    const matches = text.match(h);
    if (matches) hedgeCount += matches.length;
  }
  const wordCount = text.split(/\s+/).length;
  const ratio = hedgeCount / wordCount;
  if (ratio > 0.02 && hedgeCount >= 3) {
    return `Over-hedging detected: ${hedgeCount} hedge words in ${wordCount} words. Confidence is more human than caution.`;
  }
  return null;
}

// -- Scoring ----------------------------------------------------------------

function scoreText(text: string): { score: number; flags: string[] } {
  const flags: string[] = [];

  // Check AI phrases
  for (const { pattern, label } of AI_PHRASES) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      flags.push(label);
    }
  }

  // Check em-dashes
  const emDashMatches = text.match(EM_DASH_PATTERN);
  if (emDashMatches) {
    flags.push(
      `${emDashMatches.length} em-dash(es) found. Alloro never uses em-dashes.`
    );
  }

  // Check structural patterns
  const listFlag = checkListHeavy(text);
  if (listFlag) flags.push(listFlag);

  const hedgeFlag = checkOverHedging(text);
  if (hedgeFlag) flags.push(hedgeFlag);

  // Score: start at 100, deduct per flag
  // AI phrases: -8 each, em-dashes: -5 each, structural: -10 each
  let score = 100;
  for (const flag of flags) {
    if (flag.includes("em-dash")) {
      score -= 5 * (emDashMatches?.length || 1);
    } else if (
      flag.includes("List-heavy") ||
      flag.includes("Over-hedging")
    ) {
      score -= 10;
    } else {
      score -= 8;
    }
  }

  score = Math.max(0, Math.min(100, score));

  return { score, flags };
}

// -- Main Export -------------------------------------------------------------

/**
 * Check text for AI authenticity. Returns score, flags, and optional rewrite.
 *
 * @param text - The content to check
 * @returns AuthenticityResult with score, flags, and optional rewrite
 */
export async function checkHumanAuthenticity(
  text: string
): Promise<AuthenticityResult> {
  const { score, flags } = scoreText(text);
  const authentic = score >= 70;

  const result: AuthenticityResult = {
    authentic,
    score,
    flags,
  };

  // If score is below 70, attempt a rewrite using Claude
  if (!authentic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const client = new Anthropic({ apiKey });
        const flagList = flags.join("\n- ");
        const message = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          messages: [
            {
              role: "user",
              content: `Rewrite the following text to sound authentically human. Remove all AI fingerprints listed below. Keep the same meaning and facts. Use a direct, specific, peer-to-peer tone. No em-dashes. No filler phrases. No buzzwords. Write as if a founder who has spent years watching this problem firsthand is speaking.

AI fingerprints detected:
- ${flagList}

Original text:
${text}

Rewrite the text below. Output only the rewritten text, nothing else.`,
            },
          ],
        });
        const rewriteBlock = message.content[0];
        if (rewriteBlock.type === "text") {
          result.rewrite = rewriteBlock.text;
        }
      } catch (err: any) {
        console.error(
          "[HumanAuthenticity] Claude rewrite failed:",
          err.message
        );
        // Proceed without rewrite
      }
    } else {
      console.warn(
        "[HumanAuthenticity] No ANTHROPIC_API_KEY set. Skipping rewrite."
      );
    }
  }

  return result;
}
