import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import db from "../../src/database/connection";

const PROJECT_ID = "99fd9fdc-f53d-4602-8e4a-3c770d739bf5";

(async () => {
  // Find cost events from the latest warmup (last hour)
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const rows = await db("website_builder.ai_cost_events")
    .where("project_id", PROJECT_ID)
    .andWhere("created_at", ">", since)
    .orderBy("created_at", "desc")
    .select("event_type", "model", "input_tokens", "output_tokens", "metadata", "created_at");

  console.log(`Found ${rows.length} cost events in last 3h for project`);
  for (const r of rows) {
    const meta = r.metadata ? JSON.stringify(r.metadata).slice(0, 200) : "";
    console.log(
      `  ${new Date(r.created_at).toISOString()} | ${r.event_type} | ${r.model} | in=${r.input_tokens} out=${r.output_tokens} | ${meta}`,
    );
  }
  await db.destroy();
})();
