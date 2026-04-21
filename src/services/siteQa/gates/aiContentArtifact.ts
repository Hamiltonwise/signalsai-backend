import type { GateResult, SiteQaContext, Defect } from "../types";
import { extractTextFragments, stripHtml } from "../util";

const ARTIFACT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bClaude responded\b/i, label: "Chat artifact: \"Claude responded\"" },
  { pattern: /\bAI responded\b/i, label: "Chat artifact: \"AI responded\"" },
  { pattern: /\bGPT responded\b/i, label: "Chat artifact: \"GPT responded\"" },
  { pattern: /\bassistant:\s/i, label: "Chat role label in copy" },
  { pattern: /\buser:\s/i, label: "Chat role label in copy" },
  { pattern: /\b\d{1,2}:\d{2}\s?(AM|PM)\b/i, label: "Timestamp leaked into copy" },
  { pattern: /…$/m, label: "Ellipsis-truncated fragment" },
  { pattern: /\b\w{3,}…/, label: "Mid-word ellipsis truncation" },
  { pattern: /\bsave y…/i, label: "Known truncation artifact \"save y…\"" },
  { pattern: /\bI cannot\b/i, label: "Refusal artifact \"I cannot\"" },
  { pattern: /\bAs an AI\b/i, label: "Disclosure artifact \"As an AI\"" },
  { pattern: /\bI'm sorry, but\b/i, label: "Refusal artifact \"I'm sorry, but\"" },
  { pattern: /\[INST\]|\[\/INST\]/, label: "Prompt template token leaked" },
  { pattern: /```/, label: "Markdown code fence leaked" },
];

export function runAiContentArtifactGate(ctx: SiteQaContext): GateResult {
  const defects: Defect[] = [];
  const fragments = extractTextFragments(ctx.sections);

  for (const frag of fragments) {
    const plain = stripHtml(frag.text);
    if (!plain) continue;

    for (const { pattern, label } of ARTIFACT_PATTERNS) {
      const match = plain.match(pattern);
      if (match) {
        defects.push({
          gate: "aiContentArtifact",
          severity: "blocker",
          message: label,
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
    gate: "aiContentArtifact",
    passed: defects.length === 0,
    defects,
  };
}
