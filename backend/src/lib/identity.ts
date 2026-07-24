const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

/**
 * PostgreSQL stores shadow user references as UUID values while MongoDB uses
 * ObjectIds. Prefixing the 24 hexadecimal ObjectId characters with eight zeroes
 * produces a deterministic, reversible UUID without maintaining a mapping table.
 */
export function databaseIdentityToUuid(id: string): string {
  const normalized = id.trim().toLowerCase();
  if (UUID_PATTERN.test(normalized)) return normalized;
  if (!OBJECT_ID_PATTERN.test(normalized)) {
    throw new Error("DATABASE_IDENTITY_INVALID");
  }

  const hex32 = `00000000${normalized}`;
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20)}`;
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}
