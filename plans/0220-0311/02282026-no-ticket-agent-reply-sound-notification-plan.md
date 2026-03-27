# Agent Reply Sound Notification

## Problem Statement
Play a blip sound when the agent finishes a reply. Persist the user's preference in localStorage so the permission prompt only appears once.

## Context Summary
- Sound file: `public/blip.mp3`
- Both `MindChatTab.tsx` and `ParentingChat.tsx` have streaming chat
- Agent reply completes when streaming finishes and the assistant message is finalized

## Existing Patterns to Follow
- localStorage for persisting user preferences (no backend needed)

## Proposed Approach
1. Preload the audio file on component mount via `new Audio("/blip.mp3")`
2. Play the sound when an agent reply stream completes (after `accumulated` is finalized as an assistant message)
3. Store sound preference in localStorage key `minds-sound-enabled`
4. On first mind page load, if no localStorage key exists, show a small toast/prompt asking to enable sounds, then save the preference
5. No need for browser Notification API — this is just audio playback which doesn't require permission unless autoplay policy blocks it (user interaction unlocks it)

## Risk Analysis
- **Level 1**: Frontend-only, localStorage persistence, no backend impact

## Definition of Done
- Blip plays when agent finishes replying in both chat components
- Preference saved in localStorage, only prompted once
- TypeScript clean
