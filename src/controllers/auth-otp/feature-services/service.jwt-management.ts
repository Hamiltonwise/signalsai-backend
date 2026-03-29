/**
 * JWT Management Service
 *
 * Handles JWT token generation and verification for auth.
 */

import jwt from "jsonwebtoken";

/**
 * Read JWT_SECRET lazily at call time so dotenv.config() has already run.
 * Top-level const would capture the value before dotenv loads .env (ESM hoisting).
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("FATAL: JWT_SECRET not set");
  return secret;
}

export interface JwtPayload {
  userId: number;
  email: string;
}

/**
 * Generates a JWT token.
 * Default: 7-day expiry. With rememberMe: 30-day expiry.
 */
export function generateToken(userId: number, email: string, rememberMe?: boolean): string {
  return jwt.sign(
    { userId, email },
    getJwtSecret(),
    { expiresIn: rememberMe ? "30d" : "7d" }
  );
}

/**
 * Verifies a JWT token and returns the decoded payload.
 * Returns null if the token is invalid or expired.
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}
