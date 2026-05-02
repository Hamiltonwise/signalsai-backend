/**
 * Manual driver for the Reviewer Claude Gate (Build A).
 *
 * Usage:
 *   npx tsx scripts/run-reviewer-gate.ts --artifact <path> [options]
 *
 * Options:
 *   --artifact <path>          Path to the artifact file (markdown, plain text)
 *   --source <name>            Human label for the artifact (default: filename)
 *   --linked-url <url>         Source-of-truth URL (Notion, GitHub, etc.)
 *   --no-auto-promote          Disable PASS auto-promotion to Sandbox Card Inbox
 *   --slack-channel <id>       Override ALLORO_DEV_SLACK_CHANNEL_ID
 *   --model <model>            Override claude-opus-4-7
 *   --raw-response <path>      Skip Claude call; parse this file as the response (testing)
 *
 * Required env:
 *   ANTHROPIC_API_KEY          For the Claude API call
 *   NOTION_TOKEN               For the audit log + auto-promotion writes
 *   ALLORO_DEV_SLACK_CHANNEL_ID + SLACK_BOT_TOKEN  (optional; gracefully skipped if unset)
 *   COREY_SLACK_USER_ID        Optional; gives @-mention on non-PASS verdicts
 */

import * as fs from "fs";
import { runReviewerClaudeOnArtifact } from "../src/services/agents/reviewerClaude";

async function main() {
  const args = process.argv.slice(2);
  const opts: {
    artifactPath?: string;
    artifactSource?: string;
    linkedArtifactUrl?: string;
    autoPromoteOnPass?: boolean;
    slackChannelId?: string;
    model?: string;
    rawResponseOverride?: string;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--artifact") opts.artifactPath = args[++i];
    else if (a === "--source") opts.artifactSource = args[++i];
    else if (a === "--linked-url") opts.linkedArtifactUrl = args[++i];
    else if (a === "--no-auto-promote") opts.autoPromoteOnPass = false;
    else if (a === "--slack-channel") opts.slackChannelId = args[++i];
    else if (a === "--model") opts.model = args[++i];
    else if (a === "--raw-response") {
      const rawPath = args[++i];
      opts.rawResponseOverride = fs.readFileSync(rawPath, "utf8");
    }
  }

  if (!opts.artifactPath && !opts.rawResponseOverride) {
    console.error(
      "[run-reviewer-gate] --artifact <path> is required (or --raw-response for testing).",
    );
    process.exit(1);
  }

  const result = await runReviewerClaudeOnArtifact(opts);

  console.log("");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`Reviewer Gate verdict: ${result.verdict}`);
  console.log(`Artifact:              ${result.artifactSource}`);
  console.log(`Blockers:              ${result.blockers.length}`);
  console.log(`Concerns:              ${result.concerns.length}`);
  console.log(`Notes:                 ${result.notes.length}`);
  console.log(`Auto-promoted:         ${result.autoPromoted}`);
  if (result.auditLogPageUrl) {
    console.log(`Audit log page:        ${result.auditLogPageUrl}`);
  }
  if (result.slackMessageTs) {
    console.log(`Slack message ts:      ${result.slackMessageTs}`);
  }
  console.log("══════════════════════════════════════════════════════════════");

  if (result.blockers.length > 0) {
    console.log("");
    console.log("BLOCKERS:");
    result.blockers.forEach((f, i) => {
      console.log(`  ${i + 1}. [Check ${f.check || "?"}] ${f.finding}`);
    });
  }
  if (result.concerns.length > 0) {
    console.log("");
    console.log("CONCERNS:");
    result.concerns.forEach((f, i) => {
      console.log(`  ${i + 1}. [Check ${f.check || "?"}] ${f.finding}`);
    });
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[run-reviewer-gate] failed:", err);
  process.exit(1);
});
