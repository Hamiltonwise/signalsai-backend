import { db } from "../src/database/connection";

(async () => {
  try {
    const cols = await db.raw(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'vocabulary_configs' ORDER BY ordinal_position`,
    );
    console.log(JSON.stringify(cols.rows, null, 2));
  } catch (err: unknown) {
    console.error(err);
  } finally {
    await db.destroy();
  }
})();
