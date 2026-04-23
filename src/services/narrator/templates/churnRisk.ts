import type { TemplateContext, NarratorOutput } from "../types";
import { composeOutput } from "./_shared";

/**
 * churn.silent_quitter_risk template.
 *
 * Vertical-neutral. No GP, no patient, no referral language — the risk of
 * the owner drifting away is universal across the ICP (a CPA, a barber, a
 * chiropractor all show the same pattern). The voice stays quiet: Alloro
 * noticed, Alloro is watching, nothing from the owner required.
 */
export async function churnRiskTemplate(
  ctx: TemplateContext
): Promise<NarratorOutput> {
  // Intentionally vertical-neutral — no vocab substitutions here. The rest of
  // the pipeline expects async; awaiting nothing keeps the surface aligned.
  void ctx;
  const finding =
    "Your engagement pattern this week signals drift. Logins are holding but Monday email opens dropped.";
  const action = "Alloro is watching. Nothing from you required.";

  return composeOutput({
    templateName: "churnRisk",
    event: ctx.event,
    org: ctx.org,
    finding,
    actionIfDollar: action,
    actionIfDataGap: action,
    dollarLabel: "Retained weekly run-rate:",
    surfaces: { dashboard: true, email: false, notification: true },
  });
}
