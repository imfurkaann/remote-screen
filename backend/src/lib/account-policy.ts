export const TENANT_USER_ROLES = ["tenant_owner", "tenant_admin", "operator", "viewer"] as const;
export type TenantUserRole = (typeof TENANT_USER_ROLES)[number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 100 ? name : null;
}

export function normalizeTenantName(value: unknown): { name: string; nameKey: string } | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) return null;
  return { name, nameKey: name.toLocaleLowerCase("en-US") };
}

export function isTenantUserRole(value: unknown): value is TenantUserRole {
  return typeof value === "string" && (TENANT_USER_ROLES as readonly string[]).includes(value);
}

export function validatePassword(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) return null;
  const categories = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)]
    .filter(Boolean).length;
  return categories >= 3 ? value : null;
}

export function parsePagination(
  pageValue: unknown,
  limitValue: unknown,
  defaults: { page?: number; limit?: number; maxLimit?: number } = {}
): { page: number; limit: number; skip: number } | null {
  const page = pageValue === undefined ? (defaults.page ?? 1) : Number(pageValue);
  const limit = limitValue === undefined ? (defaults.limit ?? 100) : Number(limitValue);
  const maxLimit = defaults.maxLimit ?? 200;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    return null;
  }
  return { page, limit, skip: (page - 1) * limit };
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}