import { customAlphabet } from "nanoid";

/**
 * Generate an 8-character referral code.
 * Alphabet: no ambiguous chars (0/O, 1/I/L removed).
 */
const generate = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 8);

export function generateReferralCode(): string {
  return generate();
}
