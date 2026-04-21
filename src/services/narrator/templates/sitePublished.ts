import type { TemplateContext, NarratorOutput } from "../types";
import { composeOutput, readProp } from "./_shared";

export function sitePublishedTemplate(ctx: TemplateContext): NarratorOutput {
  const siteUrl = readProp<string>(ctx.event, "siteUrl") ?? "your site";
  const pageCount = readProp<number>(ctx.event, "pageCount") ?? 7;

  const finding = `Your new practice home is ready. ${pageCount} pages, written in your voice, live now at ${siteUrl}. Ranked against the three competitors your patients are comparing you to before the publish went through.`;

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
