import * as fs from "fs";
import * as path from "path";
import type { GateResult, SiteQaContext, Defect } from "../types";
import { extractTextFragments, stripHtml } from "../util";

let cachedPhrases: string[] | null = null;

function loadPhrases(): string[] {
  if (cachedPhrases) return cachedPhrases;
  const configPath = path.resolve(__dirname, "..", "bannedPhrases.json");
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    cachedPhrases = Array.isArray(parsed.phrases) ? parsed.phrases : [];
  } catch {
    cachedPhrases = [];
  }
  return cachedPhrases ?? [];
}

export function runBannedPhraseGate(ctx: SiteQaContext): GateResult {
  const defects: Defect[] = [];
  const phrases = loadPhrases();
  if (phrases.length === 0) {
    return { gate: "bannedPhrase", passed: true, defects };
  }

  const fragments = extractTextFragments(ctx.sections);

  for (const frag of fragments) {
    const plain = stripHtml(frag.text).toLowerCase();
    if (!plain) continue;

    for (const phrase of phrases) {
      const needle = phrase.toLowerCase();
      if (plain.includes(needle)) {
        defects.push({
          gate: "bannedPhrase",
          severity: "blocker",
          message: `Banned phrase: "${phrase}"`,
          evidence: {
            text: plain.slice(0, 200),
            sectionIndex: frag.sectionIndex,
            sectionType: frag.sectionType,
            field: frag.field,
            pagePath: ctx.pagePath,
          },
        });
      }
    }
  }

  return {
    gate: "bannedPhrase",
    passed: defects.length === 0,
    defects,
  };
}

export function _resetBannedPhraseCache(): void {
  cachedPhrases = null;
}
