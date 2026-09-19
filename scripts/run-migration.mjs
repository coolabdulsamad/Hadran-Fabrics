#!/usr/bin/env node
/**
 * Apply a SQL migration file against DATABASE_URL, statement by statement.
 * Idempotent: statements that fail only because the object already exists
 * (duplicate column / duplicate key / table exists) are skipped, so a
 * migration can be safely re-run on a partially-migrated database.
 *
 * Usage: node scripts/run-migration.mjs <file.sql> [database-url]
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import mysql from "mysql2/promise";

config();

const file = process.argv[2];
const url = process.argv[3] || process.env.DATABASE_URL;
if (!file || !url) {
  console.error("Usage: node scripts/run-migration.mjs <file.sql> [database-url]");
  process.exit(1);
}

// Split on semicolons at line ends; strip comment-only chunks.
const raw = readFileSync(file, "utf8");
const statements = raw
  .split(/;\s*(?:\n|$)/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !/^\s*--/.test(s.replace(/^--[^\n]*\n/gm, "").trim()));

const SKIPPABLE = new Set([
  "ER_DUP_FIELDNAME", // column already exists
  "ER_DUP_KEYNAME", // index name already exists
  "ER_FK_DUP_NAME", // foreign key already exists
  "ER_TABLE_EXISTS_ERROR",
  "ER_DUP_ENTRY", // seed row already present
]);

const conn = await mysql.createConnection(url);
let applied = 0, skipped = 0, failed = 0;
try {
  for (const stmt of statements) {
    const clean = stmt.replace(/^--[^\n]*$/gm, "").trim();
    if (!clean) continue;
    try {
      await conn.query(clean);
      applied++;
    } catch (e) {
      if (SKIPPABLE.has(e.code)) {
        skipped++;
      } else {
        failed++;
        console.error(`FAILED: ${e.sqlMessage || e.message}\n  → ${clean.slice(0, 90)}…`);
      }
    }
  }
} finally {
  await conn.end();
}
console.log(`Migration ${file}: ${applied} applied, ${skipped} skipped (already done), ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
