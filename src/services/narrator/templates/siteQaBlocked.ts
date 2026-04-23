import type { TemplateContext, NarratorOutput } from "../types";
import { composeOutput, readProp } from "./_shared";
import { getVocab } from "../../vocabulary/vocabLoader";

export async function siteQaBlockedTemplate(
  ctx: TemplateContext
): Promise<NarratorOutput> {
  const vocab = await getVocab(ctx.org.id ?? null);
  const defectCount = readProp<number>(ctx.event, "defectCount") ?? 0;
  const gates = readProp<string[]>(ctx.event, "gateFailures") ?? [];
  const topGate = gates[0] ?? "voice";
  const pagePath = readProp<string>(ctx.event, "pagePath") ?? "your new page";

  const finding = `Your update to ${pagePath} almost shipped with ${defectCount} phrase${
    defectCount === 1 ? "" : "s"
  } every agency uses. ${capitalize(vocab.customerTermPlural)} who have been burned by marketing spot that in seconds. We caught it before it went live.`;

  const fixHint =
    topGate === "bannedPhrase"
      ? "Replace the generic phrases and re-run publish."
      : topGate === "templateCollision"
      ? "Rewrite the sections that matched another site's copy, then re-run publish."
      : "Review the flagged sections listed in your dashboard, then re-run publish.";

  return composeOutput({
    templateName: "siteQaBlocked",
    event: ctx.event,
    org: ctx.org,
    finding,
    actionIfDollar: `Your page will publish when the flagged sections are corrected. ${fixHint}`,
    actionIfDataGap: `Your page will publish when the flagged sections are corrected. ${fixHint}`,
    dollarLabel: "Estimated 90-day avoided-cost:",
    surfaces: { dashboard: true, email: false, notification: true },
  });
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
