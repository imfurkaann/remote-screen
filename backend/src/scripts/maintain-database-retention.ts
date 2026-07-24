import { getEnv } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../lib/mongo.js";
import { connectPostgres, disconnectPostgres, getPostgresPool, isPostgresConnected } from "../lib/postgres.js";
import { CommandModel } from "../models/command.model.js";
import { PairingAuditModel } from "../models/pairing-audit.model.js";

function retentionDays(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 30 || value > 3650) {
    throw new Error(`${name} must be an integer between 30 and 3650`);
  }
  return value;
}

async function deleteMongoCommandsInBatches(filter: Record<string, unknown>): Promise<number> {
  let deleted = 0;
  for (;;) {
    const ids = await CommandModel.find(filter).sort({ completedAt: 1, _id: 1 }).limit(1_000).distinct("_id");
    if (ids.length === 0) return deleted;
    const result = await CommandModel.deleteMany({ _id: { $in: ids } });
    deleted += result.deletedCount;
  }
}

async function deleteMongoAuditsInBatches(filter: Record<string, unknown>): Promise<number> {
  let deleted = 0;
  for (;;) {
    const ids = await PairingAuditModel.find(filter).sort({ createdAt: 1, _id: 1 }).limit(1_000).distinct("_id");
    if (ids.length === 0) return deleted;
    const result = await PairingAuditModel.deleteMany({ _id: { $in: ids } });
    deleted += result.deletedCount;
  }
}

async function deletePostgresCommandsInBatches(cutoff: Date): Promise<number> {
  if (!isPostgresConnected()) return 0;
  const pool = getPostgresPool();
  let deleted = 0;
  for (;;) {
    const result = await pool.query(
      `WITH candidates AS (
         SELECT id
           FROM commands
          WHERE completed_at < $1
            AND status IN ('completed', 'failed', 'timeout')
          ORDER BY completed_at, id
          LIMIT 1000
       )
       DELETE FROM commands c USING candidates
        WHERE c.id = candidates.id`,
      [cutoff]
    );
    const batch = result.rowCount ?? 0;
    deleted += batch;
    if (batch < 1_000) return deleted;
  }
}

async function run(): Promise<void> {
  const apply = process.argv.includes("--apply");
  if (apply && !process.argv.includes("--confirm-retention")) {
    throw new Error("RETENTION_CONFIRMATION_REQUIRED: pass --apply --confirm-retention");
  }

  const env = getEnv();
  const commandCutoff = new Date(Date.now() - retentionDays("COMMAND_RETENTION_DAYS", 180) * 86_400_000);
  const auditCutoff = new Date(Date.now() - retentionDays("PAIRING_AUDIT_RETENTION_DAYS", 365) * 86_400_000);

  await connectMongo(env.mongoUri, {
    maxPoolSize: Math.min(env.mongoMaxPoolSize ?? 100, 10),
    minPoolSize: 0,
    autoIndex: false
  });

  try {
    await connectPostgres(env);
    const commandFilter = {
      status: { $in: ["completed", "failed", "timeout"] },
      completedAt: { $lt: commandCutoff }
    };
    const auditFilter = { createdAt: { $lt: auditCutoff } };
    const [commands, auditEvents, postgresCommands] = await Promise.all([
      CommandModel.countDocuments(commandFilter),
      PairingAuditModel.countDocuments(auditFilter),
      isPostgresConnected()
        ? getPostgresPool()
            .query<{ count: string }>(
              "SELECT COUNT(*)::text AS count FROM commands WHERE completed_at < $1 AND status IN ('completed', 'failed', 'timeout')",
              [commandCutoff]
            )
            .then((result) => Number(result.rows[0]?.count ?? 0))
        : Promise.resolve(0)
    ]);

    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : "dry-run",
          commandCutoff,
          pairingAuditCutoff: auditCutoff,
          candidates: { mongoCommands: commands, postgresCommands, pairingAuditEvents: auditEvents }
        },
        null,
        2
      )
    );

    if (apply) {
      const [mongoCommands, pairingAuditEvents, pgCommands] = await Promise.all([
        deleteMongoCommandsInBatches(commandFilter),
        deleteMongoAuditsInBatches(auditFilter),
        deletePostgresCommandsInBatches(commandCutoff)
      ]);
      console.log(JSON.stringify({ deleted: { mongoCommands, postgresCommands: pgCommands, pairingAuditEvents } }));
    }
  } finally {
    await Promise.allSettled([disconnectMongo(), disconnectPostgres()]);
  }
}

run().catch((error) => {
  console.error("[database-retention] failed", error);
  process.exitCode = 1;
});