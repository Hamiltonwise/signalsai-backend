# Decision: Canonical Artifact Rule

Date: 2026-04-20
Session type: THINKING
Status: PROPOSED

## What happened

Claude Web produced the PatientPath Pipeline Handoff using Memory #30 principles (feature-forward, prescriptive) but without opening the April 10 canonical example first. Result was 10x drift-correction tax caught by Corey across the session.

Earlier diagnoses in this session (surface-boundary mismatch, Notion template missing) were both wrong. Actual root cause: producing from principle instead of from canonical artifact.

## Root cause

The operating protocol captures the principles behind the Dave-Ready Handoff format. The April 10 Migration Manifest is the working artifact that embodies those principles. When Claude Web produced a handoff by reasoning from the principles alone, it produced something that looked structurally correct but drifted on shape, vocabulary, and sequencing -- all things the canonical artifact would have constrained automatically.

Capturing principles is necessary but insufficient when the artifact already exists. The artifact is the spec. The principles explain the artifact. They do not replace it.

## The rule

Every session that produces a Dave-bound handoff opens the canonical artifact first as the starting point, then modifies. The canonical artifact for Dave-Ready Handoffs is the April 10, 2026 Migration Manifest:
- Notion: https://www.notion.so/349fdaf120c4810aa045dfa4124ffa68
- Shape: Card Sequence summary table at the top, detailed cards below with done gates between.

Do not reason toward the format from principle. Open the artifact and modify it.

## What this supersedes

The earlier `memory/decisions/2026-04-20-surface-boundary.md` file from this same session diagnosed the problem as a surface-boundary mismatch (Claude Web cannot read repo files). That diagnosis was wrong. The actual failure was producing from principle instead of from artifact. The surface-boundary file remains as a record of the diagnostic process but is not the root cause.

## What this does NOT change

- The card format stays the same.
- The handoff flow stays the same.
- Dave's side is untouched.
- The session contract and operating protocol principles remain correct -- they just aren't sufficient on their own.
