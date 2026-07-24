import { TenantModel } from "../models/tenant.model.js";

const CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 10_000;
const cache = new Map<string, { active: boolean; expiresAt: number }>();

export async function isTenantActive(tenantId: string): Promise<boolean> {
  const now = Date.now();
  const cached = cache.get(tenantId);
  if (cached && cached.expiresAt > now) return cached.active;
  if (cached) cache.delete(tenantId);

  const active = Boolean(await TenantModel.exists({ _id: tenantId, isActive: true }));
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest) cache.delete(oldest);
  }
  cache.set(tenantId, { active, expiresAt: now + CACHE_TTL_MS });
  return active;
}

export function invalidateTenantState(tenantId: string): void {
  cache.delete(tenantId);
}

export function clearTenantStateCache(): void {
  cache.clear();
}