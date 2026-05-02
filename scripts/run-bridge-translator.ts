/**
 * Manual driver for the Bridge Translator agent.
 *
 * Usage:
 *   npx tsx scripts/run-bridge-translator.ts                      # shadow mode, anchor from DB or V2
 *   npx tsx scripts/run-bridge-translator.ts --anchor <sha>       # explicit anchor
 *   npx tsx scripts/run-bridge-translator.ts --head <sha>         # explicit head
 *   npx tsx scripts/run-bridge-translator.ts --dry-run             # do not write file or DB row
 *   npx tsx scripts/run-bridge-translator.ts --active              # active mode (real handoff)
 *   npx tsx scripts/run-bridge-translator.ts --session             # per-CC-session mode (writes to Sandbox Card Inbox)
 *   npx tsx scripts/run-bridge-translator.ts --no-auto-promote     # do not auto-promote PASS cards
 *
 * Session mode requires SESSION_ANCHOR_COMMIT env var to be set, OR
 * pass --anchor explicitly to override.
 *
 * For the V3 catch-up: runs from V2 anchor to HEAD by default.
 */

import { runBridgeTranslator } from "../src/services/agents/bridgeTranslator";

async function main() {
  const args = process.argv.slice(2);
  const opts: any = { mode: "shadow" };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--anchor") opts.anchorOverride = args[++i];
    else if (a === "--head") opts.headOverride = args[++i];
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--active") opts.mode = "active";
    else if (a === "--session") opts.mode = "session";
    else if (a === "--no-auto-promote") opts.autoPromoteOnPass = false;
  }

  console.log(`[runner] options:`, opts);
  const { delta, manifestPath, markdown, sessionOutcomes } =
    await runBridgeTranslator(opts);

  console.log("");
  console.log(`[runner] ${delta.cards.length} cards generated.`);
  console.log(`[runner] ${delta.orphans.length} orphan commits.`);
  if (manifestPath) {
    console.log(`[runner] file: ${manifestPath}`);
  } else {
    console.log(`[runner] dry-run: no file written. Markdown length: ${markdown.length}`);
  }
  if (sessionOutcomes.length > 0) {
    console.log(`[runner] session outcomes:`);
    for (const o of sessionOutcomes) {
      console.log(
        `   - ${o.cardId}: ${o.reviewer.verdict} (B${o.reviewer.counts.blocker}/C${o.reviewer.counts.concern}/N${o.reviewer.counts.note}) inbox ${o.inbox.status} -> ${o.inbox.pageUrl}`,
      );
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[runner] failed:", err);
  process.exit(1);
});
