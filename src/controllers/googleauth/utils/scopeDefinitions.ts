// Combined OAuth2 scopes for all Google APIs we use
export const REQUIRED_SCOPES = [
  // Google Business Profile scopes
  "https://www.googleapis.com/auth/business.manage",
];

// Scope descriptions for the /scopes endpoint
export const SCOPE_DESCRIPTIONS: Record<string, string> = {
  "https://www.googleapis.com/auth/business.manage":
    "Google Business Profile - Manage business listings and access insights",
  "https://www.googleapis.com/auth/plus.business.manage":
    "Google Business Profile - Legacy scope for reviews (may be required)",
  "https://www.googleapis.com/auth/plus.profiles.read":
    "Google Business Profile - Read profile data (may be required for reviews)",
};

// APIs covered by these scopes
export const SUPPORTED_APIS = [
  "Google Business Profile (GBP)",
];
