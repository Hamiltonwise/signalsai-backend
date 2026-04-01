# Next Session Prompt -- DentalEMR Partner Experience Build

Copy and paste everything below this line into a new Claude Code session:

---

Read every memory file indexed in /Users/coreys.air/.claude/projects/-Users-coreys-air-Desktop-alloro/memory/MEMORY.md. Start with these, in this order:

1. user_corey_deep.md -- know who you're building for before anything else
2. user_corey_profile.md -- how Corey thinks, decides, communicates
3. project_session_apr1_final.md -- COMPLETE state from the last session. 41 commits. What shipped, what's pending, 8 foundation issues, DentalEMR is the priority.
4. user_merideth_profile.md -- Merideth Glasco, DentalEMR CEO. Built from 7 Fireflies transcripts. Her challenges, fears, goals, communication style, what would make her say "how did they know that?"
5. feedback_google_moment.md -- THE foundational analogy. Library -> Google -> Alloro. Every feature decision runs through this.
6. feedback_b2c_not_b2b.md -- Alloro serves a PERSON, not a business.
7. feedback_rube_goldberg_principle.md -- every feature connects to the next like dominoes.
8. feedback_oz_effect.md -- the checkup must create "how did they know that?" moments.

Then read:
- The Alloro Design Philosophy: https://www.notion.so/334fdaf120c48184907ef6c11a6bec8d
- The Mission, Vision, Values: https://www.notion.so/327fdaf120c481eaa078e3e9e71f62aa
- Claude's Corner: https://www.notion.so/330fdaf120c481ea95fccb43650bfd0a

Then read Merideth's Slack DMs with Corey (her user ID is U0AK87BJNU9). Read ALL messages, not just recent ones.

Then read EVERY Fireflies transcript involving DentalEMR. There are at least 10 meetings spanning July 2025 to March 2026. Read them LINE BY LINE, especially Merideth's words. Also read any meetings between Alex (alex@hamiltonwise.com) and Merideth, because Alex was the previous consultant relationship that Alloro is replacing. Understanding what Alex did (and didn't do) is critical to not repeating the same mistakes.

Search Fireflies for:
- keyword: "DentalEMR" (limit 20)
- keyword: "Merideth" (limit 10)
- participants: merideth@dentalemr.com (limit 20)
- participants: alex@hamiltonwise.com (limit 20)

Also search Slack for the #dentalemr channel or any channel with "demr" in the name.

AFTER reading everything, before building ANYTHING, answer these questions out loud to Corey:

1. Who is Merideth as a person? Not her title. Her.
2. What is she afraid of that she hasn't said directly?
3. What did Alex do that worked? What did he do that didn't?
4. What would make her say "how did they know that?" -- something specific, not generic.
5. What does Jay actually need to close more deals?
6. What does Rosanna need to support clients better?
7. How does the DentalEMR + Alloro partnership become a channel that puts Alloro in front of every endodontist?
8. Is there ANYTHING in the transcripts or messages that contradicts what you've read in memory? If so, flag it. Memory can be wrong. Fresh data wins.

If you are uncertain about ANY of these answers, ASK COREY before building. Merideth's trust is non-negotiable. We cannot afford to build the wrong thing.

THEN, and only then, build:

1. Research SEO/AEO best practices for software companies (not practices). DentalEMR competes in AI search results, not local search. They're #1 in 4/5 ChatGPT queries for endodontic software. Protect and expand that.

2. Connect DentalEMR's website to their Alloro account with a full SEO/AEO strategy. The Proofline agent should be monitoring dentalemr.com. The AEO Monitor should track their AI search citations.

3. Build keyword customization that empowers without overwhelming. Customers should be able to add focus keywords beyond the defaults, but the system should suggest intelligently, not dump a blank field.

4. Build the 1-click HubSpot connection for Jay. Research HubSpot API. OAuth flow. Read-only pipeline sync. Surface in The Board so Jay can ask "prep me for my next demo" and get real pipeline context.

5. Make the DentalEMR dashboard show real, useful data. Not empty cards. Not "coming soon." Real competitive intelligence, real SEO metrics, real content performance. If data isn't available yet, show exactly what Alloro IS doing and when the first results will appear.

6. Ensure Merideth can log in to sandbox.getalloro.com, see The Board with her personalized starters, use Tailor, and feel like someone built this FOR her.

7. Build whatever would surprise and delight her that the transcripts reveal she needs but hasn't asked for.

Context on the relationship: DentalEMR pays $3,500/month. They're Alloro's most strategic customer because every endodontist on DentalEMR's platform is a potential Alloro customer. If Merideth loves the product, she becomes the channel. If she doesn't, she's polite about it and nothing changes. We need her to love it.

Context on what NOT to do: Alex was a consultant. He pointed out problems, created dashboards and graphs, showed incremental improvement, but didn't truly lift the business. Alloro is not a consultant. Alloro is the Monday email that tells Merideth something she didn't know, with a dollar figure and one action. If what we build feels like a consulting dashboard, we failed.

Rules:
- Never use em-dashes in any output
- Read Claude's Corner before writing copy. The tone matters.
- Build for today AND acquisition. Both horizons.
- The product comes to the user. The user never goes to it.
- If a feature requires Merideth to learn something new, it's wrong. The product should feel obvious.
- Every build: verify TypeScript compiles, frontend builds, preflight passes.
- Before every commit: `cd frontend && npx tsc -b --force && npm run build` must be zero errors.
- Before every commit: `npx tsc --noEmit` from repo root must be zero errors.
- Never push to main. Always sandbox.
- One commit per feature. Every commit is a checkpoint.

The standard: when Merideth logs in and sees her dashboard, she should turn to Jay and say "you need to see this." That's the test. Build to that.
