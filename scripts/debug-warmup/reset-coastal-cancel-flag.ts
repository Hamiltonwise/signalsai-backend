/**
 * Force-reset `generation_cancel_requested` on the Coastal project.
 * Unblocks page generation when a stale cancel flag is flipping new pages
 * to `cancelled` on arrival.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import db from "../../src/database/connection";

const PROJECT_ID = "99fd9fdc-f53d-4602-8e4a-3c770d739bf5";

(async () => {
  const before = await db("website_builder.projects")
    .where("id", PROJECT_ID)
    .select("generation_cancel_requested")
    .first();

  console.log(
    `before: generation_cancel_requested = ${before?.generation_cancel_requested}`,
  );

  await db("website_builder.projects")
    .where("id", PROJECT_ID)
    .update({
      generation_cancel_requested: false,
      updated_at: db.fn.now(),
    });

  const after = await db("website_builder.projects")
    .where("id", PROJECT_ID)
    .select("generation_cancel_requested")
    .first();

  console.log(
    `after:  generation_cancel_requested = ${after?.generation_cancel_requested}`,
  );

  await db.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
