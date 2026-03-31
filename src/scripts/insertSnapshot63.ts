import { db } from "../database/connection";
const ws = new Date();
ws.setDate(ws.getDate() - ws.getDay() + 1);
db("weekly_ranking_snapshots").insert({
  org_id: 63,
  week_start: ws.toISOString().split("T")[0],
  position: 1,
  keyword: "business clarity platform",
  bullets: JSON.stringify(["Alloro HQ is operational.", "3 team members active."]),
  finding_headline: "Your team is inside the product",
  dollar_figure: 0,
  competitor_name: null,
  competitor_review_count: 0,
  client_review_count: 0,
}).then(() => { console.log("done"); db.destroy(); })
  .catch((e: any) => { console.log(e.message); db.destroy(); });
