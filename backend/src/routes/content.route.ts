import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
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
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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

async function mapPlaylistItems(tenantId: string, items: PlaylistInputItem[]) {
  if (items.length === 0) {
    return [];
  }

  const mediaIds = Array.from(new Set(items.map((item) => item.media_id)));
  const mediaDocs = await MediaModel.find({ _id: { $in: mediaIds }, tenantId, status: "ready" });
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
      const devices = await DeviceModel.find({ tenantId: req.auth?.tenantId }).sort({ updatedAt: -1 }).lean();
      res.json({
        devices: devices.map((device) => ({
          id: String(device._id),
          hardware_id: device.hardwareId,
          name: device.name,
          location: device.location,
          status: device.status,
          orientation: device.orientation ?? 0,
          timezone: device.timezone ?? "Europe/Istanbul",
          screen_group: device.screenGroup ?? "Ungrouped",
          operating_hours: device.operatingHours ?? "Use Space's hours",
          current_playlist_id: device.currentPlaylistId,
          last_seen_at: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
          last_heartbeat_at: device.lastHeartbeatAt ? device.lastHeartbeatAt.toISOString() : null,
          ip_address: device.ipAddress ?? null,
          player_version: device.playerVersion ?? null,
          os_version: device.osVersion ?? null,
          resolution: device.resolution ?? null,
          memory_total: device.memoryTotal ?? null,
          memory_used: device.memoryUsed ?? null
        }))
      });
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

      if (!tenantId || !deviceId) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "deviceId is required" });
        return;
      }

      const oldDevice = await DeviceModel.findOne({ _id: deviceId, tenantId });
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

      const updatedDevice = await DeviceModel.findOneAndUpdate(
        { _id: deviceId, tenantId },
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
          operating_hours: updatedDevice.operatingHours
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
      const deleted = await DeviceModel.findOneAndDelete({ _id: deviceId, tenantId });
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

      const mediaList = await MediaModel.find({ tenantId, status: "ready" })
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        media: mediaList.map((m) => ({
          id: String(m._id),
          filename: m.filename,
          mime_type: m.mimeType,
          size_bytes: m.sizeBytes,
          checksum_sha256: m.checksumSha256,
          media_url: m.publicUrl
        }))
      });
    } catch {
      res.status(500).json({ code: "MEDIA_LIST_FAILED", message: "Failed to list media" });
    }
  });

  router.post("/media/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "file is required" });
        return;
      }

      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(401).json({ code: "UNAUTHORIZED", message: "Missing auth context" });
        return;
      }

      const extension = path.extname(req.file.originalname) || ".bin";
      const fileName = `${randomUUID()}${extension}`;
      const relativePath = path.join("uploads", "media", tenantId, fileName);
      const absolutePath = path.resolve(process.cwd(), relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, req.file.buffer);

      const checksumSha256 = createHash("sha256").update(req.file.buffer).digest("hex");
      const publicUrl = `/${relativePath.replace(/\\/g, "/")}`;

      const media = await MediaModel.create({
        tenantId,
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
          status: media.status
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
          media_url: media.publicUrl
        }
      });
    } catch {
      res.status(500).json({ code: "MEDIA_UPLOAD_FAILED", message: "Failed to upload media" });
    }
  });

  router.get("/playlists", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(401).json({ code: "UNAUTHORIZED", message: "Missing auth context" });
        return;
      }

      if (shouldReadFromPostgres(deps.readFromPostgresPercentage)) {
        const shadowRows = await contentRepository.listPlaylists(tenantId, 100);
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

      const playlists = await PlaylistModel.find({ tenantId }).sort({ updatedAt: -1 }).lean();
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

  router.post("/playlists", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const name = String(req.body?.name ?? "").trim();
      const itemsInput = normalizePlaylistItems(req.body?.items);

      if (!tenantId || !name || itemsInput.length === 0) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "name and items are required" });
        return;
      }

      const items = await mapPlaylistItems(tenantId, itemsInput);
      if (items.length !== itemsInput.length) {
        res.status(400).json({ code: "MEDIA_NOT_FOUND", message: "One or more media ids are invalid" });
        return;
      }

      const playlist = await PlaylistModel.create({
        tenantId,
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
          publishedAt: playlist.publishedAt
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

      const items = await mapPlaylistItems(tenantId, itemsInput);
      if (items.length !== itemsInput.length) {
        res.status(400).json({ code: "MEDIA_NOT_FOUND", message: "One or more media ids are invalid" });
        return;
      }

      const updated = await PlaylistModel.findOneAndUpdate(
        { _id: playlistId, tenantId },
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
          publishedAt: updated.publishedAt
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
        { _id: playlistId, tenantId },
        { $set: { publishedAt: new Date() } },
        { new: true }
      );

      if (!playlist) {
        res.status(404).json({ code: "PLAYLIST_NOT_FOUND", message: "Playlist not found" });
        return;
      }

      const devices = await DeviceModel.find({
        tenantId,
        $or: [{ _id: { $in: deviceIds } }, { hardwareId: { $in: deviceIds } }]
      });

      await DeviceModel.updateMany(
        { _id: { $in: devices.map((device) => device._id) }, tenantId },
        { $set: { currentPlaylistId: String(playlist._id) } }
      );

      try {
        await contentRepository.upsertPlaylist({
          tenantId,
          externalId: String(playlist._id),
          name: playlist.name,
          version: playlist.version,
          itemsJson: playlist.items,
          publishedAt: playlist.publishedAt
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

      for (const device of devices) {
        emitSyncContent(device.hardwareId, payload);
        emitSyncContent(String(device._id), payload);
      }

      res.json({ published: true, playlist_id: String(playlist._id), device_count: devices.length });
    } catch {
      res.status(500).json({ code: "PLAYLIST_PUBLISH_FAILED", message: "Failed to publish playlist" });
    }
  });

  return router;
}
