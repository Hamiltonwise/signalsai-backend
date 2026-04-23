import type { TemplateContext, NarratorOutput } from "../types";
import { composeOutput, readProp } from "./_shared";
import { getVocab } from "../../vocabulary/vocabLoader";

export async function sitePublishedTemplate(
  ctx: TemplateContext
): Promise<NarratorOutput> {
  const vocab = await getVocab(ctx.org.id ?? null);
  const siteUrl = readProp<string>(ctx.event, "siteUrl") ?? "your site";
  const pageCount = readProp<number>(ctx.event, "pageCount") ?? 7;

  const finding = `Your new home on the web is ready. ${pageCount} pages, written in your voice, live now at ${siteUrl}. Ranked against the three competitors your ${vocab.customerTermPlural} are comparing you to before the publish went through.`;

  return composeOutput({
    templateName: "sitePublished",
    event: ctx.event,
    org: ctx.org,
    finding,
    actionIfDollar: `A card is on its way to your office. You will know it when you see it. No action required.`,
    actionIfDataGap: `A card is on its way to your office. You will know it when you see it. No action required.`,
    dollarLabel: "Estimated year-one referral lift:",
    forceTier: "unreasonable_hospitality",
    surfaces: { dashboard: true, email: true, notification: true },
  });
}
