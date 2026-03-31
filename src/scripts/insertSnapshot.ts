import { db } from "../database/connection";
const ws = new Date();
ws.setDate(ws.getDate() - ws.getDay() + 1);
db("weekly_ranking_snapshots").insert({
  org_id: 42,
  week_start: ws.toISOString().split("T")[0],
  position: 4,
  keyword: "endodontist salt lake city",
  bullets: JSON.stringify(["You rank #4 in Salt Lake City.", "Wasatch Endodontics has 223 more reviews."]),
  finding_headline: "Wasatch gained 6 reviews last week",
  dollar_figure: 3122,
  competitor_name: "Wasatch Endodontics",
  competitor_review_count: 281,
  client_review_count: 58,
}).then(() => { console.log("Snapshot inserted"); db.destroy(); })
  .catch((e: any) => { console.log("Error:", e.message); db.destroy(); });
