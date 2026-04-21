import type { TemplateContext, NarratorOutput } from "../types";
import { composeOutput, readProp } from "./_shared";

export function referralSignalTemplate(ctx: TemplateContext): NarratorOutput {
  const kind = ctx.event.eventType;
  const gpName = readProp<string>(ctx.event, "gpName") ?? "one of your referring GPs";
  const daysSilent = readProp<number>(ctx.event, "daysSilent") ?? 0;
  const referralCount = readProp<number>(ctx.event, "referralCount");

  let finding: string;
  let actionIfDollar: string;
  let actionIfDataGap: string;

  if (kind === "gp.gone_dark") {
    finding = `${gpName} has not sent a patient in ${daysSilent} days. They used to be a steady source. Something changed on their side.`;
    actionIfDollar =
      "Alloro is preparing a re-engagement note in your voice. You will see it in the dashboard before Friday.";
    actionIfDataGap = actionIfDollar;
  } else if (kind === "gp.drift_detected") {
    finding = `${gpName}'s referrals are trending down. Not dark yet. Catching this now is cheaper than catching it in 60 days.`;
    actionIfDollar =
      "Alloro is drafting a short check-in note for your review. No action from you until then.";
    actionIfDataGap = actionIfDollar;
  } else if (kind === "referral.positive_signal") {
    finding = `${gpName} sent ${referralCount ?? "multiple"} patients this week. The relationship is earning you real money.`;
    actionIfDollar =
      "Alloro is drafting a thank-you note in your voice. You review, you send. 30 seconds.";
    actionIfDataGap = actionIfDollar;
  } else {
    finding = `${gpName}: ${kind.replace(/_/g, " ")}.`;
    actionIfDollar = "Nothing from you required.";
    actionIfDataGap = actionIfDollar;
  }

  return composeOutput({
    templateName: "referralSignal",
    event: ctx.event,
    org: ctx.org,
    finding,
    actionIfDollar,
    actionIfDataGap,
    dollarLabel: "Estimated 90-day at-risk revenue:",
    surfaces: { dashboard: true, email: false, notification: true },
  });
}
