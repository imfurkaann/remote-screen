import { createHash } from "node:crypto";
import { Types } from "mongoose";

export type PlaylistInputItem = {
  media_id: string;
  duration_ms: number;
  position: number;
};

export function normalizePlaylistName(value: unknown): { name: string; nameKey: string } | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120 || /[\u0000-\u001f]/.test(name)) return null;
  return { name, nameKey: name.toLocaleLowerCase("tr-TR") };
}

export function parsePlaylistItems(
  input: unknown,
  maxItems: number
): { items: PlaylistInputItem[]; error: string | null } {
  if (!Array.isArray(input) || input.length < 1) {
    return { items: [], error: "Playlist must contain at least one item" };
  }
  if (input.length > maxItems) {
    return { items: [], error: `Playlist cannot exceed ${maxItems} items` };
  }

  const items: PlaylistInputItem[] = [];
  const positions = new Set<number>();
  for (let index = 0; index < input.length; index += 1) {
    const value = input[index] as { media_id?: unknown; duration_ms?: unknown; position?: unknown };
    const mediaId = String(value?.media_id ?? "").trim();
    const durationMs = Number(value?.duration_ms ?? 10_000);
    const position = Number(value?.position ?? index);
    if (!Types.ObjectId.isValid(mediaId)) {
      return { items: [], error: "Playlist contains an invalid media id" };
    }
    if (!Number.isInteger(durationMs) || durationMs < 1_000 || durationMs > 86_400_000) {
      return { items: [], error: "Item duration must be between 1 second and 24 hours" };
    }
    if (!Number.isInteger(position) || position < 0 || position >= input.length || positions.has(position)) {
      return { items: [], error: "Playlist positions must be unique sequential integers" };
    }
    positions.add(position);
    items.push({ media_id: mediaId, duration_ms: durationMs, position });
  }

  return {
    items: items.sort((left, right) => left.position - right.position)
      .map((item, position) => ({ ...item, position })),
    error: null
  };
}

export function playlistContentChecksum(items: Array<{
  mediaId: string;
  mediaUrl: string;
  checksumSha256: string;
  mimeType: string;
  durationMs: number;
  position: number;
}>): string {
  return createHash("sha256").update(JSON.stringify(items.map((item) => ({
    mediaId: item.mediaId,
    mediaUrl: item.mediaUrl,
    checksumSha256: item.checksumSha256,
    mimeType: item.mimeType,
    durationMs: item.durationMs,
    position: item.position
  })))).digest("hex");
}

export function normalizeCreationKey(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const key = value.trim();
  return /^[a-zA-Z0-9_-]{8,100}$/.test(key) ? key : null;
}
