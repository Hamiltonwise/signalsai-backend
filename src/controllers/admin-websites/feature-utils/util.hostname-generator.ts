/**
 * Hostname Generator Utility
 *
 * Generates random hostnames for new website projects.
 * Format: {adjective}-{noun}-{4-digit-number}
 */

const ADJECTIVES = [
  "bright",
  "swift",
  "calm",
  "bold",
  "fresh",
  "prime",
  "smart",
  "clear",
];

const NOUNS = [
  "dental",
  "clinic",
  "care",
  "health",
  "smile",
  "wellness",
  "medical",
  "beauty",
];

export function generateHostname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${adj}-${noun}-${num}`;
}
