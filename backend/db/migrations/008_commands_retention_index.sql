-- migrate:no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commands_completed_retention
  ON commands (completed_at, id)
  WHERE status IN ('completed', 'failed', 'timeout');
