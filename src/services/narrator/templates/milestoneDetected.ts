import type { TemplateContext, NarratorOutput } from "../types";
import { composeOutput, readProp } from "./_shared";

export function milestoneDetectedTemplate(ctx: TemplateContext): NarratorOutput {
  const kind = readProp<string>(ctx.event, "kind") ?? "milestone";
  const delta = readProp<string>(ctx.event, "delta") ?? "";
  const orgName = ctx.org.name ?? "your practice";

  let finding: string;
  if (kind === "anniversary") {
    const years = readProp<number>(ctx.event, "years") ?? 1;
    finding = `${orgName} turned ${years} ${years === 1 ? "year" : "years"} old this week. No software noticed that until now.`;
  } else if (kind === "year_over_year_growth") {
    finding = `You pulled ahead of last year ${delta ? `by ${delta}` : ""}. Not by accident. The pattern your patients are responding to is the one you changed in spring.`;
  } else {
    finding = `A quiet milestone you would have skipped past: ${delta || kind}.`;
  }

  return composeOutput({
    templateName: "milestoneDetected",
    event: ctx.event,
    org: ctx.org,
    finding,
    actionIfDollar: "Nothing from you required. Tell the team.",
    actionIfDataGap: "Nothing from you required. Tell the team.",
    dollarLabel: "Quarter-on-quarter retained value:",
    forceTier: "unreasonable_hospitality",
    surfaces: { dashboard: true, email: true, notification: true },
  });
}
