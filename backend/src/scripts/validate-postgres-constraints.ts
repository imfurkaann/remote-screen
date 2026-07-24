import { getEnv } from "../config/env.js";
import { connectPostgres, disconnectPostgres, getPostgresPool } from "../lib/postgres.js";

type ConstraintRow = {
  table_name: string;
  constraint_name: string;
  definition: string;
};

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error(`UNSAFE_POSTGRES_IDENTIFIER:${value}`);
  }
  return `"${value}"`;
}
async function run(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const env = getEnv();
  if (!env.pgEnabled) throw new Error("PG_ENABLED=true is required");
  if (apply && !process.argv.includes("--confirm-validation")) {
    throw new Error("CONSTRAINT_VALIDATION_CONFIRMATION_REQUIRED: pass --apply --confirm-validation");
  }

  await connectPostgres(env);
  try {
    const pool = getPostgresPool();
    const result = await pool.query<ConstraintRow>(`
      SELECT
        relation.relname AS table_name,
        constraint_row.conname AS constraint_name,
        pg_get_constraintdef(constraint_row.oid) AS definition
      FROM pg_constraint constraint_row
      JOIN pg_class relation ON relation.oid = constraint_row.conrelid
      WHERE constraint_row.connamespace = current_schema()::regnamespace
        AND NOT constraint_row.convalidated
      ORDER BY relation.relname, constraint_row.conname
    `);

    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "dry-run",
          unvalidatedCount: result.rows.length,
          constraints: result.rows
        },
        null,
        2
      )
    );
    if (!apply) return;

    for (const row of result.rows) {
      await pool.query(
        `ALTER TABLE ${quoteIdentifier(row.table_name)} VALIDATE CONSTRAINT ${quoteIdentifier(row.constraint_name)}`
      );
      console.log(`[postgres-constraints] validated ${row.table_name}.${row.constraint_name}`);
    }
  } finally {
    await disconnectPostgres();
  }
}

run().catch((error) => {
  console.error("[postgres-constraints] failed", error);
  process.exitCode = 1;
});
