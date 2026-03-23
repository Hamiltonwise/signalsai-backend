# Skill Builder Tone Update

## Problem Statement
The Skill Builder chat greeting sounds generic and third-person ("Great, let's build a new skill for {mindName}!"). User wants it to feel POV — the agent speaking naturally, curious, like "what skill to learn today?"

## Context Summary
- System prompt lives in `service.minds-skills.ts:348`
- The greeting is LLM-generated from the system prompt instructions
- The initial user message ("Hi, I want to create a new skill.") triggers the first response

## Existing Patterns to Follow
- Minds already have personality prompts — the Skill Builder should channel that energy
- The agent's name is available as `mind.name`

## Proposed Approach
1. Update the system prompt persona from "Skill Builder assistant for an AI agent" to first-person voice — the agent IS the one learning
2. Change the conversation opener instruction to be POV and curious
3. Keep the JSON response format and field extraction logic untouched

## Risk Analysis
- Level 1 — Minor tone change, no structural impact

## Definition of Done
- System prompt updated with POV tone
- Initial greeting feels like the agent speaking naturally
