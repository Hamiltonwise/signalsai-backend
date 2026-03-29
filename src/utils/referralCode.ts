/**
 * Generate an 8-character referral code.
 * Alphabet: no ambiguous chars (0/O, 1/I/L removed).
 * Uses dynamic import because nanoid is ESM-only.
 */

let generate: (() => string) | null = null;

async function getGenerator(): Promise<() => string> {
  if (!generate) {
    const { customAlphabet } = await import("nanoid");
    generate = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 8);
  }
  return generate;
}

export async function generateReferralCode(): Promise<string> {
  const gen = await getGenerator();
  return gen();
}
