/**
 * Content Pattern Service
 *
 * Scores form submission content for spam-like patterns.
 * Pure string operations — no external dependencies.
 *
 * Score thresholds:
 * - >= 5  → flag submission (saved but not emailed)
 */

const SPAM_KEYWORDS = [
  // Direct spam / scam
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
  "lottery",
  "prize winner",
  "congratulations you",
  "nigerian prince",
  "wire transfer",
  "bitcoin",
  "investment opportunity",
  "passive income",
  "double your",
  "risk free",
  "no obligation",

  // SEO / marketing spam
  "seo services",
  "seo agency",
  "seo expert",
  "seo optimization",
  "seo package",
  "rank your website",
  "rank your site",
  "rank #1",
  "#1 ranking",
  "first page of google",
  "page 1 of google",
  "top of google",
  "google ranking",
  "search engine optimization",
  "backlinks",
  "link building",
  "guest post",
  "web traffic",
  "guaranteed ranking",
  "guaranteed results",
  "increase your traffic",
  "boost your traffic",
  "boost your ranking",
  "boost your seo",
  "organic traffic",
  "drive traffic",
  "monthly traffic",
  "domain authority",
  "da increase",
  "pbn",
  "private blog network",

  // Sales / vendor pitch
  "i offer",
  "we offer",
  "our services",
  "our agency",
  "our company offers",
  "our team can",
  "boost your",
  "grow your business",
  "scale your",
  "partnership opportunity",
  "business proposal",
  "would love to connect",
  "quick call",
  "schedule a call",
  "15 minute call",
  "free consultation",
  "free audit",
  "free trial",
  "special offer",
  "discount",
  "limited spots",
  "exclusive deal",
  "affordable price",
  "competitive rate",
  "best price",

  // Web dev spam
  "website redesign",
  "web development services",
  "mobile app development",
  "custom software",
  "hire developer",
  "offshore development",
  "dedicated team",

  // Lead gen / outreach spam
  "lead generation",
  "email list",
  "email marketing",
  "cold email",
  "b2b leads",
  "qualified leads",
  "appointment setting",
  "social media marketing",
  "social media management",
  "facebook ads",
  "google ads management",
  "ppc management",
  "content marketing",
  "video marketing",
  "influencer marketing",
  "reputation management",
  "press release",
];

const URL_PATTERN = /https?:\/\/|www\./gi;
const CONSONANT_CLUSTER = /[^aeiou\s\d]{5,}/i;
const EMAIL_IN_VALUE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export interface PatternResult {
  score: number;
  reasons: string[];
}

/**
 * Score form contents for spam patterns.
 * Higher score = more likely spam.
 * Returns score and list of reasons for flagging.
 */
export function analyzePatterns(contents: Record<string, string>): PatternResult {
  let score = 0;
  const reasons: string[] = [];
  const values = Object.values(contents);
  const allText = values.join(" ").toLowerCase();

  // URL detection
  const urlMatches = allText.match(URL_PATTERN);
  const urlCount = urlMatches ? urlMatches.length : 0;
  if (urlCount > 0) {
    score += urlCount * 3;
    reasons.push(`${urlCount} URL(s) detected`);
  }
  if (urlCount >= 3) {
    score += 5;
    reasons.push("Excessive URLs (3+)");
  }

  // Email addresses in field values (not in email-labeled fields)
  const keys = Object.keys(contents);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i].toLowerCase();
    if (key.includes("email") || key.includes("e-mail")) continue;
    const emailMatches = values[i].match(EMAIL_IN_VALUE);
    if (emailMatches && emailMatches.length > 0) {
      score += 2;
      reasons.push("Email address in non-email field");
      break;
    }
  }

  // Spam keywords
  const matchedKeywords: string[] = [];
  for (const keyword of SPAM_KEYWORDS) {
    if (allText.includes(keyword)) {
      score += 3;
      matchedKeywords.push(keyword);
    }
  }
  if (matchedKeywords.length > 0) {
    reasons.push(`Spam keywords: ${matchedKeywords.slice(0, 5).join(", ")}${matchedKeywords.length > 5 ? ` (+${matchedKeywords.length - 5} more)` : ""}`);
  }

  // All-caps detection (per field)
  for (const value of values) {
    if (value.length >= 10) {
      const letters = value.replace(/[^a-zA-Z]/g, "");
      if (letters.length > 0) {
        const upperRatio = value.replace(/[^A-Z]/g, "").length / letters.length;
        if (upperRatio > 0.8) {
          score += 2;
          reasons.push("Excessive caps in field value");
          break;
        }
      }
    }
  }

  // Identical values across 2+ fields
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length > 3 && seen.has(trimmed)) {
      score += 2;
      reasons.push("Identical values across multiple fields");
      break;
    }
    seen.add(trimmed);
  }

  // Gibberish detection (consonant clusters, no vowels in long words)
  for (const value of values) {
    if (CONSONANT_CLUSTER.test(value)) {
      score += 2;
      reasons.push("Gibberish detected");
      break;
    }
  }

  // Excessive length in a single field (walls of text in a contact form)
  for (const value of values) {
    if (value.length > 300) {
      score += 2;
      reasons.push("Unusually long field value (300+ chars)");
      break;
    }
  }

  return { score, reasons };
}

export const SPAM_THRESHOLD = 5;
