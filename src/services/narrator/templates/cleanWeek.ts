import type { TemplateContext, NarratorOutput } from "../types";
import { composeOutput } from "./_shared";

export function cleanWeekTemplate(ctx: TemplateContext): NarratorOutput {
  const finding = `Nothing moved against you this week. Your rankings held. Your referrers engaged. The quiet here means Alloro is working.`;

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
