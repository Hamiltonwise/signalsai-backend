import { db } from "../src/database/connection";

async function main(): Promise<void> {
  const tables = [
    "referral_sources",
    "pms_jobs",
    "form_submissions",
    "review_requests",
    "review_notifications",
    "weekly_ranking_snapshots",
    "weekly_digests",
    "behavioral_events",
  ];
  for (const t of tables) {
    const exists = await db.raw(
      "SELECT to_regclass(?) AS reg",
      [`public.${t}`],
    );
    if (!exists.rows[0].reg) {
      console.log(`${t}: TABLE NOT FOUND`);
      continue;
    }
    const cols = await db.raw(
      "SELECT column_name FROM information_schema.columns WHERE table_name = ? ORDER BY column_name",
      [t],
    );
    const names = (cols.rows || []).map((r: { column_name: string }) => r.column_name);
    const hasLoc = names.includes("location_id");
    const hasOrg = names.includes("organization_id") || names.includes("org_id");
    console.log(
      `${t}: location_id=${hasLoc} org_id=${hasOrg} [${names.length} cols]`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
