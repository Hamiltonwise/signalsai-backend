import crypto from "crypto";

const KEY_PREFIX_MIND = "mk_";
const KEY_PREFIX_SKILL = "sk_";

/**
 * Generate a portal API key and its SHA-256 hash.
 * The raw key is returned once (to display to the admin), and the hash is stored.
 */
export function generatePortalKey(
  type: "mind" | "skill"
): { rawKey: string; hash: string } {
  const prefix = type === "mind" ? KEY_PREFIX_MIND : KEY_PREFIX_SKILL;
  const random = crypto.randomBytes(32).toString("hex");
  const rawKey = `${prefix}${random}`;
  const hash = hashPortalKey(rawKey);
  return { rawKey, hash };
}

export function hashPortalKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export function verifyPortalKey(rawKey: string, storedHash: string): boolean {
  const hash = hashPortalKey(rawKey);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
}
