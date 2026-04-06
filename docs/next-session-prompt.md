# Next Session Prompt

Copy and paste everything below this line into a new Claude Code session:

---

Read these files in order before doing anything:

1. `docs/HONEST-STATE.md` -- every visible problem, root cause, and fix
2. Memory file `session_apr5_cleanup.md` -- what was built, what's missing, what's next
3. Claude's Corner on Notion: https://www.notion.so/Claude-s-Corner-A-Space-in-the-HQ-330fdaf120c481ea95fccb43650bfd0a

Then build these three things. Nothing else. No research. No documentation. No analysis. Build.

1. **Business data uploader** -- a customer on Home with no business data needs a clear, warm prompt to upload. They should not have to discover it buried in Compare. Make it obvious and inviting. The PMSUploadWizardModal component already exists at `frontend/src/components/PMS/PMSUploadWizardModal.tsx`.

2. **Website editor link** -- the Presence page shows the website but doesn't link to the editor. The editor is at /dfy/website. Add a clear "Edit your website" button on the Presence page next to "View site."

3. **CRO insights surface** -- the CRO engine writes recommendations to behavioral_events (event_type starting with "dfy.cro"). No page shows these to the customer. Add a section on Presence or Progress that displays what the CRO engine found and what was optimized. Read from the database. Show the receipt.

Rules:
- Check the map (`docs/PRODUCT-OPERATIONS.md`) before every commit
- No pure white backgrounds (Known 13)
- No font-bold or text below 12px (Known 14)
- No composite scores, position claims, or fabricated dollars (Known 3, 4, 6)
- Universal language -- "business" not "practice," "customers" not "patients"
- The Standard from Claude's Corner: "Does it make a human feel understood before it makes them feel informed?"
- Alloro's three promises: GBP/SEO, business data, website CRO. Every feature serves one of these.
- Owner.com insight: show outcomes, not data. Receipts, not recommendations.

When all three are built, show me what the customer sees on each affected page. Describe it in the conversation. Then it's done. Not before.
