import type { TemplateContext, NarratorOutput } from "../types";
import { composeOutput, readProp } from "./_shared";
import { getVocab } from "../../vocabulary/vocabLoader";

export async function weeklyRankingUpdateTemplate(
  ctx: TemplateContext
): Promise<NarratorOutput> {
  await getVocab(ctx.org.id ?? null);
  const direction = readProp<string>(ctx.event, "direction") ?? "held";
  const rank = readProp<number>(ctx.event, "rank");
  const totalTracked = readProp<number>(ctx.event, "totalTracked");
  const topCompetitor = readProp<string>(ctx.event, "topCompetitor") ?? "the market";

  const position =
    rank != null && totalTracked != null
      ? `#${rank} of ${totalTracked}`
      : "your tracked position";

  let finding: string;
  if (direction === "up") {
    finding = `You moved up against ${topCompetitor} this week. Your market position is ${position}. The change is small enough to be real.`;
  } else if (direction === "down") {
    finding = `${topCompetitor} pulled ahead this week. Your market position is ${position}. Alloro is tracking it.`;
  } else {
    finding = `Your rankings held. Position ${position}. Holding is the 80% case in this market.`;
  }

  return composeOutput({
    templateName: "weeklyRankingUpdate",
    event: ctx.event,
    org: ctx.org,
    finding,
    actionIfDollar: "Nothing from you required.",
    actionIfDataGap: "Nothing from you required.",
    dollarLabel: "Estimated 90-day position value:",
    surfaces: { dashboard: true, email: true, notification: false },
  });
}
