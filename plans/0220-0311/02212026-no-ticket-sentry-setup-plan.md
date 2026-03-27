# Sentry Setup — Frontend & Backend

## Problem Statement

The application lacks error monitoring. Sentry needs to be integrated into both the React frontend and Express backend to capture unhandled errors and provide observability into production failures.

## Context Summary

- **Frontend**: React + Vite + TypeScript. Entry point is `signalsai/src/main.tsx`. `@sentry/react` v10.39.0 already installed but not initialized.
- **Backend**: Express.js + TypeScript. Entry point is `signalsai-backend/src/index.ts`. `@sentry/node` is **not installed**.
- Two separate Sentry DSNs provided (one per project).
- No existing error monitoring or Sentry configuration anywhere in the codebase.

## Existing Patterns to Follow

- Backend uses ESM imports (`import x from "y"`)
- Environment variables loaded via `dotenv` at top of `index.ts`
- Frontend uses Vite with `@` path alias

## Proposed Approach

### Backend (`signalsai-backend`)

1. **Install** `@sentry/node`
2. **Initialize Sentry** at the very top of `src/index.ts` — before `dotenv`, before Express, before everything. Sentry must be the first thing that runs to capture all errors.
3. **Add `Sentry.setupExpressErrorHandler(app)`** after all route registrations but before the static file serving / proxy fallback. This is Sentry v8+ API for Express.
4. **DSN** stored in `.env` as `SENTRY_DSN` — not hardcoded.

**Resulting `index.ts` top:**
```
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: true,
});

import dotenv from "dotenv";
dotenv.config();
// ... rest of imports
```

**After all routes, before `if (isProd)`:**
```
Sentry.setupExpressErrorHandler(app);
```

### Frontend (`signalsai`)

1. **Initialize Sentry** in `src/main.tsx` before `createRoot()`.
2. **DSN** stored in `.env` as `VITE_SENTRY_DSN` (Vite requires `VITE_` prefix for client-exposed env vars).
3. **Wrap** the `<App />` component with `Sentry.ErrorBoundary` as a fallback for uncaught React render errors.

**Resulting `main.tsx`:**
```
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  sendDefaultPii: true,
});

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<p>Something went wrong.</p>}>
    <App />
  </Sentry.ErrorBoundary>
);
```

### Environment Variables

Add to backend `.env`:
```
SENTRY_DSN=https://561d84da0cec284ed7ce60d8dcdfc928@o4510924014419968.ingest.us.sentry.io/4510924039389184
```

Add to frontend `.env`:
```
VITE_SENTRY_DSN=https://1ef139708672799dbc251c5c4ebacdee@o4510924014419968.ingest.us.sentry.io/4510924015861760
```

## Risk Analysis

**Level 1 — Low risk.**

- Additive only — no existing behavior changes.
- Sentry SDK is lightweight and non-blocking. If DSN is missing/invalid, it silently no-ops.
- Express error handler is a standard middleware — follows existing Express middleware pattern.
- No database changes. No auth changes. No API contract changes.

## Security Considerations

- DSNs are stored in environment variables, not hardcoded.
- `sendDefaultPii: true` will collect IP addresses. This is the user's explicit choice per the provided config.
- Frontend DSN is inherently public (shipped to browser) — this is expected and by Sentry's design.

## Blast Radius Analysis

- **Backend**: `src/index.ts` only — two insertion points (top of file, after routes).
- **Frontend**: `src/main.tsx` only — initialization and ErrorBoundary wrapper.
- **Env files**: Two new variables added.
- No other files touched.

## Definition of Done

- [ ] `@sentry/node` installed in backend
- [ ] Sentry initialized at top of `signalsai-backend/src/index.ts`
- [ ] `Sentry.setupExpressErrorHandler(app)` placed after all routes
- [ ] Sentry initialized at top of `signalsai/src/main.tsx`
- [ ] `<App />` wrapped with `Sentry.ErrorBoundary`
- [ ] DSNs stored in respective `.env` files
- [ ] Backend starts without errors
- [ ] Frontend builds without errors
