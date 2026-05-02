#!/usr/bin/env tsx
/**
 * Card-ref transition script
 *
 * Used by the post-commit and CI-merge hooks to scan a commit message for
 * Card-NN references and trigger the appropriate Notion Blackboard state
 * transition.
 *
 * Patterns recognized in commit messages (case-insensitive):
 *   Card-12, card-12, Card 12, card 12
 *   Card-J, Card-K, Card-L (single-letter card identifiers)
 *   sandbox-YYYY-MM-DD-<area_key>           -- canonical Card ID format
 *
 * The first format is mapped to a Card ID by reading the latest manifest
 * delta in docs/migration-manifest-deltas/. If no manifest is found, the
 * raw "Card-12" string is logged and no transition is fired.
 *
 * Usage:
 *   tsx scripts/blackboard-card-ref-transition.ts \
 *     --commit-sha=<sha> \
 *     --commit-message-file=<path> \
 *     --to-state="Dave In Progress" \
 *     --actor=GitHook \
 *     [--branch=<branch>]
 *
 * Exits 0 always -- a failure in the transition layer should never block
 * the underlying git operation. Errors are logged.
 */

import * as fs from "fs";
import {
  transitionCard,
  type CardState,
  type Actor,
} from "../src/services/blackboard/stateTransitions";

interface Args {
  commitSha: string;
  commitMessageFile?: string;
  commitMessageInline?: string;
  toState: CardState;
  actor: Actor;
  branch: string;
}

function parseArgs(): Args {
  const args: Record<string, string> = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return {
    commitSha: args["commit-sha"] || "",
    commitMessageFile: args["commit-message-file"],
    commitMessageInline: args["commit-message"],
    toState: (args["to-state"] || "Dave In Progress") as CardState,
    actor: (args["actor"] || "GitHook") as Actor,
    branch: args["branch"] || "sandbox",
  };
}

function readMessage(args: Args): string {
  if (args.commitMessageInline) return args.commitMessageInline;
  if (args.commitMessageFile && fs.existsSync(args.commitMessageFile)) {
    return fs.readFileSync(args.commitMessageFile, "utf8");
  }
  return "";
}

/**
 * Extract every plausible card reference from a commit message.
 * Returns canonical Card IDs (sandbox-YYYY-MM-DD-...) where they appear,
 * plus raw Card-NN tokens for downstream resolution.
 */
function extractCardRefs(message: string): {
  canonical: string[];
  raw: string[];
} {
  const canonical = new Set<string>();
  const raw = new Set<string>();

  // Canonical Card ID format
  for (const match of message.matchAll(/sandbox-\d{4}-\d{2}-\d{2}-[a-z_]+/g)) {
    canonical.add(match[0]);
  }

  // Card-N or Card-A tokens (numeric or single-letter)
  for (const match of message.matchAll(/\bcard[-_ ]([A-Z]|\d{1,3})\b/gi)) {
    raw.add(`card-${match[1].toUpperCase()}`);
  }

  return {
    canonical: Array.from(canonical),
    raw: Array.from(raw),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.commitSha) {
    console.error("[card-ref-transition] commit-sha is required");
    process.exit(0); // never block
  }
  const message = readMessage(args);
  if (!message) {
    console.log("[card-ref-transition] no commit message available -- skipping");
    process.exit(0);
  }

  const { canonical, raw } = extractCardRefs(message);
  if (canonical.length === 0 && raw.length === 0) {
    console.log("[card-ref-transition] no card references in commit -- skipping");
    process.exit(0);
  }

  const reason = `${args.actor} detected card reference in commit ${args.commitSha.slice(0, 8)} on branch ${args.branch}.`;
  const linkedArtifacts: string[] = [];
  if (process.env.GITHUB_REPOSITORY) {
    linkedArtifacts.push(
      `https://github.com/${process.env.GITHUB_REPOSITORY}/commit/${args.commitSha}`,
    );
  }

  for (const cardId of canonical) {
    try {
      const r = await transitionCard({
        cardId,
        toState: args.toState,
        actor: args.actor,
        reason,
        linkedArtifacts,
      });
      if (r.success) {
        console.log(
          `[card-ref-transition] ${cardId}: ${r.fromState} -> ${r.toState}`,
        );
      } else {
        console.log(
          `[card-ref-transition] ${cardId}: skip (${r.error})`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[card-ref-transition] ${cardId} failed:`, message);
    }
  }

  if (raw.length > 0) {
    console.log(
      `[card-ref-transition] non-canonical refs detected (${raw.join(", ")}). Resolution against manifest deltas not yet wired -- skipping.`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[card-ref-transition] fatal:", err);
  process.exit(0);
});
