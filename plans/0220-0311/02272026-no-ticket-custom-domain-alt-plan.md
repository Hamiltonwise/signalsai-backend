# Add custom_domain_alt for www/non-www support

## Problem Statement
When a user connects `dentalemr.com`, `www.dentalemr.com` doesn't work (and vice versa). Need to auto-populate the counterpart.

## Context Summary
- `custom_domain` is VARCHAR UNIQUE on projects table
- Renderer checks `custom_domain` in verify-domain and site route
- Need a second column `custom_domain_alt` checked in parallel

## Existing Patterns to Follow
- Knex migrations in `src/database/migrations/`
- Service updates in `service.custom-domain.ts`

## Proposed Approach

### 1. Migration: add `custom_domain_alt` VARCHAR UNIQUE NULLABLE
### 2. Backend service: auto-compute alt domain on connect, clear on disconnect, check uniqueness of both
### 3. Renderer verify-domain: check both columns
### 4. Renderer project.service: check both columns
### 5. Renderer middleware: no change (already passes through to service)

## Risk Analysis
Level 1 — additive column and OR clause. No existing behavior broken.

## Definition of Done
- Connecting `example.com` auto-stores `www.example.com` as alt (and vice versa)
- Both domains resolve to the project
- Both domains get SSL certs from Caddy
- Disconnecting clears both
