import type { TemplateContext, NarratorOutput } from "../types";
import { composeOutput } from "./_shared";
import { getVocab } from "../../vocabulary/vocabLoader";

export async function cleanWeekTemplate(ctx: TemplateContext): Promise<NarratorOutput> {
  const vocab = await getVocab(ctx.org.id ?? null);
  const finding = `Nothing moved against you this week. Your rankings held. Your ${vocab.referralSourceTerm}s engaged. The quiet here means Alloro is working.`;

  return composeOutput({
    templateName: "cleanWeek",
    event: ctx.event,
    org: ctx.org,
    finding,
    actionIfDollar: "Nothing from you required. Take the win.",
    actionIfDataGap: "Nothing from you required. Take the win.",
    dollarLabel: "Retained weekly run-rate:",
    forceTier: "unreasonable_hospitality",
    surfaces: { dashboard: true, email: true, notification: false },
  });
}
