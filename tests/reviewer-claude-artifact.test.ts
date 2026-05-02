/**
 * Reviewer Claude (Build A) -- Artifact Gate Integration Test
 *
 * Asserts the verdict structure of runReviewerClaudeOnArtifact() against
 * a known fixture artifact, using rawResponseOverride to skip the live
 * Anthropic API call. The fixture mimics a Reviewer Claude markdown
 * response with mixed bullet formats (dashes, numbered, bold-numbered)
 * to exercise the parser.
 *
 * No network. No Notion writes (NOTION_TOKEN should be unset in CI).
 * No Slack post (ALLORO_DEV_SLACK_CHANNEL_ID unset).
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  runReviewerClaudeOnArtifact,
  parseReviewerResponse,
  type ReviewerArtifactResult,
} from "../src/services/agents/reviewerClaude";

// Save and restore env so the test never accidentally writes to Notion or Slack.
let savedEnv: Record<string, string | undefined> = {};
beforeAll(() => {
  savedEnv = {
    NOTION_TOKEN: process.env.NOTION_TOKEN,
    NOTION_API_KEY: process.env.NOTION_API_KEY,
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
    ALLORO_DEV_SLACK_CHANNEL_ID: process.env.ALLORO_DEV_SLACK_CHANNEL_ID,
  };
  delete process.env.NOTION_TOKEN;
  delete process.env.NOTION_API_KEY;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.ALLORO_DEV_SLACK_CHANNEL_ID;
});
afterAll(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const FIXTURE_PASS = `## Reviewer Claude Pass — Test Feature Brief

### Summary
Brief delivers exactly the original ask. Passes.

### Blockers (🔴)
None.

### Concerns (🟡)
None.

### Notes (🔵)
- Card title is short (3 words). Consider expanding for Dave's TL;DR scan.

### Verdict
PASS
`;

const FIXTURE_PASS_WITH_CONCERNS = `## Reviewer Claude Pass — Test Feature Brief

### Summary
Brief is acceptable but two concerns warrant Corey's review.

### Blockers (🔴)
None.

### Concerns (🟡)
- Check 6: Hard rule may break legitimate workflows. Recommend manual-review carve-out.
- Check 7: 30% improvement claim lacks traceable basis.

### Notes (🔵)
None.

### Verdict
PASS WITH CONCERNS
`;

const FIXTURE_BLOCK = `## Reviewer Claude Pass — Test Feature Brief

### Summary
Brief contains scope creep, premature scale, and unapproved customer copy.

### Blockers (🔴)
1. Card B: 1,000 concurrent dashboard load test required to ship — Check 2 violation.
2. **3. Check 3:** "Alloro is watching" customer string not isolated for Corey approval.
- Check 5: Cards X, Y, Z committed to sandbox before Dave reviewed diffs.

### Concerns (🟡)
- Check 1: Card spans 5 distinct top-level directories — likely bundles concerns.

### Notes (🔵)
- Card title length is fine.

### Verdict
BLOCK
`;

describe("runReviewerClaudeOnArtifact (Build A)", () => {
  test("PASS verdict has clean structure", async () => {
    const result: ReviewerArtifactResult = await runReviewerClaudeOnArtifact({
      artifactSource: "test-pass-fixture",
      rawResponseOverride: FIXTURE_PASS,
      autoPromoteOnPass: false,
    });
    expect(result.verdict).toBe("PASS");
    expect(result.blockers).toHaveLength(0);
    expect(result.concerns).toHaveLength(0);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].finding).toContain("Card title is short");
    expect(result.autoPromoted).toBe(false);
    expect(result.artifactSource).toBe("test-pass-fixture");
    expect(result.auditLogPageId).toBeUndefined();
  });

  test("PASS_WITH_CONCERNS verdict captures concern findings", async () => {
    const result = await runReviewerClaudeOnArtifact({
      artifactSource: "test-concerns-fixture",
      rawResponseOverride: FIXTURE_PASS_WITH_CONCERNS,
    });
    expect(result.verdict).toBe("PASS_WITH_CONCERNS");
    expect(result.blockers).toHaveLength(0);
    expect(result.concerns).toHaveLength(2);
    expect(result.concerns[0].check).toBe("6");
    expect(result.concerns[1].check).toBe("7");
    expect(result.autoPromoted).toBe(false);
  });

  test("BLOCK verdict captures all bullet formats (dashed, numbered, bold-numbered)", async () => {
    const result = await runReviewerClaudeOnArtifact({
      artifactSource: "test-block-fixture",
      rawResponseOverride: FIXTURE_BLOCK,
    });
    expect(result.verdict).toBe("BLOCK");
    expect(result.blockers.length).toBeGreaterThanOrEqual(3);
    expect(result.concerns).toHaveLength(1);
    expect(result.notes).toHaveLength(1);
    expect(result.autoPromoted).toBe(false);

    // Confirm parser pulls Check numbers from each blocker
    const findings = result.blockers.map((b) => b.finding).join(" | ");
    expect(findings).toContain("1,000 concurrent");
    expect(findings).toContain("Alloro is watching");
    expect(findings).toContain("committed to sandbox");
  });

  test("Sanity clamp: blockers > 0 forces BLOCK verdict even if line says PASS", async () => {
    const malformed = `## Reviewer Claude Pass — X
### Blockers (🔴)
- Check 2: Real blocker.
### Verdict
PASS`;
    const result = await runReviewerClaudeOnArtifact({
      artifactSource: "malformed-fixture",
      rawResponseOverride: malformed,
    });
    expect(result.verdict).toBe("BLOCK");
    expect(result.blockers).toHaveLength(1);
  });

  test("Result shape matches the documented Promise<{verdict, blockers, concerns, notes, auditLogPageId, autoPromoted}> contract", async () => {
    const result = await runReviewerClaudeOnArtifact({
      artifactSource: "shape-test-fixture",
      rawResponseOverride: FIXTURE_PASS,
    });
    expect(result).toHaveProperty("verdict");
    expect(result).toHaveProperty("blockers");
    expect(result).toHaveProperty("concerns");
    expect(result).toHaveProperty("notes");
    expect(result).toHaveProperty("auditLogPageId");
    expect(result).toHaveProperty("autoPromoted");
    expect(["PASS", "PASS_WITH_CONCERNS", "BLOCK"]).toContain(result.verdict);
    expect(Array.isArray(result.blockers)).toBe(true);
    expect(Array.isArray(result.concerns)).toBe(true);
    expect(Array.isArray(result.notes)).toBe(true);
    expect(typeof result.autoPromoted).toBe("boolean");
  });
});

describe("parseReviewerResponse (unit)", () => {
  test("extracts sections in order: Summary, Blockers, Concerns, Notes, Verdict", () => {
    const parsed = parseReviewerResponse(FIXTURE_BLOCK);
    expect(parsed.summary).toContain("scope creep");
    expect(parsed.blockers.length).toBeGreaterThan(0);
    expect(parsed.concerns.length).toBeGreaterThan(0);
    expect(parsed.notes.length).toBeGreaterThan(0);
    expect(parsed.verdict).toBe("BLOCK");
  });

  test("ignores 'None' / 'N/A' placeholders in empty sections", () => {
    const parsed = parseReviewerResponse(FIXTURE_PASS);
    expect(parsed.blockers).toHaveLength(0);
    expect(parsed.concerns).toHaveLength(0);
  });
});
