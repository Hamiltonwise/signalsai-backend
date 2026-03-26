/**
 * Migration: Add voice_profile to organizations
 *
 * Stores the partner's extracted voice profile for the email writing assistant.
 * Pre-loads Merideth Glasco's profile from transcript analysis.
 */

import { Knex } from "knex";

const MERIDETH_VOICE_PROFILE = `VOICE PROFILE: Merideth Glasco

RHYTHM:
Builds context before landing the point.
Medium-length sentences that layer reasoning.
Uses numbered lists naturally when explaining process.
Transitional phrases to connect ideas ("In terms of...", "What I've found is...").
Ends messages with an open door, not a closed decision.

TONE:
Warm, organized, and solution-oriented.
Builds trust before she closes. Never pushy.
Strategic but collaborative -- presents options, doesn't dictate.
Authentic about uncertainty: "I don't know yet, but here's what I think."
With DentalEMR clients: advisor energy, not vendor energy.
With Alloro/partners: peer, working toward shared outcomes.

NEVER SAYS:
Hard closes. Pressure language.
"You need to do this."
Overly technical software language.
Anything that sounds like a sales script.
Generic platitudes about "partnering together."

ALWAYS DOES:
Frames decisions around the doctor's outcome, not the product's features.
Acknowledges complexity before simplifying it.
Respects her audience's time -- short, friendly, educational.
Uses "we" when talking about shared goals.
Asks one clear question at the end rather than multiple.

VOCABULARY:
"In terms of...", "What I've found is...", "The goal here is...", "Make sense?", "Happy to..."
Dental-specific: "practice growth," "referral base," "patient experience"

WHAT SHE CARES ABOUT:
Doctors feeling supported, not sold to.
Her team having the right tools to succeed.
Marketing that builds trust, not hype.
Not wasting anyone's time.
Delivering on what she promises.

SAMPLE SENTENCES:
"I wanted to share something that might help -- we've been seeing practices use this to get ahead of the conversation before AAE."
"In terms of next steps, I think the simplest path is X -- but happy to talk through it if you have questions."
"What I've found is that when doctors see the data on their own practice, the conversation changes pretty quickly."`;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (t) => {
    t.text("voice_profile");
  });

  // Pre-load Merideth's voice profile if her org exists
  // Search for DentalEMR or Merideth in org names
  const meridethOrg = await knex("organizations")
    .whereILike("name", "%dentalemr%")
    .orWhereILike("name", "%merideth%")
    .orWhereILike("name", "%glasco%")
    .first();

  if (meridethOrg) {
    await knex("organizations")
      .where({ id: meridethOrg.id })
      .update({ voice_profile: MERIDETH_VOICE_PROFILE });
    console.log(`[Migration] Pre-loaded Merideth's voice profile for org ${meridethOrg.id}`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organizations", (t) => {
    t.dropColumn("voice_profile");
  });
}
