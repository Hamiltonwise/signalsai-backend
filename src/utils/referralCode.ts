/**
 * Generate an 8-character referral code.
 * Alphabet: no ambiguous chars (0/O, 1/I/L removed).
 *
 * nanoid is ESM-only. We use Function constructor to prevent
 * TypeScript from compiling import() to require() in CommonJS output.
 */

let generate: (() => string) | null = null;

// Prevents tsc from transforming import() to require()
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<any>;

async function getGenerator(): Promise<() => string> {
  if (!generate) {
    const { customAlphabet } = await dynamicImport("nanoid");
    generate = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 8);
  }
  return generate as () => string;
}

export async function generateReferralCode(): Promise<string> {
  const gen = await getGenerator();
  return gen();
}
