import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Router } from "express";
import multer from "multer";

import { Logger } from "../lib/logger.js";
import { metrics } from "../lib/metrics.js";
import { isPostgresConnected } from "../lib/postgres.js";
import { requireRoles, requireUserAuth } from "../middlewares/auth.js";
import { DeviceModel } from "../models/device.model.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";
import { MediaFolderModel } from "../models/media-folder.model.js";
import { contentRepository } from "../repositories/content.repository.js";
import { emitSyncContent, type SyncContentPayload } from "../sockets/registry.js";
import { queueCommand } from "../services/command.service.js";

type ContentRouteDeps = {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  readFromPostgresPercentage: number;
};

type PlaylistInputItem = {
  media_id: string;
  duration_ms: number;
  position: number;
};

const logger = new Logger('ContentRoute');

/**
 * Hard limit on playlist items to prevent oversized SYNC_CONTENT socket frames.
 * Socket.IO relays the full items array in a single WebSocket frame; beyond ~500
 * items the frame size can exceed client WebSocket limits and cause silent drops.
 */
const MAX_PLAYLIST_ITEMS = 500;

/**
 * Stream uploads directly to a temp file on disk — never buffer the full file
 * in Node.js heap memory. A 500 MB video with memoryStorage would OOM a
 * Node process; with diskStorage it streams at constant ~64 KB RAM.
 */
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, _file, cb) => cb(null, `rs-upload-${randomUUID()}.tmp`)
  }),
  limits: { fileSize: 500 * 1024 * 1024 } // 500 MB — covers large video files
});

function shouldReadFromPostgres(percentage: number): boolean {
  if (!isPostgresConnected()) {
    return false;
  }
  if (percentage <= 0) {
    return false;
  }
  if (percentage >= 100) {
    return true;
  }
  return Math.random() * 100 < percentage;
}

function countPlaylistItems(itemsJson: unknown): number {
  if (Array.isArray(itemsJson)) {
    return itemsJson.length;
  }
  return 0;
}

function normalizePlaylistItems(input: unknown): PlaylistInputItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => ({
      media_id: String((item as { media_id?: unknown }).media_id ?? "").trim(),
      duration_ms: Number((item as { duration_ms?: unknown }).duration_ms ?? 10_000),
      position: Number((item as { position?: unknown }).position ?? 0)
    }))
    .filter((item) => item.media_id && Number.isFinite(item.duration_ms) && Number.isFinite(item.position));
}

type AuthCtx = { userId: string; tenantId: string; role: string };

function buildMediaFilter(auth: AuthCtx, extra: Record<string, any> = {}) {
  const base = auth.role === "tenant_owner"
    ? { tenantId: auth.tenantId }
    : { tenantId: auth.tenantId, ownerUserId: auth.userId };
  return { ...base, ...extra };
}

function buildDeviceFilter(auth: AuthCtx, extra: Record<string, any> = {}) {
  const base = auth.role === "tenant_owner"
    ? { tenantId: auth.tenantId }
    : { tenantId: auth.tenantId, pairedOwnerUserId: auth.userId };
  return { ...base, ...extra };
}

async function assertDeviceOwnership(deviceId: string, auth: AuthCtx): Promise<boolean> {
  if (auth.role === "tenant_owner") return true;
  const d = await DeviceModel.findOne({ _id: deviceId, tenantId: auth.tenantId, pairedOwnerUserId: auth.userId });
  return d !== null;
}

async function mapPlaylistItems(auth: AuthCtx, items: PlaylistInputItem[]) {
  if (items.length === 0) {
    return [];
  }

  const mediaIds = Array.from(new Set(items.map((item) => item.media_id)));
  const query = buildMediaFilter(auth, { _id: { $in: mediaIds }, status: "ready" });
  const mediaDocs = await MediaModel.find(query);
  const byId = new Map(mediaDocs.map((doc) => [String(doc._id), doc]));

  return items
    .sort((a, b) => a.position - b.position)
    .map((item) => {
      const media = byId.get(item.media_id);
      if (!media) {
        return null;
      }

      return {
        mediaId: String(media._id),
        filename: media.filename,
        mediaUrl: media.publicUrl,
        checksumSha256: media.checksumSha256,
        mimeType: media.mimeType,
        durationMs: Math.max(1_000, item.duration_ms),
        position: item.position
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export function buildContentRouter(deps: ContentRouteDeps): Router {
  const router = Router();

  router.use(requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }));
  router.use(requireRoles(["tenant_owner", "tenant_admin", "operator"]));

  router.get("/devices", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const search = req.query.search ? String(req.query.search).trim() : undefined;
      const status = req.query.status ? String(req.query.status).trim() : undefined;

      const query: Record<string, any> = buildDeviceFilter(req.auth!);

      if (status) {
        query.status = status;
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { hardwareId: { $regex: search, $options: "i" } },
          { location: { $regex: search, $options: "i" } }
        ];
      }

      let devicesQuery = DeviceModel.find(query).sort({ updatedAt: -1 });

      let total: number | undefined;
      let totalPages: number | undefined;

      if (page !== undefined && limit !== undefined && !isNaN(page) && !isNaN(limit)) {
        total = await DeviceModel.countDocuments(query);
        totalPages = Math.ceil(total / limit);
        devicesQuery = devicesQuery.skip((page - 1) * limit).limit(limit);
      }

      const devices = await devicesQuery.lean();

      const mappedDevices = devices.map((device) => ({
        id: String(device._id),
        hardware_id: device.hardwareId,
        name: device.name,
        location: device.location,
        status: device.status,
        orientation: device.orientation ?? 0,
        timezone: device.timezone ?? "Europe/Istanbul",
        screen_group: device.screenGroup ?? "Ungrouped",
        operating_hours: device.operatingHours ?? "Use Space's hours",
        scale_mode: device.scaleMode ?? "fit",
        notes: device.notes ?? "",
        current_playlist_id: device.currentPlaylistId,
        last_seen_at: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
        last_heartbeat_at: device.lastHeartbeatAt ? device.lastHeartbeatAt.toISOString() : null,
        ip_address: device.ipAddress ?? null,
        player_version: device.playerVersion ?? null,
        os_version: device.osVersion ?? null,
        resolution: device.resolution ?? null,
        memory_total: device.memoryTotal ?? null,
        memory_used: device.memoryUsed ?? null
      }));

      if (page !== undefined && limit !== undefined && !isNaN(page) && !isNaN(limit)) {
        res.json({
          devices: mappedDevices,
          total,
          page,
          limit,
          totalPages
        });
      } else {
        res.json({
          devices: mappedDevices
        });
      }
    } catch {
      res.status(500).json({ code: "DEVICE_LIST_FAILED", message: "Failed to fetch devices" });
    }
  });

  router.put("/devices/:deviceId", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const deviceId = req.params.deviceId;
      const name = req.body?.name === undefined ? undefined : String(req.body.name || "").trim() || null;
      const location = req.body?.location === undefined ? undefined : String(req.body.location || "").trim() || null;
      const orientation = req.body?.orientation === undefined ? undefined : Number(req.body.orientation);
      const timezone = req.body?.timezone === undefined ? undefined : String(req.body.timezone || "").trim();
      const screenGroup = req.body?.screen_group === undefined ? undefined : String(req.body.screen_group || "").trim();
      const operatingHours = req.body?.operating_hours === undefined ? undefined : String(req.body.operating_hours || "").trim();
      const scaleMode = req.body?.scale_mode === undefined ? undefined : String(req.body.scale_mode || "").trim();
      const notes = req.body?.notes === undefined ? undefined : String(req.body.notes || "");

      if (!tenantId || !deviceId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "deviceId is required" });
        return;
      }

      const oldDevice = await DeviceModel.findOne(buildDeviceFilter(req.auth!, { _id: deviceId }));
      if (!oldDevice) {
        res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "Device not found" });
        return;
      }

      const updateFields: Record<string, any> = {};
      if (name !== undefined) updateFields.name = name;
      if (location !== undefined) updateFields.location = location;
      if (orientation !== undefined && [0, 90, 180, 270].includes(orientation)) {
        updateFields.orientation = orientation;
      }
      if (timezone !== undefined) updateFields.timezone = timezone;
      if (screenGroup !== undefined) updateFields.screenGroup = screenGroup;
      if (operatingHours !== undefined) updateFields.operatingHours = operatingHours;
      if (scaleMode !== undefined && ["fit", "fill", "stretch"].includes(scaleMode)) {
        updateFields.scaleMode = scaleMode;
      }
      if (notes !== undefined) updateFields.notes = notes;

      const updatedDevice = await DeviceModel.findOneAndUpdate(
        buildDeviceFilter(req.auth!, { _id: deviceId }),
        { $set: updateFields },
        { new: true }
      );

      if (!updatedDevice) {
        res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "Device not found" });
        return;
      }

      if (orientation !== undefined && oldDevice.orientation !== updatedDevice.orientation) {
        try {
          const commandId = randomUUID();
          await queueCommand({
            tenantId,
            deviceId,
            commandId,
            commandType: "SET_ORIENTATION",
            payload: { orientation: updatedDevice.orientation },
            maxAttempts: 2,
            timeoutMs: 15_000
          });
          logger.info("Dispatched SET_ORIENTATION command", { deviceId, orientation: updatedDevice.orientation, commandId });
        } catch (cmdErr) {
          logger.warn("Failed to dispatch SET_ORIENTATION command during device update", { deviceId }, cmdErr instanceof Error ? cmdErr : new Error(String(cmdErr)));
        }
      }

      if (operatingHours !== undefined && oldDevice.operatingHours !== updatedDevice.operatingHours) {
        try {
          const commandId = randomUUID();
          await queueCommand({
            tenantId,
            deviceId,
            commandId,
            commandType: "SET_OPERATING_HOURS",
            payload: { operating_hours: updatedDevice.operatingHours },
            maxAttempts: 2,
            timeoutMs: 15_000
          });
          logger.info("Dispatched SET_OPERATING_HOURS command", { deviceId, operatingHours: updatedDevice.operatingHours, commandId });
        } catch (cmdErr) {
          logger.warn("Failed to dispatch SET_OPERATING_HOURS command during device update", { deviceId }, cmdErr instanceof Error ? cmdErr : new Error(String(cmdErr)));
        }
      }

      if (scaleMode !== undefined && oldDevice.scaleMode !== updatedDevice.scaleMode) {
        try {
          const commandId = randomUUID();
          await queueCommand({
            tenantId,
            deviceId,
            commandId,
            commandType: "SET_SCALE_MODE",
            payload: { scale_mode: updatedDevice.scaleMode },
            maxAttempts: 2,
            timeoutMs: 15_000
          });
          logger.info("Dispatched SET_SCALE_MODE command", { deviceId, scaleMode: updatedDevice.scaleMode, commandId });
        } catch (cmdErr) {
          logger.warn("Failed to dispatch SET_SCALE_MODE command during device update", { deviceId }, cmdErr instanceof Error ? cmdErr : new Error(String(cmdErr)));
        }
      }

      res.json({
        success: true,
        device: {
          id: String(updatedDevice._id),
          hardware_id: updatedDevice.hardwareId,
          name: updatedDevice.name,
          location: updatedDevice.location,
          status: updatedDevice.status,
          orientation: updatedDevice.orientation,
          timezone: updatedDevice.timezone,
          screen_group: updatedDevice.screenGroup,
          operating_hours: updatedDevice.operatingHours,
          scale_mode: updatedDevice.scaleMode,
          notes: updatedDevice.notes
        }
      });
    } catch {
      res.status(500).json({ code: "DEVICE_UPDATE_FAILED", message: "Failed to update device" });
    }
  });

  router.delete("/devices/:deviceId", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const deviceId = req.params.deviceId;
      if (!tenantId || !deviceId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "deviceId is required" });
        return;
      }
      const deleted = await DeviceModel.findOneAndDelete(buildDeviceFilter(req.auth!, { _id: deviceId }));
      if (!deleted) {
        res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "Device not found" });
        return;
      }
      logger.info("Device deleted", { deviceId, tenantId });
      res.status(204).send();
    } catch {
      res.status(500).json({ code: "DEVICE_DELETE_FAILED", message: "Failed to delete device" });
    }
  });

  router.get("/media", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(401).json({ code: "UNAUTHORIZED", message: "Missing auth context" });
        return;
      }

      const ownerUserIdFilter = req.auth?.role === "tenant_owner" ? null : req.auth?.userId;
      if (shouldReadFromPostgres(deps.readFromPostgresPercentage)) {
        const shadowRows = await contentRepository.listMedia(tenantId, 100, ownerUserIdFilter);
        if (shadowRows.length > 0) {
          logger.debug('Served media list from PostgreSQL', {
            operation: 'listMedia',
            tenantId,
            count: shadowRows.length
          });

          res.json({
            media: shadowRows.map((m) => ({
              id: m.external_id,
              filename: m.filename,
              mime_type: m.mime_type,
              size_bytes: m.size_bytes,
              checksum_sha256: m.checksum_sha256,
              media_url: m.public_url,
              created_at: m.created_at
            }))
          });
          return;
        }
      }

      const query = buildMediaFilter(req.auth!, { status: "ready" });
      const mediaList = await MediaModel.find(query)
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        media: mediaList.map((m) => ({
          id: String(m._id),
          filename: m.filename,
          mime_type: m.mimeType,
          size_bytes: m.sizeBytes,
          checksum_sha256: m.checksumSha256,
          media_url: m.publicUrl,
          created_at: (m as any).createdAt
        }))
      });
    } catch {
      res.status(500).json({ code: "MEDIA_LIST_FAILED", message: "Failed to list media" });
    }
  });

  router.post("/media/upload", upload.single("file"), async (req, res) => {
    // Track the temp file path so we can clean it up regardless of outcome.
    const tempPath: string | undefined = (req.file as Express.Multer.File & { path?: string })?.path;

    try {
      if (!req.file || !tempPath) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "file is required" });
        return;
      }

      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(401).json({ code: "UNAUTHORIZED", message: "Missing auth context" });
        return;
      }

      // Compute SHA-256 by streaming from disk — zero heap allocation.
      const checksumSha256 = await new Promise<string>((resolve, reject) => {
        const hash = createHash("sha256");
        const stream = createReadStream(tempPath);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("end", () => resolve(hash.digest("hex")));
        stream.on("error", reject);
      });

      const extension = path.extname(req.file.originalname) || ".bin";
      const fileName = `${randomUUID()}${extension}`;
      const relativePath = path.join("uploads", "media", tenantId, fileName);
      const absolutePath = path.resolve(process.cwd(), relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });

      // Atomic move from temp → final destination (same filesystem = rename, not copy).
      await rename(tempPath, absolutePath);

      const publicUrl = `/${relativePath.replace(/\\/g, "/")}`;

      const media = await MediaModel.create({
        tenantId,
        ownerUserId: req.auth!.userId,
        filename: req.file.originalname,
        mimeType: req.file.mimetype || "application/octet-stream",
        sizeBytes: req.file.size,
        checksumSha256,
        storagePath: relativePath,
        publicUrl,
        status: "ready"
      });

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
      } catch (error) {
        logger.error('Failed to upsert media to PostgreSQL', error instanceof Error ? error : new Error(String(error)), {
          operation: 'media-upload',
          tenantId,
          mediaId: String(media._id)
        });
      }

      res.status(201).json({
        media: {
          id: String(media._id),
          filename: media.filename,
          mime_type: media.mimeType,
          size_bytes: media.sizeBytes,
          checksum_sha256: media.checksumSha256,
          media_url: media.publicUrl,
          created_at: (media as any).createdAt
        }
      });
    } catch (err) {
      // Best-effort cleanup of the temp file on any error path.
      if (tempPath) {
        rm(tempPath, { force: true }).catch(() => { /* intentionally ignored */ });
      }
      logger.error("Media upload failed", err instanceof Error ? err : new Error(String(err)), {
        operation: "media-upload",
        tenantId: req.auth?.tenantId
      });
      res.status(500).json({ code: "MEDIA_UPLOAD_FAILED", message: "Failed to upload media" });
    }
  });

  router.delete("/media/:mediaId", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const mediaId = req.params.mediaId;

      if (!tenantId || !mediaId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "mediaId is required" });
        return;
      }

      const media = await MediaModel.findOne(buildMediaFilter(req.auth!, { _id: mediaId }));
      if (!media) {
        res.status(404).json({ code: "MEDIA_NOT_FOUND", message: "Media not found" });
        return;
      }

      // 1. Find all playlists using this media item
      const playlistsUsing = await PlaylistModel.find(buildMediaFilter(req.auth!, {
        "items.mediaId": mediaId
      }));

      // Check if the media is used by any regular/custom playlist (not starting with "Single Media:")
      const regularPlaylist = playlistsUsing.find((p) => !p.name.startsWith("Single Media:"));
      if (regularPlaylist) {
        res.status(400).json({
          code: "MEDIA_IN_USE",
          message: `Media is currently in use by playlist "${regularPlaylist.name}"`
        });
        return;
      }

      // If we reach here, the media is only used in "Single Media:" playlists or not used at all.
      // Perform cascading cleanup on those "Single Media:" playlists.
      for (const playlist of playlistsUsing) {
        if (playlist.name.startsWith("Single Media:")) {
          // A. Delete auto-created "Single Media:" playlist completely
          await PlaylistModel.deleteOne({ _id: playlist._id });
          
          // Clear device currentPlaylistId and notify screens playing it
          const deviceQuery = buildDeviceFilter(req.auth!, { currentPlaylistId: String(playlist._id) });
          const devices = await DeviceModel.find(deviceQuery);
          if (devices.length > 0) {
            await DeviceModel.updateMany(
              deviceQuery,
              { $set: { currentPlaylistId: null } }
            );

            const nullPayload: SyncContentPayload = {
              playlist_id: null as any,
              playlist_version: 0,
              checksum_sha256: "",
              items: []
            };

            for (const device of devices) {
              emitSyncContent(device.hardwareId, nullPayload);
              emitSyncContent(String(device._id), nullPayload);
            }

            try {
              await contentRepository.setDevicesCurrentPlaylist(
                tenantId,
                devices.map((device) => device.hardwareId),
                null as any
              );
            } catch (err) {
              logger.error("Failed to clear device playlist in Postgres on single-media delete", err instanceof Error ? err : new Error(String(err)));
            }
          }

          try {
            await contentRepository.deletePlaylist(tenantId, String(playlist._id));
          } catch (err) {
            logger.error("Failed to delete single-media playlist in Postgres on media delete", err instanceof Error ? err : new Error(String(err)));
          }
        }
      }

      // 2. Perform media deletion from MongoDB, filesystem, and PostgreSQL shadow table
      await MediaModel.deleteOne({ _id: mediaId, tenantId });

      const absolutePath = path.resolve(process.cwd(), media.storagePath);
      rm(absolutePath, { force: true }).catch((err) => {
        logger.error("Failed to delete media file from disk", err, { mediaId, path: absolutePath });
      });

      try {
        await contentRepository.deleteMedia(tenantId, mediaId);
      } catch (error) {
        logger.error("Failed to delete media in PostgreSQL shadow table", error instanceof Error ? error : new Error(String(error)));
      }

      res.status(204).send();
    } catch (err) {
      logger.error("Media delete failed", err instanceof Error ? err : new Error(String(err)));
      res.status(500).json({ code: "MEDIA_DELETE_FAILED", message: "Failed to delete media" });
    }
  });

  router.get("/playlists", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(401).json({ code: "UNAUTHORIZED", message: "Missing auth context" });
        return;
      }

      const ownerUserIdFilter = req.auth?.role === "tenant_owner" ? null : req.auth?.userId;
      if (shouldReadFromPostgres(deps.readFromPostgresPercentage)) {
        const shadowRows = await contentRepository.listPlaylists(tenantId, 100, ownerUserIdFilter);
        if (shadowRows.length > 0) {
          logger.debug('Served playlist list from PostgreSQL', {
            operation: 'listPlaylists',
            tenantId,
            count: shadowRows.length
          });

          res.json({
            playlists: shadowRows.map((row) => ({
              id: row.external_id,
              name: row.name,
              version: row.version,
              item_count: countPlaylistItems(row.items_json),
              updated_at: row.updated_at
            }))
          });
          return;
        }
      }

      const query = buildMediaFilter(req.auth!);
      const playlists = await PlaylistModel.find(query).sort({ updatedAt: -1 }).lean();
      metrics.recordShadowRead('mongo', 0);

      res.json({
        playlists: playlists.map((playlist) => ({
          id: String(playlist._id),
          name: playlist.name,
          version: playlist.version,
          item_count: playlist.items.length,
          updated_at: (playlist as { updatedAt?: Date }).updatedAt ?? new Date(0),
          items: playlist.items.map((item) => ({
            media_id: item.mediaId,
            filename: item.filename,
            media_url: item.mediaUrl,
            checksum_sha256: item.checksumSha256,
            mime_type: item.mimeType,
            duration_ms: item.durationMs,
            position: item.position
          }))
        }))
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to list playlists', err, {
        operation: 'listPlaylists',
        tenantId: req.auth?.tenantId
      });
      res.status(500).json({ code: "PLAYLIST_LIST_FAILED", message: "Failed to list playlists" });
    }
  });

  router.get("/playlists/:playlistId", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const playlistId = String(req.params.playlistId);
      if (!tenantId || !playlistId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "playlistId is required" });
        return;
      }

      if (shouldReadFromPostgres(deps.readFromPostgresPercentage)) {
        const row = await contentRepository.getPlaylist(tenantId, playlistId);
        if (row) {
          if (req.auth?.role !== "tenant_owner" && row.owner_user_id !== req.auth?.userId) {
            res.status(404).json({ code: "PLAYLIST_NOT_FOUND", message: "Playlist not found" });
            return;
          }

          logger.debug('Served single playlist from PostgreSQL', {
            operation: 'getPlaylist',
            tenantId,
            playlistId
          });

          res.json({
            playlist: {
              id: row.external_id,
              name: row.name,
              version: row.version,
              updated_at: row.updated_at,
              items: Array.isArray(row.items_json) ? row.items_json.map((item: any) => ({
                media_id: item.mediaId || item.media_id,
                filename: item.filename,
                media_url: item.mediaUrl || item.media_url,
                checksum_sha256: item.checksumSha256 || item.checksum_sha256,
                mime_type: item.mimeType || item.mime_type,
                duration_ms: item.durationMs || item.duration_ms,
                position: item.position
              })) : []
            }
          });
          return;
        }
      }

      const query = buildMediaFilter(req.auth!, { _id: playlistId });
      const playlist = await PlaylistModel.findOne(query).lean();
      if (!playlist) {
        res.status(404).json({ code: "PLAYLIST_NOT_FOUND", message: "Playlist not found" });
        return;
      }
      metrics.recordShadowRead('mongo', 0);

      res.json({
        playlist: {
          id: String(playlist._id),
          name: playlist.name,
          version: playlist.version,
          updated_at: (playlist as { updatedAt?: Date }).updatedAt ?? new Date(0),
          items: playlist.items.map((item) => ({
            media_id: item.mediaId,
            filename: item.filename,
            media_url: item.mediaUrl,
            checksum_sha256: item.checksumSha256,
            mime_type: item.mimeType,
            duration_ms: item.durationMs,
            position: item.position
          }))
        }
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to get playlist', err, {
        operation: 'getPlaylist',
        tenantId: req.auth?.tenantId,
        playlistId: req.params.playlistId
      });
      res.status(500).json({ code: "PLAYLIST_GET_FAILED", message: "Failed to fetch playlist" });
    }
  });

  router.post("/playlists", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const name = String(req.body?.name ?? "").trim();
      const itemsInput = normalizePlaylistItems(req.body?.items);

      if (!tenantId || !name || itemsInput.length === 0) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "name and items are required" });
        return;
      }

      if (itemsInput.length > MAX_PLAYLIST_ITEMS) {
        res.status(400).json({
          code: "PLAYLIST_TOO_LARGE",
          message: `Playlist cannot exceed ${MAX_PLAYLIST_ITEMS} items (got ${itemsInput.length})`
        });
        return;
      }

      const items = await mapPlaylistItems(req.auth!, itemsInput);
      if (items.length !== itemsInput.length) {
        res.status(400).json({ code: "MEDIA_NOT_FOUND", message: "One or more media ids are invalid" });
        return;
      }

      const playlist = await PlaylistModel.create({
        tenantId,
        ownerUserId: req.auth!.userId,
        name,
        version: 1,
        items,
        publishedAt: null
      });

      try {
        await contentRepository.upsertPlaylist({
          tenantId,
          externalId: String(playlist._id),
          name: playlist.name,
          version: playlist.version,
          itemsJson: playlist.items,
          publishedAt: playlist.publishedAt,
          ownerUserId: req.auth!.userId
        });
      } catch (error) {
        logger.error('Failed to upsert playlist to PostgreSQL', error instanceof Error ? error : new Error(String(error)), {
          operation: 'playlist-create',
          tenantId,
          playlistId: String(playlist._id)
        });
      }

      res.status(201).json({
        playlist: {
          id: String(playlist._id),
          name: playlist.name,
          version: playlist.version,
          item_count: playlist.items.length
        }
      });
    } catch {
      res.status(500).json({ code: "PLAYLIST_CREATE_FAILED", message: "Failed to create playlist" });
    }
  });

  router.put("/playlists/:playlistId", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const playlistId = String(req.params.playlistId);
      const name = String(req.body?.name ?? "").trim();
      const itemsInput = normalizePlaylistItems(req.body?.items);

      if (!tenantId || !playlistId || !name || itemsInput.length === 0) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "playlistId, name, items are required" });
        return;
      }

      if (itemsInput.length > MAX_PLAYLIST_ITEMS) {
        res.status(400).json({
          code: "PLAYLIST_TOO_LARGE",
          message: `Playlist cannot exceed ${MAX_PLAYLIST_ITEMS} items (got ${itemsInput.length})`
        });
        return;
      }

      const items = await mapPlaylistItems(req.auth!, itemsInput);
      if (items.length !== itemsInput.length) {
        res.status(400).json({ code: "MEDIA_NOT_FOUND", message: "One or more media ids are invalid" });
        return;
      }

      const updated = await PlaylistModel.findOneAndUpdate(
        buildMediaFilter(req.auth!, { _id: playlistId }),
        { $set: { name, items }, $inc: { version: 1 } },
        { new: true }
      );

      if (!updated) {
        res.status(404).json({ code: "PLAYLIST_NOT_FOUND", message: "Playlist not found" });
        return;
      }

      try {
        await contentRepository.upsertPlaylist({
          tenantId,
          externalId: String(updated._id),
          name: updated.name,
          version: updated.version,
          itemsJson: updated.items,
          publishedAt: updated.publishedAt,
          ownerUserId: updated.ownerUserId
        });
      } catch (error) {
        logger.error('Failed to upsert playlist to PostgreSQL', error instanceof Error ? error : new Error(String(error)), {
          operation: 'playlist-update',
          tenantId,
          playlistId: String(updated._id)
        });
      }

      res.json({
        playlist: {
          id: String(updated._id),
          name: updated.name,
          version: updated.version,
          item_count: updated.items.length
        }
      });
    } catch {
      res.status(500).json({ code: "PLAYLIST_UPDATE_FAILED", message: "Failed to update playlist" });
    }
  });

  router.post("/playlists/:playlistId/publish", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const playlistId = String(req.params.playlistId);
      const rawDeviceIds = Array.isArray(req.body?.device_ids) ? req.body.device_ids : [];
      const deviceIds = rawDeviceIds.map((value: unknown) => String(value).trim()).filter(Boolean);

      if (!tenantId || !playlistId || deviceIds.length === 0) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "playlistId and device_ids are required" });
        return;
      }

      const playlist = await PlaylistModel.findOneAndUpdate(
        buildMediaFilter(req.auth!, { _id: playlistId }),
        { $set: { publishedAt: new Date() } },
        { new: true }
      );

      if (!playlist) {
        res.status(404).json({ code: "PLAYLIST_NOT_FOUND", message: "Playlist not found" });
        return;
      }

      const devices = await DeviceModel.find(buildDeviceFilter(req.auth!, {
        $or: [{ _id: { $in: deviceIds } }, { hardwareId: { $in: deviceIds } }]
      }));

      await DeviceModel.updateMany(
        buildDeviceFilter(req.auth!, { _id: { $in: devices.map((device) => device._id) } }),
        { $set: { currentPlaylistId: String(playlist._id) } }
      );

      try {
        await contentRepository.upsertPlaylist({
          tenantId,
          externalId: String(playlist._id),
          name: playlist.name,
          version: playlist.version,
          itemsJson: playlist.items,
          publishedAt: playlist.publishedAt,
          ownerUserId: playlist.ownerUserId
        });

        await contentRepository.setDevicesCurrentPlaylist(
          tenantId,
          devices.map((device) => device.hardwareId),
          String(playlist._id)
        );
      } catch (error) {
        logger.error('Failed to upsert playlist/device assignments to PostgreSQL', error instanceof Error ? error : new Error(String(error)), {
          operation: 'playlist-publish',
          tenantId,
          playlistId: String(playlist._id)
        });
      }

      const playlistChecksum = createHash("sha256")
        .update(
          JSON.stringify(
            playlist.items.map((item) => ({ mediaId: item.mediaId, checksumSha256: item.checksumSha256, position: item.position }))
          )
        )
        .digest("hex");

      const payload: SyncContentPayload = {
        playlist_id: String(playlist._id),
        playlist_version: playlist.version,
        checksum_sha256: playlistChecksum,
        items: playlist.items.map((item) => ({
          media_id: item.mediaId,
          filename: item.filename,
          media_url: item.mediaUrl,
          checksum_sha256: item.checksumSha256,
          mime_type: item.mimeType,
          duration_ms: item.durationMs,
          position: item.position
        }))
      };

      // Emit to both hardwareId and device _id rooms to ensure all active clients sync
      for (const device of devices) {
        emitSyncContent(device.hardwareId, payload);
        emitSyncContent(String(device._id), payload);
      }

      res.json({ published: true, playlist_id: String(playlist._id), device_count: devices.length });
    } catch {
      res.status(500).json({ code: "PLAYLIST_PUBLISH_FAILED", message: "Failed to publish playlist" });
    }
  });

  router.delete("/playlists/:playlistId", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const playlistId = req.params.playlistId;

      if (!tenantId || !playlistId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "playlistId is required" });
        return;
      }

      // 1. Delete playlist from MongoDB
      const deletedPlaylist = await PlaylistModel.findOneAndDelete(buildMediaFilter(req.auth!, { _id: playlistId }));
      if (!deletedPlaylist) {
        res.status(404).json({ code: "PLAYLIST_NOT_FOUND", message: "Playlist not found" });
        return;
      }

      // 2. Find and update devices that have this playlist assigned
      const deviceQuery = buildDeviceFilter(req.auth!, { currentPlaylistId: playlistId });
      const devices = await DeviceModel.find(deviceQuery);
      if (devices.length > 0) {
        await DeviceModel.updateMany(
          deviceQuery,
          { $set: { currentPlaylistId: null } }
        );

        // Prepare empty sync payload
        const nullPayload: SyncContentPayload = {
          playlist_id: null as any,
          playlist_version: 0,
          checksum_sha256: "",
          items: []
        };

        // Notify devices via Socket
        for (const device of devices) {
          emitSyncContent(device.hardwareId, nullPayload);
          emitSyncContent(String(device._id), nullPayload);
        }

        // Update in Postgres
        try {
          await contentRepository.setDevicesCurrentPlaylist(
            tenantId,
            devices.map((device) => device.hardwareId),
            null as any
          );
        } catch (error) {
          logger.error("Failed to clear devices playlist in PostgreSQL on delete", error instanceof Error ? error : new Error(String(error)));
        }
      }

      // 3. Mark playlist as deleted in PostgreSQL shadow table
      try {
        await contentRepository.deletePlaylist(tenantId, playlistId);
      } catch (error) {
        logger.error("Failed to delete playlist in PostgreSQL shadow table", error instanceof Error ? error : new Error(String(error)));
      }

      res.status(204).send();
    } catch {
      res.status(500).json({ code: "PLAYLIST_DELETE_FAILED", message: "Failed to delete playlist" });
    }
  });

  router.get("/folders", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const ownerUserId = req.auth?.userId;
      if (!req.auth || !tenantId || !ownerUserId) {
        res.status(401).json({ code: "UNAUTHORIZED", message: "Missing auth context" });
        return;
      }
      
      const filter = req.auth.role === "tenant_owner"
        ? { tenantId }
        : { tenantId, ownerUserId };
        
      const folderDocs = await MediaFolderModel.find(filter).sort({ name: 1 }).lean();
      res.json({
        folders: folderDocs.map((f) => f.name)
      });
    } catch {
      res.status(500).json({ code: "FOLDER_LIST_FAILED", message: "Failed to list folders" });
    }
  });

  router.post("/folders", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const ownerUserId = req.auth?.userId;
      const name = String(req.body?.name ?? "").trim();
      
      if (!req.auth || !tenantId || !ownerUserId || !name) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "name is required" });
        return;
      }
      
      const filter = req.auth.role === "tenant_owner"
        ? { tenantId, name }
        : { tenantId, ownerUserId, name };
        
      const existing = await MediaFolderModel.findOne(filter);
      if (existing) {
        res.status(400).json({ code: "FOLDER_EXISTS", message: "Folder already exists" });
        return;
      }
      
      const folder = await MediaFolderModel.create({
        tenantId,
        ownerUserId,
        name
      });
      
      res.status(201).json({ success: true, folder: folder.name });
    } catch {
      res.status(500).json({ code: "FOLDER_CREATE_FAILED", message: "Failed to create folder" });
    }
  });

  router.put("/folders/:folderName", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const ownerUserId = req.auth?.userId;
      const oldName = req.params.folderName;
      const newName = String(req.body?.name ?? "").trim();
      
      if (!req.auth || !tenantId || !ownerUserId || !oldName || !newName) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "new folder name is required" });
        return;
      }
      
      const filter = req.auth.role === "tenant_owner"
        ? { tenantId, name: oldName }
        : { tenantId, ownerUserId, name: oldName };
        
      const folder = await MediaFolderModel.findOne(filter);
      if (!folder) {
        res.status(404).json({ code: "FOLDER_NOT_FOUND", message: "Folder not found" });
        return;
      }
      
      // Check if new name exists
      const targetFilter = req.auth.role === "tenant_owner"
        ? { tenantId, name: newName }
        : { tenantId, ownerUserId, name: newName };
      const exists = await MediaFolderModel.findOne(targetFilter);
      if (exists) {
        res.status(400).json({ code: "FOLDER_EXISTS", message: "A folder with the new name already exists" });
        return;
      }
      
      folder.name = newName;
      await folder.save();
      
      // Update all media in this folder
      const mediaFilter = req.auth.role === "tenant_owner"
        ? { tenantId, folder: oldName }
        : { tenantId, ownerUserId, folder: oldName };
        
      const mediaList = await MediaModel.find(mediaFilter);
      for (const m of mediaList) {
        m.folder = newName;
        await m.save();
        
        // Shadow write to PG
        try {
          await contentRepository.upsertMedia({
            tenantId: m.tenantId,
            externalId: String(m._id),
            filename: m.filename,
            mimeType: m.mimeType,
            sizeBytes: m.sizeBytes,
            checksumSha256: m.checksumSha256,
            storagePath: m.storagePath,
            publicUrl: m.publicUrl,
            status: m.status,
            ownerUserId: m.ownerUserId,
            folder: newName
          });
        } catch (err) {
          logger.error("Failed to sync media folder update to postgres", err instanceof Error ? err : new Error(String(err)));
        }
      }
      
      res.json({ success: true, folder: newName });
    } catch {
      res.status(500).json({ code: "FOLDER_RENAME_FAILED", message: "Failed to rename folder" });
    }
  });

  router.delete("/folders/:folderName", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const ownerUserId = req.auth?.userId;
      const name = req.params.folderName;
      
      if (!req.auth || !tenantId || !ownerUserId || !name) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "folder name is required" });
        return;
      }
      
      const filter = req.auth.role === "tenant_owner"
        ? { tenantId, name }
        : { tenantId, ownerUserId, name };
        
      const deleted = await MediaFolderModel.findOneAndDelete(filter);
      if (!deleted) {
        res.status(404).json({ code: "FOLDER_NOT_FOUND", message: "Folder not found" });
        return;
      }
      
      // Update all media inside to null
      const mediaFilter = req.auth.role === "tenant_owner"
        ? { tenantId, folder: name }
        : { tenantId, ownerUserId, folder: name };
        
      const mediaList = await MediaModel.find(mediaFilter);
      for (const m of mediaList) {
        m.folder = null;
        await m.save();
        
        // Shadow write to PG
        try {
          await contentRepository.upsertMedia({
            tenantId: m.tenantId,
            externalId: String(m._id),
            filename: m.filename,
            mimeType: m.mimeType,
            sizeBytes: m.sizeBytes,
            checksumSha256: m.checksumSha256,
            storagePath: m.storagePath,
            publicUrl: m.publicUrl,
            status: m.status,
            ownerUserId: m.ownerUserId,
            folder: null
          });
        } catch (err) {
          logger.error("Failed to sync media folder clear to postgres", err instanceof Error ? err : new Error(String(err)));
        }
      }
      
      res.status(204).send();
    } catch {
      res.status(500).json({ code: "FOLDER_DELETE_FAILED", message: "Failed to delete folder" });
    }
  });

  router.put("/media/:mediaId/folder", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const mediaId = req.params.mediaId;
      const folderName = req.body?.folder === undefined ? undefined : (req.body.folder === null ? null : String(req.body.folder).trim());
      
      if (!tenantId || !mediaId || folderName === undefined) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "mediaId and folder are required" });
        return;
      }
      
      const media = await MediaModel.findOne(buildMediaFilter(req.auth!, { _id: mediaId }));
      if (!media) {
        res.status(404).json({ code: "MEDIA_NOT_FOUND", message: "Media not found" });
        return;
      }
      
      if (folderName !== null) {
        // Verify folder exists
        const folderFilter = req.auth!.role === "tenant_owner"
          ? { tenantId, name: folderName }
          : { tenantId, ownerUserId: req.auth!.userId, name: folderName };
        const folderExists = await MediaFolderModel.findOne(folderFilter);
        if (!folderExists) {
          res.status(404).json({ code: "FOLDER_NOT_FOUND", message: "Target folder not found" });
          return;
        }
      }
      
      media.folder = folderName;
      await media.save();
      
      // Shadow write to PG
      try {
        await contentRepository.upsertMedia({
          tenantId: media.tenantId,
          externalId: String(media._id),
          filename: media.filename,
          mimeType: media.mimeType,
          sizeBytes: media.sizeBytes,
          checksumSha256: media.checksumSha256,
          storagePath: media.storagePath,
          publicUrl: media.publicUrl,
          status: media.status,
          ownerUserId: media.ownerUserId,
          folder: folderName
        });
      } catch (err) {
        logger.error("Failed to sync media folder move to postgres", err instanceof Error ? err : new Error(String(err)));
      }
      
      res.json({ success: true, media_id: String(media._id), folder: folderName });
    } catch {
      res.status(500).json({ code: "MEDIA_MOVE_FAILED", message: "Failed to move media to folder" });
    }
  });

  return router;
}
