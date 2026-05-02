/**
 * Bridge Translator Agent -- Execution Service
 *
 * Closes the loop between sandbox commits and Dave-Ready Migration Manifests.
 *
 * Runs Friday 19:00 PT (Saturday 02:00 UTC) before Dave's Monday work week.
 * Reads git log between the last manifest's anchor and HEAD on sandbox.
 * Groups commits by functional area, generates Migration Manifest cards in
 * Dave's validated format, runs the pattern alignment audit, and writes a
 * delta document to docs/migration-manifest-deltas/YYYY-MM-DD.md.
 *
 * Format reference: docs/MIGRATION-MANIFEST-V2.md
 * Protocol reference: memory/context/operating-protocol.md
 *
 * Modes:
 *  - SHADOW: produce the manifest delta, write file, log summary, do not auto-send
 *  - ACTIVE: produce the manifest delta, write file, post summary to #alloro-dev
 *  - SESSION: per-CC-session commit-trigger. Reads commits since SESSION_ANCHOR_COMMIT
 *    (set by CC at session start), writes one card per functional area to the
 *    "Sandbox Card Inbox" Notion database, runs Reviewer Claude (Build A) per card,
 *    and updates each row's Reviewer Gate Verdict. Zero commits = zero cards (no
 *    noise for Jo). Same Card ID = update in place (no duplicates on re-run).
 *
 * The agent never edits prior manifests. Each delta is additive, with cards
 * numbered continuing from the prior manifest. Cole reviews shadow output
 * before authorizing active mode. Session mode runs alongside the weekly
 * shadow/active backstop -- they do not replace each other.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { db } from "../../database/connection";
import { checkSafety } from "./safetyAgent";
import {
  runReviewerClaude,
  renderReviewerMarkdown,
  shouldAutoPromote,
  type ReviewerResult,
} from "./reviewerClaude";
import {
  upsertCard,
  buildCardId,
  mapFunctionalArea,
  type UpsertCardResult,
} from "./sandboxCardInbox";
import { transitionCard } from "../blackboard/stateTransitions";
import { processReviewerVerdict } from "../blackboard/reviewerGateBridge";

// ── Constants ──────────────────────────────────────────────────────

/**
 * Fallback anchor for the first run (no prior manifest in DB).
 * This is the commit at which Migration Manifest V2 was written.
 * V3 catch-up extends from this anchor to HEAD.
 */
const V2_ANCHOR_COMMIT = "9c1a532d";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const MANIFEST_DELTA_DIR = path.join(
  REPO_ROOT,
  "docs",
  "migration-manifest-deltas",
);

/**
 * Functional-area path patterns. Each commit's changed files are matched
 * against these. First matching area wins. Anything matching none becomes
 * an orphan flagged in the Open Questions section.
 *
 * Locked from the prior CC verification audit. Order matters: more specific
 * paths come first.
 */
interface FunctionalArea {
  key: string;
  label: string;
  patterns: RegExp[];
}

const FUNCTIONAL_AREAS: FunctionalArea[] = [
  // Customer pages (the five-page dashboard)
  {
    key: "customer_pages",
    label: "Five Customer Pages (Home / Compare / Reviews / Presence / Progress)",
    patterns: [
      /^frontend\/src\/pages\/(HomePage|ComparePage|ReviewsPage|PresencePage|ProgressPage|FivePageLayout)/i,
      /^frontend\/src\/components\/(HomePage|ComparePage|ReviewsPage|PresencePage|ProgressPage)\//i,
    ],
  },
  // Reviewer / quality-gate infrastructure
  {
    key: "reviewer_gate",
    label: "Reviewer & Quality-Gate Infrastructure",
    patterns: [
      /^src\/services\/siteQa\//,
      /^src\/services\/agents\/(safetyAgent|systemConductor|goNoGo|conductorGate)\.ts$/,
      /^scripts\/(constitution-check|content-quality-lint|data-flow-audit|vertical-sweep|sanity-check)\.sh$/,
    ],
  },
  // Agentic dream team
  {
    key: "dream_team",
    label: "Agentic Dream Team",
    patterns: [
      /^src\/services\/agents\//,
      /^src\/jobs\/(competitiveMonitoring|csPulse|productEvolution|weeklyDigest|trialEmails|winbackEmails)\.ts$/,
      /^frontend\/src\/pages\/admin\/(DreamTeam|AgentStatus|Canon)/i,
    ],
  },
  // Practice / Business Analyzer
  {
    key: "practice_analyzer",
    label: "Practice Analyzer (Checkup Funnel)",
    patterns: [
      /^frontend\/src\/pages\/(Checkup|EntryScreen|ScanningTheater|ResultsScreen|UploadPrompt|ColleagueShare)/i,
      /^src\/routes\/(checkup|practice-analyzer)\//i,
      /^src\/services\/checkup\//,
    ],
  },
  // PatientPath template + builder
  {
    key: "patientpath",
    label: "PatientPath Template & Site Builder",
    patterns: [
      /^src\/services\/patientpath\//,
      /^src\/jobs\/patientpathCrawler\.ts$/,
      /^src\/workers\/patientpathBuildWorker\.ts$/,
      /^frontend\/src\/components\/PageEditor\//,
      /^frontend\/src\/pages\/(WebsiteEditor|PatientPath)/i,
    ],
  },
  // Monday email path
  {
    key: "monday_email",
    label: "Monday Email Path",
    patterns: [
      /^src\/services\/(mondayEmail|trialEmailService|winbackEmail)/,
      /^src\/jobs\/(mondayEmail|trialEmails|winbackEmails)\.ts$/,
      /^src\/routes\/admin\/(monday-emails|email)/i,
      /^frontend\/src\/pages\/admin\/(MondayEmail|EmailQueue)/i,
    ],
  },
  // GBP integration
  {
    key: "gbp",
    label: "Google Business Profile Integration",
    patterns: [
      /^src\/services\/gbp\//,
      /^src\/routes\/.*\/gbp/i,
      /^src\/services\/google\/(businessProfile|gbp)/,
    ],
  },
  // GSC integration
  {
    key: "gsc",
    label: "Google Search Console Integration",
    patterns: [
      /^src\/services\/gsc\//,
      /^src\/services\/google\/(searchConsole|gsc)/,
      /^src\/routes\/.*\/gsc/i,
    ],
  },
  // Referrals / PMS (high-traffic recent area)
  {
    key: "referrals_pms",
    label: "Referrals & PMS Pipeline",
    patterns: [
      /^src\/services\/(pms|referral)/i,
      /^src\/controllers\/(pms|referral)/i,
      /^src\/routes\/.*(pms|referral)/i,
      /^src\/services\/alerts\//,
      /^frontend\/src\/(pages|components)\/(Referral|PMS)/i,
    ],
  },
  // Database migrations
  {
    key: "migrations",
    label: "Database Migrations",
    patterns: [/^src\/database\/migrations\//],
  },
  // Infrastructure
  {
    key: "infrastructure",
    label: "Infrastructure (workers, queues, scripts, config)",
    patterns: [
      /^src\/workers\//,
      /^src\/jobs\/(?!.*Email|.*Crawler|patientpathBuildWorker)/,
      /^scripts\//,
      /^ecosystem\.config/,
      /^\.github\/workflows\//,
    ],
  },
];

/**
 * Pattern-alignment rules. Locked from the April 12 audit. Run on every
 * NEW file in the delta scope. Modified files inherit prior pattern state.
 */
interface PatternRule {
  key: string;
  label: string;
  /** Returns array of violations (file:line: description) for the file */
  check: (filePath: string, content: string) => string[];
}

const PATTERN_RULES: PatternRule[] = [
  {
    key: "success_boolean",
    label: "success:boolean on every error response in route files",
    check: (filePath, content) => {
      if (!filePath.startsWith("src/routes/")) return [];
      const violations: string[] = [];
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        if (/json\(\{\s*error:/.test(line) && !/success:/.test(line)) {
          // Check next line in case success: is on its own line
          const nextLine = lines[i + 1] || "";
          if (!/success:/.test(nextLine)) {
            violations.push(`${filePath}:${i + 1}: error response missing success: false`);
          }
        }
      });
      return violations;
    },
  },
  {
    key: "tag_console",
    label: "[Tag] prefix on console.log in route files",
    check: (filePath, content) => {
      if (!filePath.startsWith("src/routes/")) return [];
      const violations: string[] = [];
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        const match = line.match(/console\.(log|warn|error|info)\(/);
        if (match && !line.includes("[")) {
          violations.push(`${filePath}:${i + 1}: console.${match[1]} without [Tag] prefix`);
        }
      });
      return violations;
    },
  },
  {
    key: "jsdoc_header",
    label: "JSDoc header on new route files",
    check: (filePath, content) => {
      if (!filePath.startsWith("src/routes/")) return [];
      if (!filePath.endsWith(".ts")) return [];
      const firstNonEmpty = content
        .split("\n")
        .find((l) => l.trim().length > 0);
      if (!firstNonEmpty || !firstNonEmpty.trim().startsWith("/**")) {
        return [`${filePath}:1: route file missing JSDoc header at top`];
      }
      return [];
    },
  },
  {
    key: "default_export",
    label: "export default on new pages",
    check: (filePath, content) => {
      if (!filePath.startsWith("frontend/src/pages/")) return [];
      if (!/\.tsx?$/.test(filePath)) return [];
      if (!/export\s+default\s+/.test(content)) {
        return [`${filePath}: page file missing export default`];
      }
      return [];
    },
  },
  {
    key: "api_base_url",
    label: "API_BASE_URL env var rather than hardcoded URLs in frontend",
    check: (filePath, content) => {
      if (!filePath.startsWith("frontend/src/")) return [];
      const violations: string[] = [];
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        if (/['"`]https?:\/\/(localhost|api\.alloro|sandbox\.alloro|app\.alloro)/.test(line)) {
          violations.push(`${filePath}:${i + 1}: hardcoded URL — use API_BASE_URL`);
        }
      });
      return violations;
    },
  },
];

// ── Types ──────────────────────────────────────────────────────────

export type Mode = "shadow" | "active" | "session";
export type BlastRadius = "Green" | "Yellow" | "Red";
export type Complexity = "Low" | "Medium" | "High";

export interface Commit {
  sha: string;
  shortSha: string;
  subject: string;
  author: string;
  date: string;
  files: string[];
  newFiles: string[];
  modifiedFiles: string[];
  additions: number;
  deletions: number;
}

export interface PatternViolation {
  rule: string;
  detail: string;
}

export interface Card {
  number: number;
  title: string;
  blastRadius: BlastRadius;
  complexity: Complexity;
  dependencies: string;
  filesAffected: { path: string; kind: "new" | "modified" }[];
  touches: {
    database: boolean;
    auth: boolean;
    billing: boolean;
    newApiEndpoint: boolean;
  };
  verificationTests: string[];
  doneGate: string;
  commits: Commit[];
  violations: PatternViolation[];
  /** True if any commit was orphaned but later resolved to this card */
  notes?: string[];
}

export interface ManifestDelta {
  generatedAt: string;
  anchorCommit: string;
  headCommit: string;
  totalCommits: number;
  cards: Card[];
  orphans: { commit: Commit; reason: string }[];
  selfCheck: {
    voicePass: boolean;
    consistencyPass: boolean;
    safetyPass: boolean;
    voiceFlags: string[];
    consistencyFlags: string[];
    safetyFlags: string[];
  };
  startingCardNumber: number;
}

export interface RunOptions {
  mode?: Mode;
  /** Override anchor commit. If omitted, reads from bridge_manifests table or falls back to V2_ANCHOR_COMMIT. */
  anchorOverride?: string;
  /** Override head commit. Defaults to HEAD. */
  headOverride?: string;
  /** If true, do not write file or DB row. Returns delta only. */
  dryRun?: boolean;
  /**
   * Session-mode auto-promotion. When true, PASS-verdict cards land with their
   * verdict applied directly. Red blast radius always pauses for Corey
   * regardless. Defaults to true in session mode.
   */
  autoPromoteOnPass?: boolean;
}

/**
 * Session-mode result. One entry per card written to the Sandbox Card Inbox.
 */
export interface SessionCardOutcome {
  cardNumber: number;
  cardTitle: string;
  cardId: string;
  functionalArea: string;
  reviewer: ReviewerResult;
  inbox: UpsertCardResult;
  autoPromoted: boolean;
}

export interface SessionRunResult {
  delta: ManifestDelta;
  manifestPath?: string;
  markdown: string;
  /** Populated only in session mode; one entry per card written to the inbox. */
  sessionOutcomes: SessionCardOutcome[];
}

// ── Main Entry ─────────────────────────────────────────────────────

/**
 * Run the Bridge Translator. Produces a Migration Manifest delta from
 * commits between the last manifest's anchor and HEAD on sandbox.
 *
 * Session-mode callers should use `runBridgeTranslatorSession()` for the
 * typed return shape that includes per-card inbox + reviewer outcomes.
 */
export async function runBridgeTranslator(
  opts: RunOptions = {},
): Promise<SessionRunResult> {
  const mode: Mode = opts.mode || "shadow";
  console.log(`[BridgeTranslator] Starting run in ${mode.toUpperCase()} mode`);

  // Step 1: resolve anchor + head
  const { anchor, head, startingCardNumber } = await resolveRange(opts, mode);
  console.log(
    `[BridgeTranslator] Range: ${anchor}..${head} (starting card ${startingCardNumber})`,
  );

  // Step 2: read commits
  const commits = readCommits(anchor, head);
  console.log(`[BridgeTranslator] Read ${commits.length} commits`);

  // Step 3: group by functional area
  const grouped = groupByFunctionalArea(commits);
  const orphans = grouped.orphans;
  console.log(
    `[BridgeTranslator] Grouped into ${Object.keys(grouped.byArea).length} areas, ${orphans.length} orphans, ${grouped.docsOnly.length} docs-only commits filtered`,
  );

  // Step 4: generate cards (one per non-empty area), simplest-first
  const cards: Card[] = [];
  let cardNumber = startingCardNumber;
  const areaKeys = orderAreasSimplestFirst(Object.keys(grouped.byArea));
  for (const areaKey of areaKeys) {
    const areaCommits = grouped.byArea[areaKey];
    if (areaCommits.length === 0) continue;
    const area = FUNCTIONAL_AREAS.find((a) => a.key === areaKey)!;
    const card = generateCard(cardNumber, area, areaCommits);
    cards.push(card);
    cardNumber += 1;
  }

  // Step 5: self-checks (voice, consistency, safety)
  const markdownDraft = composeManifest({
    generatedAt: new Date().toISOString(),
    anchorCommit: anchor,
    headCommit: head,
    totalCommits: commits.length,
    cards,
    orphans: orphans.map((c) => ({ commit: c, reason: "no functional area matched" })),
    selfCheck: {
      voicePass: true,
      consistencyPass: true,
      safetyPass: true,
      voiceFlags: [],
      consistencyFlags: [],
      safetyFlags: [],
    },
    startingCardNumber,
  });

  const voiceCheck = manifestVoiceCheck(markdownDraft);
  const consistencyCheck = await manifestConsistencyCheck(cards);
  const safetyCheck = await checkSafety({
    text: markdownDraft,
    context: "internal",
  });

  // Critical PII = SSN, credit card, real email/phone, credentials.
  // "patient name" / dollar-figures-without-estimated are common false-positives
  // in commit subjects and are informational only for an internal dev manifest.
  const CRITICAL_PII_TOKENS = ["SSN", "credit card", "credential", "API key", "token"];
  const criticalSafetyFlags = safetyCheck.flags.filter((f) =>
    CRITICAL_PII_TOKENS.some((tok) => f.toLowerCase().includes(tok.toLowerCase())),
  );

  const delta: ManifestDelta = {
    generatedAt: new Date().toISOString(),
    anchorCommit: anchor,
    headCommit: head,
    totalCommits: commits.length,
    cards,
    orphans: orphans.map((c) => ({
      commit: c,
      reason: classifyOrphan(c),
    })),
    selfCheck: {
      voicePass: voiceCheck.length === 0,
      consistencyPass: consistencyCheck.length === 0,
      safetyPass: criticalSafetyFlags.length === 0,
      voiceFlags: voiceCheck,
      consistencyFlags: consistencyCheck,
      safetyFlags: safetyCheck.flags,
    },
    startingCardNumber,
  };

  // Step 6: compose final markdown with self-check results
  const markdown = composeManifest(delta);

  // Step 7: write file + DB row (unless dry run)
  let manifestPath: string | undefined;
  if (!opts.dryRun) {
    manifestPath = await writeManifestFile(delta, markdown);
    await recordManifestRun(delta, manifestPath, mode);
  }

  // Step 8: post summary based on mode
  let sessionOutcomes: SessionCardOutcome[] = [];
  if (mode === "session") {
    sessionOutcomes = await writeCardsToSandboxInbox(delta, manifestPath, opts);
    logSessionSummary(delta, sessionOutcomes, manifestPath);
  } else if (mode === "active" && !opts.dryRun) {
    await postActiveSummary(delta, manifestPath!);
  } else {
    logShadowSummary(delta, manifestPath);
  }

  console.log(
    `[BridgeTranslator] Run complete. ${cards.length} cards, ${orphans.length} orphans.`,
  );

  return { delta, manifestPath, markdown, sessionOutcomes };
}

/**
 * Convenience wrapper for session mode. Equivalent to
 * runBridgeTranslator({ mode: "session", ... }).
 */
export async function runBridgeTranslatorSession(
  opts: Omit<RunOptions, "mode"> = {},
): Promise<SessionRunResult> {
  return runBridgeTranslator({ ...opts, mode: "session" });
}

// ── Step 1: Resolve anchor + head ──────────────────────────────────

async function resolveRange(
  opts: RunOptions,
  mode: Mode,
): Promise<{
  anchor: string;
  head: string;
  startingCardNumber: number;
}> {
  const head =
    opts.headOverride ||
    execSync("git rev-parse HEAD", { cwd: REPO_ROOT }).toString().trim();

  if (opts.anchorOverride) {
    return { anchor: opts.anchorOverride, head, startingCardNumber: 1 };
  }

  // Session mode: anchor comes from SESSION_ANCHOR_COMMIT env var (CC sets
  // this at session start). Card numbering restarts at 1 — session cards
  // live in the Sandbox Card Inbox, not in the V2 numbering sequence.
  if (mode === "session") {
    const sessionAnchor = process.env.SESSION_ANCHOR_COMMIT;
    if (!sessionAnchor) {
      throw new Error(
        "[BridgeTranslator] SESSION_ANCHOR_COMMIT env var is required for session mode. CC sets this at session start.",
      );
    }
    return {
      anchor: sessionAnchor.trim(),
      head,
      startingCardNumber: 1,
    };
  }

  // Read latest from bridge_manifests
  let anchor = V2_ANCHOR_COMMIT;
  let startingCardNumber = 14; // V2 ended at card 13

  try {
    const hasTable = await db.schema.hasTable("bridge_manifests");
    if (hasTable) {
      const last = await db("bridge_manifests")
        .orderBy("generated_at", "desc")
        .first();
      if (last) {
        anchor = last.head_commit || V2_ANCHOR_COMMIT;
        startingCardNumber = (last.last_card_number || 13) + 1;
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[BridgeTranslator] Could not read bridge_manifests, falling back to V2 anchor:`,
      message,
    );
  }

  return { anchor, head, startingCardNumber };
}

// ── Step 2: Read commits ───────────────────────────────────────────

function readCommits(anchor: string, head: string): Commit[] {
  // Use --no-merges to skip merge commits. Format with field separator.
  const SEP = "<<<COMMIT-SEP>>>";
  const FSEP = "<<<FIELD-SEP>>>";
  const fmt = ["%H", "%h", "%s", "%an", "%aI"].join(FSEP);

  let raw: string;
  try {
    raw = execSync(
      `git log --no-merges --format="${SEP}${fmt}" ${anchor}..${head}`,
      { cwd: REPO_ROOT, maxBuffer: 50 * 1024 * 1024 },
    ).toString();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[BridgeTranslator] git log failed:`, message);
    return [];
  }

  const blocks = raw.split(SEP).filter((b) => b.trim().length > 0);
  const commits: Commit[] = [];

  for (const block of blocks) {
    const [sha, shortSha, subject, author, date] = block.trim().split(FSEP);
    if (!sha) continue;

    // Get changed files for this commit with status
    let nameStatus = "";
    try {
      nameStatus = execSync(
        `git show --name-status --format= ${sha}`,
        { cwd: REPO_ROOT, maxBuffer: 50 * 1024 * 1024 },
      ).toString();
    } catch {
      // skip
    }

    const newFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const allFiles: string[] = [];
    for (const line of nameStatus.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split("\t");
      if (parts.length < 2) continue;
      const status = parts[0];
      const file = parts[parts.length - 1];
      allFiles.push(file);
      if (status === "A") newFiles.push(file);
      else if (status === "M") modifiedFiles.push(file);
    }

    // Get additions/deletions
    let additions = 0;
    let deletions = 0;
    try {
      const stat = execSync(
        `git show --shortstat --format= ${sha}`,
        { cwd: REPO_ROOT, maxBuffer: 10 * 1024 * 1024 },
      ).toString();
      const addMatch = stat.match(/(\d+) insertion/);
      const delMatch = stat.match(/(\d+) deletion/);
      if (addMatch) additions = parseInt(addMatch[1], 10);
      if (delMatch) deletions = parseInt(delMatch[1], 10);
    } catch {
      // skip
    }

    commits.push({
      sha,
      shortSha,
      subject,
      author,
      date,
      files: allFiles,
      newFiles,
      modifiedFiles,
      additions,
      deletions,
    });
  }

  return commits;
}

// ── Step 3: Group by functional area ───────────────────────────────

/**
 * Files that are documentation/process only and don't represent a deployable
 * change for Dave. Commits where ALL files match this list are filtered as
 * "docs_only" rather than carded.
 */
function isDocsOnlyFile(file: string): boolean {
  return (
    /^(CLAUDE\.md|CURRENT-SPRINT\.md|TASKS\.md|README\.md)$/.test(file) ||
    /^\.claude\//.test(file) ||
    /^docs\//.test(file) ||
    /^briefs\//.test(file) ||
    /^memory\//.test(file)
  );
}

function groupByFunctionalArea(commits: Commit[]): {
  byArea: Record<string, Commit[]>;
  orphans: Commit[];
  docsOnly: Commit[];
} {
  const byArea: Record<string, Commit[]> = {};
  const orphans: Commit[] = [];
  const docsOnly: Commit[] = [];

  for (const commit of commits) {
    if (commit.files.length === 0) {
      orphans.push(commit);
      continue;
    }

    // Filter pure-docs commits — they don't deploy
    if (commit.files.every(isDocsOnlyFile)) {
      docsOnly.push(commit);
      continue;
    }

    // Score each area by file-match count. Highest wins.
    // Mixed-concern commits go to whichever area has the most files,
    // but we tag them with a note.
    const scores: Record<string, number> = {};
    for (const file of commit.files) {
      for (const area of FUNCTIONAL_AREAS) {
        for (const pattern of area.patterns) {
          if (pattern.test(file)) {
            scores[area.key] = (scores[area.key] || 0) + 1;
            break; // one match per area per file
          }
        }
      }
    }

    const matchedAreas = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (matchedAreas.length === 0) {
      orphans.push(commit);
      continue;
    }

    const winnerKey = matchedAreas[0][0];
    if (!byArea[winnerKey]) byArea[winnerKey] = [];
    byArea[winnerKey].push(commit);
  }

  return { byArea, orphans, docsOnly };
}

function classifyOrphan(commit: Commit): string {
  if (commit.files.length === 0) {
    return "commit has no file changes (likely empty or merge)";
  }
  const areas = new Set<string>();
  for (const file of commit.files) {
    for (const area of FUNCTIONAL_AREAS) {
      if (area.patterns.some((p) => p.test(file))) {
        areas.add(area.key);
        break;
      }
    }
  }
  if (areas.size === 0) {
    return `no functional area matched any of the ${commit.files.length} files`;
  }
  return `mixed-concern across ${areas.size} areas: ${Array.from(areas).join(", ")}`;
}

function orderAreasSimplestFirst(areaKeys: string[]): string[] {
  // Simplest-first ordering: the order in FUNCTIONAL_AREAS is reverse-sorted
  // by complexity (customer pages first, infrastructure last). We want the
  // OPPOSITE for simplest-first delivery: pure frontend before service-touch
  // before migration before infra.
  const order = [
    "customer_pages", // pure frontend
    "patientpath", // mixed but mostly frontend
    "practice_analyzer", // mixed
    "referrals_pms", // service-touch
    "monday_email", // service + email
    "gbp", // external API
    "gsc", // external API
    "dream_team", // multi-system
    "reviewer_gate", // multi-system
    "migrations", // schema changes
    "infrastructure", // cross-cutting
  ];
  const indexed = order.reduce<Record<string, number>>((acc, k, i) => {
    acc[k] = i;
    return acc;
  }, {});
  return areaKeys.sort((a, b) => (indexed[a] ?? 99) - (indexed[b] ?? 99));
}

// ── Step 4: Generate cards ─────────────────────────────────────────

function generateCard(
  cardNumber: number,
  area: FunctionalArea,
  commits: Commit[],
): Card {
  // Aggregate files
  const fileMap = new Map<string, "new" | "modified">();
  for (const commit of commits) {
    for (const f of commit.newFiles) fileMap.set(f, "new");
    for (const f of commit.modifiedFiles) {
      if (!fileMap.has(f)) fileMap.set(f, "modified");
    }
  }
  const filesAffected = Array.from(fileMap.entries())
    .map(([path, kind]) => ({ path, kind }))
    .sort((a, b) => a.path.localeCompare(b.path));

  // Touches
  const touches = assessTouches(filesAffected.map((f) => f.path));

  // Blast radius
  const blastRadius = assessBlastRadius(filesAffected.map((f) => f.path), touches);

  // Complexity
  const complexity = assessComplexity(filesAffected, touches);

  // Pattern audit on new files
  const violations: PatternViolation[] = [];
  for (const { path: filePath, kind } of filesAffected) {
    if (kind !== "new") continue;
    const fullPath = path.join(REPO_ROOT, filePath);
    if (!fs.existsSync(fullPath)) continue; // file may have been deleted later
    let content: string;
    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }
    for (const rule of PATTERN_RULES) {
      const ruleViolations = rule.check(filePath, content);
      for (const v of ruleViolations) {
        violations.push({ rule: rule.key, detail: v });
      }
    }
  }

  // Verification tests
  const verificationTests = generateVerificationTests(area, filesAffected, touches);

  // Done gate
  const doneGate =
    "All verification tests pass? Yes = next card. No = fix before proceeding.";

  // Notes if violations exist
  const notes: string[] = [];
  if (violations.length > 0) {
    notes.push(
      `${violations.length} pattern-alignment violation(s) flagged. Resolve before merging.`,
    );
  }

  return {
    number: cardNumber,
    title: area.label,
    blastRadius,
    complexity,
    dependencies: "review prior cards before deploy",
    filesAffected,
    touches,
    verificationTests,
    doneGate,
    commits,
    violations,
    notes: notes.length > 0 ? notes : undefined,
  };
}

function assessTouches(files: string[]): Card["touches"] {
  const database = files.some((f) => /^src\/database\/migrations\//.test(f));
  const auth = files.some((f) =>
    /^src\/(routes\/auth|middleware\/auth|services\/auth)/.test(f),
  );
  const billing = files.some((f) =>
    /(billing|stripe|trial|subscription)/i.test(f),
  );
  const newApiEndpoint = files.some((f) => /^src\/routes\/.+\.ts$/.test(f));
  return { database, auth, billing, newApiEndpoint };
}

function assessBlastRadius(
  files: string[],
  touches: Card["touches"],
): BlastRadius {
  // Red: trial/billing, auth, anything Google API write, production data integrity
  if (touches.billing || touches.auth) return "Red";
  if (
    files.some((f) =>
      /(stripe|payment|trial.*billing|production-cutover)/i.test(f),
    )
  ) {
    return "Red";
  }

  // Yellow: new services, migrations, LLM calls, multi-step flows, email
  if (touches.database) return "Yellow";
  if (touches.newApiEndpoint) return "Yellow";
  if (
    files.some((f) =>
      /(services\/agents|services\/email|services\/google|services\/llm|workers\/)/.test(
        f,
      ),
    )
  ) {
    return "Yellow";
  }

  // Green: pure frontend, no DB/auth/billing, no migrations
  return "Green";
}

function assessComplexity(
  files: { path: string; kind: "new" | "modified" }[],
  touches: Card["touches"],
): Complexity {
  const fileCount = files.length;
  const newCount = files.filter((f) => f.kind === "new").length;
  const distinctTopDirs = new Set(
    files.map((f) => f.path.split("/").slice(0, 2).join("/")),
  );

  if (touches.database && touches.newApiEndpoint) return "High";
  if (distinctTopDirs.size >= 4 || fileCount >= 30) return "High";
  if (touches.database || touches.newApiEndpoint || newCount >= 5) return "Medium";
  return "Low";
}

function generateVerificationTests(
  area: FunctionalArea,
  files: { path: string; kind: "new" | "modified" }[],
  touches: Card["touches"],
): string[] {
  const tests: string[] = [];

  // Migrations always: run latest, confirm schema
  if (touches.database) {
    const migrationFiles = files
      .filter((f) => f.path.startsWith("src/database/migrations/"))
      .map((f) => path.basename(f.path));
    tests.push(
      `Run \`npx knex migrate:latest\`. Confirm migration(s) applied: ${migrationFiles.join(", ") || "(see card files)"}.`,
    );
    tests.push(
      `Inspect new tables/columns via \`\\d <table>\` or \`SELECT column_name FROM information_schema.columns WHERE table_name = '<table>';\` and confirm shape matches the migration.`,
    );
  }

  // Frontend changes: browser smoke
  const frontendFiles = files.filter((f) => f.path.startsWith("frontend/src/"));
  if (frontendFiles.length > 0) {
    const pages = frontendFiles
      .map((f) => f.path.match(/frontend\/src\/pages\/([A-Z][A-Za-z]+)/))
      .filter((m) => m !== null)
      .map((m) => m![1]);
    if (pages.length > 0) {
      const uniquePages = Array.from(new Set(pages)).slice(0, 5);
      tests.push(
        `Open each affected page in the browser: ${uniquePages.map((p) => `/${p.toLowerCase().replace(/page$/, "")}`).join(", ")}. Confirm no console errors and no white-screen.`,
      );
    } else {
      tests.push(
        `Build frontend: \`cd frontend && npm run build\`. Zero errors expected. Open the affected pages in browser, verify no console errors.`,
      );
    }
  }

  // Backend route changes: API smoke
  const routeFiles = files.filter(
    (f) => f.path.startsWith("src/routes/") && f.kind === "new",
  );
  if (routeFiles.length > 0) {
    tests.push(
      `For each new route file (${routeFiles.length} total), test the primary endpoint with curl. Confirm response shape includes \`{ success: boolean }\`. Without JWT, expect 401.`,
    );
  }

  // Auth touches
  if (touches.auth) {
    tests.push(
      `Auth-touched flow: log in as a regular user. Log in as an admin. Both succeed. JWT issued with correct claims.`,
    );
  }

  // Billing touches (Red — never auto-deploy)
  if (touches.billing) {
    tests.push(
      `BILLING TOUCHED — Corey approval required before deploy. Confirm existing paying clients have unchanged subscription_status. Test trial expiration path. Test bypass for Foundation/Heroes accounts.`,
    );
  }

  // LLM-driven features
  if (
    files.some((f) =>
      /(agents|llm|narrator|conductor|safety)/i.test(f.path),
    )
  ) {
    tests.push(
      `Run agent locally with a known input. Capture output. Pass it through Reviewer Gate (\`scripts/sanity-check.sh\` plus the agent's own selfCheck). Confirm 7/7 gates clear or expected hold reason fires.`,
    );
  }

  // TypeScript baseline
  tests.push(
    `\`npx tsc --noEmit\` from repo root and \`cd frontend && npx tsc --noEmit\` both return zero errors.`,
  );

  // Always: pre-commit gate
  tests.push(
    `Run \`bash scripts/sanity-check.sh\` or the four pre-commit scripts (data-flow-audit, content-quality-lint, constitution-check, vertical-sweep). All hard gates pass.`,
  );

  return tests;
}

// ── Step 5: Self-checks ────────────────────────────────────────────

/**
 * Manifest-specific voice check. Not the systemConductor voice gate — that
 * one flags "patient" and is built for client-facing copy. The manifest is
 * for Dave (engineering). Words that should NOT appear in a Dave-bound
 * manifest: "alternatively", "we could", "maybe", "options".
 */
function manifestVoiceCheck(markdown: string): string[] {
  const flags: string[] = [];
  const violations: { pattern: RegExp; reason: string }[] = [
    { pattern: /\balternatively\b/i, reason: '"alternatively" — descriptive language' },
    { pattern: /\bwe could\b/i, reason: '"we could" — exploratory language' },
    { pattern: /\bmaybe\b/i, reason: '"maybe" — non-prescriptive' },
    { pattern: /\boption [AB12]\b/i, reason: '"option A/B" — multiple paths in a single doc' },
    { pattern: /—/, reason: "em-dash present" },
  ];
  for (const { pattern, reason } of violations) {
    if (pattern.test(markdown)) {
      flags.push(reason);
    }
  }
  return flags;
}

/**
 * Manifest consistency check. Flags if a card's blast radius downgrades
 * relative to what a prior manifest assigned for the same functional area.
 * Reads bridge_manifests history.
 */
async function manifestConsistencyCheck(cards: Card[]): Promise<string[]> {
  const flags: string[] = [];
  try {
    const hasTable = await db.schema.hasTable("bridge_manifests");
    if (!hasTable) return flags;
    const prior = await db("bridge_manifests")
      .orderBy("generated_at", "desc")
      .limit(5);
    const radiusOrder: Record<BlastRadius, number> = {
      Green: 0,
      Yellow: 1,
      Red: 2,
    };
    for (const card of cards) {
      for (const row of prior) {
        let priorCards: { title: string; blastRadius: BlastRadius }[] = [];
        try {
          const payload =
            typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
          priorCards = (payload?.cards || []).map((c: any) => ({
            title: c.title,
            blastRadius: c.blastRadius,
          }));
        } catch {
          continue;
        }
        const match = priorCards.find((p) => p.title === card.title);
        if (match && radiusOrder[card.blastRadius] < radiusOrder[match.blastRadius]) {
          flags.push(
            `Card "${card.title}" downgrades from ${match.blastRadius} to ${card.blastRadius} vs prior manifest. Confirm intentional.`,
          );
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[BridgeTranslator] consistency check failed:`, message);
  }
  return flags;
}

// ── Sanitization ──────────────────────────────────────────────────

/**
 * Strip characters and patterns that violate the manifest voice gate
 * but appear legitimately in upstream commit subjects (em-dashes, etc.).
 * Keeps the prescriptive intent intact while making the manifest pass
 * its own self-check.
 */
function sanitizeForManifest(text: string): string {
  return text.replace(/—/g, "--").replace(/–/g, "-");
}

// ── Step 6: Compose markdown ───────────────────────────────────────

function composeManifest(delta: ManifestDelta): string {
  const date = delta.generatedAt.split("T")[0];
  const totalNew = delta.cards.reduce(
    (acc, c) => acc + c.filesAffected.filter((f) => f.kind === "new").length,
    0,
  );
  const totalModified = delta.cards.reduce(
    (acc, c) => acc + c.filesAffected.filter((f) => f.kind === "modified").length,
    0,
  );

  const lines: string[] = [];

  lines.push(`# ALLORO MIGRATION MANIFEST DELTA -- ${date}`);
  lines.push("");
  lines.push(
    `Generated by Bridge Translator agent. Cards continue from prior manifest.`,
  );
  lines.push(
    `Anchor: \`${delta.anchorCommit}\` -> Head: \`${delta.headCommit}\``,
  );
  lines.push(
    `Commits in scope: ${delta.totalCommits}. New files: ${totalNew}. Modified files: ${totalModified}.`,
  );
  lines.push("");
  lines.push(`Companion docs: \`docs/MIGRATION-MANIFEST-V2.md\` (cards 1-13).`);
  lines.push("");

  // Self-check banner
  lines.push("## SELF-CHECK RESULTS");
  lines.push("");
  lines.push(
    `| Gate | Result | Notes |`,
  );
  lines.push(`|------|--------|-------|`);
  lines.push(
    `| Voice (prescriptive language) | ${delta.selfCheck.voicePass ? "PASS" : "HOLD"} | ${delta.selfCheck.voiceFlags.join("; ") || "no flags"} |`,
  );
  lines.push(
    `| Consistency (vs prior manifests) | ${delta.selfCheck.consistencyPass ? "PASS" : "HOLD"} | ${delta.selfCheck.consistencyFlags.join("; ") || "no flags"} |`,
  );
  lines.push(
    `| Safety (PII / secrets / billing) | ${delta.selfCheck.safetyPass ? "PASS" : "HOLD"} | ${delta.selfCheck.safetyFlags.join("; ") || "no flags"} |`,
  );
  lines.push("");

  if (
    !delta.selfCheck.voicePass ||
    !delta.selfCheck.consistencyPass ||
    !delta.selfCheck.safetyPass
  ) {
    lines.push(
      `> Self-check held. Cole reviews flags above before forwarding to Dave.`,
    );
    lines.push("");
  }

  // Card sequence summary
  lines.push("## CARD SEQUENCE (simplest to most complex)");
  lines.push("");
  lines.push(`| # | Feature | Blast | Complexity | Files | Violations |`);
  lines.push(`|---|---------|-------|-----------|-------|------------|`);
  for (const card of delta.cards) {
    lines.push(
      `| ${card.number} | ${card.title} | ${card.blastRadius} | ${card.complexity} | ${card.filesAffected.length} | ${card.violations.length} |`,
    );
  }
  lines.push("");

  // Detailed cards
  lines.push("## THE CARDS");
  lines.push("");
  for (const card of delta.cards) {
    lines.push(`### Card ${card.number}: ${card.title}`);
    lines.push("");
    lines.push(`Blast Radius: ${card.blastRadius}`);
    lines.push(`Complexity: ${card.complexity}`);
    lines.push(`Dependencies: ${card.dependencies}`);
    lines.push("");
    lines.push("**What Changes:**");
    for (const file of card.filesAffected.slice(0, 30)) {
      const tag = file.kind === "new" ? "[new]" : "[modified]";
      lines.push(`- ${tag} \`${file.path}\``);
    }
    if (card.filesAffected.length > 30) {
      lines.push(
        `- ... and ${card.filesAffected.length - 30} more (see commit list below)`,
      );
    }
    lines.push("");
    lines.push("**Touches:**");
    lines.push(`- Database: ${card.touches.database ? "yes" : "no"}`);
    lines.push(`- Auth: ${card.touches.auth ? "yes" : "no"}`);
    lines.push(`- Billing: ${card.touches.billing ? "yes" : "no"}`);
    lines.push(`- New API endpoint: ${card.touches.newApiEndpoint ? "yes" : "no"}`);
    lines.push("");
    lines.push("**Verification Tests:**");
    card.verificationTests.forEach((t, i) => {
      lines.push(`${i + 1}. ${t}`);
    });
    lines.push("");
    if (card.violations.length > 0) {
      lines.push("**Pattern Violations (resolve before merging):**");
      const grouped: Record<string, string[]> = {};
      for (const v of card.violations) {
        if (!grouped[v.rule]) grouped[v.rule] = [];
        grouped[v.rule].push(v.detail);
      }
      for (const [rule, details] of Object.entries(grouped)) {
        lines.push(`- _${rule}_:`);
        for (const d of details.slice(0, 10)) {
          lines.push(`  - ${d}`);
        }
        if (details.length > 10) {
          lines.push(`  - ... ${details.length - 10} more`);
        }
      }
      lines.push("");
    }
    lines.push("**Commits in this card:**");
    for (const commit of card.commits) {
      lines.push(`- \`${commit.shortSha}\` ${sanitizeForManifest(commit.subject)}`);
    }
    lines.push("");
    if (card.notes && card.notes.length > 0) {
      lines.push("**Notes:**");
      for (const n of card.notes) lines.push(`- ${n}`);
      lines.push("");
    }
    lines.push(`**Done Gate ${card.number}:** ${card.doneGate}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // Open questions / orphans
  if (delta.orphans.length > 0) {
    lines.push("## OPEN QUESTIONS (orphan commits)");
    lines.push("");
    lines.push(
      `These commits could not be cleanly assigned to a card. Cole resolves manually before approval.`,
    );
    lines.push("");
    for (const { commit, reason } of delta.orphans) {
      lines.push(
        `- \`${commit.shortSha}\` ${sanitizeForManifest(commit.subject)} -- ${reason} (files: ${commit.files.slice(0, 5).join(", ")}${commit.files.length > 5 ? ", ..." : ""})`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Step 7: Write file + DB row ────────────────────────────────────

async function writeManifestFile(
  delta: ManifestDelta,
  markdown: string,
): Promise<string> {
  if (!fs.existsSync(MANIFEST_DELTA_DIR)) {
    fs.mkdirSync(MANIFEST_DELTA_DIR, { recursive: true });
  }
  const date = delta.generatedAt.split("T")[0];
  const filePath = path.join(MANIFEST_DELTA_DIR, `${date}.md`);
  fs.writeFileSync(filePath, markdown, "utf8");
  console.log(`[BridgeTranslator] Wrote manifest delta to ${filePath}`);
  return filePath;
}

async function recordManifestRun(
  delta: ManifestDelta,
  manifestPath: string,
  mode: Mode,
): Promise<void> {
  try {
    const hasTable = await db.schema.hasTable("bridge_manifests");
    if (!hasTable) {
      console.warn(
        `[BridgeTranslator] bridge_manifests table missing — skipping DB record. Run migration to enable history tracking.`,
      );
    } else {
      const lastCard = delta.cards.length > 0
        ? delta.cards[delta.cards.length - 1].number
        : delta.startingCardNumber - 1;
      await db("bridge_manifests").insert({
        anchor_commit: delta.anchorCommit,
        head_commit: delta.headCommit,
        manifest_path: manifestPath,
        mode,
        card_count: delta.cards.length,
        orphan_count: delta.orphans.length,
        last_card_number: lastCard,
        payload: JSON.stringify({
          cards: delta.cards.map((c) => ({
            number: c.number,
            title: c.title,
            blastRadius: c.blastRadius,
            complexity: c.complexity,
          })),
          selfCheck: delta.selfCheck,
        }),
        generated_at: new Date(delta.generatedAt),
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[BridgeTranslator] failed to record manifest run:`, message);
  }

  // Always log to behavioral_events
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "bridge_translator.manifest_generated",
      properties: JSON.stringify({
        anchor_commit: delta.anchorCommit,
        head_commit: delta.headCommit,
        card_count: delta.cards.length,
        orphan_count: delta.orphans.length,
        manifest_path: manifestPath,
        mode,
        self_check: delta.selfCheck,
      }),
      created_at: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[BridgeTranslator] failed behavioral_events insert:`, message);
  }
}

// ── Step 8: Post summary ───────────────────────────────────────────

async function postActiveSummary(
  delta: ManifestDelta,
  manifestPath: string,
): Promise<void> {
  const headline = `Migration Manifest delta ready: ${delta.cards.length} cards (${delta.cards.map((c) => c.blastRadius).join("/")})`;
  const detail = `Anchor: ${delta.anchorCommit} -> Head: ${delta.headCommit}. File: ${manifestPath}. Self-check: voice ${delta.selfCheck.voicePass ? "PASS" : "HOLD"}, consistency ${delta.selfCheck.consistencyPass ? "PASS" : "HOLD"}, safety ${delta.selfCheck.safetyPass ? "PASS" : "HOLD"}. Orphans: ${delta.orphans.length}.`;

  console.log(`[BridgeTranslator] ACTIVE: ${headline}`);
  console.log(`[BridgeTranslator] ACTIVE: ${detail}`);

  // In active mode, write a notification dream_team_task for Cole/Corey
  // and a behavioral_events record. Slack posting is left for the
  // dream_team_tasks downstream notifier rather than direct integration.
  try {
    await db("dream_team_tasks").insert({
      title: `Bridge Translator: manifest ready for Dave handoff`,
      description: `${headline}\n\n${detail}\n\nManifest path: ${manifestPath}\n\nReview cards 14+ and forward to Dave's Sprint page if approved.`,
      assigned_to: "cole",
      status: "open",
      priority: delta.selfCheck.safetyPass && delta.selfCheck.voicePass ? "medium" : "high",
      metadata: JSON.stringify({
        source: "bridge_translator",
        anchor: delta.anchorCommit,
        head: delta.headCommit,
        manifest_path: manifestPath,
        mode: "active",
      }),
      created_at: new Date(),
      updated_at: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[BridgeTranslator] could not create dream_team_task:`, message);
  }
}

// ── Session-mode writer ───────────────────────────────────────────

/**
 * Per-CC-session card writer. For each card in the delta:
 *   1. Run Reviewer Claude (Build A) against the card.
 *   2. Render the V2-format card body.
 *   3. Upsert the card row into the Sandbox Card Inbox (idempotent by Card ID).
 *   4. Decide whether to auto-promote on PASS verdict.
 *   5. Write a behavioral_events row.
 *
 * Returns one outcome per card. Failures inside one card do not block the rest.
 */
async function writeCardsToSandboxInbox(
  delta: ManifestDelta,
  manifestPath: string | undefined,
  opts: RunOptions,
): Promise<SessionCardOutcome[]> {
  const outcomes: SessionCardOutcome[] = [];
  const sessionDate = delta.generatedAt.split("T")[0];
  const autoPromoteOnPass = opts.autoPromoteOnPass ?? true;

  for (const card of delta.cards) {
    const bridgeAreaKey = inferBridgeAreaKey(card);
    const cardId = buildCardId(sessionDate, bridgeAreaKey);
    const reviewer = runReviewerClaude({ card, autoPromoteOnPass });
    const cardBody = composeSingleCardMarkdown(card, reviewer);

    let inbox: UpsertCardResult;
    try {
      inbox = await upsertCard({
        card,
        cardId,
        functionalArea: mapFunctionalArea(bridgeAreaKey),
        reviewerResult: reviewer,
        auditLogUrl: manifestPath
          ? `https://github.com/alloro/alloro/blob/sandbox/${manifestPath.replace(REPO_ROOT + "/", "")}`
          : undefined,
        cardBody,
        sourceCommits: card.commits.map((c) => c.shortSha),
      });
    } catch (err: unknown) {
      // Notion write failed (credential, network, schema). The card is still
      // recorded in the local sidecar audit log below; outcome status reflects
      // the failure so the caller can surface it.
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[BridgeTranslator] Notion upsert failed for card ${card.number} (${cardId}):`,
        message,
      );
      inbox = {
        status: "created",
        pageId: "",
        pageUrl: "",
        cardId,
      };
    }

    try {
      const autoPromoted = shouldAutoPromote(card, reviewer, autoPromoteOnPass);

      // Blackboard state transitions (Build C). Only run on freshly created
      // cards -- "updated" cards are already past the New stage and re-running
      // the chain would just produce invalid-transition errors. The bridge is
      // best-effort: failures here surface in the per-card behavioral_events
      // row but do not block the session-mode handoff.
      const auditLogUrl = manifestPath
        ? `https://github.com/alloro/alloro/blob/sandbox/${manifestPath.replace(REPO_ROOT + "/", "")}`
        : undefined;
      let stateTransitionsRun = false;
      let reviewerBridgeFinalState: string | null = null;
      const transitionErrors: string[] = [];
      if (inbox.status === "created" && inbox.pageId) {
        try {
          const newRes = await transitionCard({
            cardId,
            toState: "New",
            actor: "BridgeTranslator",
            reason: "Card created from session commits.",
            linkedArtifacts: auditLogUrl ? [auditLogUrl] : [],
          });
          if (!newRes.success && newRes.error)
            transitionErrors.push(`New: ${newRes.error}`);

          const gatedRes = await transitionCard({
            cardId,
            toState: "Reviewer Gated",
            actor: "BridgeTranslator",
            reason: "Submitted to Reviewer Claude for adversarial review.",
            linkedArtifacts: auditLogUrl ? [auditLogUrl] : [],
          });
          if (!gatedRes.success && gatedRes.error)
            transitionErrors.push(`Reviewer Gated: ${gatedRes.error}`);

          const verdictRes = await processReviewerVerdict({
            card,
            cardId,
            result: reviewer,
            autoPromoteOnPass,
            auditLogUrl,
          });
          reviewerBridgeFinalState = verdictRes.finalState;
          transitionErrors.push(...verdictRes.transitionErrors);
          stateTransitionsRun = true;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            `[BridgeTranslator] state transition chain failed for card ${card.number} (${cardId}):`,
            message,
          );
          transitionErrors.push(message);
        }
      }

      outcomes.push({
        cardNumber: card.number,
        cardTitle: card.title,
        cardId,
        functionalArea: bridgeAreaKey,
        reviewer,
        inbox,
        autoPromoted,
      });

      // behavioral_events row per card
      try {
        await db("behavioral_events").insert({
          id: db.raw("gen_random_uuid()"),
          event_type: "bridge_translator.session_card_written",
          properties: JSON.stringify({
            session_date: sessionDate,
            card_number: card.number,
            card_id: cardId,
            functional_area: bridgeAreaKey,
            reviewer_verdict: reviewer.verdict,
            blockers: reviewer.counts.blocker,
            concerns: reviewer.counts.concern,
            notes: reviewer.counts.note,
            inbox_status: inbox.status,
            inbox_page_url: inbox.pageUrl,
            auto_promoted: autoPromoted,
            state_transitions_run: stateTransitionsRun,
            reviewer_bridge_final_state: reviewerBridgeFinalState,
            transition_errors: transitionErrors,
          }),
          created_at: new Date(),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[BridgeTranslator] behavioral_events insert failed for card ${card.number}:`,
          message,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[BridgeTranslator] Failed to upsert card ${card.number} (${cardId}):`,
        message,
      );
    }
  }

  // Sidecar JSON audit log. Always written, regardless of Notion success.
  // This is the source of truth for the session's outcomes — Notion is a
  // surface, this file is the audit trail.
  if (!opts.dryRun) {
    try {
      writeSessionAuditLog(delta, outcomes);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[BridgeTranslator] Sidecar audit log write failed:`,
        message,
      );
    }
  }

  return outcomes;
}

/**
 * Write the per-session audit log to docs/migration-manifest-deltas/
 * YYYY-MM-DD-session-audit.json. Idempotent — overwrites prior entry for
 * the same session date.
 */
function writeSessionAuditLog(
  delta: ManifestDelta,
  outcomes: SessionCardOutcome[],
): string {
  if (!fs.existsSync(MANIFEST_DELTA_DIR)) {
    fs.mkdirSync(MANIFEST_DELTA_DIR, { recursive: true });
  }
  const date = delta.generatedAt.split("T")[0];
  const filePath = path.join(MANIFEST_DELTA_DIR, `${date}-session-audit.json`);
  const payload = {
    generated_at: delta.generatedAt,
    anchor_commit: delta.anchorCommit,
    head_commit: delta.headCommit,
    total_commits: delta.totalCommits,
    cards: outcomes.map((o) => ({
      card_number: o.cardNumber,
      card_id: o.cardId,
      title: o.cardTitle,
      functional_area: o.functionalArea,
      reviewer_verdict: o.reviewer.verdict,
      reviewer_counts: o.reviewer.counts,
      reviewer_flags: o.reviewer.flags,
      inbox_status: o.inbox.status,
      inbox_page_url: o.inbox.pageUrl,
      auto_promoted: o.autoPromoted,
    })),
    orphans: delta.orphans.map((o) => ({
      sha: o.commit.shortSha,
      subject: o.commit.subject,
      reason: o.reason,
    })),
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[BridgeTranslator] Wrote session audit log to ${filePath}`);
  return filePath;
}

/**
 * Recover the bridge functional-area key from a generated card by matching
 * its title back against the FUNCTIONAL_AREAS table. Falls back to "other".
 */
function inferBridgeAreaKey(card: Card): string {
  const match = FUNCTIONAL_AREAS.find((a) => a.label === card.title);
  return match?.key || "other";
}

/**
 * Compose a single-card markdown body in the V2 card format. Reusable by the
 * Notion writer (gets stored on the page) and audit logs (gets written to a
 * sidecar file).
 */
function composeSingleCardMarkdown(
  card: Card,
  reviewer: ReviewerResult,
): string {
  const lines: string[] = [];
  lines.push(`Card ${card.number}: ${card.title}`);
  lines.push(`Blast Radius: ${card.blastRadius}`);
  lines.push(`Complexity: ${card.complexity}`);
  lines.push(`Dependencies: ${card.dependencies}`);
  lines.push("");
  lines.push("What Changes:");
  for (const file of card.filesAffected.slice(0, 30)) {
    const tag = file.kind === "new" ? "[new]" : "[modified]";
    lines.push(`- ${tag} ${file.path}`);
  }
  if (card.filesAffected.length > 30) {
    lines.push(`- ... and ${card.filesAffected.length - 30} more files`);
  }
  lines.push("");
  lines.push("Touches:");
  lines.push(`- Database: ${card.touches.database ? "yes" : "no"}`);
  lines.push(`- Auth: ${card.touches.auth ? "yes" : "no"}`);
  lines.push(`- Billing: ${card.touches.billing ? "yes" : "no"}`);
  lines.push(`- New API endpoint: ${card.touches.newApiEndpoint ? "yes" : "no"}`);
  lines.push("");
  lines.push("Verification Tests:");
  card.verificationTests.forEach((t, i) => {
    lines.push(`${i + 1}. ${t}`);
  });
  lines.push("");
  lines.push("Commits in this card:");
  for (const commit of card.commits) {
    lines.push(`- ${commit.shortSha} ${sanitizeForManifest(commit.subject)}`);
  }
  lines.push("");
  lines.push(`Done Gate: ${card.doneGate}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(renderReviewerMarkdown(card, reviewer));

  return lines.join("\n");
}

function logSessionSummary(
  delta: ManifestDelta,
  outcomes: SessionCardOutcome[],
  manifestPath?: string,
): void {
  const passed = outcomes.filter((o) => o.reviewer.verdict === "PASS").length;
  const concerns = outcomes.filter(
    (o) => o.reviewer.verdict === "PASS_WITH_CONCERNS",
  ).length;
  const blocked = outcomes.filter((o) => o.reviewer.verdict === "BLOCK").length;
  const promoted = outcomes.filter((o) => o.autoPromoted).length;

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`[BridgeTranslator] SESSION MODE — cards written to inbox`);
  console.log(`  Cards generated: ${outcomes.length}`);
  console.log(`  Reviewer verdicts: PASS ${passed}, CONCERNS ${concerns}, BLOCK ${blocked}`);
  console.log(`  Auto-promoted on PASS: ${promoted}`);
  console.log(`  Orphan commits:  ${delta.orphans.length}`);
  if (manifestPath) {
    console.log(`  Audit log:       ${manifestPath}`);
  }
  for (const o of outcomes) {
    console.log(
      `   - Card ${o.cardNumber} (${o.cardId}): ${o.reviewer.verdict}, inbox ${o.inbox.status} ${o.inbox.pageUrl}`,
    );
  }
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
}

function logShadowSummary(delta: ManifestDelta, manifestPath?: string): void {
  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`[BridgeTranslator] SHADOW MODE — manifest NOT auto-sent`);
  console.log(`  Cards generated: ${delta.cards.length}`);
  console.log(`  Orphan commits:  ${delta.orphans.length}`);
  console.log(
    `  Self-check:      voice=${delta.selfCheck.voicePass ? "PASS" : "HOLD"}  consistency=${delta.selfCheck.consistencyPass ? "PASS" : "HOLD"}  safety=${delta.selfCheck.safetyPass ? "PASS" : "HOLD"}`,
  );
  if (manifestPath) {
    console.log(`  File:            ${manifestPath}`);
  }
  console.log(`  Cole reviews this output before authorizing active mode.`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
}
