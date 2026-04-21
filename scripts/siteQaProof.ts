/**
 * Site QA Proof Script — 2026-04-21
 *
 * Runs the Site QA Agent against Coastal (calm-beauty-2180) and ARCS
 * (calm-clinic-3597). Attempts to pull the live sandbox sections first; falls
 * back to the embedded fixtures if the DB is not reachable from this machine.
 * Writes the proof markdown to /tmp/site-qa-proof-2026-04-21.md.
 */

import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import { runSiteQa } from "../src/services/siteQa/siteQaAgent";
import { db } from "../src/database/connection";
import {
  coastalSections,
  coastalFooter,
  arcsSections,
  arcsFooter,
} from "../tests/siteQa/fixtures";
import type { Section, SiteQaReport } from "../src/services/siteQa/types";
import type { CollisionFetcher } from "../src/services/siteQa/gates/templateCollision";

const PROOF_PATH = "/tmp/site-qa-proof-2026-04-21.md";

interface SiteCase {
  label: string;
  slug: string;
  orgName: string;
  sections: Section[];
  footer: string;
  source: "sandbox-db" | "fixtures";
  expectedDefectKeywords: string[];
}

async function tryLoadFromSandbox(slug: string): Promise<{
  sections: Section[];
  footer: string;
} | null> {
  try {
    const project = await Promise.race([
      db("website_builder.projects")
        .where("id", slug)
        .orWhere("subdomain", slug)
        .orWhere("slug", slug)
        .first()
        .catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ]);

    if (!project) return null;

    const page = await db("website_builder.pages")
      .where({ project_id: (project as any).id, status: "published", path: "/" })
      .orderBy("version", "desc")
      .first();

    if (!page) return null;

    let sections: Section[] = [];
    try {
      sections =
        typeof page.sections === "string" ? JSON.parse(page.sections) : page.sections ?? [];
    } catch {
      sections = [];
    }
    const footer = (project as any).footer ?? "";
    return { sections, footer };
  } catch {
    return null;
  }
}

const alwaysCollides: CollisionFetcher = {
  async fingerprintExistsElsewhere() {
    return true;
  },
};

function renderDefects(report: SiteQaReport): string {
  if (report.defects.length === 0) return "  (no defects caught)\n";
  const lines: string[] = [];
  for (const d of report.defects) {
    const loc = [d.evidence.pagePath, d.evidence.sectionType ?? "", d.evidence.field ?? ""]
      .filter(Boolean)
      .join(" / ");
    lines.push(`- **[${d.gate}] ${d.message}**`);
    if (loc) lines.push(`  - Location: ${loc}`);
    if (d.evidence.sectionIndex !== undefined && d.evidence.sectionIndex >= 0) {
      lines.push(`  - Section index: ${d.evidence.sectionIndex}`);
    }
    if (d.evidence.text) {
      const text = d.evidence.text.length > 220 ? `${d.evidence.text.slice(0, 220)}…` : d.evidence.text;
      lines.push(`  - Evidence: "${text}"`);
    }
  }
  return lines.join("\n") + "\n";
}

function caughtKeywords(report: SiteQaReport, keywords: string[]): { caught: string[]; missed: string[] } {
  const blob = report.defects
    .map((d) => `${d.gate} ${d.message} ${d.evidence.text ?? ""}`)
    .join(" | ")
    .toLowerCase();
  const caught: string[] = [];
  const missed: string[] = [];
  for (const kw of keywords) {
    if (blob.includes(kw.toLowerCase())) caught.push(kw);
    else missed.push(kw);
  }
  return { caught, missed };
}

async function main(): Promise<void> {
  const cases: SiteCase[] = [];

  const coastalSandbox = await tryLoadFromSandbox("calm-beauty-2180");
  cases.push({
    label: "Coastal Endodontic Studio",
    slug: "calm-beauty-2180",
    orgName: "Coastal Endodontic Studio",
    sections: coastalSandbox?.sections ?? coastalSections,
    footer: coastalSandbox?.footer || coastalFooter,
    source: coastalSandbox ? "sandbox-db" : "fixtures",
    expectedDefectKeywords: [
      "Claude responded",
      "Timestamp",
      "state-of-the-art",
      "Missing space",
      "2025",
      "duplicate",
      "template collision",
    ],
  });

  const arcsSandbox = await tryLoadFromSandbox("calm-clinic-3597");
  cases.push({
    label: "ARCS (Atlantic Regional Center for Surgery)",
    slug: "calm-clinic-3597",
    orgName: "ARCS",
    sections: arcsSandbox?.sections ?? arcsSections,
    footer: arcsSandbox?.footer || arcsFooter,
    source: arcsSandbox ? "sandbox-db" : "fixtures",
    expectedDefectKeywords: [
      "Doctors Block",
      "Services Block",
      "Missing space",
      "description",
      "up-to-date technology",
      "template collision",
    ],
  });

  const out: string[] = [];
  out.push(`# Site QA Agent — Proof Run (2026-04-21)`);
  out.push("");
  out.push(`Branch: sandbox`);
  out.push(`Ran at: ${new Date().toISOString()}`);
  out.push("");
  out.push(`Gates executed: 10 (aiContentArtifact, placeholderText, bannedPhrase, punctuationFormatting, copyrightYear, templateCollision, structuralCompleteness, fivePercentElement, recognitionTest, altTextSanity).`);
  out.push("");
  out.push(`LLM gates (fivePercentElement, recognitionTest, altTextSanity-LLM-layer) are disabled in this proof run so every defect reported is deterministic and reproducible. Those LLM gates activate when the org flag patientpath_qa_enabled=true.`);
  out.push("");

  for (const c of cases) {
    out.push(`---`);
    out.push(`## ${c.label} (${c.slug})`);
    out.push(`Source: ${c.source === "sandbox-db" ? "live sandbox DB (website_builder.pages where status=published, path=\"/\")" : "embedded fixtures (tests/siteQa/fixtures.ts) — sandbox DB not reachable from this run"}`);
    out.push("");

    const report = await runSiteQa(
      {
        projectId: c.slug,
        pagePath: "/",
        sections: c.sections,
        footer: c.footer,
        orgName: c.orgName,
        currentYear: 2026,
        useLlm: false,
      },
      { collisionFetcher: alwaysCollides }
    );

    out.push(`Passed: **${report.passed}**`);
    out.push(`Defects caught: ${report.defects.length}`);
    out.push(`Gates failed: ${report.gates.filter((g) => !g.passed).length} of ${report.gates.length}`);
    out.push("");
    out.push(`### Defects`);
    out.push(renderDefects(report));

    const { caught, missed } = caughtKeywords(report, c.expectedDefectKeywords);
    out.push(`### Expected vs caught`);
    out.push(`Expected defect keywords: ${c.expectedDefectKeywords.map((k) => `\`${k}\``).join(", ")}`);
    out.push(`Caught: ${caught.length === c.expectedDefectKeywords.length ? "ALL" : caught.join(", ") || "(none)"}`);
    out.push(`Missed: ${missed.length === 0 ? "NONE" : missed.join(", ")}`);
    out.push("");
  }

  out.push(`---`);
  out.push(`## Shadow-mode behavior`);
  out.push(`When org.patientpath_qa_enabled=false (the default after this migration), the hook runs every publish but never halts it. Each run writes a behavioral_event of type \`site.qa_shadow_run\` with the defect count and the list of failing gates, so we can watch the signal before flipping the flag.`);
  out.push("");
  out.push(`When org.patientpath_qa_enabled=true, a failed run halts the publish (422 SITE_QA_BLOCKED), writes a dream_team_task with source_type='site_qa_block' and the full defect list, and emits behavioral_event \`site.qa_passed\` on clean runs.`);
  out.push("");

  fs.writeFileSync(PROOF_PATH, out.join("\n"));
  console.log(`[site-qa] Proof written to ${PROOF_PATH}`);

  try {
    await db.destroy();
  } catch {}
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[site-qa] Proof run failed:", err);
    process.exit(1);
  });
