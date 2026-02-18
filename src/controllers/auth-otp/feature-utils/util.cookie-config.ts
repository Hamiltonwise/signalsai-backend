/**
 * Cookie Configuration Utility
 *
 * Builds auth cookie options for cross-app auth sync.
 */

export interface AuthCookieOptions {
  path: string;
  maxAge: number;
  httpOnly: boolean;
  sameSite: "lax" | "strict" | "none";
  secure: boolean;
  domain: string | undefined;
}

export function buildAuthCookieOptions(): AuthCookieOptions {
  return {
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    httpOnly: false, // Allow client-side access for cross-tab sync
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    domain:
      process.env.NODE_ENV === "production" ? ".getalloro.com" : undefined,
  };
}
