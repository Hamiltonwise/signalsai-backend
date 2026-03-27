# Add n8n CORS Origin

## Problem Statement
`https://n8n.getalloro.com` is not in the CORS allowlist, so requests from the n8n instance to the backend are blocked by the browser's same-origin policy.

## Context Summary
- CORS is configured in `signalsai-backend/src/index.ts` lines 72–91 as a static `allowedOrigins` array.
- The n8n instance at `https://n8n.getalloro.com` needs to be added to this array.

## Existing Patterns to Follow
- All production subdomains are listed as full `https://` URLs in the static array.

## Proposed Approach
Add `"https://n8n.getalloro.com"` to the `allowedOrigins` array alongside the other production origins.

## Risk Analysis
- **Level 1 — Suggestion**: Additive change, no existing behavior affected. n8n is a trusted internal service.

## Definition of Done
- `https://n8n.getalloro.com` is present in the `allowedOrigins` array.
