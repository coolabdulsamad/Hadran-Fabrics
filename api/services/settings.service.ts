import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { settings } from "@db/schema";

/**
 * HADRAN FABRICS MALL — shared settings reader.
 * Returns the parsed JSON value for a key, or the fallback when the key is
 * missing or unparsable.
 */
export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const db = getDb();
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (!rows[0]) return fallback;
  try {
    return JSON.parse(rows[0].value) as T;
  } catch {
    return fallback;
  }
}
