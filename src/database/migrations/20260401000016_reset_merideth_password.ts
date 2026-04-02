/**
 * Reset Merideth's password so she can log in to sandbox.
 *
 * Her account was created through the checkup flow with an unknown password.
 * This sets it to the same password as Jay and Rosanna for sandbox testing.
 */

import { Knex } from "knex";
import bcrypt from "bcrypt";

export async function up(knex: Knex): Promise<void> {
  const user = await knex("users").where({ email: "merideth@dentalemr.com" }).first();
  if (!user) return;

  const hash = await bcrypt.hash("dentalemr2026", 12);
  await knex("users").where({ id: user.id }).update({ password_hash: hash });
  console.log(`[Migration] Reset password for merideth@dentalemr.com (id: ${user.id})`);
}

export async function down(_knex: Knex): Promise<void> {
  // Cannot restore original password
}
