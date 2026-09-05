import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { Types } from "mongoose";

import { Logger } from "../lib/logger.js";
import { metrics } from "../lib/metrics.js";
import { getPostgresPool, isPostgresConnected } from "../lib/postgres.js";
import { escapeRegex, parsePagination } from "../lib/account-policy.js";
import {
  normalizeCreationKey,
  normalizePlaylistName,
  parsePlaylistItems,
  playlistContentChecksum,
  type PlaylistInputItem
} from "../lib/playlist-policy.js";
import { requireRoles, requireUserAuth } from "../middlewares/auth.js";
import { CommandModel } from "../models/command.model.js";
import { DeviceModel } from "../models/device.model.js";
import { UserModel } from "../models/user.model.js";
import { MediaModel } from "../models/media.model.js";
import { PlaylistModel } from "../models/playlist.model.js";
import { MediaFolderModel } from "../models/media-folder.model.js";
import { contentRepository } from "../repositories/content.repository.js";
import { deviceRepository } from "../repositories/device.repository.js";
import { disconnectDeviceSockets, emitSyncContentToDevices, type SyncContentPayload } from "../sockets/registry.js";
import { queueCommand } from "../services/command.service.js";
import {
  canonicalMediaFilename,
  inspectMediaFile,
  LocalMediaStorage
} from "../services/media-storage.service.js";

type ContentRouteDeps = {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  readFromPostgresPercentage: number;
  mediaStorageRoot?: string | undefined;
  mediaPublicBaseUrl?: string | null | undefined;
  mediaMaxFileBytes?: number | undefined;
};

const logger = new Logger('ContentRoute');

/**
 * Hard limit on playlist items to prevent oversized SYNC_CONTENT socket frames.
 * Socket.IO relays the full items array in a single WebSocket frame; beyond ~500
 * items the frame size can exceed client WebSocket limits and cause silent drops.
 */
const MAX_PLAYLIST_ITEMS = 500;
const MAX_PUBLISH_DEVICES = 20_000;


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

type AuthCtx = { userId: string; tenantId: string; role: string };

function hasTenantWideAssetAccess(auth: AuthCtx): boolean {
  return auth.role === "super_admin" || auth.role === "tenant_owner" || auth.role === "tenant_admin";
}

function normalizeFolderName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120 || name === "." || name === ".." || /[\\/\u0000-\u001f]/.test(name)) return null;
  return name;
}

async function syncMediaFolderChange(input: {
  tenantId: string;
  ownerUserId: string | null;
  oldFolder: string;
  newFolder: string | null;
}): Promise<void> {
  if (!isPostgresConnected()) return;
  const pool = getPostgresPool();
  const params: unknown[] = [input.newFolder, input.tenantId, input.oldFolder];
  let ownerClause = "";
  if (input.ownerUserId) {
    params.push(input.ownerUserId);
    ownerClause = ` AND owner_user_id = $${params.length}`;
  }
  await pool.query(
    `UPDATE media SET folder = $1, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = $2::uuid AND folder = $3 AND deleted_at IS NULL${ownerClause}`,
    params
  );
}

function buildMediaFilter(auth: AuthCtx, extra: Record<string, any> = {}) {
  if (auth.role === "super_admin" && auth.tenantId === "system") {
    return { tenantId: "system", ...extra };
  }
  if (auth.role === "super_admin") {
    return { tenantId: auth.tenantId, ...extra };
  }
  const base = ["tenant_owner", "tenant_admin"].includes(auth.role)
    ? { tenantId: auth.tenantId }
    : { tenantId: auth.tenantId, ownerUserId: auth.userId };
  return { ...base, ...extra };
}

function buildDeviceFilter(auth: AuthCtx, extra: Record<string, any> = {}) {
  if (auth.role === "super_admin" && auth.tenantId === "system") {
    return { tenantId: "system", ...extra };
  }
  if (auth.role === "super_admin") {
    return { tenantId: auth.tenantId, ...extra };
  }
  const base = ["tenant_owner", "tenant_admin"].includes(auth.role)
    ? { tenantId: auth.tenantId }
    : { tenantId: auth.tenantId, pairedOwnerUserId: auth.userId };
  return { ...base, ...extra };
}

async function assertDeviceOwnership(deviceId: string, auth: AuthCtx): Promise<boolean> {
  if (auth.role === "super_admin" || ["tenant_owner", "tenant_admin"].includes(auth.role)) return true;
  const d = await DeviceModel.findOne({ _id: deviceId, tenantId: auth.tenantId, pairedOwnerUserId: auth.userId });
  return d !== null;
}

async function mapPlaylistItems(auth: AuthCtx, items: PlaylistInputItem[]) {
  if (items.length === 0) {
    return [];
  }

  const mediaIds = Array.from(new Set(items.map((item) => item.media_id)));
  const query = buildMediaFilter(auth, { _id: { $in: mediaIds }, status: "ready" });
  const mediaDocs = await MediaModel.find(query)
    .select({ filename: 1, publicUrl: 1, checksumSha256: 1, mimeType: 1 })
    .lean();
  const byId = new Map(mediaDocs.map((doc) => [String(doc._id), doc]));

  return [...items]
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
  const mediaStorage = new LocalMediaStorage({
    rootDir: deps.mediaStorageRoot,
    publicBaseUrl: deps.mediaPublicBaseUrl
  });
  const mediaUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        mediaStorage.ensureTempDir().then((directory) => callback(null, directory)).catch((error) => callback(error as Error, ""));
      },
      filename: (_req, _file, callback) => callback(null, "rs-upload-" + randomUUID() + ".tmp")
    }),
    limits: { fileSize: deps.mediaMaxFileBytes ?? 500 * 1024 * 1024, files: 1, fields: 4 }
  }).single("file");
  const receiveMediaUpload: RequestHandler = (req, res, next) => {
    mediaUpload(req, res, (error) => {
      if (!error) {
        next();
        return;
      }
      if (error instanceof multer.MulterError) {
        const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        res.status(status).json({
          code: error.code === "LIMIT_FILE_SIZE" ? "MEDIA_TOO_LARGE" : "MEDIA_UPLOAD_INVALID",
          message: error.code === "LIMIT_FILE_SIZE" ? "Media file exceeds the configured upload limit" : "Invalid media upload"
        });
        return;
      }
      next(error);
    });
  };

  router.use(requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }));
  router.use(requireRoles(["tenant_owner", "tenant_admin", "operator"]));

  router.get("/devices", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
      const search = req.query.search ? String(req.query.search).trim() : undefined;
      const status = req.query.status ? String(req.query.status).trim() : undefined;

      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 200) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "page must be >= 1 and limit must be between 1 and 200" });
        return;
      }

      const query: Record<string, any> = buildDeviceFilter(req.auth!);

      if (status) {
        if (!["online", "offline", "degraded"].includes(status)) {
          res.status(400).json({ code: "VALIDATION_ERROR", message: "status is invalid" });
          return;
        }
        query.status = status;
      }

      if (search) {
        query.$text = { $search: search.slice(0, 120) };
      }

      const devicesQuery = DeviceModel.find(query)
        .select({
          hardwareId: 1, name: 1, location: 1, status: 1, orientation: 1,
          timezone: 1, screenGroup: 1, operatingHours: 1, scaleMode: 1,
          notes: 1, currentPlaylistId: 1, currentMediaId: 1, playbackStartedAt: 1,
          previewUrl: 1, previewCapturedAt: 1,
          lastSeenAt: 1, lastHeartbeatAt: 1,
          ipAddress: 1, playerVersion: 1, osVersion: 1, resolution: 1,
          memoryTotal: 1, memoryUsed: 1, screenOn: 1, diagnostics: 1
        })
        .sort({ updatedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      const [total, devices] = await Promise.all([
        DeviceModel.countDocuments(query),
        devicesQuery
      ]);
      const totalPages = Math.max(1, Math.ceil(total / limit));

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
        current_media_id: device.currentMediaId ?? null,
        playback_started_at: device.playbackStartedAt?.toISOString() ?? null,
        preview_url: device.previewUrl ?? null,
        preview_captured_at: device.previewCapturedAt?.toISOString() ?? null,
        last_seen_at: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
        last_heartbeat_at: device.lastHeartbeatAt ? device.lastHeartbeatAt.toISOString() : null,
        screen_on: typeof device.screenOn === "boolean" ? device.screenOn : null,
        ip_address: device.ipAddress ?? null,
        player_version: device.playerVersion ?? null,
        os_version: device.osVersion ?? null,
        resolution: device.resolution ?? null,
        memory_total: device.memoryTotal ?? null,
        memory_used: device.memoryUsed ?? null,
        diagnostics: (device as any).diagnostics ?? null
      }));

      res.json({ devices: mappedDevices, total, page, limit, totalPages });
    } catch {
      res.status(500).json({ code: "DEVICE_LIST_FAILED", message: "Failed to fetch devices" });
    }
  });

  router.get("/device-summary", async (req, res) => {
    try {
      const match = buildDeviceFilter(req.auth!);
      const rows = await DeviceModel.aggregate<{ _id: string; count: number }>([
        { $match: match },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]);
      const byStatus = Object.fromEntries(rows.map((row) => [row._id, row.count]));
      const total = rows.reduce((sum, row) => sum + row.count, 0);
      res.json({ total, online: byStatus.online ?? 0, offline: byStatus.offline ?? 0, degraded: byStatus.degraded ?? 0 });
    } catch {
      res.status(500).json({ code: "DEVICE_SUMMARY_FAILED", message: "Failed to fetch device summary" });
    }
  });
  router.get("/device-groups", async (req, res) => {
    try {
      const match = buildDeviceFilter(req.auth!);
      const groups = await DeviceModel.aggregate<{ name: string; count: number }>([
        { $match: match },
        { $group: { _id: { $ifNull: ["$screenGroup", "Ungrouped"] }, count: { $sum: 1 } } },
        { $project: { _id: 0, name: "$_id", count: 1 } },
        { $sort: { name: 1 } },
        { $limit: 1000 }
      ]);
      res.json({ groups });
    } catch {
      res.status(500).json({ code: "DEVICE_GROUP_LIST_FAILED", message: "Failed to fetch device groups" });
    }
  });
  router.put("/devices/bulk", async (req, res) => {
    try {
      const deviceIds: string[] = Array.isArray(req.body?.device_ids)
        ? Array.from(new Set<string>((req.body.device_ids as unknown[])
          .map((value) => String(value).trim())
          .filter((value) => value.length > 0)))
        : [];
      const screenGroup = String(req.body?.screen_group ?? "").trim();

      if (deviceIds.length < 1 || deviceIds.length > 500 || !screenGroup || screenGroup.length > 120) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "device_ids must contain 1-500 unique ids and screen_group must contain 1-120 characters"
        });
        return;
      }

      if (deviceIds.some((deviceId) => !Types.ObjectId.isValid(deviceId))) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "device_ids contains an invalid id" });
        return;
      }

      const filter = buildDeviceFilter(req.auth!, { _id: { $in: deviceIds } });
      const permittedCount = await DeviceModel.countDocuments(filter);
      if (permittedCount !== deviceIds.length) {
        res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "One or more devices were not found" });
        return;
      }

      const result = await DeviceModel.updateMany(filter, { $set: { screenGroup } });
      logger.info("Bulk device group updated", {
        tenantId: req.auth?.tenantId,
        actorUserId: req.auth?.userId,
        screenGroup,
        modifiedCount: result.modifiedCount
      });
      res.json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
    } catch (error) {
      logger.error("Bulk device update failed", error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({ code: "DEVICE_BULK_UPDATE_FAILED", message: "Failed to update devices" });
    }
  });

  router.get("/devices/:deviceId", async (req, res) => {
    try {
      if (!Types.ObjectId.isValid(req.params.deviceId)) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "deviceId is invalid" });
        return;
      }
      const device = await DeviceModel.findOne(buildDeviceFilter(req.auth!, { _id: req.params.deviceId })).lean();
      if (!device) {
        res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "Device not found" });
        return;
      }
      res.json({
        device: {
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
          current_media_id: device.currentMediaId ?? null,
          playback_started_at: device.playbackStartedAt?.toISOString() ?? null,
          preview_url: device.previewUrl ?? null,
          preview_captured_at: device.previewCapturedAt?.toISOString() ?? null,
          last_seen_at: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
          last_heartbeat_at: device.lastHeartbeatAt ? device.lastHeartbeatAt.toISOString() : null,
          screen_on: typeof device.screenOn === "boolean" ? device.screenOn : null,
          ip_address: device.ipAddress ?? null,
          player_version: device.playerVersion ?? null,
          os_version: device.osVersion ?? null,
          resolution: device.resolution ?? null,
          memory_total: device.memoryTotal ?? null,
          memory_used: device.memoryUsed ?? null,
          diagnostics: (device as any).diagnostics ?? null
        }
      });
    } catch {
      res.status(500).json({ code: "DEVICE_FETCH_FAILED", message: "Failed to fetch device" });
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

      if (!tenantId || !deviceId || !Types.ObjectId.isValid(deviceId)) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "A valid deviceId is required" });
        return;
      }
      const invalidFields =
        (typeof name === "string" && name.length > 120) ||
        (typeof location === "string" && location.length > 240) ||
        (typeof timezone === "string" && timezone.length > 80) ||
        (typeof screenGroup === "string" && screenGroup.length > 120) ||
        (typeof operatingHours === "string" && operatingHours.length > 200) ||
        (typeof notes === "string" && notes.length > 2_000) ||
        (orientation !== undefined && ![0, 90, 180, 270].includes(orientation)) ||
        (scaleMode !== undefined && !["fit", "fill", "stretch"].includes(scaleMode));
      if (invalidFields) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "One or more device fields are invalid" });
        return;
      }

      const updateFields: Record<string, unknown> = {};
      if (name !== undefined) updateFields.name = name;
      if (location !== undefined) updateFields.location = location;
      if (orientation !== undefined) updateFields.orientation = orientation;
      if (timezone !== undefined) updateFields.timezone = timezone;
      if (screenGroup !== undefined) updateFields.screenGroup = screenGroup;
      if (operatingHours !== undefined) updateFields.operatingHours = operatingHours;
      if (scaleMode !== undefined) updateFields.scaleMode = scaleMode;
      if (notes !== undefined) updateFields.notes = notes;

      const previousDevice = await DeviceModel.findOneAndUpdate(
        buildDeviceFilter(req.auth!, { _id: deviceId }),
        { $set: updateFields },
        { new: false }
      );
      if (!previousDevice) {
        res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "Device not found" });
        return;
      }

      const updatedDevice = {
        _id: previousDevice._id,
        hardwareId: previousDevice.hardwareId,
        name: name !== undefined ? name : previousDevice.name,
        location: location !== undefined ? location : previousDevice.location,
        status: previousDevice.status,
        orientation: orientation !== undefined ? orientation : previousDevice.orientation,
        timezone: timezone !== undefined ? timezone : previousDevice.timezone,
        screenGroup: screenGroup !== undefined ? screenGroup : previousDevice.screenGroup,
        operatingHours: operatingHours !== undefined ? operatingHours : previousDevice.operatingHours,
        scaleMode: scaleMode !== undefined ? scaleMode : previousDevice.scaleMode,
        notes: notes !== undefined ? notes : previousDevice.notes
      };
      if (orientation !== undefined && previousDevice.orientation !== updatedDevice.orientation) {
        try {
          const commandId = randomUUID();
          await queueCommand({
            tenantId,
            deviceId,
            requestedByUserId: req.auth!.userId,
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

      if (operatingHours !== undefined && previousDevice.operatingHours !== updatedDevice.operatingHours) {
        try {
          const commandId = randomUUID();
          await queueCommand({
            tenantId,
            deviceId,
            requestedByUserId: req.auth!.userId,
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

      if (scaleMode !== undefined && previousDevice.scaleMode !== updatedDevice.scaleMode) {
        try {
          const commandId = randomUUID();
          await queueCommand({
            tenantId,
            deviceId,
            requestedByUserId: req.auth!.userId,
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
      if (!tenantId || !Types.ObjectId.isValid(deviceId)) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "A valid deviceId is required" });
        return;
      }

      const device = await DeviceModel.findOneAndUpdate(
        buildDeviceFilter(req.auth!, { _id: deviceId }),
        {
          $set: {
            tenantId: null,
            pairedOwnerUserId: null,
            currentPlaylistId: null,
            currentMediaId: null,
            playbackStartedAt: null,
            deviceCredentialHash: null,
            status: "offline",
            lastHeartbeatAt: null,
            lastSeenAt: new Date()
          }
        },
        { new: false }
      );
      if (!device) {
        res.status(404).json({ code: "DEVICE_NOT_FOUND", message: "Device not found" });
        return;
      }

      await CommandModel.updateMany(
        { tenantId, deviceId, status: { $in: ["queued", "sent", "acknowledged"] } },
        {
          $set: {
            status: "failed",
            completedAt: new Date(),
            timeoutAt: null,
            errorMessage: "Device was removed from the organization"
          }
        }
      );
      await deviceRepository.unpairByHardware(tenantId, device.hardwareId);
      disconnectDeviceSockets(deviceId);
      logger.info("Device unpaired and detached from tenant", { deviceId, tenantId });
      res.status(204).send();
    } catch (error) {
      logger.error("Device removal failed", error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({ code: "DEVICE_DELETE_FAILED", message: "Failed to remove device" });
    }
  });
  router.get("/media", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(401).json({ code: "UNAUTHORIZED", message: "Missing auth context" });
        return;
      }
      const pagination = parsePagination(req.query.page, req.query.limit, { limit: 100, maxLimit: 200 });
      if (!pagination) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid page or limit" });
        return;
      }

      const query: Record<string, any> = buildMediaFilter(req.auth!, { status: "ready" });
      const search = String(req.query.search ?? "").trim().slice(0, 120);
      const folder = req.query.folder === undefined ? undefined : String(req.query.folder).trim();
      const kind = String(req.query.kind ?? "all").trim().toLowerCase();
      if (!new Set(["all", "media", "apps"]).has(kind)) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "kind must be all, media, or apps" });
        return;
      }
      if (kind === "apps") {
        query.mimeType = "text/html";
        query.storagePath = /^app:\/\//;
      } else if (kind === "media") {
        query.mimeType = { $ne: "text/html" };
      }
      if (search) query.filename = { $regex: `^${escapeRegex(search)}`, $options: "i" };
      if (folder !== undefined) query.folder = folder === "" || folder === "root" ? null : folder;

      const [total, mediaList] = await Promise.all([
        MediaModel.countDocuments(query),
        MediaModel.find(query)
          .select({
            filename: 1,
            mimeType: 1,
            sizeBytes: 1,
            checksumSha256: 1,
            publicUrl: 1,
            storagePath: 1,
            appConfig: 1,
            ownerUserId: 1,
            folder: 1,
            createdAt: 1
          })
          .sort({ createdAt: -1, _id: -1 })
          .skip(pagination.skip)
          .limit(pagination.limit)
          .lean()
      ]);

      res.json({
        media: mediaList.map((media) => ({
          id: String(media._id),
          filename: media.filename,
          mime_type: media.mimeType,
          size_bytes: media.sizeBytes,
          checksum_sha256: media.checksumSha256,
          media_url: media.publicUrl,
          storage_path: media.storagePath,
          app_config: media.appConfig,
          owner_user_id: media.ownerUserId,
          folder: media.folder,
          created_at: (media as any).createdAt
        })),
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.max(1, Math.ceil(total / pagination.limit))
      });
    } catch {
      res.status(500).json({ code: "MEDIA_LIST_FAILED", message: "Failed to list media" });
    }
  });
  router.post("/media/upload", receiveMediaUpload, async (req, res) => {
    const tempPath: string | undefined = (req.file as Express.Multer.File & { path?: string })?.path;
    let committedStoragePath: string | null = null;

    try {
      if (!req.file || !tempPath) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "file is required" });
        return;
      }

      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        await rm(tempPath, { force: true });
        res.status(401).json({ code: "UNAUTHORIZED", message: "Missing auth context" });
        return;
      }

      const inspected = await inspectMediaFile(tempPath);
      if (!inspected.mimeType || inspected.sizeBytes < 1) {
        await rm(tempPath, { force: true });
        res.status(415).json({
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "File contents are not a supported image or video format"
        });
        return;
      }

      const userId = req.auth!.userId;
      const duplicate = await MediaModel.findOne({
        tenantId,
        ownerUserId: userId,
        checksumSha256: inspected.checksumSha256,
        status: "ready"
      }).lean();
      if (duplicate) {
        await rm(tempPath, { force: true });
        res.status(200).json({
          deduplicated: true,
          media: {
            id: String(duplicate._id),
            filename: duplicate.filename,
            mime_type: duplicate.mimeType,
            size_bytes: duplicate.sizeBytes,
            checksum_sha256: duplicate.checksumSha256,
            media_url: duplicate.publicUrl,
            folder: duplicate.folder,
            created_at: (duplicate as { createdAt?: Date }).createdAt
          }
        });
        return;
      }

      const filename = canonicalMediaFilename(req.file.originalname, inspected.mimeType);
      const stored = await mediaStorage.commit({
        tempPath,
        tenantId,
        ownerUserId: userId,
        checksumSha256: inspected.checksumSha256,
        filename
      });
      committedStoragePath = stored.storagePath;

      let media;
      try {
        media = await MediaModel.create({
          tenantId,
          ownerUserId: userId,
          filename,
          mimeType: inspected.mimeType,
          sizeBytes: inspected.sizeBytes,
          checksumSha256: inspected.checksumSha256,
          storagePath: stored.storagePath,
          publicUrl: stored.publicUrl,
          status: "ready",
          folder: null
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        const racedDuplicate = await MediaModel.findOne({
          tenantId,
          ownerUserId: userId,
          checksumSha256: inspected.checksumSha256,
          status: "ready"
        }).lean();
        if (!racedDuplicate) throw error;
        await mediaStorage.delete(stored.storagePath);
        committedStoragePath = null;
        res.status(200).json({
          deduplicated: true,
          media: {
            id: String(racedDuplicate._id),
            filename: racedDuplicate.filename,
            mime_type: racedDuplicate.mimeType,
            size_bytes: racedDuplicate.sizeBytes,
            checksum_sha256: racedDuplicate.checksumSha256,
            media_url: racedDuplicate.publicUrl,
            folder: racedDuplicate.folder,
            created_at: (racedDuplicate as { createdAt?: Date }).createdAt
          }
        });
        return;
      }

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
        ownerUserId: userId,
        folder: null
      });

      res.status(201).json({
        deduplicated: false,
        media: {
          id: String(media._id),
          filename: media.filename,
          mime_type: media.mimeType,
          size_bytes: media.sizeBytes,
          checksum_sha256: media.checksumSha256,
          media_url: media.publicUrl,
          folder: null,
          created_at: (media as { createdAt?: Date }).createdAt
        }
      });
    } catch (error) {
      await Promise.all([
        tempPath ? rm(tempPath, { force: true }).catch(() => undefined) : Promise.resolve(),
        committedStoragePath
          ? mediaStorage.delete(committedStoragePath).catch(() => undefined)
          : Promise.resolve()
      ]);
      logger.error("Media upload failed", error instanceof Error ? error : new Error(String(error)), {
        operation: "media-upload",
        tenantId: req.auth?.tenantId
      });
      res.status(500).json({ code: "MEDIA_UPLOAD_FAILED", message: "Failed to upload media" });
    }
  });
  router.delete("/media/:mediaId", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const mediaId = String(req.params.mediaId ?? "");
      if (!tenantId || !Types.ObjectId.isValid(mediaId)) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "A valid mediaId is required" });
        return;
      }

      const mediaFilter = buildMediaFilter(req.auth!, { _id: mediaId });
      const media = await MediaModel.findOne(mediaFilter).select({ storagePath: 1 }).lean();
      if (!media) {
        res.status(404).json({ code: "MEDIA_NOT_FOUND", message: "Media not found" });
        return;
      }
      if (!media.storagePath.startsWith("app://") && !mediaStorage.resolveStoredPath(media.storagePath)) {
        res.status(409).json({ code: "MEDIA_STORAGE_PATH_INVALID", message: "Media storage path is outside the configured storage root" });
        return;
      }

      const playlistsUsing = await PlaylistModel.find(
        buildMediaFilter(req.auth!, { "items.mediaId": mediaId })
      ).select({ name: 1 }).lean();
      const regularPlaylist = playlistsUsing.find((playlist) => !playlist.name.startsWith("Single Media:"));
      if (regularPlaylist) {
        res.status(409).json({
          code: "MEDIA_IN_USE",
          message: "Media is currently in use by playlist " + regularPlaylist.name
        });
        return;
      }

      const autoPlaylistIds = playlistsUsing
        .filter((playlist) => playlist.name.startsWith("Single Media:"))
        .map((playlist) => String(playlist._id));
      let detachedDevices: Array<{ _id: Types.ObjectId; hardwareId: string }> = [];

      if (autoPlaylistIds.length > 0) {
        const deviceQuery = buildDeviceFilter(req.auth!, { currentPlaylistId: { $in: autoPlaylistIds } });
        detachedDevices = await DeviceModel.find(deviceQuery)
          .select({ _id: 1, hardwareId: 1 })
          .lean();
        await Promise.all([
          PlaylistModel.deleteMany(buildMediaFilter(req.auth!, { _id: { $in: autoPlaylistIds } })),
          DeviceModel.updateMany(deviceQuery, {
            $set: { currentPlaylistId: null, currentMediaId: null, playbackStartedAt: null }
          })
        ]);
      }

      const deleted = await MediaModel.deleteOne(mediaFilter);
      if (deleted.deletedCount !== 1) {
        res.status(409).json({ code: "MEDIA_STATE_CHANGED", message: "Media changed while it was being deleted" });
        return;
      }

      if (detachedDevices.length > 0) {
        emitSyncContentToDevices(
          detachedDevices.map((device) => String(device._id)),
          { playlist_id: null, playlist_version: 0, checksum_sha256: "", items: [] }
        );
      }

      await Promise.all([
        mediaStorage.delete(media.storagePath).catch((error) => {
          logger.error("Failed to delete media file from storage", error instanceof Error ? error : new Error(String(error)), {
            mediaId,
            storagePath: media.storagePath
          });
        }),
        contentRepository.deleteMedia(tenantId, mediaId),
        ...autoPlaylistIds.map((id) => contentRepository.deletePlaylist(tenantId, id)),
        detachedDevices.length > 0
          ? contentRepository.setDevicesCurrentPlaylist(
              tenantId,
              detachedDevices.map((device) => device.hardwareId),
              null
            )
          : Promise.resolve()
      ]);

      res.status(204).send();
    } catch (error) {
      logger.error("Media delete failed", error instanceof Error ? error : new Error(String(error)));
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
      const pagination = parsePagination(req.query.page, req.query.limit, { limit: 50, maxLimit: 200 });
      if (!pagination) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid page or limit" });
        return;
      }

      const query: Record<string, unknown> = buildMediaFilter(req.auth!);
      const search = String(req.query.search ?? "").trim().slice(0, 120);
      const includeSystem = String(req.query.include_system ?? "true") === "true";
      const nameConditions: Array<Record<string, unknown>> = [];
      if (search) nameConditions.push({ nameKey: { $regex: "^" + escapeRegex(search.toLocaleLowerCase("tr-TR")) } });
      if (!includeSystem) nameConditions.push({ name: { $not: /^Single Media:/i } });
      if (nameConditions.length > 0) query.$and = nameConditions;

      const [result] = await PlaylistModel.aggregate<{
        data: Array<{
          _id: Types.ObjectId;
          name: string;
          version: number;
          publishedAt: Date | null;
          publishedVersion: number | null;
          updatedAt: Date;
          itemCount: number;
        }>;
        total: Array<{ count: number }>;
      }>([
        { $match: query },
        { $sort: { updatedAt: -1, _id: -1 } },
        {
          $facet: {
            data: [
              { $skip: pagination.skip },
              { $limit: pagination.limit },
              {
                $project: {
                  name: 1,
                  version: 1,
                  publishedAt: 1,
                  publishedVersion: 1,
                  updatedAt: 1,
                  itemCount: { $size: "$items" }
                }
              }
            ],
            total: [{ $count: "count" }]
          }
        }
      ]);

      const total = result?.total[0]?.count ?? 0;
      metrics.recordShadowRead("mongo", 0);
      res.json({
        playlists: (result?.data ?? []).map((playlist) => ({
          id: String(playlist._id),
          name: playlist.name,
          version: playlist.version,
          published_version: playlist.publishedVersion,
          published_at: playlist.publishedAt,
          item_count: playlist.itemCount,
          updated_at: playlist.updatedAt
        })),
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.max(1, Math.ceil(total / pagination.limit))
      });
    } catch (error) {
      logger.error("Failed to list playlists", error instanceof Error ? error : new Error(String(error)), {
        operation: "listPlaylists",
        tenantId: req.auth?.tenantId
      });
      res.status(500).json({ code: "PLAYLIST_LIST_FAILED", message: "Failed to list playlists" });
    }
  });
  router.get("/playlists/:playlistId", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const playlistId = String(req.params.playlistId);
      if (!tenantId || !Types.ObjectId.isValid(playlistId)) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "playlistId is required" });
        return;
      }

      if (shouldReadFromPostgres(deps.readFromPostgresPercentage)) {
        const row = await contentRepository.getPlaylist(tenantId, playlistId);
        if (row) {
          if (!hasTenantWideAssetAccess(req.auth!) && row.owner_user_id !== req.auth?.userId) {
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
      const normalizedName = normalizePlaylistName(req.body?.name);
      const parsedItems = parsePlaylistItems(req.body?.items, MAX_PLAYLIST_ITEMS);
      const creationKey = normalizeCreationKey(req.body?.request_id);
      if (!tenantId || !normalizedName || parsedItems.error ||
          (req.body?.request_id !== undefined && !creationKey)) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: parsedItems.error || "Playlist name or request_id is invalid"
        });
        return;
      }

      if (creationKey) {
        const existing = await PlaylistModel.findOne({
          tenantId,
          ownerUserId: req.auth!.userId,
          creationKey
        }).lean();
        if (existing) {
          res.status(200).json({
            deduplicated: true,
            playlist: {
              id: String(existing._id),
              name: existing.name,
              version: existing.version,
              item_count: existing.items.length
            }
          });
          return;
        }
      }

      const items = await mapPlaylistItems(req.auth!, parsedItems.items);
      if (items.length !== parsedItems.items.length) {
        res.status(400).json({ code: "MEDIA_NOT_FOUND", message: "One or more media ids are unavailable" });
        return;
      }

      const contentChecksumSha256 = playlistContentChecksum(items);
      let playlist;
      try {
        playlist = await PlaylistModel.create({
          tenantId,
          ownerUserId: req.auth!.userId,
          name: normalizedName.name,
          nameKey: normalizedName.nameKey,
          creationKey,
          version: 1,
          contentChecksumSha256,
          items,
          publishedAt: null,
          publishedVersion: null
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        if (creationKey) {
          const raced = await PlaylistModel.findOne({
            tenantId,
            ownerUserId: req.auth!.userId,
            creationKey
          }).lean();
          if (raced) {
            res.status(200).json({
              deduplicated: true,
              playlist: {
                id: String(raced._id),
                name: raced.name,
                version: raced.version,
                item_count: raced.items.length
              }
            });
            return;
          }
        }
        res.status(409).json({ code: "PLAYLIST_NAME_EXISTS", message: "A playlist with this name already exists" });
        return;
      }

      await contentRepository.upsertPlaylist({
        tenantId,
        externalId: String(playlist._id),
        name: playlist.name,
        nameKey: playlist.nameKey ?? normalizePlaylistName(playlist.name)?.nameKey ?? playlist.name,
        creationKey: playlist.creationKey,
        version: playlist.version,
        contentChecksumSha256: playlist.contentChecksumSha256,
        itemsJson: playlist.items,
        publishedAt: playlist.publishedAt,
        publishedVersion: playlist.publishedVersion,
        ownerUserId: req.auth!.userId
      });

      res.status(201).json({
        deduplicated: false,
        playlist: {
          id: String(playlist._id),
          name: playlist.name,
          version: playlist.version,
          content_checksum_sha256: playlist.contentChecksumSha256,
          item_count: playlist.items.length
        }
      });
    } catch (error) {
      logger.error("Playlist creation failed", error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({ code: "PLAYLIST_CREATE_FAILED", message: "Failed to create playlist" });
    }
  });
  router.put("/playlists/:playlistId", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const playlistId = String(req.params.playlistId ?? "");
      const normalizedName = normalizePlaylistName(req.body?.name);
      const parsedItems = parsePlaylistItems(req.body?.items, MAX_PLAYLIST_ITEMS);
      const expectedVersion = req.body?.expected_version === undefined
        ? null
        : Number(req.body.expected_version);

      if (!tenantId || !Types.ObjectId.isValid(playlistId) || !normalizedName || parsedItems.error ||
          (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion < 1))) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: parsedItems.error || "Playlist id, name or expected_version is invalid"
        });
        return;
      }

      const items = await mapPlaylistItems(req.auth!, parsedItems.items);
      if (items.length !== parsedItems.items.length) {
        res.status(400).json({ code: "MEDIA_NOT_FOUND", message: "One or more media ids are unavailable" });
        return;
      }
      const contentChecksumSha256 = playlistContentChecksum(items);
      const versionFilter = expectedVersion === null ? {} : { version: expectedVersion };
      const ownershipFilter = buildMediaFilter(req.auth!, { _id: playlistId, ...versionFilter });

      let updated;
      try {
        updated = await PlaylistModel.findOneAndUpdate(
          {
            ...ownershipFilter,
            $or: [
              { nameKey: { $ne: normalizedName.nameKey } },
              { contentChecksumSha256: { $ne: contentChecksumSha256 } }
            ]
          },
          {
            $set: {
              name: normalizedName.name,
              nameKey: normalizedName.nameKey,
              items,
              contentChecksumSha256,
              publishedAt: null,
              publishedVersion: null
            },
            $inc: { version: 1 }
          },
          { new: true, runValidators: true }
        );
      } catch (error) {
        if ((error as { code?: number }).code === 11000) {
          res.status(409).json({ code: "PLAYLIST_NAME_EXISTS", message: "A playlist with this name already exists" });
          return;
        }
        throw error;
      }

      if (!updated) {
        const current = await PlaylistModel.findOne(buildMediaFilter(req.auth!, { _id: playlistId }))
          .select({ name: 1, nameKey: 1, version: 1, contentChecksumSha256: 1, items: 1 })
          .lean();
        if (!current) {
          res.status(404).json({ code: "PLAYLIST_NOT_FOUND", message: "Playlist not found" });
          return;
        }
        if (expectedVersion !== null && current.version !== expectedVersion) {
          res.status(409).json({
            code: "PLAYLIST_VERSION_CONFLICT",
            message: "Playlist was changed by another session",
            current_version: current.version
          });
          return;
        }
        res.status(200).json({
          unchanged: true,
          playlist: {
            id: String(current._id),
            name: current.name,
            version: current.version,
            content_checksum_sha256: current.contentChecksumSha256,
            item_count: current.items.length
          }
        });
        return;
      }

      await contentRepository.upsertPlaylist({
        tenantId,
        externalId: String(updated._id),
        name: updated.name,
        nameKey: updated.nameKey ?? normalizePlaylistName(updated.name)?.nameKey ?? updated.name,
        creationKey: updated.creationKey,
        version: updated.version,
        contentChecksumSha256: updated.contentChecksumSha256,
        itemsJson: updated.items,
        publishedAt: updated.publishedAt,
        publishedVersion: updated.publishedVersion,
        ownerUserId: updated.ownerUserId
      });

      res.json({
        unchanged: false,
        playlist: {
          id: String(updated._id),
          name: updated.name,
          version: updated.version,
          content_checksum_sha256: updated.contentChecksumSha256,
          item_count: updated.items.length
        }
      });
    } catch (error) {
      logger.error("Playlist update failed", error instanceof Error ? error : new Error(String(error)), {
        playlistId: req.params.playlistId,
        tenantId: req.auth?.tenantId
      });
      res.status(500).json({ code: "PLAYLIST_UPDATE_FAILED", message: "Failed to update playlist" });
    }
  });
  router.post("/playlists/:playlistId/publish", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const playlistId = String(req.params.playlistId ?? "");
      const rawDeviceIds = Array.isArray(req.body?.device_ids) ? req.body.device_ids : [];
      const deviceIds = Array.from(new Set<string>(
        rawDeviceIds.map((value: unknown) => String(value).trim()).filter(Boolean)
      ));
      const expectedVersion = req.body?.expected_version === undefined
        ? null
        : Number(req.body.expected_version);

      if (!tenantId || !Types.ObjectId.isValid(playlistId) || deviceIds.length < 1 ||
          deviceIds.some((id) => id.length > 200) ||
          (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion < 1))) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Playlist, device ids or expected_version is invalid" });
        return;
      }
      if (deviceIds.length > MAX_PUBLISH_DEVICES) {
        res.status(413).json({
          code: "TOO_MANY_DEVICES",
          message: "A single publish can target at most " + MAX_PUBLISH_DEVICES + " devices"
        });
        return;
      }

      const playlistFilter = buildMediaFilter(req.auth!, {
        _id: playlistId,
        ...(expectedVersion === null ? {} : { version: expectedVersion })
      });
      const playlist = await PlaylistModel.findOne(playlistFilter).lean();
      if (!playlist) {
        const current = expectedVersion === null
          ? null
          : await PlaylistModel.findOne(buildMediaFilter(req.auth!, { _id: playlistId }))
              .select({ version: 1 })
              .lean();
        if (current) {
          res.status(409).json({
            code: "PLAYLIST_VERSION_CONFLICT",
            message: "Playlist was changed before it could be published",
            current_version: current.version
          });
          return;
        }
        res.status(404).json({ code: "PLAYLIST_NOT_FOUND", message: "Playlist not found" });
        return;
      }

      const devices = await DeviceModel.find(buildDeviceFilter(req.auth!, {
        $or: [{ _id: { $in: deviceIds.filter((id) => Types.ObjectId.isValid(id)) } }, { hardwareId: { $in: deviceIds } }]
      })).select({ _id: 1, hardwareId: 1 }).lean();

      const matchedDeviceKeys = new Set<string>();
      for (const device of devices) {
        matchedDeviceKeys.add(String(device._id));
        matchedDeviceKeys.add(device.hardwareId);
      }
      const missingDeviceCount = deviceIds.filter((id) => !matchedDeviceKeys.has(id)).length;
      if (missingDeviceCount > 0) {
        res.status(404).json({
          code: "DEVICE_NOT_FOUND",
          message: "One or more target devices were not found or are not accessible",
          missing_device_count: missingDeviceCount
        });
        return;
      }

      const publishedAt = new Date();
      const publishState = await PlaylistModel.updateOne(
        buildMediaFilter(req.auth!, { _id: playlistId, version: playlist.version }),
        { $set: { publishedAt, publishedVersion: playlist.version } }
      );
      if (publishState.modifiedCount !== 1) {
        res.status(409).json({ code: "PLAYLIST_VERSION_CONFLICT", message: "Playlist changed during publish" });
        return;
      }

      await DeviceModel.updateMany(
        buildDeviceFilter(req.auth!, { _id: { $in: devices.map((device) => device._id) } }),
        { $set: { currentPlaylistId: playlistId, currentMediaId: null, playbackStartedAt: null } }
      );

      await Promise.all([
        contentRepository.upsertPlaylist({
          tenantId,
          externalId: playlistId,
          name: playlist.name,
          nameKey: playlist.nameKey ?? normalizePlaylistName(playlist.name)?.nameKey ?? playlist.name,
          creationKey: playlist.creationKey,
          version: playlist.version,
          contentChecksumSha256: playlist.contentChecksumSha256,
          itemsJson: playlist.items,
          publishedAt,
          publishedVersion: playlist.version,
          ownerUserId: playlist.ownerUserId
        }),
        contentRepository.setDevicesCurrentPlaylist(
          tenantId,
          devices.map((device) => device.hardwareId),
          playlistId
        )
      ]);

      const checksumSha256 = playlist.contentChecksumSha256 || playlistContentChecksum(playlist.items);
      const payload: SyncContentPayload = {
        playlist_id: playlistId,
        playlist_version: playlist.version,
        checksum_sha256: checksumSha256,
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

      emitSyncContentToDevices(devices.map((device) => String(device._id)), payload);
      res.json({
        published: true,
        playlist_id: playlistId,
        playlist_version: playlist.version,
        checksum_sha256: checksumSha256,
        device_count: devices.length
      });
    } catch (error) {
      logger.error("Playlist publish failed", error instanceof Error ? error : new Error(String(error)), {
        playlistId: req.params.playlistId,
        tenantId: req.auth?.tenantId
      });
      res.status(500).json({ code: "PLAYLIST_PUBLISH_FAILED", message: "Failed to publish playlist" });
    }
  });
  router.delete("/playlists/:playlistId", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const playlistId = req.params.playlistId;

      if (!tenantId || !Types.ObjectId.isValid(playlistId)) {
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
      const devices = await DeviceModel.find(deviceQuery)
        .select({ _id: 1, hardwareId: 1 })
        .lean();
      if (devices.length > 0) {
        await DeviceModel.updateMany(
          deviceQuery,
          { $set: { currentPlaylistId: null, currentMediaId: null, playbackStartedAt: null } }
        );

        // Prepare empty sync payload
        const nullPayload: SyncContentPayload = {
          playlist_id: null,
          playlist_version: 0,
          checksum_sha256: "",
          items: []
        };

        // Notify all canonical device rooms with a single adapter publication.
        emitSyncContentToDevices(devices.map((device) => String(device._id)), nullPayload);

        // Update in Postgres
        try {
          await contentRepository.setDevicesCurrentPlaylist(
            tenantId,
            devices.map((device) => device.hardwareId),
            null
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
      if (!req.auth || !tenantId) {
        res.status(401).json({ code: "UNAUTHORIZED", message: "Missing auth context" });
        return;
      }
      const match = hasTenantWideAssetAccess(req.auth)
        ? { tenantId }
        : { tenantId, ownerUserId: req.auth.userId };
      const folders = await MediaFolderModel.aggregate<{ name: string }>([
        { $match: match },
        { $group: { _id: "$name" } },
        { $sort: { _id: 1 } },
        { $limit: 1_000 },
        { $project: { _id: 0, name: "$_id" } }
      ]);
      res.json({ folders: folders.map((folder) => folder.name) });
    } catch {
      res.status(500).json({ code: "FOLDER_LIST_FAILED", message: "Failed to list folders" });
    }
  });

  router.post("/folders", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const name = normalizeFolderName(req.body?.name);
      if (!req.auth || !tenantId || !name) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Folder name must contain 1-120 safe characters" });
        return;
      }
      const tenantWide = hasTenantWideAssetAccess(req.auth);
      const existingFilter = tenantWide
        ? { tenantId, name }
        : { tenantId, ownerUserId: req.auth.userId, name };
      if (await MediaFolderModel.exists(existingFilter)) {
        res.status(409).json({ code: "FOLDER_EXISTS", message: "Folder already exists" });
        return;
      }
      const folder = await MediaFolderModel.create({
        tenantId,
        ownerUserId: tenantWide ? null : req.auth.userId,
        name
      });
      res.status(201).json({ success: true, folder: folder.name });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        res.status(409).json({ code: "FOLDER_EXISTS", message: "Folder already exists" });
        return;
      }
      res.status(500).json({ code: "FOLDER_CREATE_FAILED", message: "Failed to create folder" });
    }
  });

  router.put("/folders/:folderName", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const oldName = normalizeFolderName(req.params.folderName);
      const newName = normalizeFolderName(req.body?.name);
      if (!req.auth || !tenantId || !oldName || !newName) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "Folder names must contain 1-120 safe characters" });
        return;
      }
      if (oldName === newName) {
        res.json({ success: true, folder: newName, modified: 0 });
        return;
      }

      const tenantWide = hasTenantWideAssetAccess(req.auth);
      const sourceFilter = tenantWide
        ? { tenantId, name: oldName }
        : { tenantId, ownerUserId: req.auth.userId, name: oldName };
      const targetFilter = tenantWide
        ? { tenantId, name: newName }
        : { tenantId, ownerUserId: req.auth.userId, name: newName };
      if (!(await MediaFolderModel.exists(sourceFilter))) {
        res.status(404).json({ code: "FOLDER_NOT_FOUND", message: "Folder not found" });
        return;
      }
      if (await MediaFolderModel.exists(targetFilter)) {
        res.status(409).json({ code: "FOLDER_EXISTS", message: "A folder with the new name already exists" });
        return;
      }

      if (tenantWide) {
        await MediaFolderModel.deleteMany(sourceFilter);
        await MediaFolderModel.create({ tenantId, ownerUserId: null, name: newName });
      } else {
        await MediaFolderModel.updateOne(sourceFilter, { $set: { name: newName } });
      }
      const mediaFilter = tenantWide
        ? { tenantId, folder: oldName }
        : { tenantId, ownerUserId: req.auth.userId, folder: oldName };
      const updated = await MediaModel.updateMany(mediaFilter, { $set: { folder: newName } });
      try {
        await syncMediaFolderChange({
          tenantId,
          ownerUserId: tenantWide ? null : req.auth.userId,
          oldFolder: oldName,
          newFolder: newName
        });
      } catch (error) {
        logger.error("Failed to sync folder rename to PostgreSQL", error instanceof Error ? error : new Error(String(error)));
      }
      res.json({ success: true, folder: newName, modified: updated.modifiedCount });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        res.status(409).json({ code: "FOLDER_EXISTS", message: "A folder with the new name already exists" });
        return;
      }
      res.status(500).json({ code: "FOLDER_RENAME_FAILED", message: "Failed to rename folder" });
    }
  });

  router.delete("/folders/:folderName", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const name = normalizeFolderName(req.params.folderName);
      if (!req.auth || !tenantId || !name) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "A valid folder name is required" });
        return;
      }
      const tenantWide = hasTenantWideAssetAccess(req.auth);
      const folderFilter = tenantWide
        ? { tenantId, name }
        : { tenantId, ownerUserId: req.auth.userId, name };
      const deleted = await MediaFolderModel.deleteMany(folderFilter);
      if (deleted.deletedCount === 0) {
        res.status(404).json({ code: "FOLDER_NOT_FOUND", message: "Folder not found" });
        return;
      }
      const mediaFilter = tenantWide
        ? { tenantId, folder: name }
        : { tenantId, ownerUserId: req.auth.userId, folder: name };
      await MediaModel.updateMany(mediaFilter, { $set: { folder: null } });
      try {
        await syncMediaFolderChange({
          tenantId,
          ownerUserId: tenantWide ? null : req.auth.userId,
          oldFolder: name,
          newFolder: null
        });
      } catch (error) {
        logger.error("Failed to sync folder delete to PostgreSQL", error instanceof Error ? error : new Error(String(error)));
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
      const rawFolder = req.body?.folder;
      const folderName = rawFolder === undefined
        ? undefined
        : rawFolder === null
          ? null
          : normalizeFolderName(rawFolder);
      
      if (!tenantId || !Types.ObjectId.isValid(mediaId) || folderName === undefined || (rawFolder !== null && folderName === null)) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "A valid mediaId and safe folder name are required" });
        return;
      }
      
      const media = await MediaModel.findOne(buildMediaFilter(req.auth!, { _id: mediaId }));
      if (!media) {
        res.status(404).json({ code: "MEDIA_NOT_FOUND", message: "Media not found" });
        return;
      }
      
      if (folderName !== null) {
        // Verify folder exists
        const folderFilter = hasTenantWideAssetAccess(req.auth!)
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
