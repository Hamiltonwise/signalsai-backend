# Parenting System Prompt Tuning

**Date:** 02/28/2026
**Ticket:** --no-ticket

---

## Problem Statement

Two issues with the parenting chat system prompt:

1. **Greeting is generic** — The greeting instruction says "greet warmly and ask what they want you to learn today" but doesn't leverage the agent's personality/role/specialization. A dental SEO agent should greet differently than a general-purpose agent.

2. **Push-back is too aggressive** — Current rule says "push back with a direct citation" which can feel confrontational. Should push back softly once but never insist if the parent corrects.

---

## Context Summary

- System prompt lives in `service.minds-parenting-chat.ts`, function `buildParentingSystemPrompt()`
- The `personalityPrompt` param already contains role/profession/specialization info
- Greeting generation at line 118 uses a hardcoded user message trigger
- Push-back rule is rule #3 in the RULES section

---

## Existing Patterns to Follow

The personality prompt is injected into the system prompt and the LLM is expected to embody it. The greeting should naturally reflect whatever role/specialization the personality describes.

---

## Proposed Approach

1. Update rule #1 (greeting) to instruct the agent to reference its specialization/role from the personality when greeting
2. Update rule #3 (push-back) to soften: mention the conflict once with a citation, accept the parent's correction without insisting
3. Update the greeting trigger message to reinforce role-awareness

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|------------|
| Prompt change affects tone unpredictably | Level 1 | Changes are scoped to greeting + conflict rules only |

---

## Definition of Done

- [ ] Greeting references agent's role/specialization from personality
- [ ] Push-back mentions conflict once but accepts correction without insisting
- [ ] No other behavioral changes
