import type { TemplateContext, NarratorOutput } from "../types";
import { composeOutput, readProp } from "./_shared";

export function siteQaPassedTemplate(ctx: TemplateContext): NarratorOutput {
  const pagePath = readProp<string>(ctx.event, "pagePath") ?? "your new page";
  const gatesRun = readProp<number>(ctx.event, "gatesRun") ?? 10;

  const finding = `Your update to ${pagePath} cleared the ${gatesRun}-step quality review and is ready to publish. No phrases from the marketing wasteland survived.`;

  return composeOutput({
    templateName: "siteQaPassed",
    event: ctx.event,
    org: ctx.org,
    finding,
    actionIfDollar: "Nothing from you required.",
    actionIfDataGap: "Nothing from you required.",
    dollarLabel: "Estimated 90-day kept-momentum value:",
    surfaces: { dashboard: true, email: false, notification: false },
  });
}
