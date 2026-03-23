# Alloro Brain Documentation

**Date**: 02/28/2026
**Ticket**: --no-ticket
**Mode**: --instant

## Problem Statement

The app needs a comprehensive, accurate markdown document that serves as its "brain" — a complete self-understanding of everything Alloro is, does, and how it works. This document will be incorporated into a self-learning system as the baseline knowledge. It must cover business logic, technical architecture, features, security, risks, and improvement potentials.

## Context Summary

- Full frontend codebase explored (React 19 + Vite, 22 API modules, 17+ pages, 41+ component directories)
- Full backend codebase explored (Express 5, 30+ route namespaces, 50+ migrations, 3 BullMQ workers)
- All plan files reviewed (40 plans showing development history)
- Key business files deeply analyzed (billing, onboarding, RBAC, minds, dashboard)

## Existing Patterns to Follow

- Markdown documentation style consistent with existing plan files
- Structured sections with headers for scanability

## Proposed Approach

Create a single comprehensive `BRAIN.md` at the project root containing:
1. Business identity and value proposition
2. Complete technical architecture
3. Every feature documented with business context
4. All user flows (customer journey)
5. All admin flows
6. Security model
7. Risk analysis
8. Improvement potentials
9. Infrastructure and deployment
10. Data model

## Risk Analysis

- **Level 1**: Documentation-only change. No code modifications. Zero blast radius.

## Definition of Done

- [x] `BRAIN.md` exists at project root
- [x] Covers every feature, endpoint, page, and flow discovered during exploration
- [x] Business perspective is prioritized alongside technical details
- [x] Risks and improvements are highlighted
- [x] Accurate to current codebase state

## Execution Log

- **Executed**: 02/28/2026
- **Approach**: Three parallel exploration agents (frontend, backend, infra) + deep-dive agent on 12 critical business files
- **Output**: `BRAIN.md` at project root — 28 sections, ~1,800 lines
- **Coverage**:
  - Business identity, value prop, revenue model
  - Complete customer journey (signup → active usage)
  - Full technical architecture (monorepo, stack, patterns)
  - All 12+ features documented with business context
  - Complete API reference (80+ endpoints across user, admin, minds, public)
  - Full database schema (30+ tables across core + minds schema)
  - Security model with 7 control categories
  - 18 identified risks across 3 tiers
  - 17 improvement potentials (business, technical, minds-specific)
  - Development history from 40 plan files
  - Critical file paths appendix
