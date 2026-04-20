import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });
import db from "../../src/database/connection";

(async () => {
  const all = await db("website_builder.templates")
    .select("*")
    .orderBy("name");
  for (const t of all) {
    const ls = t.layout_slots;
    const slotCount = Array.isArray(ls)
      ? ls.length
      : typeof ls === "string"
        ? (() => { try { const p = JSON.parse(ls); return Array.isArray(p) ? p.length : "non-array"; } catch { return "bad-json"; } })()
        : ls == null ? "null" : "non-array";
    console.log(`${t.id}  slots=${slotCount}  — ${t.name}`);
    if (Object.keys(t).length && all.indexOf(t) === 0) {
      console.log(`columns: ${Object.keys(t).join(", ")}\n`);
    }
  }
  await db.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
