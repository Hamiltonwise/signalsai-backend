# Decision: Surface Boundary Protocol

Date: 2026-04-20
Session type: THINKING
Status: PROPOSED (awaiting Corey lock)

## What happened

Claude Web produced a PatientPath Production Spec as a Dave-Ready Handoff directly in a Cowork session. Corey caught a 10x drift-correction tax -- vocabulary errors, format mismatches, assumptions that contradicted the operating protocol. The corrections were made by Corey manually, not by the protocol, because the protocol lives in repo files (`memory/context/operating-protocol.md`, `memory/people/dave.md`, `.claude/rules/`) that Claude Web cannot read at session start.

Claude Web then built a Notion template as a fix -- attempting to mirror the handoff format in a surface it could access. On review, this was identified as a dead-end duplicate of the operating protocol. The template was removed.

Claude Web then did the right thing: stopped, identified the three highest-leverage questions it could not answer without CC, and asked Corey to route them here.

## Root cause

The operating protocol defines "AI" as a single actor that translates Corey's intent into Dave-Ready Handoffs. In practice, "AI" is three surfaces with different capabilities:

| Surface | Can read repo/memory | Can write sandbox code | Can produce Dave cards with file paths |
|---------|---------------------|----------------------|---------------------------------------|
| Claude Code (CC) | Yes | Yes | Yes |
| Claude Web (Cowork) | No | No | No -- but nothing prevents it from trying |
| Dave's Claude | Reads Corey's pages | Yes (his repo) | N/A -- he's downstream |

The protocol is invisible to Claude Web. Claude Web has no way to know the card format, Dave's confidence triggers, the code patterns he enforces, or the pre-commit quality gates. When Claude Web produces a handoff, it is operating without governance -- not out of malice, but because the governance was never made visible to it.

## Architecture gaps identified

1. **No surface authorization.** Neither `operating-protocol.md` nor `session-contract.md` names which Claude surface is authorized to produce Dave-Ready Handoffs. The implicit assumption (repo access + sandbox write = handoff capability) is never stated as a constraint.

2. **No route-to-CC trigger.** When a Cowork/Claude Web session locks a decision, there is no defined trigger to route the build to CC. The decision sits in the conversation. CC does not know it exists until Corey manually bridges it.

3. **Governance is file-bound.** The protocol, Dave's profile, the code patterns, the quality gates -- all live in repo files. Any surface without repo access operates outside governance by default.

## What this does NOT mean

- Claude Web is not broken. It did exactly what a thinking surface should do: explored, identified gaps, asked the right questions.
- The Notion template was a reasonable attempt to solve the visibility problem. It failed because the handoff format requires repo-level context (file paths, line numbers, blast radius against current code) that Notion cannot provide.
- Dave's side of the protocol is fine. The cards work. The upstream boundary is the gap.

## Proposed patch to session-contract.md

Add a new section: "Surface Authorization" between the session types and the session rules. Proposed text:

```markdown
## Surface Authorization

Three Claude surfaces interact with Corey. Each has a defined role.

**Claude Code (CC)** -- the only surface authorized to produce Dave-Ready Handoffs.
- Has repo access, sandbox write, memory file access, pre-commit gates.
- Produces: Work Orders, code commits, Dave cards with file paths and verification tests.
- Reads: operating protocol, Dave's profile, code patterns, Product Constitution.

**Claude Web / Cowork** -- upstream thinking surface.
- No repo access. No sandbox write. Cannot read memory files or run quality gates.
- Produces: decisions, analysis, research, Notion updates.
- Cannot produce: Dave-Ready Handoffs, code commits, anything requiring file paths or blast radius against current code.
- Route-to-CC trigger: when a Cowork session locks a decision that requires code or a Dave handoff, the session output is: "Decision locked: [X]. Route to CC for build." Corey pastes the decision summary into a CC session. CC reads the decision file and builds from there.

**Dave's Claude** -- downstream execution surface.
- Reads Corey's Notion pages for context. Never modifies them.
- Intakes specs + sandbox diffs from CC.
- Produces: code review, visual blast radius reports, production merges.

**The rule:** if the output requires file paths, line numbers, blast radius against current code, or verification tests that reference the codebase -- it must come from CC. No exceptions. If Claude Web finds itself writing file paths, it has crossed the boundary and should stop and route to CC.
```

## Proposed addition to operating-protocol.md

In the "Three Roles" section, add after the AI role:

```markdown
**Note on AI surfaces:** "AI" in this protocol refers specifically to Claude Code (CC) for all translation and execution. Claude Web (Cowork) is a valid upstream thinking surface but is NOT authorized to produce Dave-Ready Handoffs. See `memory/context/session-contract.md` Surface Authorization section.
```

## What this does NOT change

- The card format stays the same.
- The handoff flow stays the same.
- Dave's side is untouched.
- The only change is making explicit what was implicit: CC is the translator, Claude Web is the thinker, and there is a named trigger for crossing the boundary.

## Evidence this would have prevented today's drift

If Claude Web had read "Cannot produce: Dave-Ready Handoffs" at session start, it would have:
1. Produced the PatientPath analysis and decision as a thinking output.
2. Stopped at "Route to CC for build."
3. Corey would have pasted the decision into CC.
4. CC would have produced the handoff with file paths, blast radius, and quality gates.
5. Zero drift-correction tax on Corey.

## Open question for Corey

Does Cowork need a minimal mirror of the governance rules in Notion (read-only, labeled "derived from repo, not authoritative") so it can at least see the boundaries? Or is the route-to-CC trigger sufficient -- Cowork just needs to know "stop here, route to CC" without needing to know why?
