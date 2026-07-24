import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";

export const SUPPORTED_MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime"
] as const;

export type SupportedMediaMimeType = (typeof SUPPORTED_MEDIA_MIME_TYPES)[number];

const EXTENSION_BY_MIME: Record<SupportedMediaMimeType, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov"
};

function detectMimeType(header: Buffer): SupportedMediaMimeType | null {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return "image/jpeg";
  }
  if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  const prefix = header.subarray(0, 12).toString("ascii");
  if (prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a")) return "image/gif";
  if (prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP") return "image/webp";
  if (header.length >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return "video/webm";
  }
  if (header.length >= 12 && header.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = header.subarray(8, 12).toString("ascii");
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  return null;
}

export async function inspectMediaFile(filePath: string): Promise<{
  checksumSha256: string;
  mimeType: SupportedMediaMimeType | null;
  sizeBytes: number;
}> {
  const hash = createHash("sha256");
  const headerChunks: Buffer[] = [];
  let headerLength = 0;
  let sizeBytes = 0;

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (value) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      hash.update(chunk);
      sizeBytes += chunk.length;
      if (headerLength < 64) {
        const slice = chunk.subarray(0, 64 - headerLength);
        headerChunks.push(slice);
        headerLength += slice.length;
      }
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  const header = Buffer.concat(headerChunks, headerLength);
  return {
    checksumSha256: hash.digest("hex"),
    mimeType: detectMimeType(header),
    sizeBytes
  };
}

export function canonicalMediaFilename(originalName: string, mimeType: SupportedMediaMimeType): string {
  const safeBasename = path.basename(originalName)
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_")
    .trim();
  const parsed = path.parse(safeBasename || "media");
  const stem = (parsed.name || "media").replace(/\s+/g, " ").slice(0, 140).replace(/[. ]+$/g, "") || "media";
  return `${stem}${EXTENSION_BY_MIME[mimeType]}`;
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

export class LocalMediaStorage {
  readonly rootDir: string;
  readonly tempDir: string;
  private readonly publicBaseUrl: string;

  constructor(input: { rootDir?: string | undefined; publicBaseUrl?: string | null | undefined } = {}) {
    this.rootDir = path.resolve(input.rootDir || path.resolve(process.cwd(), "uploads"));
    this.tempDir = path.join(this.rootDir, ".tmp");
    this.publicBaseUrl = (input.publicBaseUrl || "/uploads").replace(/\/+$/, "");
  }

  async ensureTempDir(): Promise<string> {
    await mkdir(this.tempDir, { recursive: true });
    return this.tempDir;
  }

  async commit(input: {
    tempPath: string;
    tenantId: string;
    ownerUserId: string;
    checksumSha256: string;
    filename: string;
  }): Promise<{ storagePath: string; absolutePath: string; publicUrl: string }> {
    const storagePath = path.posix.join(
      "media",
      safeSegment(input.tenantId),
      safeSegment(input.ownerUserId),
      input.checksumSha256.slice(0, 2),
      `${randomUUID()}-${input.filename}`
    );
    const absolutePath = path.resolve(this.rootDir, ...storagePath.split("/"));
    if (!isWithin(this.rootDir, absolutePath)) throw new Error("MEDIA_STORAGE_PATH_INVALID");
    await mkdir(path.dirname(absolutePath), { recursive: true });
    try {
      await rename(input.tempPath, absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
      await copyFile(input.tempPath, absolutePath);
      await rm(input.tempPath, { force: true });
    }
    return {
      storagePath,
      absolutePath,
      publicUrl: `${this.publicBaseUrl}/${storagePath}`.replace(/\\/g, "/")
    };
  }

  resolveStoredPath(storagePath: string): string | null {
    if (!storagePath || storagePath.startsWith("app://")) return null;
    const normalized = storagePath.replace(/\\/g, "/");
    let candidate: string;
    if (path.isAbsolute(storagePath)) {
      candidate = path.resolve(storagePath);
    } else if (normalized.startsWith("uploads/")) {
      candidate = path.resolve(process.cwd(), ...normalized.split("/"));
    } else {
      candidate = path.resolve(this.rootDir, ...normalized.split("/"));
    }
    return isWithin(this.rootDir, candidate) ? candidate : null;
  }

  async delete(storagePath: string): Promise<void> {
    const absolutePath = this.resolveStoredPath(storagePath);
    if (!absolutePath) {
      if (storagePath.startsWith("app://")) return;
      throw new Error("MEDIA_STORAGE_PATH_INVALID");
    }
    await rm(absolutePath, { force: true });
  }
}
