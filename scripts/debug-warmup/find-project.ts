import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import db from "../../src/database/connection";

(async () => {
  const rows = await db("website_builder.projects")
    .select("id", "display_name", "generated_hostname", "selected_place_ids", "primary_place_id", "selected_place_id")
    .where("display_name", "ilike", "%coastal%")
    .orWhere("generated_hostname", "ilike", "%coastal%")
    .orWhere("generated_hostname", "ilike", "%endo%")
    .limit(10);
  console.log(JSON.stringify(rows, null, 2));
  await db.destroy();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
