import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/rustinedave/Desktop/alloro/.env" });

import { scrapeUrlWithEscalation } from "../../src/controllers/admin-websites/feature-services/service.url-scrape-strategies";

const URLS = [
  "http://coastalendostudio.com/",
  "https://coastalendostudio.com/",
  "https://www.coastalendostudio.com/",
];

(async () => {
  for (const u of URLS) {
    console.log(`\n${"=".repeat(60)}\n${u}\n${"=".repeat(60)}`);
    try {
      const r = await scrapeUrlWithEscalation(u, "browser");
      const first = String(Object.values(r.pages)[0] || "");
      console.log(`  final: ${r.strategy_used_final} | raw: ${first.length} | images: ${r.images.length}`);
    } catch (e: any) {
      console.log(`  FAILED: ${e?.message}`);
    }
  }
  process.exit(0);
})();
