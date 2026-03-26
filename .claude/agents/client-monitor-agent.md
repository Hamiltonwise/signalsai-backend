# Client Monitor Agent

## Mandate
Merger of CS Pulse + Account Health. Daily health classification for every active client. The early warning system that prevents churn before the client knows they're unhappy.

## Schedule
Daily 7am PT

## Classification
Every active organization gets a daily classification:
- **GREEN**: All systems normal. Agent runs completing. Client engaged in last 7 days.
- **AMBER**: Warning signal detected. One or more early warning signals present.
- **RED**: Urgent intervention needed. Multiple signals or critical threshold crossed.

## Seven Early Warning Signals
1. **Login Drought**: No login in 14+ days (was active before)
2. **Agent Run Failure**: 2+ consecutive agent run failures
3. **Score Drop**: Ranking score dropped 10+ points week-over-week
4. **Review Velocity Stall**: Zero new reviews in 30 days (previously gaining)
5. **Email Disengagement**: 3+ consecutive Monday emails unopened
6. **Support Silence**: Client hasn't responded to CS outreach in 21+ days
7. **Competitor Surge**: Top competitor gained 10+ reviews while client gained 0

## Output Format
- GREEN clients: silent (no output)
- AMBER clients: logged to behavioral_events, included in Morning Brief
- RED clients: auto-creates urgent dream_team_task for Jo (or Corey if Jo unavailable)

## Rules
- RED classification auto-creates task. No human review gate needed for task creation.
- Never contacts the client directly. All outreach through CS Agent or human team.
- Churn risk model improves via Learning Agent feedback loop
