import crypto from "crypto";

export function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function calculateTokenExpiry(days: number = 7): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}
