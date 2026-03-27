# Project Display Name & Custom Domain in List

**Date:** 03/09/2026
**Ticket:** no-ticket
**Status:** Complete

---

## Problem Statement

Website projects show their generated slug hostname in the list which is confusing. Need an editable display name. Also, "View Site" link and listed domain should prefer custom_domain over generated subdomain.

## Proposed Approach

1. **Migration**: Add `display_name` VARCHAR nullable to `website_builder.projects` (NOT `name` — that exists in IProject interface but not DB)
2. **Backend**: Add `display_name` and `custom_domain` to listProjects SELECT; add updateProjectDisplayName endpoint
3. **Frontend type**: Add `display_name` and `custom_domain` to WebsiteProject interface
4. **WebsitesList.tsx**: Show display_name (fallback to generated_hostname), prefer custom_domain for links, add inline edit for display name

## Risk Analysis

Level 1 — Additive column, no breaking changes.

## Definition of Done

- Projects show display_name in list (editable inline)
- View Site and domain link prefer custom_domain when available
- display_name defaults to generated_hostname on create
