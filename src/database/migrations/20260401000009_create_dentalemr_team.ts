/**
 * Migration: Create DentalEMR team accounts
 *
 * Creates user accounts for Jay and Rosanna at DentalEMR (org 6).
 * Idempotent: checks if users exist before creating.
 * Uses bcrypt with 12 salt rounds (same as auth system).
 */

import { Knex } from "knex";
import bcrypt from "bcrypt";

const BCRYPT_SALT_ROUNDS = 12;
const ORG_ID = 6;

const USERS = [
  {
    email: "jay@dentalemr.com",
    name: "Jay",
    password: "dentalemr2026",
    role: "manager",
  },
  {
    email: "rosanna@dentalemr.com",
    name: "Rosanna",
    password: "dentalemr2026",
    role: "member",
  },
];

export async function up(knex: Knex): Promise<void> {
  for (const userData of USERS) {
    // Check if user already exists
    const existing = await knex("users")
      .where({ email: userData.email })
      .first();

    let userId: number;

    if (existing) {
      userId = existing.id;
      console.log(`[Migration] User ${userData.email} already exists (id: ${userId}), skipping creation`);
    } else {
      const passwordHash = await bcrypt.hash(userData.password, BCRYPT_SALT_ROUNDS);

      const [user] = await knex("users")
        .insert({
          email: userData.email,
          name: userData.name,
          password_hash: passwordHash,
          email_verified: true,
        })
        .returning(["id"]);

      userId = user.id;
      console.log(`[Migration] Created user ${userData.email} (id: ${userId})`);
    }

    // Check if already linked to org
    const existingLink = await knex("organization_users")
      .where({ user_id: userId, organization_id: ORG_ID })
      .first();

    if (existingLink) {
      console.log(`[Migration] User ${userData.email} already linked to org ${ORG_ID}, skipping`);
    } else {
      await knex("organization_users").insert({
        user_id: userId,
        organization_id: ORG_ID,
        role: userData.role,
      });
      console.log(`[Migration] Linked ${userData.email} to org ${ORG_ID} as ${userData.role}`);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const userData of USERS) {
    const user = await knex("users")
      .where({ email: userData.email })
      .first();

    if (user) {
      await knex("organization_users")
        .where({ user_id: user.id, organization_id: ORG_ID })
        .del();

      console.log(`[Migration] Removed ${userData.email} from org ${ORG_ID}`);
    }
  }
}
