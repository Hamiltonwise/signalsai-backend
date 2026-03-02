/**
 * Content Pattern Service
 *
 * Scores form submission content for spam-like patterns.
 * Pure string operations — no external dependencies.
 *
 * Score thresholds:
 * - >= 5  → reject silently
 */

const SPAM_KEYWORDS = [
  "buy now",
  "click here",
  "free money",
  "act now",
  "limited time",
  "casino",
  "viagra",
  "crypto",
  "earn money",
  "work from home",
  "make money online",
  "mlm",
  "forex",
  "binary options",
  "adult",
  "xxx",
  "onlyfans",
  "telegram",
  "whatsapp me",
  "seo services",
  "rank your website",
  "backlinks",
  "link building",
  "guest post",
  "web traffic",
  "guaranteed ranking",
];

const URL_PATTERN = /https?:\/\/|www\./gi;
const CONSONANT_CLUSTER = /[^aeiou\s\d]{6,}/i;

/**
 * Score form contents for spam patterns.
 * Higher score = more likely spam.
 */
export function getSpamScore(contents: Record<string, string>): number {
  let score = 0;
  const values = Object.values(contents);
  const allText = values.join(" ").toLowerCase();

  // URL detection
  const urlMatches = allText.match(URL_PATTERN);
  const urlCount = urlMatches ? urlMatches.length : 0;
  score += urlCount * 3;
  if (urlCount >= 3) score += 5;

  // Spam keywords
  for (const keyword of SPAM_KEYWORDS) {
    if (allText.includes(keyword)) {
      score += 3;
    }
  }

  // All-caps detection (per field)
  for (const value of values) {
    if (value.length >= 10) {
      const letters = value.replace(/[^a-zA-Z]/g, "");
      if (letters.length > 0) {
        const upperRatio = value.replace(/[^A-Z]/g, "").length / letters.length;
        if (upperRatio > 0.8) score += 2;
      }
    }
  }

  // Identical values across 2+ fields
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length > 3 && seen.has(trimmed)) {
      score += 2;
      break;
    }
    seen.add(trimmed);
  }

  // Gibberish detection (consonant clusters, no vowels in long words)
  for (const value of values) {
    if (CONSONANT_CLUSTER.test(value)) {
      score += 2;
      break;
    }
  }

  return score;
}

export const SPAM_THRESHOLD = 5;
