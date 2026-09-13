import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Router } from "express";
import { Types } from "mongoose";
import rateLimit from "express-rate-limit";
import { Logger } from "../lib/logger.js";
import { renderNoticeHtml } from "../lib/notice-renderer.js";
import { renderQrHtml } from "../lib/qr-renderer.js";
import { parseRssXml, renderRssHtml, type ParsedRssFeed } from "../lib/rss-renderer.js";
import { renderWeatherHtml } from "../lib/weather-renderer.js";
import { renderWayfindingHtml } from "../lib/wayfinding-renderer.js";
import { renderEventsHtml, renderHotelGuideHtml } from "../lib/hotel-renderers.js";
import { renderRestaurantMenuHtml } from "../lib/restaurant-menu-renderer.js";
import { normalizePlaylistName, playlistContentChecksum } from "../lib/playlist-policy.js";
import { requireRoles, requireUserAuth } from "../middlewares/auth.js";
import { DeviceModel } from "../models/device.model.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel, type PlaylistItemDoc } from "../models/playlist.model.js";
import { contentRepository } from "../repositories/content.repository.js";
import { emitSyncContentToDevices, type SyncContentPayload } from "../sockets/registry.js";

const logger = new Logger("AppsRoute");
const SUPPORTED_APP_TYPES = new Set(["clock", "weather", "rss", "notice", "qrcode", "wayfinding", "events", "hotel-guide", "restaurant-menu"]);

const RSS_MAX_BYTES = 1_000_000;
const RSS_MAX_REDIRECTS = 3;

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(normalized) === 4) {
    const parts = normalized.split(".").map(Number);
    const [a = 0, b = 0] = parts;
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || a >= 224;
  }
  return normalized === "::1" || normalized === "::" ||
    normalized.startsWith("fc") || normalized.startsWith("fd") ||
    normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
    normalized.startsWith("fea") || normalized.startsWith("feb");
}

async function assertPublicHttpsUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Only public HTTPS feed URLs are allowed");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Feed host resolves to a private or restricted address");
  }
  return url;
}

async function fetchPublicRss(rawUrl: string): Promise<string> {
  let currentUrl = rawUrl;
  for (let redirectCount = 0; redirectCount <= RSS_MAX_REDIRECTS; redirectCount += 1) {
    const validatedUrl = await assertPublicHttpsUrl(currentUrl);
    const response = await fetch(validatedUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
      headers: { "user-agent": "RemoteScreen-RSS/1.0", accept: "application/rss+xml, application/xml, text/xml" }
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === RSS_MAX_REDIRECTS) throw new Error("Unsafe or excessive RSS redirect");
      currentUrl = new URL(location, validatedUrl).toString();
      continue;
    }
    if (!response.ok || !response.body) throw new Error("RSS upstream returned HTTP " + response.status);

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > RSS_MAX_BYTES) throw new Error("RSS response is too large");

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > RSS_MAX_BYTES) {
        await reader.cancel();
        throw new Error("RSS response is too large");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  throw new Error("RSS redirect limit exceeded");
}

type RssCacheEntry = {
  feed: ParsedRssFeed;
  freshUntil: number;
  staleUntil: number;
  lastAccess: number;
};

const RSS_CACHE_FRESH_MS = 5 * 60_000;
const RSS_CACHE_STALE_MS = 6 * 60 * 60_000;
const RSS_CACHE_MAX_ENTRIES = 500;
const rssFeedCache = new Map<string, RssCacheEntry>();
const rssFeedRequests = new Map<string, Promise<ParsedRssFeed & { stale: boolean }>>();

function normalizeRssCacheKey(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  return url.toString();
}

function pruneRssCache(): void {
  if (rssFeedCache.size < RSS_CACHE_MAX_ENTRIES) return;
  const oldest = [...rssFeedCache.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess)[0]?.[0];
  if (oldest) rssFeedCache.delete(oldest);
}

async function loadCachedRss(rawUrl: string): Promise<ParsedRssFeed & { stale: boolean }> {
  const cacheKey = normalizeRssCacheKey(rawUrl);
  const now = Date.now();
  const cached = rssFeedCache.get(cacheKey);
  if (cached && cached.freshUntil > now) {
    cached.lastAccess = now;
    return { ...cached.feed, stale: false };
  }
  const pending = rssFeedRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    try {
      const feed = parseRssXml(await fetchPublicRss(cacheKey));
      if (feed.items.length === 0) throw new Error("RSS feed contains no supported items");
      pruneRssCache();
      rssFeedCache.set(cacheKey, {
        feed,
        freshUntil: Date.now() + RSS_CACHE_FRESH_MS,
        staleUntil: Date.now() + RSS_CACHE_STALE_MS,
        lastAccess: Date.now()
      });
      return { ...feed, stale: false };
    } catch (error) {
      if (cached && cached.staleUntil > Date.now()) {
        cached.lastAccess = Date.now();
        return { ...cached.feed, stale: true };
      }
      throw error;
    } finally {
      rssFeedRequests.delete(cacheKey);
    }
  })();
  rssFeedRequests.set(cacheKey, request);
  return request;
}
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function safeExternalUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeCssColor(value: unknown, fallback: string): string {
  const candidate = String(value ?? "").trim();
  return /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)|hsla?\(\s*[\d.]+(?:deg)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%(?:\s*,\s*[\d.]+)?\s*\))$/.test(candidate)
    ? candidate
    : fallback;
}

function appRevision(appId: string, name: string, config: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify({ appId, name, config }))
    .digest("hex");
}

async function refreshPlaylistsForApp(input: {
  tenantId: string;
  appId: string;
  filename: string;
  mediaUrl: string;
  checksumSha256: string;
  mimeType: string;
}): Promise<{ playlistsUpdated: number; devicesNotified: number }> {
  const playlists = await PlaylistModel.find({
    tenantId: input.tenantId,
    "items.mediaId": input.appId
  }).lean();

  let playlistsUpdated = 0;
  let devicesNotified = 0;
  for (const playlist of playlists) {
    const items: PlaylistItemDoc[] = playlist.items.map((item) => item.mediaId === input.appId
      ? {
          ...item,
          filename: input.filename,
          mediaUrl: input.mediaUrl,
          checksumSha256: input.checksumSha256,
          mimeType: input.mimeType
        }
      : item);
    const contentChecksumSha256 = playlistContentChecksum(items);
    const nextVersion = playlist.version + 1;
    const assignedDevices = await DeviceModel.find({
      tenantId: input.tenantId,
      currentPlaylistId: String(playlist._id)
    }).select({ _id: 1, hardwareId: 1 }).lean();
    const remainsPublished = playlist.publishedAt !== null || assignedDevices.length > 0;
    const publishedAt = remainsPublished ? new Date() : null;
    const publishedVersion = remainsPublished ? nextVersion : null;
    const updatedPlaylist = await PlaylistModel.findOneAndUpdate(
      { _id: playlist._id, tenantId: input.tenantId, version: playlist.version },
      {
        $set: {
          items,
          contentChecksumSha256,
          publishedAt,
          publishedVersion
        },
        $inc: { version: 1 }
      },
      { new: true }
    ).lean();

    if (!updatedPlaylist) {
      throw new Error(`Playlist ${String(playlist._id)} changed while refreshing app ${input.appId}`);
    }
    playlistsUpdated += 1;

    await contentRepository.upsertPlaylist({
      tenantId: input.tenantId,
      externalId: String(updatedPlaylist._id),
      name: updatedPlaylist.name,
      nameKey: updatedPlaylist.nameKey ?? normalizePlaylistName(updatedPlaylist.name)?.nameKey ?? updatedPlaylist.name,
      creationKey: updatedPlaylist.creationKey,
      version: updatedPlaylist.version,
      contentChecksumSha256: updatedPlaylist.contentChecksumSha256,
      itemsJson: updatedPlaylist.items,
      publishedAt: updatedPlaylist.publishedAt,
      publishedVersion: updatedPlaylist.publishedVersion,
      ownerUserId: updatedPlaylist.ownerUserId
    });

    if (assignedDevices.length > 0) {
      const payload: SyncContentPayload = {
        playlist_id: String(updatedPlaylist._id),
        playlist_version: updatedPlaylist.version,
        checksum_sha256: updatedPlaylist.contentChecksumSha256,
        items: updatedPlaylist.items.map((item) => ({
          media_id: item.mediaId,
          filename: item.filename,
          media_url: item.mediaUrl,
          checksum_sha256: item.checksumSha256,
          mime_type: item.mimeType,
          duration_ms: item.durationMs,
          position: item.position
        }))
      };
      emitSyncContentToDevices(assignedDevices.map((device) => String(device._id)), payload);
      devicesNotified += assignedDevices.length;
    }
  }

  return { playlistsUpdated, devicesNotified };
}
type AppsRouterDeps = {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
};

export function buildAppsRouter(deps: AppsRouterDeps): Router {
  const router = Router();
  const rssProxyLimiter = rateLimit({
    windowMs: 60_000,
    max: 6_000,
    standardHeaders: true,
    legacyHeaders: false
  });

  // 1. PUBLIC RENDERING ENDPOINT
  // Serves standalone interactive HTML pages for each widget type
  router.get("/render/:id", async (req, res) => {
    try {
      const mediaId = req.params.id;
      if (!Types.ObjectId.isValid(mediaId)) {
        res.status(404).send("<html><body><h1>App Widget Not Found</h1></body></html>");
        return;
      }
      const media = await MediaModel.findById(mediaId).lean();

      if (!media || media.mimeType !== "text/html") {
        res.status(404).send("<html><body><h1>App Widget Not Found</h1></body></html>");
        return;
      }

      const config = (media as any).appConfig || {};
      const appType = (media.storagePath || "").replace("app://", "").split("?")[0];
      const title = escapeHtml(media.filename);

      let htmlContent = "";

      switch (appType) {
        case "clock":
          htmlContent = renderClockHtml(title, config);
          break;
        case "weather":
          htmlContent = renderWeatherHtml(title, config);
          break;
        case "rss":
          htmlContent = renderRssHtml(title, config);
          break;
        case "notice":
          htmlContent = renderNoticeHtml(title, config);
          break;
        case "qrcode":
          htmlContent = renderQrHtml(title, config);
          break;
        case "wayfinding":
          htmlContent = renderWayfindingHtml(title, config);
          break;
        case "events":
          htmlContent = renderEventsHtml(title, config);
          break;
        case "hotel-guide":
          htmlContent = renderHotelGuideHtml(title, config);
          break;
        case "restaurant-menu":
          htmlContent = renderRestaurantMenuHtml(title, config);
          break;
        default:
          htmlContent = `<html><body><h1>Unknown App Type: ${appType}</h1></body></html>`;
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      const requestedRevision = String(req.query.rs_rev ?? "").trim();
      const currentRevision = media.checksumSha256.slice(0, 16);
      if (requestedRevision && requestedRevision === currentRevision) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-cache, must-revalidate, stale-if-error=604800");
        res.setHeader("Pragma", "no-cache");
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https:; font-src https: data:; base-uri 'none'; frame-ancestors 'none'"
      );
      res.send(htmlContent);
    } catch (err) {
      logger.error("Failed to render app", err instanceof Error ? err : new Error(String(err)));
      res.status(500).send("<html><body><h1>Internal Server Error Rendering App</h1></body></html>");
    }
  });

  // 2. PUBLIC RSS PROXY ENDPOINT
  router.get("/rss-proxy", rssProxyLimiter, async (req, res) => {
    try {
      const feedUrl = req.query.url;
      if (!feedUrl || typeof feedUrl !== "string") {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "A feed URL is required" });
        return;
      }

      const feed = await loadCachedRss(feedUrl);
      res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
      res.json(feed);
    } catch (err) {
      logger.warn("RSS proxy rejected or failed upstream request", {}, err instanceof Error ? err : new Error(String(err)));
      res.status(502).json({ code: "RSS_PROXY_FAILED", message: "Feed could not be fetched safely" });
    }
  });
  // 3. AUTHENTICATED ENDPOINTS FOR MANAGING INSTANCES
  router.use(requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }));
  router.use(requireRoles(["tenant_owner", "tenant_admin", "operator"]));

  // Create App Instance
  router.post("/create-app", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const { name, appType, config } = req.body;

      if (!tenantId || !name || !appType || !config) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "name, appType, and config are required" });
        return;
      }
      if (!SUPPORTED_APP_TYPES.has(String(appType))) {
        res.status(400).json({ code: "UNSUPPORTED_APP_TYPE", message: "This app type is not supported" });
        return;
      }

      const media = new MediaModel({
        tenantId,
        ownerUserId: req.auth!.userId,
        filename: name,
        mimeType: "text/html",
        sizeBytes: 0,
        checksumSha256: "temp",
        storagePath: "temp",
        publicUrl: "temp",
        status: "ready",
        appConfig: config
      });

      const appId = String(media._id);
      const checksumSha256 = appRevision(appId, name, config);
      const publicUrl = `/api/v1/apps/render/${appId}`;
      const storagePath = `app://${appType}?id=${appId}`;

      media.checksumSha256 = checksumSha256;
      media.publicUrl = publicUrl;
      media.storagePath = storagePath;

      await media.save();

      try {
        await contentRepository.upsertMedia({
          tenantId,
          externalId: String(media._id),
          filename: media.filename,
          mimeType: media.mimeType,
          sizeBytes: media.sizeBytes,
          checksumSha256: media.checksumSha256,
          storagePath: media.storagePath,
          publicUrl: media.publicUrl,
          status: media.status,
          ownerUserId: req.auth!.userId
        });
      } catch (err) {
        logger.error("Failed to sync app to postgres shadow write", err instanceof Error ? err : new Error(String(err)));
      }

      res.status(201).json({ success: true, app: media });
    } catch (err) {
      logger.error("Failed to create app instance", err instanceof Error ? err : new Error(String(err)));
      res.status(500).json({ code: "APP_CREATE_FAILED", message: "Failed to save app instance" });
    }
  });

  // Update App Instance
  router.put("/update-app/:id", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const appId = req.params.id;
      const { name, config } = req.body;

      if (!tenantId || !Types.ObjectId.isValid(appId) || !name || !config) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "name and config are required" });
        return;
      }

      const filter = req.auth?.role === "tenant_owner"
        ? { _id: appId, tenantId }
        : { _id: appId, tenantId, ownerUserId: req.auth?.userId };

      const checksumSha256 = appRevision(appId, name, config);
      const updated = await MediaModel.findOneAndUpdate(
        filter,
        {
          $set: {
            filename: name,
            appConfig: config,
            checksumSha256
          }
        },
        { new: true }
      ).lean();

      if (!updated) {
        res.status(404).json({ code: "APP_NOT_FOUND", message: "App instance not found" });
        return;
      }

      try {
        await contentRepository.upsertMedia({
          tenantId,
          externalId: String(updated._id),
          filename: updated.filename,
          mimeType: updated.mimeType,
          sizeBytes: updated.sizeBytes,
          checksumSha256: updated.checksumSha256,
          storagePath: updated.storagePath,
          publicUrl: updated.publicUrl,
          status: updated.status,
          ownerUserId: (updated as any).ownerUserId
        });
      } catch (err) {
        logger.error("Failed to sync app update to postgres shadow write", err instanceof Error ? err : new Error(String(err)));
      }

      const refreshResult = await refreshPlaylistsForApp({
        tenantId,
        appId,
        filename: updated.filename,
        mediaUrl: updated.publicUrl,
        checksumSha256: updated.checksumSha256,
        mimeType: updated.mimeType
      });

      res.json({
        success: true,
        app: updated,
        playlists_updated: refreshResult.playlistsUpdated,
        devices_notified: refreshResult.devicesNotified
      });
    } catch (err) {
      logger.error("Failed to update app instance", err instanceof Error ? err : new Error(String(err)));
      res.status(500).json({ code: "APP_UPDATE_FAILED", message: "Failed to update app instance" });
    }
  });

  return router;
}

// -------------------------------------------------------------
// APP RENDER TEMPLATES (DYNAMIC STANDALONE HTML/CSS/JS)
// -------------------------------------------------------------

function cleanXml(str: string): string {
  const plainText = str
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
  return escapeHtml(plainText);
}

function getOverlayStyle(pos: string, x: number, y: number, widthOrSize?: number, isText: boolean = false, textColor?: string, textSize?: number): string {
  let styleStr = "position: absolute; z-index: 10; display: flex; align-items: center; justify-content: center;";

  if (widthOrSize && !isText) {
    styleStr += ` width: ${widthOrSize}px;`;
  }
  if (isText) {
    styleStr += ` color: ${textColor || "#ffffff"}; font-size: ${textSize || 24}px; font-weight: 700; text-shadow: 0 2px 10px rgba(0,0,0,0.5);`;
  }

  switch (pos) {
    case "top-left":
      styleStr += " top: 5%; left: 5%;";
      break;
    case "top-right":
      styleStr += " top: 5%; right: 5%;";
      break;
    case "bottom-left":
      styleStr += " bottom: 5%; left: 5%;";
      break;
    case "bottom-right":
      styleStr += " bottom: 5%; right: 5%;";
      break;
    case "top-center":
      styleStr += " top: 5%; left: 50%; transform: translateX(-50%);";
      break;
    case "bottom-center":
      styleStr += " bottom: 5%; left: 50%; transform: translateX(-50%);";
      break;
    case "center":
      styleStr += " top: 50%; left: 50%; transform: translate(-50%, -50%);";
      break;
    case "custom":
    default:
      styleStr += ` top: ${y}%; left: ${x}%; transform: translate(-${x}%, -${y}%);`;
      break;
  }
  return styleStr;
}

type ModernClockConfig = {
  timezone: string;
  locale: "tr" | "en";
  format: "24h" | "12h";
  layout: "digital" | "analog" | "split";
  theme: "midnight" | "paper" | "aurora" | "warm";
  primaryColor: string;
  showSeconds: boolean;
  showDate: boolean;
  showTimezone: boolean;
};

export function normalizeClockConfig(config: Record<string, unknown>): ModernClockConfig {
  const legacyLayout = String(config.layout ?? "");
  const layout: ModernClockConfig["layout"] = legacyLayout === "analog"
    ? "analog"
    : legacyLayout === "digital"
      ? "digital"
      : legacyLayout === "split" || legacyLayout === "hybrid"
        ? "split"
        : "split";
  const legacyTheme = String(config.theme ?? "");
  const theme: ModernClockConfig["theme"] = legacyTheme === "paper" || legacyTheme === "light"
    ? "paper"
    : legacyTheme === "aurora" || legacyTheme === "oceanic"
      ? "aurora"
      : legacyTheme === "warm" || legacyTheme === "sunset"
        ? "warm"
        : "midnight";
  const defaultAccent: Record<ModernClockConfig["theme"], string> = {
    midnight: "#6ee7b7",
    paper: "#0f766e",
    aurora: "#67e8f9",
    warm: "#fdba74"
  };
  return {
    timezone: typeof config.timezone === "string" && config.timezone ? config.timezone : "Europe/Istanbul",
    locale: config.locale === "en" ? "en" : "tr",
    format: config.format === "12h" ? "12h" : "24h",
    layout,
    theme,
    primaryColor: safeCssColor(config.primaryColor, defaultAccent[theme]),
    showSeconds: config.showSeconds !== false,
    showDate: config.showDate !== false,
    showTimezone: config.showTimezone !== false
  };
}

export function renderClockHtml(title: string, rawConfig: Record<string, unknown>): string {
  const config = normalizeClockConfig(rawConfig);
  const configJson = safeJson(config);
  const ticks = Array.from({ length: 60 }, (_, index) =>
    `<i class="tick${index % 5 === 0 ? " major" : ""}" style="--i:${index}" aria-hidden="true"></i>`
  ).join("");

  return `<!doctype html>
<html lang="${config.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>${title}</title>
  <style>
    :root {
      color-scheme: dark;
      --accent: ${config.primaryColor};
      --bg: linear-gradient(145deg,#101827 0%,#07111f 58%,#050a12 100%);
      --text: #f8fafc;
      --muted: #94a3b8;
      --line: rgba(255,255,255,.11);
      --glow-opacity: .13;
    }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-rendering: geometricPrecision;
      -webkit-font-smoothing: antialiased;
    }
    body.theme-paper { color-scheme: light; --bg: linear-gradient(145deg,#fff 0%,#eef2f7 100%); --text:#0f172a; --muted:#64748b; --line:rgba(15,23,42,.11); --glow-opacity:.07; }
    body.theme-aurora { --bg:linear-gradient(145deg,#071a24 0%,#102a33 48%,#172554 100%); --text:#f0fdfa; --muted:#a5f3fc; --line:rgba(125,211,252,.18); --glow-opacity:.14; }
    body.theme-warm { --bg:linear-gradient(145deg,#2a1714 0%,#42231d 50%,#1c1012 100%); --text:#fff7ed; --muted:#fed7aa; --line:rgba(253,186,116,.18); --glow-opacity:.12; }
    .app { position:relative; width:100%; height:100%; min-height:100vh; isolation:isolate; }
    .ambient { position:absolute; border-radius:50%; background:var(--accent); opacity:var(--glow-opacity); filter:blur(12vmin); pointer-events:none; z-index:-1; }
    .ambient.one { width:58vmin; height:58vmin; left:-18vmin; top:-25vmin; }
    .ambient.two { width:44vmin; height:44vmin; right:-14vmin; bottom:-24vmin; opacity:calc(var(--glow-opacity) * .7); }
    .stage { width:100%; height:100%; min-height:100vh; padding:48px; padding:clamp(34px,6vmin,92px); display:grid; align-items:center; }
    .digital { min-width:0; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .time-row { display:flex; align-items:baseline; justify-content:center; }
    .time-main { font-size:160px; font-size:clamp(82px,15.8vw,300px); line-height:.82; letter-spacing:-.072em; font-weight:720; }
    .colon { color:var(--accent); padding:0 .045em; }
    .seconds { margin-left:.55em; color:var(--accent); font-size:42px; font-size:clamp(24px,3.2vw,62px); font-weight:680; letter-spacing:-.03em; }
    .period { margin-left:.65em; color:var(--muted); font-size:22px; font-size:clamp(14px,1.5vw,30px); font-weight:760; }
    .meta { color:var(--text); }
    .date { font-size:28px; font-size:clamp(18px,2.2vw,42px); line-height:1.18; font-weight:650; letter-spacing:-.025em; text-transform:capitalize; }
    .timezone { margin-top:.8em; color:var(--accent); font-size:16px; font-size:clamp(12px,1.05vw,21px); font-weight:780; letter-spacing:.14em; text-transform:uppercase; }
    .meta-mark { display:block; width:40px; width:clamp(32px,3vw,58px); height:6px; height:clamp(4px,.38vw,7px); margin-bottom:auto; border-radius:999px; background:var(--accent); }
    .analog { position:relative; width:450px; height:450px; width:min(62vmin,610px); height:min(62vmin,610px); aspect-ratio:1; margin:auto; border:1px solid var(--line); border-radius:50%; box-shadow:inset 0 0 0 10px rgba(255,255,255,.025),0 5vmin 12vmin rgba(0,0,0,.18); }
    .analog::after { content:""; position:absolute; inset:17%; border:1px solid var(--line); border-radius:50%; opacity:.36; }
    .tick { --size:1px; position:absolute; inset:0; transform:rotate(calc(var(--i) * 6deg)); }
    .tick::after { content:""; position:absolute; left:50%; top:4%; width:var(--size); height:2.2%; border-radius:2px; background:currentColor; opacity:.22; transform:translateX(-50%); }
    .tick.major { --size:2px; --size:clamp(2px,.2vmin,3px); }
    .tick.major::after { height:5.5%; opacity:.78; }
    .number { position:absolute; z-index:1; color:var(--muted); font-size:20px; font-size:clamp(15px,2.1vmin,28px); font-weight:700; }
    .n12 { left:50%; top:10%; transform:translateX(-50%); } .n3 { right:11%; top:50%; transform:translateY(-50%); } .n6 { left:50%; bottom:9%; transform:translateX(-50%); } .n9 { left:11%; top:50%; transform:translateY(-50%); }
    .hand { position:absolute; z-index:3; left:50%; bottom:50%; border-radius:999px; background:currentColor; transform-origin:50% 100%; transform:translateX(-50%) rotate(0deg); }
    .hour-hand { width:7px; width:clamp(5px,.65vmin,9px); height:25%; }
    .minute-hand { width:4px; width:clamp(3px,.42vmin,6px); height:35%; }
    .second-hand { width:1px; height:39%; background:var(--accent); }
    .pin { position:absolute; z-index:5; left:50%; top:50%; width:16px; height:16px; width:clamp(12px,1.7vmin,22px); height:clamp(12px,1.7vmin,22px); aspect-ratio:1; border-radius:50%; background:var(--accent); box-shadow:0 0 0 5px rgba(253,230,138,.3); transform:translate(-50%,-50%); }
    .stage[data-layout="digital"] { grid-template-rows:1fr auto; gap:clamp(24px,5vmin,70px); text-align:center; }
    .stage[data-layout="digital"] .analog, .stage[data-layout="split"] .analog { display:none; }
    .stage[data-layout="digital"] .meta-mark { display:none; }
    .stage[data-layout="digital"] .meta { padding-bottom:2vmin; text-align:center; }
    .stage[data-layout="analog"] { grid-template-rows:minmax(0,1fr) auto; gap:clamp(20px,3vmin,42px); text-align:center; }
    .stage[data-layout="analog"] .digital { display:none; }
    .stage[data-layout="analog"] .meta { text-align:center; }
    .stage[data-layout="analog"] .meta-mark { display:none; }
    .stage[data-layout="split"] { grid-template-columns:minmax(0,1.7fr) minmax(260px,.75fr); }
    .stage[data-layout="split"] .digital { padding-right:7vw; }
    .stage[data-layout="split"] .time-main { font-size:clamp(72px,10.8vw,210px); }
    .stage[data-layout="split"] .meta { align-self:stretch; display:flex; flex-direction:column; justify-content:flex-end; padding:7% 0 7% 14%; border-left:1px solid var(--line); text-align:left; }
    [hidden] { display:none !important; }
    @media (max-aspect-ratio:1/1) {
      .stage { padding:clamp(28px,7vmin,64px); }
      .stage[data-layout="split"] { grid-template-columns:1fr; grid-template-rows:minmax(0,1fr) auto; }
      .stage[data-layout="split"] .digital { padding:0; align-self:center; }
      .stage[data-layout="split"] .time-main { font-size:clamp(68px,19vw,180px); }
      .stage[data-layout="split"] .meta { padding:7% 0 0; border-left:0; border-top:1px solid var(--line); }
      .stage[data-layout="split"] .meta-mark { margin:0 0 7%; }
      .analog { width:min(76vw,58vh); }
    }
    @media (prefers-reduced-motion:reduce) { * { scroll-behavior:auto !important; } }
  </style>
</head>
<body class="theme-${config.theme}">
  <main class="app" aria-label="${escapeHtml(title)}">
    <span class="ambient one" aria-hidden="true"></span><span class="ambient two" aria-hidden="true"></span>
    <section class="stage" data-layout="${config.layout}">
      <div class="digital" aria-live="off"><div class="time-row"><span class="time-main"><span id="hour">00</span><span class="colon">:</span><span id="minute">00</span></span><span class="seconds" id="second"${config.showSeconds ? "" : " hidden"}>00</span><span class="period" id="period"></span></div></div>
      <div class="analog" aria-label="Analog clock">${ticks}<b class="number n12">12</b><b class="number n3">3</b><b class="number n6">6</b><b class="number n9">9</b><span class="hand hour-hand" id="hour-hand"></span><span class="hand minute-hand" id="minute-hand"></span><span class="hand second-hand" id="second-hand"${config.showSeconds ? "" : " hidden"}></span><span class="pin"></span></div>
      <aside class="meta"><span class="meta-mark" aria-hidden="true"></span><div class="date" id="date"${config.showDate ? "" : " hidden"}></div><div class="timezone" id="timezone"${config.showTimezone ? "" : " hidden"}></div></aside>
    </section>
  </main>
  <script>
    var config = ${configJson};
    var hourEl = document.getElementById("hour");
    var minuteEl = document.getElementById("minute");
    var secondEl = document.getElementById("second");
    var periodEl = document.getElementById("period");
    var dateEl = document.getElementById("date");
    var timezoneEl = document.getElementById("timezone");
    var hourHand = document.getElementById("hour-hand");
    var minuteHand = document.getElementById("minute-hand");
    var secondHand = document.getElementById("second-hand");
    var locale = config.locale === "tr" ? "tr-TR" : "en-GB";
    var resolvedTimeZone = config.timezone === "local" ? undefined : config.timezone;

    function formatter(options) {
      var resolvedOptions = {};
      for (var key in options) { if (Object.prototype.hasOwnProperty.call(options, key)) resolvedOptions[key] = options[key]; }
      if (resolvedTimeZone) resolvedOptions.timeZone = resolvedTimeZone;
      try { return new Intl.DateTimeFormat(locale, resolvedOptions); }
      catch (error) { resolvedTimeZone = undefined; return new Intl.DateTimeFormat(locale, options); }
    }
    function part(parts, type) { for (var index = 0; index < parts.length; index += 1) { if (parts[index].type === type) return parts[index].value || ""; } return ""; }
    function twoDigits(value) { value = String(value || ""); return value.length < 2 ? "0" + value : value; }
    function update() {
      try {
        var now = new Date();
        var displayOptions = { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:config.format === "12h" };
        if (config.format === "24h") displayOptions.hourCycle = "h23";
        var displayParts = formatter(displayOptions).formatToParts(now);
        if (hourEl) hourEl.textContent = twoDigits(part(displayParts,"hour"));
        if (minuteEl) minuteEl.textContent = twoDigits(part(displayParts,"minute"));
        if (secondEl) secondEl.textContent = twoDigits(part(displayParts,"second"));
        if (periodEl) periodEl.textContent = part(displayParts,"dayPeriod");
        if (config.showDate && dateEl) dateEl.textContent = formatter({ weekday:"long", day:"numeric", month:"long", year:"numeric" }).format(now);
        if (config.showTimezone && timezoneEl) timezoneEl.textContent = config.timezone === "local" ? (config.locale === "tr" ? "Yerel saat" : "Local time") : String(config.timezone.split("/").pop() || "").replace(/_/g," ");

        var numericOptions = { hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23" };
        if (resolvedTimeZone) numericOptions.timeZone = resolvedTimeZone;
        var numericParts = new Intl.DateTimeFormat("en-GB", numericOptions).formatToParts(now);
        function numberPart(type) { return Number(part(numericParts,type) || 0); }
        var hours = numberPart("hour"); var minutes = numberPart("minute"); var seconds = numberPart("second") + now.getMilliseconds() / 1000;
        if (hourHand) hourHand.style.transform = "translateX(-50%) rotate(" + ((hours % 12) * 30 + minutes * .5) + "deg)";
        if (minuteHand) minuteHand.style.transform = "translateX(-50%) rotate(" + (minutes * 6 + seconds * .1) + "deg)";
        if (secondHand) secondHand.style.transform = "translateX(-50%) rotate(" + (seconds * 6) + "deg)";
      } catch (err) {
        console.error("Clock update error:", err);
      }
    }
    update();
    window.__remoteScreenTick = update;
    setInterval(update, 1000);
  </script>
</body>
</html>`;
}
