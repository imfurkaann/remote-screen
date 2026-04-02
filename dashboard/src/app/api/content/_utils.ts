import { cookies } from "next/headers";

export function getBackendBaseUrl(): string {
  return process.env.BACKEND_BASE_URL ?? "http://localhost:4100";
}

export async function getDashboardAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get("dashboard_access_token")?.value ?? null;
}
