/**
 * One-shot script: run the Cold Outbound dry-run agent against the fixture
 * prospects and emit a single combined markdown report to /tmp.
 *
 * Usage:
 *   npx tsx scripts/cold-outbound-dry-run.ts
 *
 * Output: /tmp/cold-outbound-dry-run-<YYYY-MM-DD>.md (combined endo + ortho)
 *
 * No network calls. Uses the deterministic template generator (no
 * ANTHROPIC_API_KEY required) plus a passing readability stub. This script
 * is safe to run repeatedly; each run overwrites the prior report.
 */

import * as fs from "fs";
import * as path from "path";
import {
  runColdOutbound,
  type ReadabilityChecker,
} from "../src/services/agents/coldOutbound";
import { SAMPLE_COLD_OUTBOUND_PROSPECTS } from "../tests/coldOutbound/fixtures/cold-outbound-sample";
import type {
  ColdOutboundDraft,
  SkippedProspect,
} from "../src/services/agents/coldOutbound.schema";

const passingReadability: ReadabilityChecker = async () => ({
  readable: true,
  issues: [],
  source: "stub",
});

async function main(): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const outputDir = "/tmp";

  // Endo run.
  const endo = await runColdOutbound({
    mode: "dry-run",
    vertical: "endodontist",
    touchNumber: 1,
    fixtureProspects: SAMPLE_COLD_OUTBOUND_PROSPECTS,
    readabilityChecker: passingReadability,
    outputDir,
    outputBaseName: `cold-outbound-dry-run-${date}-endo`,
  });

  // Ortho run.
  const ortho = await runColdOutbound({
    mode: "dry-run",
    vertical: "orthodontist",
    touchNumber: 1,
    fixtureProspects: SAMPLE_COLD_OUTBOUND_PROSPECTS,
    readabilityChecker: passingReadability,
    outputDir,
    outputBaseName: `cold-outbound-dry-run-${date}-ortho`,
  });

  // Combined report — overall summary + a pointer to each per-vertical report.
  const combinedPath = path.join(outputDir, `cold-outbound-dry-run-${date}.md`);
  const lines: string[] = [];
  lines.push(`# Cold Outbound Dry-Run — Combined Validation Report`);
  lines.push("");
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Build:** v0 dry-run skeleton (downscoped from production v1 spec)`);
  lines.push(`**Fixtures:** ${SAMPLE_COLD_OUTBOUND_PROSPECTS.length} synthetic prospects`);
  lines.push("");
  lines.push("## Combined Summary");
  lines.push("");
  lines.push("| Vertical | Drafted | Skipped | Tier A | Tier B | Tier C | Fallbacks | Green | Yellow | Red |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  lines.push(
    `| endodontist | ${endo.summary.drafted} | ${endo.summary.skipped} | ${endo.summary.byTier.A} | ${endo.summary.byTier.B} | ${endo.summary.byTier.C} | ${endo.summary.fallbacks} | ${endo.summary.green} | ${endo.summary.yellow} | ${endo.summary.red} |`,
  );
  lines.push(
    `| orthodontist | ${ortho.summary.drafted} | ${ortho.summary.skipped} | ${ortho.summary.byTier.A} | ${ortho.summary.byTier.B} | ${ortho.summary.byTier.C} | ${ortho.summary.fallbacks} | ${ortho.summary.green} | ${ortho.summary.yellow} | ${ortho.summary.red} |`,
  );
  const totalDrafted = endo.summary.drafted + ortho.summary.drafted;
  const totalSkipped = endo.summary.skipped + ortho.summary.skipped;
  const totalGreen = endo.summary.green + ortho.summary.green;
  const totalYellow = endo.summary.yellow + ortho.summary.yellow;
  lines.push(
    `| **TOTAL** | **${totalDrafted}** | **${totalSkipped}** | **${endo.summary.byTier.A + ortho.summary.byTier.A}** | **${endo.summary.byTier.B + ortho.summary.byTier.B}** | **${endo.summary.byTier.C + ortho.summary.byTier.C}** | **${endo.summary.fallbacks + ortho.summary.fallbacks}** | **${totalGreen}** | **${totalYellow}** | **${endo.summary.red + ortho.summary.red}** |`,
  );
  lines.push("");

  lines.push("## Per-Vertical Reports");
  lines.push("");
  lines.push(`- Endodontist: \`${endo.outputPath}\``);
  lines.push(`- Orthodontist: \`${ortho.outputPath}\``);
  lines.push("");

  lines.push("## Confidence Distribution Across All 12 Fixtures");
  lines.push("");
  const allDrafts: ColdOutboundDraft[] = [...endo.drafts, ...ortho.drafts];
  const allSkipped: SkippedProspect[] = [...endo.skipped, ...ortho.skipped];
  for (const d of allDrafts) {
    const fb = d.tierAssignment.fallbackFrom
      ? ` (fallback from Tier ${d.tierAssignment.fallbackFrom})`
      : "";
    lines.push(
      `- ${d.prospectId} (${d.vertical}, Tier ${d.tier}${fb}): **${d.confidence.toUpperCase()}** — ${d.gates.crossPersonalization.uniqueElementCount} unique element(s)`,
    );
  }
  for (const s of allSkipped) {
    lines.push(`- ${s.prospectId}: **SKIPPED** — ${s.reason}`);
  }
  lines.push("");

  lines.push("## Sample Drafts (one per tier path)");
  lines.push("");

  const tierAEndo = allDrafts.find((d) => d.tier === "A" && d.vertical === "endodontist");
  const tierAOrtho = allDrafts.find((d) => d.tier === "A" && d.vertical === "orthodontist");
  const tierB = allDrafts.find(
    (d) => d.tier === "B" && d.gates.crossPersonalization.uniqueElementCount > 0,
  );
  const tierC = allDrafts.find((d) => d.tier === "C");

  function renderSample(d: ColdOutboundDraft | undefined, label: string): void {
    if (!d) {
      lines.push(`### ${label}`);
      lines.push("(no draft of this type produced)");
      lines.push("");
      return;
    }
    const fb = d.tierAssignment.fallbackFrom
      ? ` (fallback from Tier ${d.tierAssignment.fallbackFrom})`
      : "";
    lines.push(
      `### ${label}: ${d.prospectId} (${d.vertical}, Tier ${d.tier}${fb}, ${d.confidence.toUpperCase()})`,
    );
    lines.push("");
    lines.push(`**Tier reason:** ${d.tierAssignment.reason}`);
    lines.push("");
    lines.push(`**Subject:** ${d.subject}`);
    lines.push("");
    lines.push("**Body:**");
    lines.push("");
    lines.push("```");
    lines.push(d.body);
    lines.push("```");
    lines.push("");
    lines.push(`**Personalization elements (${d.personalizationElements.length}):**`);
    for (const e of d.personalizationElements) lines.push(`- ${e}`);
    lines.push("");
    lines.push(
      `**Gates:** auth ${d.gates.humanAuthenticity.passed ? "PASS" : "FAIL"} (score ${d.gates.humanAuthenticity.score}); voice ${d.gates.voice.passed ? "PASS" : "FAIL"}; readability ${d.gates.readability.passed ? "PASS" : "FAIL"} (${d.gates.readability.source}); cross-personalization ${d.gates.crossPersonalization.uniqueElementCount} unique`,
    );
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  renderSample(tierAEndo, "Sample 1 — Endo Tier A (GP referral wedge)");
  renderSample(tierAOrtho, "Sample 2 — Ortho Tier A (auto-build wedge)");
  renderSample(tierB, "Sample 3 — Tier B (Practice Analyzer findings)");
  renderSample(tierC, "Sample 4 — Tier C (free analyzer link)");

  lines.push("## Explicitly NOT Built In This Session");
  lines.push("");
  lines.push("The following are out of scope for v0 dry-run and are explicitly deferred:");
  lines.push("");
  lines.push("- Notion DB creation (Cold Outbound Draft Inbox schema exported as constant only)");
  lines.push("- ICP source DB reads (caller supplies fixtureProspects array)");
  lines.push("- Real Practice Analyzer invocation (runPracticeAnalyzer is a null-returning stub; production extraction from src/routes/admin/checkupFunnel.ts pending)");
  lines.push("- Real PatientPath site generation (runPatientPathBuild is a null-returning stub; production extraction from PatientPath build pipeline pending)");
  lines.push("- Mailgun integration (no send path in this code)");
  lines.push("- Cron registration (registerColdOutboundCron returns {registered: false} until COLD_OUTBOUND_ENABLED + upstream prerequisites)");
  lines.push("- Production-approved subject/body strings (every draft begins \"[DRY RUN PLACEHOLDER. NOT FOR SEND.]\")");
  lines.push("- Slack notifications");
  lines.push("- Auto-promotion to Jo's inbox");
  lines.push("- First-50 Corey Voice Review gate (production v1 only)");
  lines.push("- ALLORO_N8N_WEBHOOK_URL destination wiring");
  lines.push("- CAN-SPAM physical-address footer (placeholder included; real address wired at send time)");
  lines.push("");

  fs.writeFileSync(combinedPath, lines.join("\n"), "utf8");
  console.log(`Endo per-vertical report: ${endo.outputPath}`);
  console.log(`Ortho per-vertical report: ${ortho.outputPath}`);
  console.log(`Combined validation report: ${combinedPath}`);
  console.log(
    `\nSummary: ${totalDrafted} drafted, ${totalSkipped} skipped, ${totalGreen} Green, ${totalYellow} Yellow, ${endo.summary.fallbacks + ortho.summary.fallbacks} fallback(s).`,
  );
}

main().catch((err) => {
  console.error("Cold outbound dry-run failed:", err);
  process.exit(1);
});
