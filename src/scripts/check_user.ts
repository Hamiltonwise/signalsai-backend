
import { db } from "../database/connection";

async function checkUser(email: string) {
  console.log(`Checking for email: ${email}`);

  try {
    const user = await db("users").where({ email }).first();
    console.log("User found:", user ? "YES" : "NO");
    if (user) console.log(user);

    const invitation = await db("invitations").where({ email }).first();
    console.log("Invitation found:", invitation ? "YES" : "NO");
    if (invitation) console.log(invitation);

  } catch (error) {
    console.error("Error checking database:", error);
  } finally {
    await db.destroy();
  }
}

checkUser("laggy80@gmail.com");
