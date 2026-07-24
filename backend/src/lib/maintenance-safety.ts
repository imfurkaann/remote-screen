const DESTRUCTIVE_CONFIRMATION = "remote_screen-delete-data";

export function assertDestructiveMaintenanceAllowed(
  action: string,
  environment: NodeJS.ProcessEnv = process.env
): void {
  if ((environment.NODE_ENV ?? "development").toLowerCase() === "production") {
    throw new Error(`DESTRUCTIVE_MAINTENANCE_BLOCKED: ${action} cannot run in production`);
  }

  if (environment.ALLOW_DESTRUCTIVE_DB_MAINTENANCE !== "true") {
    throw new Error(
      `DESTRUCTIVE_MAINTENANCE_BLOCKED: set ALLOW_DESTRUCTIVE_DB_MAINTENANCE=true for ${action}`
    );
  }

  if (environment.DESTRUCTIVE_DB_CONFIRM !== DESTRUCTIVE_CONFIRMATION) {
    throw new Error(
      `DESTRUCTIVE_MAINTENANCE_BLOCKED: set DESTRUCTIVE_DB_CONFIRM=${DESTRUCTIVE_CONFIRMATION} for ${action}`
    );
  }
}
