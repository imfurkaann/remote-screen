"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmProvider";
import ScreenPowerBadge from "@/components/ScreenPowerBadge";
import { useFleetSocket } from "@/lib/use-fleet-socket";
import { commandAckStatus } from "@/lib/fleet-events";
import { getDevicePresence, type DevicePresence } from "@/lib/device-presence";
import { getScreenPowerState } from "@/lib/screen-power";
import { createClientId } from "@/lib/client-uuid";

// Define Types
type Device = {
  id: string;
  hardware_id: string;
  name?: string | null;
  location?: string | null;
  status: string;
  orientation?: number;
  timezone?: string | null;
  screen_group?: string | null;
  operating_hours?: string | null;
  scale_mode?: string | null;
  notes?: string | null;
  last_seen_at?: string | null;
  last_heartbeat_at?: string | null;
  screen_on?: boolean | null;
  current_playlist_id?: string | null;
  current_media_id?: string | null;
  playback_started_at?: string | null;
  preview_url?: string | null;
  preview_captured_at?: string | null;
  ip_address?: string | null;
  player_version?: string | null;
  os_version?: string | null;
  resolution?: string | null;
  memory_total?: string | null;
  memory_used?: string | null;
  diagnostics?: {
    storage_total_mb?: number;
    storage_free_mb?: number;
    storage_usage_percent?: number;
    network_type?: string;
    wifi_rssi?: number;
    wifi_signal_level?: number;
    wifi_ssid?: string;
    memory_total_gb?: string;
    memory_free_gb?: string;
    memory_used_gb?: string;
    memory_usage_percent?: number;
    logs?: string;
    storage_error?: string;
    network_error?: string;
    memory_error?: string;
  } | null;
};

type Playlist = {
  id: string;
  name: string;
  version: number;
  item_count: number;
  updated_at: string;
  items?: Array<{
    media_id: string;
    filename: string;
    media_url: string;
    checksum_sha256: string;
    mime_type: string;
    duration_ms: number;
    position: number;
  }>;
};

type MediaItem = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  media_url: string;
};

type CommandLog = {
  id: string;
  command_id: string;
  command_type: string;
  status: string;
  attempts: number;
  max_attempts: number;
  screenshot_url?: string | null;
  error_message?: string | null;
  created_at?: string;
  completed_at?: string | null;
};

const TERMINAL_STATUSES = new Set(["completed", "failed", "timeout"]);
const POLL_INTERVAL_MS = 2500;
const POLL_MAX_MS = 20_000;

const PRESENCE_STYLE: Record<DevicePresence, {
  label: string;
  color: string;
  dot: string;
  background: string;
  border: string;
}> = {
  online: {
    label: "ONLINE",
    color: "#10b981",
    dot: "#10b981",
    background: "rgba(16, 185, 129, 0.06)",
    border: "1px solid rgba(16, 185, 129, 0.15)"
  },
  degraded: {
    label: "DEGRADED",
    color: "#d97706",
    dot: "#f59e0b",
    background: "rgba(245, 158, 11, 0.08)",
    border: "1px solid rgba(245, 158, 11, 0.22)"
  },
  offline: {
    label: "OFFLINE",
    color: "#64748b",
    dot: "#64748b",
    background: "#f1f5f9",
    border: "1px solid #cbd5e1"
  }
};

type DaySchedule = {
  enabled: boolean;
  start: string; // "HH:mm:ss"
  end: string;   // "HH:mm:ss"
};

type WeeklySchedule = {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
};

const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  monday: { enabled: true, start: "09:00:00", end: "17:00:00" },
  tuesday: { enabled: true, start: "09:00:00", end: "17:00:00" },
  wednesday: { enabled: true, start: "09:00:00", end: "17:00:00" },
  thursday: { enabled: true, start: "09:00:00", end: "17:00:00" },
  friday: { enabled: true, start: "09:00:00", end: "17:00:00" },
  saturday: { enabled: false, start: "09:00:00", end: "17:00:00" },
  sunday: { enabled: false, start: "09:00:00", end: "17:00:00" }
};

const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function parse24To12(time24: string) {
  const [hStr, mStr, sStr] = (time24 || "09:00:00").split(":");
  const h = parseInt(hStr || "0", 10);
  const ampm = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  const hour = String(h12).padStart(2, "0");
  const minute = (mStr || "00").padStart(2, "0");
  const second = (sStr || "00").padStart(2, "0");
  return { hour, minute, second, ampm };
}

function convert12To24(hour: string, minute: string, second: string, ampm: string) {
  let h = parseInt(hour || "12", 10);
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  const hStr = String(h).padStart(2, "0");
  const mStr = String(minute || "00").padStart(2, "0");
  const sStr = String(second || "00").padStart(2, "0");
  return `${hStr}:${mStr}:${sStr}`;
}

const hourOptions = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const TimePicker = ({
  value,
  onChange
}: {
  value: string;
  onChange: (newValue: string) => void;
}) => {
  const { hour, minute, ampm } = parse24To12(value);

  const handlePartChange = (part: "hour" | "minute" | "ampm", val: string) => {
    let newHour = hour;
    let newMinute = minute;
    let newAmpm = ampm;

    if (part === "hour") newHour = val;
    if (part === "minute") newMinute = val;
    if (part === "ampm") newAmpm = val;

    const updated = convert12To24(newHour, newMinute, "00", newAmpm);
    onChange(updated);
  };

  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      backgroundColor: "#ffffff",
      border: "1px solid #cbd5e1",
      borderRadius: "6px",
      padding: "4px 8px",
      gap: "2px"
    }}>
      <select
        value={hour}
        onChange={(e) => handlePartChange("hour", e.target.value)}
        style={{ border: "none", outline: "none", fontSize: "12px", background: "transparent", cursor: "pointer", paddingRight: "4px" }}
      >
        {hourOptions.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span style={{ fontSize: "11px", color: "#64748b" }}>:</span>
      <select
        value={minute}
        onChange={(e) => handlePartChange("minute", e.target.value)}
        style={{ border: "none", outline: "none", fontSize: "12px", background: "transparent", cursor: "pointer", paddingRight: "4px" }}
      >
        {minuteOptions.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      
      <div style={{ width: "1px", height: "14px", backgroundColor: "#e2e8f0", margin: "0 6px" }} />
      
      <select
        value={ampm}
        onChange={(e) => handlePartChange("ampm", e.target.value)}
        style={{ border: "none", outline: "none", fontSize: "12px", background: "transparent", cursor: "pointer", fontWeight: 600, color: "#0f172a" }}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
};

export default function ScreenDetailPage() {
  const params = useParams();
  const router = useRouter();
  const confirm = useConfirm();
  const deviceId = typeof params?.deviceId === "string" ? params.deviceId : "";

  // State Variables
  const [device, setDevice] = useState<Device | null>(null);
  const [existingGroups, setExistingGroups] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [commandsList, setCommandsList] = useState<CommandLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Tab control
  const [activeTab, setActiveTab] = useState<"device_info" | "settings">("device_info");
  
  // Note section
  const [note, setNote] = useState("");
  
  // Remote Command States
  const [activeCommand, setActiveCommand] = useState<CommandLog | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState<number>(50);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotCapturedAt, setScreenshotCapturedAt] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Settings Form State
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [orientation, setOrientation] = useState<number>(0);
  const [timezone, setTimezone] = useState("Europe/Istanbul");
  const [screenGroup, setScreenGroup] = useState("Ungrouped");
  const [customGroupInput, setCustomGroupInput] = useState("");
  const [operatingHours, setOperatingHours] = useState("Use Space's hours");
  const [scaleMode, setScaleMode] = useState("fit");
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  
  // Settings Notification/Toast State
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);
  const [tempSchedule, setTempSchedule] = useState<WeeklySchedule>(DEFAULT_WEEKLY_SCHEDULE);
  
  // Modal State for Set Content
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"playlists" | "media">("playlists");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [modalMessage, setModalMessage] = useState<string | null>(null);

  // Upload States in Modal
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  // Polling timers reference
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef<number>(0);
  const pollTargetRef = useRef<{ deviceId: string; commandId: string } | null>(null);
  const autoPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPreviewTimeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastAutoPreviewKeyRef = useRef<string | null>(null);
  const autoPreviewCommandsRef = useRef(new Map<string, string>());

  const scheduleAutomaticPreview = (mediaId: string | null | undefined, playbackStartedAt: string | null | undefined) => {
    if (!mediaId || !playbackStartedAt || document.visibilityState !== "visible") return;
    const previewKey = `${mediaId}|${playbackStartedAt}`;
    if (lastAutoPreviewKeyRef.current === previewKey) return;

    lastAutoPreviewKeyRef.current = previewKey;
    setScreenshotUrl(null);
    setScreenshotCapturedAt(null);
    setPreviewError(false);
    if (autoPreviewTimerRef.current) clearTimeout(autoPreviewTimerRef.current);

    // Let image, WebView and the first decoded video frame settle before capture.
    autoPreviewTimerRef.current = setTimeout(async () => {
      autoPreviewTimerRef.current = null;
      const commandId = createClientId();
      autoPreviewCommandsRef.current.set(commandId, previewKey);
      try {
        const response = await fetch("/api/commands/dispatch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            device_id: deviceId,
            command_id: commandId,
            command_type: "SCREENSHOT",
            payload: { reason: "playback_changed", media_id: mediaId },
            timeout_ms: 15000,
            max_attempts: 1
          })
        });
        if (!response.ok) {
          autoPreviewCommandsRef.current.delete(commandId);
          if (lastAutoPreviewKeyRef.current === previewKey) {
            lastAutoPreviewKeyRef.current = null;
            setPreviewError(true);
          }
        } else {
          const timeout = setTimeout(() => {
            if (autoPreviewCommandsRef.current.delete(commandId)) {
              if (lastAutoPreviewKeyRef.current === previewKey) {
                lastAutoPreviewKeyRef.current = null;
                setPreviewError(true);
              }
            }
            autoPreviewTimeoutsRef.current.delete(commandId);
          }, 25_000);
          autoPreviewTimeoutsRef.current.set(commandId, timeout);
        }
      } catch {
        autoPreviewCommandsRef.current.delete(commandId);
        if (lastAutoPreviewKeyRef.current === previewKey) {
          lastAutoPreviewKeyRef.current = null;
          setPreviewError(true);
        }
      }
    }, 2_000);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (autoPreviewTimerRef.current) clearTimeout(autoPreviewTimerRef.current);
      for (const timeout of autoPreviewTimeoutsRef.current.values()) clearTimeout(timeout);
      autoPreviewTimeoutsRef.current.clear();
    };
  }, []);

  // Fetch device details and associated info
  const loadData = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      // Fetch only the selected device; never download the complete fleet for a detail view.
      const deviceRes = await fetch(`/api/content/devices/${deviceId}`, { cache: "no-store" });
      if (deviceRes.status === 401 || deviceRes.status === 403) {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = `/login?redirect=/screens/${deviceId}`;
        return;
      }
      if (deviceRes.status === 404) {
        setError("Device not found.");
        return;
      }
      if (!deviceRes.ok) throw new Error("Failed to load device");
      const deviceData = (await deviceRes.json()) as { device?: Device };
      const foundDevice = deviceData.device;
      if (!foundDevice) throw new Error("Device response was incomplete");
      setDevice(foundDevice);
      const devicePreviewTime = foundDevice.preview_captured_at ? Date.parse(foundDevice.preview_captured_at) : Number.NaN;
      const devicePlaybackTime = foundDevice.playback_started_at ? Date.parse(foundDevice.playback_started_at) : Number.NaN;
      const hasFreshDevicePreview = Boolean(
        foundDevice.current_media_id &&
        foundDevice.preview_url &&
        Number.isFinite(devicePreviewTime) &&
        Number.isFinite(devicePlaybackTime) &&
        devicePreviewTime >= devicePlaybackTime
      );
      if (hasFreshDevicePreview) {
        setScreenshotUrl(foundDevice.preview_url ?? null);
        setScreenshotCapturedAt(foundDevice.preview_captured_at ?? null);
        setPreviewError(false);
        lastAutoPreviewKeyRef.current = `${foundDevice.current_media_id}|${foundDevice.playback_started_at}`;
      } else {
        setScreenshotUrl(null);
        setScreenshotCapturedAt(null);
      }
      if (foundDevice.status === "online" && !hasFreshDevicePreview) {
        scheduleAutomaticPreview(foundDevice.current_media_id, foundDevice.playback_started_at);
      }
      setOrientation(foundDevice.orientation ?? 0);
      
      // Seed settings inputs if initial load OR if they haven't been modified since last fetch
      const isInitial = !device;
      if (isInitial || editName === device?.name) {
        setEditName(foundDevice.name || "");
      }
      if (isInitial || editLocation === device?.location) {
        setEditLocation(foundDevice.location || "");
      }
      if (isInitial || timezone === device?.timezone) {
        setTimezone(foundDevice.timezone || "Europe/Istanbul");
      }
      if (isInitial || screenGroup === device?.screen_group) {
        setScreenGroup(foundDevice.screen_group || "Ungrouped");
      }
      if (isInitial || operatingHours === device?.operating_hours) {
        setOperatingHours(foundDevice.operating_hours || "Use Space's hours");
      }
      if (isInitial || scaleMode === device?.scale_mode) {
        setScaleMode(foundDevice.scale_mode || "fit");
      }
      if (isInitial || note === device?.notes) {
        setNote(foundDevice.notes || "");
      }

      if (showLoading) {
        const [groupsRes, playlistRes, mediaRes] = await Promise.all([
          fetch("/api/content/device-groups", { cache: "no-store" }),
          fetch("/api/content/playlists", { cache: "no-store" }),
          fetch("/api/content/media", { cache: "no-store" })
        ]);
        if (groupsRes.ok) {
          const groupData = (await groupsRes.json()) as { groups?: { name: string; count: number }[] };
          setExistingGroups(
            (groupData.groups ?? []).map((group) => group.name).filter((name) => name !== "Ungrouped")
          );
        }
        if (playlistRes.ok) {
          const playlistData = (await playlistRes.json()) as { playlists?: Playlist[] };
          setPlaylists(playlistData.playlists ?? []);
        }
        if (mediaRes.ok) {
          const mediaData = (await mediaRes.json()) as { media?: MediaItem[] };
          setMedia(mediaData.media ?? []);
        }
      }
      // 4. Fetch commands history list for this device
      const commandRes = await fetch(`/api/commands/status?device_id=${deviceId}`, { cache: "no-store" });
      if (commandRes.ok) {
        const cmdData = (await commandRes.json()) as { commands?: CommandLog[] };
        const fetchedCommands = cmdData.commands ?? [];
        setCommandsList(fetchedCommands);

        // Find last completed screenshot
        const screenshotCmd = fetchedCommands.find(
          (c) => c.command_type === "SCREENSHOT" && c.status === "completed" && c.screenshot_url
        );
        const screenshotTime = screenshotCmd?.completed_at ? Date.parse(screenshotCmd.completed_at) : Number.NaN;
        const playbackTime = foundDevice.playback_started_at ? Date.parse(foundDevice.playback_started_at) : Number.NaN;
        const belongsToCurrentPlayback = !Number.isFinite(playbackTime) ||
          (Number.isFinite(screenshotTime) && screenshotTime >= playbackTime);
        if (!hasFreshDevicePreview && foundDevice.current_media_id && screenshotCmd?.screenshot_url && belongsToCurrentPlayback) {
          setScreenshotUrl(screenshotCmd.screenshot_url);
          setScreenshotCapturedAt(screenshotCmd.completed_at ?? new Date().toISOString());
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred fetching screen details.");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const loadDataRef = useRef<typeof loadData>(loadData);
  loadDataRef.current = loadData;

  useFleetSocket({
    onDeviceStatus: (event) => {
      if (event.device_id !== deviceId) return;
      setNowMs(Date.now());
      setDevice((current) => current
        ? {
            ...current,
            status: event.status,
            last_seen_at: event.last_seen_at,
            ...(event.status === "online" ? { last_heartbeat_at: event.last_seen_at } : {}),
            ...(event.screen_on !== undefined ? { screen_on: event.screen_on } : {})
          }
        : current
      );
    },
    onCommandAck: (event) => {
      if (event.device_id !== deviceId) return;
      const status = commandAckStatus(event);
      const automaticPreviewKey = autoPreviewCommandsRef.current.get(event.command_id);
      const isAutomaticPreview = automaticPreviewKey !== undefined;
      setCommandsList((current) => current.map((command) =>
        command.command_id === event.command_id
          ? {
              ...command,
              status,
              ...(event.screenshot_url !== undefined ? { screenshot_url: event.screenshot_url } : {}),
              ...(event.error_message !== undefined ? { error_message: event.error_message } : {})
            }
          : command
      ));
      setActiveCommand((current) => current?.command_id === event.command_id
        ? {
            ...current,
            status,
            ...(event.screenshot_url !== undefined ? { screenshot_url: event.screenshot_url } : {}),
            ...(event.error_message !== undefined ? { error_message: event.error_message } : {})
          }
        : current
      );

      if (status === "completed" || status === "failed") {
        if (isAutomaticPreview) {
          autoPreviewCommandsRef.current.delete(event.command_id);
          const timeout = autoPreviewTimeoutsRef.current.get(event.command_id);
          if (timeout) clearTimeout(timeout);
          autoPreviewTimeoutsRef.current.delete(event.command_id);
          if (status === "failed") {
            if (lastAutoPreviewKeyRef.current === automaticPreviewKey) {
              lastAutoPreviewKeyRef.current = null;
              setPreviewError(true);
            }
          }
        }
        if (event.screenshot_url) {
          setScreenshotUrl(event.screenshot_url);
          setScreenshotCapturedAt(new Date().toISOString());
        }
        if (isAutomaticPreview) return;
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTargetRef.current = null;
        setIsPolling(false);
        showToast(
          status === "completed"
            ? "Command completed successfully."
            : `Command failed: ${event.error_message ?? "device error"}`,
          status === "completed" ? "success" : "error"
        );
        void loadDataRef.current(false);
      }
    },
    onPlaybackStatus: (event) => {
      if (event.device_id !== deviceId) return;
      setDevice((current) => current
        ? {
            ...current,
            current_media_id: event.media_id,
            playback_started_at: event.playback_started_at
          }
        : current
      );
      scheduleAutomaticPreview(event.media_id, event.playback_started_at);
    },
    onPreviewUpdated: (event) => {
      if (event.device_id !== deviceId) return;
      setScreenshotUrl(event.preview_url);
      setScreenshotCapturedAt(event.captured_at);
      setPreviewError(false);
    }
  });

  useEffect(() => {
    if (deviceId) {
      void loadData(true);
    }
  }, [deviceId]);

  // Live socket events handle immediate transitions. A low-frequency visible-tab
  // poll remains as recovery if a proxy temporarily blocks WebSockets.
  useEffect(() => {
    if (!deviceId) return;
    const interval = setInterval(() => {
      setNowMs(Date.now());
      if (document.visibilityState === "visible") void loadDataRef.current(false);
    }, 30_000);
    return () => clearInterval(interval);
  }, [deviceId]);


  // Determine currently playing playlist details
  const activePlaylist = useMemo(() => {
    if (!device?.current_playlist_id) return null;
    return playlists.find((p) => p.id === device.current_playlist_id) || null;
  }, [device, playlists]);

  const currentMediaItem = useMemo(() => {
    if (!activePlaylist?.items?.length) return null;
    if (!device?.current_media_id) return activePlaylist.items[0] ?? null;
    return activePlaylist.items.find((item) => item.media_id === device.current_media_id) ?? null;
  }, [activePlaylist, device?.current_media_id]);

  // Command status fetch
  const fetchSingleCommandStatus = async (targetDeviceId: string, commandId: string): Promise<CommandLog | null> => {
    try {
      const response = await fetch(`/api/commands/status?device_id=${targetDeviceId}&command_id=${commandId}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as { command?: CommandLog };
      if (response.ok && payload.command) return payload.command;
    } catch {
      // ignore network errors
    }
    return null;
  };

  // Poll for command status until finished or timeout
  const startCommandPolling = (targetDeviceId: string, commandId: string) => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollStartRef.current = Date.now();
    pollTargetRef.current = { deviceId: targetDeviceId, commandId };
    setIsPolling(true);

    const tick = async () => {
      const target = pollTargetRef.current;
      if (!target) return;

      const result = await fetchSingleCommandStatus(target.deviceId, target.commandId);
      if (result) {
        setActiveCommand(result);
        const isTerminal = TERMINAL_STATUSES.has(result.status);
        const elapsed = Date.now() - pollStartRef.current;

        if (isTerminal || elapsed >= POLL_MAX_MS) {
          setIsPolling(false);
          pollTargetRef.current = null;
          
          if (isTerminal) {
            if (result.status === "completed") {
              showToast(`Command ${result.command_type || ""} completed successfully.`, "success");
            } else {
              showToast(`Command failed: ${result.error_message || result.status}`, "error");
            }
          } else {
            showToast("Command response timed out.", "error");
          }
          
          // Refresh commands and screenshot
          void loadData(false);
          
          setTimeout(() => {
            setActiveCommand(null);
          }, 4000);
          return;
        }
      }

      pollTimerRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };

    pollTimerRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
  };

  // Dispatches a command to the device
  const handleDispatchCommand = async (commandType: string, customPayload: Record<string, unknown> = {}) => {
    if (isPolling) return;
    
    showToast(`Dispatching ${commandType}...`, "success");
    setActiveCommand(null);

    const commandId = createClientId();
    try {
      const response = await fetch("/api/commands/dispatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          device_id: deviceId,
          command_id: commandId,
          command_type: commandType,
          payload: customPayload,
          timeout_ms: 15000,
          max_attempts: 2
        })
      });
      const data = await response.json();
      if (response.ok) {
        if (data.command) {
          setActiveCommand(data.command);
        }
        showToast(`Command ${commandType} dispatched. Awaiting response...`, "success");
        // Start polling
        startCommandPolling(deviceId, commandId);
      } else {
        showToast(`Error: ${data.message || "Failed to execute command"}`, "error");
      }
    } catch {
      showToast("Failed to dispatch command. Backend unreachable.", "error");
    }
  };

  // Set screen rotation (orientation) and save to DB
  const handleSetOrientation = async (angle: number) => {
    setOrientation(angle);
    try {
      const response = await fetch(`/api/content/devices/${deviceId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orientation: angle
        })
      });
      if (response.ok) {
        showToast("Orientation updated successfully.", "success");
      } else {
        showToast("Failed to update orientation.", "error");
      }
    } catch {
      showToast("Network error saving orientation setting.", "error");
    }
  };

  // Saves General Name & Location details
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const response = await fetch(`/api/content/devices/${deviceId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editName,
          location: editLocation,
          timezone,
          screen_group: screenGroup === "__new__" ? (customGroupInput.trim() || "Ungrouped") : screenGroup,
          operating_hours: operatingHours,
          scale_mode: scaleMode
        })
      });
      if (response.ok) {
        showToast("Settings saved successfully.", "success");
        if (screenGroup === "__new__") {
          const resolvedGroup = customGroupInput.trim() || "Ungrouped";
          setScreenGroup(resolvedGroup);
          setCustomGroupInput("");
        }
        void loadData(false);
      } else {
        showToast("Failed to save settings.", "error");
      }
    } catch {
      showToast("Network error saving settings.", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveNote = async () => {
    if (note === device?.notes) return;
    setSavingNote(true);
    try {
      const response = await fetch(`/api/content/devices/${deviceId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notes: note
        })
      });
      if (response.ok) {
        showToast("Note saved successfully.", "success");
        void loadData(false);
      } else {
        showToast("Failed to save note.", "error");
      }
    } catch {
      showToast("Network error saving note.", "error");
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteScreen = async () => {
    const confirmed = await confirm({
      title: "Ekranı Sil",
      message: "Bu ekranı sistemden tamamen silmek istediğinize emin misiniz?",
      confirmText: "Ekranı Sil",
      cancelText: "Vazgeç",
      type: "danger"
    });
    if (!confirmed) {
      return;
    }
    
    try {
      const response = await fetch(`/api/content/devices/${deviceId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        showToast("Screen deleted successfully.", "success");
        router.push("/screens");
      } else {
        showToast("Failed to delete screen.", "error");
      }
    } catch {
      showToast("Network error deleting screen.", "error");
    }
  };

  const handleConfirmForceRefresh = async () => {
    const confirmed = await confirm({
      title: "Ekranı Yenile",
      message: "Bu ekranı yenilenmeye zorlamak istediğinize emin misiniz?",
      confirmText: "Yenile",
      cancelText: "Vazgeç",
      type: "default"
    });
    if (confirmed) {
      void handleDispatchCommand("FORCE_REFRESH");
    }
  };

  const handleConfirmClearCache = async () => {
    const confirmed = await confirm({
      title: "Önbelleği Temizle",
      message: "Bu TV'deki indirilmiş tüm video ve dosyaları silip sıfırdan indirmeye zorlamak istediğinize emin misiniz?",
      confirmText: "Temizle",
      cancelText: "Vazgeç",
      type: "warning"
    });
    if (confirmed) {
      void handleDispatchCommand("CLEAR_CACHE");
    }
  };

  const handleConfirmFactoryReset = async () => {
    const confirmed = await confirm({
      title: "Cihazı Sıfırla",
      message: "DİKKAT: Bu cihazın sunucu ile olan bağlantısını uzaktan koparacak ve TV ekranını ilk eşleştirme (Pairing) ekranına döndürecektir. Emin misiniz?",
      confirmText: "Cihazı Sıfırla",
      cancelText: "Vazgeç",
      type: "danger"
    });
    if (confirmed) {
      void handleDispatchCommand("FACTORY_RESET");
    }
  };

  // Handles Media File Upload inside publish modal
  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileToUpload = files[0];
    if (!fileToUpload) return;

    setUploadingFile(true);
    setUploadMessage("Uploading file to signage storage...");

    try {
      const formData = new FormData();
      formData.append("file", fileToUpload);

      const res = await fetch("/api/content/media/upload", {
        method: "POST",
        body: formData
      });
      
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Upload failed");
      }

      setUploadMessage("File uploaded successfully!");
      
      // Reload media list
      const mediaRes = await fetch("/api/content/media", { cache: "no-store" });
      if (mediaRes.ok) {
        const mediaData = (await mediaRes.json()) as { media?: MediaItem[] };
        const updatedMedia = mediaData.media ?? [];
        setMedia(updatedMedia);
        
        // Find uploaded item and select it
        const uploadedItem = updatedMedia.find((m) => m.filename === fileToUpload.name);
        if (uploadedItem) {
          setSelectedMediaId(uploadedItem.id);
        }
      }

      setTimeout(() => setUploadMessage(null), 3000);
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : "Failed to upload file.");
    } finally {
      setUploadingFile(false);
    }
  };

  // Open the "Set Content" modal
  const openSetContentModal = () => {
    setSelectedPlaylistId(null);
    setSelectedMediaId(null);
    setSearchQuery("");
    setModalMessage(null);
    setUploadMessage(null);
    setIsModalOpen(true);
  };

  // Filtered lists inside the modal
  const filteredPlaylists = useMemo(() => {
    return playlists.filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) &&
      !p.name.toLowerCase().startsWith("single media:")
    );
  }, [playlists, searchQuery]);

  const filteredMedia = useMemo(() => {
    return media.filter((m) =>
      m.filename.toLowerCase().includes(searchQuery.toLowerCase().trim())
    );
  }, [media, searchQuery]);

  // Modal Submit (Publish playlist or media to device)
  const handlePublishContent = async () => {
    setPublishing(true);
    setModalMessage(null);

    try {
      let playlistIdToPublish = selectedPlaylistId;

      // Single Media selected
      if (modalTab === "media" && selectedMediaId) {
        const selectedItem = media.find((m) => m.id === selectedMediaId);
        if (!selectedItem) throw new Error("Selected media not found");

        const targetPlaylistName = `Single Media: ${selectedItem.filename}`;
        
        // Lookup if single media playlist already exists to avoid database pollution
        const existingPlaylist = playlists.find((p) => p.name === targetPlaylistName);
        if (existingPlaylist) {
          playlistIdToPublish = existingPlaylist.id;
        } else {
          // Create wrapper playlist
          const createPlaylistRes = await fetch("/api/content/playlists", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: targetPlaylistName,
              items: [
                {
                  media_id: selectedItem.id,
                  duration_ms: 10000,
                  position: 0
                }
              ]
            })
          });

          const createdPayload = await createPlaylistRes.json();
          if (!createPlaylistRes.ok) {
            throw new Error(createdPayload.message || "Failed to create wrapper playlist for media");
          }
          playlistIdToPublish = createdPayload.playlist?.id;
        }
      }

      if (!playlistIdToPublish) {
        throw new Error("No content selected");
      }

      // Publish the playlist to this device
      const publishRes = await fetch(`/api/content/playlists/${playlistIdToPublish}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          device_ids: [deviceId]
        })
      });

      const publishData = await publishRes.json();
      if (!publishRes.ok) {
        throw new Error(publishData.message || "Failed to publish content to device");
      }

      setModalMessage("Content successfully published to screen!");
      void loadData(false);
      setTimeout(() => {
        setIsModalOpen(false);
        setModalMessage(null);
      }, 1500);

    } catch (err) {
      setModalMessage(err instanceof Error ? err.message : "Failed to publish content.");
    } finally {
      setPublishing(false);
    }
  };

  const presence = getDevicePresence({
    status: device?.status,
    lastHeartbeatAt: device?.last_heartbeat_at
  }, nowMs);
  const presenceStyle = PRESENCE_STYLE[presence];
  const screenPower = getScreenPowerState(presence, device?.screen_on);

  // Dynamic metrics details based on device telemetry
  const deviceDetails = useMemo(() => {
    if (!device) return null;
    
    const ipAddress = device.ip_address || "N/A";
    const playerVersion = device.player_version || "N/A";
    const osVer = device.os_version || "N/A";
    const resolution = device.resolution || "N/A";
    const memory = device.memory_total || "N/A";
    const memoryUsed = device.memory_used || "N/A";

    let aspect = "N/A";
    if (device.resolution) {
      const parts = device.resolution.toLowerCase().split(/[×x]/);
      if (parts.length === 2) {
        const w = parseInt(parts[0] || "", 10);
        const h = parseInt(parts[1] || "", 10);
        if (w > 0 && h > 0) {
          const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
          const divisor = gcd(w, h);
          aspect = `${w / divisor}:${h / divisor}`;
        }
      }
    }

    let memoryPercent = 0;
    if (device.memory_total && device.memory_used) {
      const totalNum = parseFloat(device.memory_total);
      const usedNum = parseFloat(device.memory_used);
      if (totalNum > 0 && usedNum >= 0) {
        memoryPercent = Math.min(100, Math.round((usedNum / totalNum) * 100));
      }
    }
    
    const lastContactAt = device.last_heartbeat_at ?? device.last_seen_at;
    const lastContactMs = lastContactAt ? Date.parse(lastContactAt) : Number.NaN;
    const lastContactStr = Number.isFinite(lastContactMs)
      ? new Date(lastContactMs).toLocaleString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      : "Never";

    return {
      ipAddress,
      playerVersion,
      osVer,
      resolution,
      aspect,
      memory,
      memoryUsed,
      memoryPercent,
      lastContactStr
    };
  }, [device]);

  // Dynamic phone/screen mockup sizing based on aspect ratio
  const mockupDimensions = useMemo(() => {
    // Default aspect ratio 9:16 (portrait phone)
    let aspectWidth = 9;
    let aspectHeight = 16;
    if (device?.resolution) {
      const parts = device.resolution.toLowerCase().split(/[×x]/);
      if (parts.length === 2) {
        const w = parseInt(parts[0] || "", 10);
        const h = parseInt(parts[1] || "", 10);
        if (w > 0 && h > 0) {
          aspectWidth = w;
          aspectHeight = h;
        }
      }
    }

    const maxBoundingSize = 516; // Maximum dimension of the inner screen preview
    let innerWidth = 0;
    let innerHeight = 0;

    if (aspectWidth <= aspectHeight) {
      // Portrait or square: fix inner height to maxBoundingSize
      innerHeight = maxBoundingSize;
      innerWidth = Math.round(maxBoundingSize * (aspectWidth / aspectHeight));
    } else {
      // Landscape: fix inner width to maxBoundingSize
      innerWidth = maxBoundingSize;
      innerHeight = Math.round(maxBoundingSize * (aspectHeight / aspectWidth));
    }

    const totalWidth = innerWidth + 24; // 12px border on each side
    const totalHeight = innerHeight + 24; // 12px border on each side

    return {
      width: `${totalWidth}px`,
      height: `${totalHeight}px`,
      innerWidth: `${innerWidth}px`,
      innerHeight: `${innerHeight}px`,
      isLandscape: aspectWidth > aspectHeight
    };
  }, [device]);

  if (loading && !device) {
    return (
      <div style={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "center", minHeight: "80vh", backgroundColor: "#f4f5f7" }}>
        <p style={{ fontSize: "16px", color: "#64748b" }}>Loading screen details...</p>
      </div>
    );
  }

  if (error || !device) {
    return (
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, alignItems: "center", justifyContent: "center", gap: "16px", minHeight: "80vh", backgroundColor: "#f4f5f7" }}>
        <h4 style={{ fontSize: "18px", color: "#ef4444", margin: 0 }}>Error</h4>
        <p style={{ color: "#64748b", margin: 0 }}>{error || "Screen not found."}</p>
        <Link href="/screens" style={{ padding: "10px 20px", backgroundColor: "#10b981", color: "#ffffff", borderRadius: "6px", textDecoration: "none", fontWeight: 700 }}>
          Back to Screens List
        </Link>
      </div>
    );
  }

  const isOnline = presence === "online";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#f4f5f7", boxSizing: "border-box" }}>
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      {toast && (
        <div style={{
          position: "fixed",
          top: "24px",
          right: "24px",
          backgroundColor: toast.type === "success" ? "#10b981" : "#ef4444",
          color: "#ffffff",
          padding: "12px 20px",
          borderRadius: "8px",
          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          zIndex: 9999,
          fontWeight: 600,
          fontSize: "13px",
          animation: "slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
        }}>
          {toast.type === "success" ? (
            <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
          {toast.message}
        </div>
      )}
      {/* Dynamic Header */}
      <header style={{
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        padding: "16px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "24px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* Back button */}
          <Link href="/screens" style={{
            color: "#64748b",
            fontSize: "20px",
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            padding: "4px"
          }}>
            <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>
                {device.name || "Unnamed Screen"}
              </h1>
              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, backgroundColor: "#f1f5f9", padding: "2px 8px", borderRadius: "4px" }}>
                {device.hardware_id}
              </span>
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#64748b" }}>
              Last device contact: {deviceDetails?.lastContactStr}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Refresh Button */}
          <button
            onClick={handleConfirmForceRefresh}
            disabled={isPolling}
            title="Refresh Screen"
            type="button"
            style={{
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#334155",
              cursor: isPolling ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
            }}
            onMouseOver={(e) => {
              if (!isPolling) {
                e.currentTarget.style.backgroundColor = "#f8fafc";
                e.currentTarget.style.borderColor = "#94a3b8";
              }
            }}
            onMouseOut={(e) => {
              if (!isPolling) {
                e.currentTarget.style.backgroundColor = "#ffffff";
                e.currentTarget.style.borderColor = "#cbd5e1";
              }
            }}
          >
            <svg
              style={{ width: 16, height: 16, animation: isPolling ? "spin 1s linear infinite" : "none" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89" />
            </svg>
            <span>Refresh</span>
          </button>

          {/* Delete Button */}
          <button
            onClick={handleDeleteScreen}
            title="Delete Screen Completely"
            type="button"
            style={{
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "#fef2f2",
              border: "1px solid #fee2e2",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#ef4444",
              cursor: "pointer",
              transition: "all 0.15s ease",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#fee2e2";
              e.currentTarget.style.borderColor = "#fca5a5";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "#fef2f2";
              e.currentTarget.style.borderColor = "#fee2e2";
            }}
          >
            <svg
              style={{ width: 16, height: 16 }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Delete</span>
          </button>
        </div>
      </header>

      {/* Main Split Layout */}
      <div style={{ display: "flex", flexGrow: 1, minHeight: "0", position: "relative" }}>
        
        {/* Left/Center Area (Device Preview + Now Playing) */}
        <div style={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          minHeight: "0",
          overflowY: "auto"
        }}>
          
          {/* NOW PLAYING Selector Box */}
          <div style={{
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "24px"
          }}>
            <div>
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>ASSIGNED CONTENT</span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <svg style={{ width: 16, height: 16, color: "#64748b" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span style={{ fontSize: "15px", fontWeight: 600, color: "#0f172a" }}>
                  {currentMediaItem?.filename ?? activePlaylist?.name ?? "No content assigned to this screen"}
                </span>
              </div>
            </div>

            {/* Set Content publish button */}
            <button
              onClick={openSetContentModal}
              title="Set Content"
              style={{
                backgroundColor: "#10b981",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "background-color 0.15s ease"
              }}
            >
              <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </button>
          </div>

          {/* Device Screen Preview Container */}
          <div style={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px 0"
          }}>
            {/* Phone outline mockup container without device rotation */}
            <div style={{
              width: mockupDimensions.width,
              height: mockupDimensions.height,
              backgroundColor: "#000000",
              borderRadius: "32px",
              border: "12px solid #1e293b",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              position: "relative",
              alignItems: "center",
              justifyContent: "center",
              transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
            }}>
              {/* Speaker & camera dots at top */}
              {!mockupDimensions.isLandscape && (
                <div style={{
                  position: "absolute",
                  top: "10px",
                  width: "48px",
                  height: "4px",
                  backgroundColor: "#334155",
                  borderRadius: "2px",
                  zIndex: 2
                }} />
              )}

              {/* Display contents */}
              <div style={{
                width: "100%",
                height: "100%",
                boxSizing: "border-box",
                backgroundColor: "#0d0e12",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "0px",
                textAlign: "center",
                position: "relative"
              }}>
                {screenshotUrl ? (
                  <img
                    src={`/api/content/devices/${encodeURIComponent(deviceId)}/preview?v=${encodeURIComponent(screenshotCapturedAt ?? "latest")}`}
                    alt="Latest device screenshot preview"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      position: "absolute",
                      top: 0,
                      left: 0,
                      transform: `rotate(${orientation}deg)`,
                      transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
                    }}
                  />
                ) : currentMediaItem ? (
                  (() => {
                    const firstItem = currentMediaItem;
                    const isImg = firstItem ? firstItem.mime_type.startsWith("image/") : false;
                    const mediaSrc = firstItem ? firstItem.media_url : "";
                    
                    if (isImg) {
                      return (
                        <img
                          src={mediaSrc}
                          alt="Currently playing image"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            position: "absolute",
                            top: 0,
                            left: 0,
                            transform: `rotate(${orientation}deg)`,
                            transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
                          }}
                        />
                      );
                    } else {
                      return (
                        <video
                          src={mediaSrc}
                          autoPlay
                          loop
                          muted
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            position: "absolute",
                            top: 0,
                            left: 0,
                            transform: `rotate(${orientation}deg)`,
                            transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
                          }}
                        />
                      );
                    }
                  })()
                ) : activePlaylist ? (
                  <div style={{ color: "#ffffff", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "16px", transform: `rotate(${orientation}deg)`, transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)" }}>
                    <svg style={{ width: 48, height: 48, color: "#10b981" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 700 }}>Assigned Playlist</h4>
                      <p style={{ margin: 0, fontSize: "12px", color: "#9ca3af" }}>{activePlaylist.name}</p>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: "#475569", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                    <svg style={{ width: 44, height: 44, color: "#475569" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <h4 style={{ margin: "0 0 4px 0", fontSize: "13px", fontWeight: 600, color: "#94a3b8" }}>No Content</h4>
                      <p style={{ margin: 0, fontSize: "11px", color: "#64748b" }}>Screen ready for playback assignments</p>
                    </div>
                  </div>
                )}
              </div>

              <div style={{
                position: "absolute",
                top: "16px",
                left: "16px",
                zIndex: 3,
                backgroundColor: screenshotUrl ? "rgba(5, 150, 105, 0.9)" : "rgba(15, 23, 42, 0.82)",
                color: "#ffffff",
                padding: "5px 9px",
                borderRadius: "999px",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.3px"
              }}>
                {screenshotCapturedAt
                  ? `VERIFIED ${new Date(screenshotCapturedAt).toLocaleTimeString()}`
                  : previewError
                    ? "PREVIEW UNAVAILABLE"
                  : device.current_media_id
                    ? "UPDATING PREVIEW"
                    : "AWAITING PLAYBACK"}
              </div>

              {/* Live connection and screen power indicators */}
              <div style={{
                position: "absolute",
                bottom: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                flexWrap: "wrap"
              }}>
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  padding: "4px 10px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  color: presenceStyle.color,
                  fontWeight: 700
                }}>
                  <span
                    className={`pulse-dot ${isOnline ? "online" : "offline"}`}
                    style={{ width: 6, height: 6, display: "inline-block", backgroundColor: presenceStyle.dot, borderRadius: "50%" }}
                  />
                  <span>{presenceStyle.label}</span>
                </div>
                <ScreenPowerBadge state={screenPower} compact dark />
              </div>
            </div>
            

          </div>
        </div>

        {/* Right Sidebar Area (Independent Scroll Container) */}
        <aside style={{
          width: "380px",
          backgroundColor: "#ffffff",
          borderLeft: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          maxHeight: "calc(100vh - 80px)", // Locks height inside viewport
          overflowY: "auto" // Enables independent scrolling
        }}>
          {/* Tabs bar */}
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0" }}>
            <button
              onClick={() => setActiveTab("device_info")}
              type="button"
              style={{
                flexGrow: 1,
                border: "none",
                borderRadius: 0,
                borderBottom: activeTab === "device_info" ? "3px solid #10b981" : "none",
                backgroundColor: "transparent",
                color: activeTab === "device_info" ? "#0f172a" : "#64748b",
                fontWeight: 700,
                padding: "16px",
                fontSize: "13px",
                cursor: "pointer"
              }}
            >
              DEVICE INFO
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              type="button"
              style={{
                flexGrow: 1,
                border: "none",
                borderRadius: 0,
                borderBottom: activeTab === "settings" ? "3px solid #10b981" : "none",
                backgroundColor: "transparent",
                color: activeTab === "settings" ? "#0f172a" : "#64748b",
                fontWeight: 700,
                padding: "16px",
                fontSize: "13px",
                cursor: "pointer"
              }}
            >
              SETTINGS
            </button>
          </div>

          {/* Active Tab Panel */}
          <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
            {activeTab === "device_info" ? (
              <>
                {/* Add Note Section */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <textarea
                    placeholder="Add note..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onBlur={handleSaveNote}
                    style={{
                      width: "100%",
                      height: "80px",
                      fontSize: "13px",
                      padding: "8px 12px",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      resize: "none"
                    }}
                  />
                  {note !== (device?.notes || "") && (
                    <button
                      type="button"
                      onClick={handleSaveNote}
                      disabled={savingNote}
                      style={{
                        alignSelf: "flex-end",
                        backgroundColor: "#10b981",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "4px",
                        padding: "6px 16px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        opacity: savingNote ? 0.7 : 1,
                        transition: "background-color 0.15s ease"
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#059669")}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#10b981")}
                    >
                      {savingNote ? "Saving..." : "Save Note"}
                    </button>
                  )}
                </div>

                {/* Connection and physical screen state */}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "8px" }}>
                  <div style={{
                    backgroundColor: presenceStyle.background,
                    border: presenceStyle.border,
                    borderRadius: "8px",
                    padding: "12px",
                    textAlign: "center",
                    fontSize: "15px",
                    fontWeight: 700,
                    color: presenceStyle.color,
                    textTransform: "uppercase"
                  }}>
                    {presenceStyle.label}
                  </div>
                  <ScreenPowerBadge state={screenPower} wide />
                </div>

                {/* Brand / Model Info block */}
                <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                  <div style={{
                    width: "44px",
                    height: "44px",
                    backgroundColor: "#f8fafc",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    <svg style={{ width: 28, height: 28, color: "#64748b" }} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 2H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H5V4h14v10zm-7 4l-2 3h6l-2-3z" />
                    </svg>
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>Android Device</h4>
                    <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "#64748b" }}>
                      Android • {deviceDetails?.resolution}, {deviceDetails?.aspect}
                    </p>
                    <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "#94a3b8" }}>
                      OS Version: {deviceDetails?.osVer}
                    </p>
                  </div>
                </div>



                {/* Diagnostics Section (Task 3) */}
                <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px", backgroundColor: "#ffffff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>Diagnostics & Health</h3>
                    <button
                      onClick={() => handleDispatchCommand("GET_DIAGNOSTICS")}
                      disabled={isPolling || !isOnline}
                      title={isOnline ? "Fetch current diagnostics" : "Device must be online to fetch diagnostics"}
                      type="button"
                      style={{
                        padding: "6px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        backgroundColor: "#10b981",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "4px",
                        cursor: isPolling || !isOnline ? "not-allowed" : "pointer",
                        opacity: isPolling || !isOnline ? 0.6 : 1
                      }}
                    >
                      {isPolling && activeCommand?.command_type === "GET_DIAGNOSTICS" ? "Fetching..." : "Fetch Diagnostics"}
                    </button>
                  </div>

                  {device.diagnostics ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {/* Storage Progress */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
                          <span>DISK STORAGE ({device.diagnostics.storage_free_mb} MB Free)</span>
                          <span>{device.diagnostics.storage_usage_percent}% Used</span>
                        </div>
                        <div style={{ width: "100%", height: "8px", backgroundColor: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                          <div style={{
                            width: `${device.diagnostics.storage_usage_percent ?? 0}%`,
                            height: "100%",
                            backgroundColor: (device.diagnostics.storage_usage_percent ?? 0) > 90 ? "#ef4444" : "#10b981"
                          }} />
                        </div>
                      </div>

                      {/* Memory Usage */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
                          <span>RAM MEMORY ({device.diagnostics.memory_used_gb} GB / {device.diagnostics.memory_total_gb} GB)</span>
                          <span>{device.diagnostics.memory_usage_percent}% Used</span>
                        </div>
                        <div style={{ width: "100%", height: "8px", backgroundColor: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                          <div style={{
                            width: `${device.diagnostics.memory_usage_percent ?? 0}%`,
                            height: "100%",
                            backgroundColor: (device.diagnostics.memory_usage_percent ?? 0) > 85 ? "#f59e0b" : "#3b82f6"
                          }} />
                        </div>
                      </div>

                      {/* Network & Wi-Fi Details */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px", backgroundColor: "#f8fafc", padding: "10px", borderRadius: "6px", fontSize: "12px" }}>
                        <div>
                          <span style={{ color: "#94a3b8", display: "block", fontSize: "10px", fontWeight: 700 }}>CONNECTION TYPE</span>
                          <span style={{ fontWeight: 600, color: "#334155" }}>{device.diagnostics.network_type}</span>
                        </div>
                        {device.diagnostics.network_type === "WIFI" && (
                          <div>
                            <span style={{ color: "#94a3b8", display: "block", fontSize: "10px", fontWeight: 700 }}>WIFI SIGNAL</span>
                            <span style={{ fontWeight: 600, color: (device.diagnostics.wifi_signal_level ?? 0) < 40 ? "#ef4444" : "#10b981" }}>
                              {device.diagnostics.wifi_signal_level}% ({device.diagnostics.wifi_rssi} dBm)
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Log Console View */}
                      {device.diagnostics.logs && (
                        <div style={{ marginTop: "12px" }}>
                          <span style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "6px" }}>RECENT SYSTEM LOGS (LOGCAT)</span>
                          <pre style={{
                            margin: 0,
                            padding: "10px",
                            backgroundColor: "#0f172a",
                            color: "#38bdf8",
                            fontFamily: "monospace",
                            fontSize: "11px",
                            borderRadius: "6px",
                            maxHeight: "150px",
                            overflowY: "auto",
                            whiteSpace: "pre-wrap"
                          }}>
                            {device.diagnostics.logs}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "#94a3b8", fontSize: "13px" }}>
                      {isOnline
                        ? "No diagnostic data available. Fetch diagnostics to retrieve current health stats."
                        : "No diagnostic data available. The device must reconnect before current health stats can be fetched."}
                    </div>
                  )}
                </div>

                {/* Core properties list */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>IP Address</span>
                    <span style={{ fontWeight: 600 }}>{deviceDetails?.ipAddress}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#64748b" }}>Screen ID</span>
                    <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                      {device.id.substring(0, 16)}...
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(device.id);
                          alert("Screen ID copied to clipboard.");
                        }}
                        type="button"
                        style={{ background: "none", border: "none", padding: "2px", cursor: "pointer", color: "#64748b" }}
                      >
                        <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                      </button>
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Player Version</span>
                    <span style={{ fontWeight: 600 }}>{deviceDetails?.playerVersion}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Operating System</span>
                    <span style={{ fontWeight: 600 }}>Android</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>OS Time zone</span>
                    <span style={{ fontWeight: 600 }}>{device.timezone || "N/A"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Last heartbeat</span>
                    <span style={{ fontWeight: 600 }}>{deviceDetails?.lastContactStr}</span>
                  </div>
                </div>


              </>
            ) : (
              // SETTINGS TAB PANEL
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {/* Remote Control Button Grid */}
                <div>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "12px", fontWeight: 700, color: "#64748b" }}>REMOTE CONTROL</h4>
                  
                  {/* Grid 1: Basic command buttons */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                    <button
                      onClick={handleConfirmForceRefresh}
                      disabled={isPolling}
                      title="Force Refresh Screen"
                      type="button"
                      className="secondary"
                      style={{
                        padding: "10px",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        backgroundColor: "#ffffff",
                        border: "1px solid #cbd5e1"
                      }}
                    >
                      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDispatchCommand("SCREENSHOT")}
                      disabled={isPolling}
                      title="Capture Screen Screenshot"
                      type="button"
                      className="secondary"
                      style={{
                        padding: "10px",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        backgroundColor: "#ffffff",
                        border: "1px solid #cbd5e1"
                      }}
                    >
                      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDispatchCommand("REBOOT_APP")}
                      disabled={isPolling}
                      title="Reboot Client Signage Application"
                      type="button"
                      className="secondary"
                      style={{
                        padding: "10px",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        backgroundColor: "#ffffff",
                        border: "1px solid #cbd5e1"
                      }}
                    >
                      <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                      </svg>
                    </button>
                  </div>

                  {/* Remote Maintenance Buttons (Clear Cache & Factory Reset) */}
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    <button
                      onClick={handleConfirmClearCache}
                      disabled={isPolling}
                      title="Clear TV Local Media Cache"
                      type="button"
                      style={{
                        flexGrow: 1,
                        padding: "8px",
                        fontSize: "12px",
                        fontWeight: 600,
                        backgroundColor: "#f59e0b",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer"
                      }}
                    >
                      Clear Cache
                    </button>
                    <button
                      onClick={handleConfirmFactoryReset}
                      disabled={isPolling}
                      title="Remote Factory Reset & Unpair"
                      type="button"
                      style={{
                        flexGrow: 1,
                        padding: "8px",
                        fontSize: "12px",
                        fontWeight: 600,
                        backgroundColor: "#ef4444",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer"
                      }}
                    >
                      Factory Reset
                    </button>
                  </div>

                  {/* Power control switches */}
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    <button
                      type="button"
                      onClick={() => handleDispatchCommand("SCREEN_ON")}
                      disabled={isPolling}
                      style={{
                        flexGrow: 1,
                        padding: "8px",
                        fontSize: "12px",
                        fontWeight: 600,
                        backgroundColor: "#10b981",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer"
                      }}
                    >
                      Turn Screen On
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDispatchCommand("SCREEN_OFF")}
                      disabled={isPolling}
                      style={{
                        flexGrow: 1,
                        padding: "8px",
                        fontSize: "12px",
                        fontWeight: 600,
                        backgroundColor: "#64748b",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer"
                      }}
                    >
                      Turn Screen Off
                    </button>
                  </div>

                  {/* Volume Control Slider */}
                  <div style={{ marginTop: "16px", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", backgroundColor: "#f8fafc" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>SET VOLUME</span>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#10b981" }}>{volumeLevel}%</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={volumeLevel}
                        onChange={(e) => setVolumeLevel(Number(e.target.value))}
                        style={{ flexGrow: 1, accentColor: "#10b981", cursor: "pointer" }}
                      />
                      <button
                        type="button"
                        onClick={() => handleDispatchCommand("SET_VOLUME", { volume: volumeLevel })}
                        disabled={isPolling}
                        style={{
                          padding: "6px 12px",
                          fontSize: "11px",
                          fontWeight: 700,
                          backgroundColor: "#10b981",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer"
                        }}
                      >
                        Set
                      </button>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>General</h3>
                  
                  {/* Screen Name */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Screen Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Screen Name"
                      style={{ fontSize: "13px", padding: "8px 12px", border: "1px solid #cbd5e1" }}
                    />
                  </div>

                  {/* Orientation Selection (Connected to DB & preview rotation) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Orientation</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
                      {[0, 90, 180, 270].map((angle) => (
                        <button
                          key={angle}
                          type="button"
                          onClick={() => handleSetOrientation(angle)}
                          style={{
                            padding: "8px 0",
                            fontSize: "12px",
                            fontWeight: 600,
                            borderRadius: "4px",
                            border: "1px solid #cbd5e1",
                            backgroundColor: orientation === angle ? "#10b981" : "#ffffff",
                            color: orientation === angle ? "#ffffff" : "#334155",
                            cursor: "pointer"
                          }}
                        >
                          {angle}°
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Zone Selection */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Time Zone</label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      style={{ fontSize: "13px", padding: "8px 12px", border: "1px solid #cbd5e1" }}
                    >
                      <option value="Europe/Istanbul">Turkey Time (Europe/Istanbul)</option>
                      <option value="UTC">Coordinated Universal Time (UTC)</option>
                      <option value="America/New_York">Eastern Time (New York)</option>
                    </select>
                  </div>

                  {/* Screen Group Selection — dynamic from existing groups */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Screen Group</label>
                      {screenGroup && screenGroup !== "Ungrouped" && (
                        <span style={{
                          fontSize: "11px", fontWeight: 700,
                          backgroundColor: "rgba(99,102,241,0.1)",
                          color: "#6366f1",
                          padding: "2px 8px",
                          borderRadius: "999px"
                        }}>
                          📁 {screenGroup}
                        </span>
                      )}
                    </div>
                    <select
                      value={screenGroup === "__new__" ? "__new__" : (existingGroups.includes(screenGroup) || screenGroup === "Ungrouped" ? screenGroup : (screenGroup ? "__new__" : "Ungrouped"))}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "__new__") {
                          setScreenGroup("__new__");
                          setCustomGroupInput("");
                        } else {
                          setScreenGroup(val);
                          setCustomGroupInput("");
                        }
                      }}
                      style={{ fontSize: "13px", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                    >
                      <option value="Ungrouped">— Ungrouped —</option>
                      {existingGroups.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                      <option value="__new__">✎ Enter new group name...</option>
                    </select>
                    {/* Custom group name input */}
                    {(screenGroup === "__new__" || (screenGroup !== "Ungrouped" && !existingGroups.includes(screenGroup) && screenGroup !== "")) && (
                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          type="text"
                          placeholder="New group name (e.g. Lobby, Floor 2)"
                          value={customGroupInput || (screenGroup !== "__new__" ? screenGroup : "")}
                          onChange={(e) => {
                            setCustomGroupInput(e.target.value);
                            setScreenGroup(e.target.value || "__new__");
                          }}
                          autoFocus
                          style={{
                            flex: 1,
                            fontSize: "13px",
                            padding: "8px 12px",
                            border: "1px solid #6366f1",
                            borderRadius: "6px",
                            outline: "none"
                          }}
                        />
                      </div>
                    )}
                    <p style={{ margin: 0, fontSize: "11px", color: "#94a3b8" }}>
                      Select an existing group or type a new group name. Saved when you click "Save Settings".
                    </p>
                  </div>

                  {/* Operating Hours */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Operating Hours</label>
                    {(() => {
                      const isCustomHours = typeof operatingHours === "string" && (operatingHours.trim().startsWith("{") || operatingHours.includes("schedule"));
                      return (
                        <>
                          <select
                            value={isCustomHours ? "custom" : operatingHours}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "custom") {
                                let currentSchedule = DEFAULT_WEEKLY_SCHEDULE;
                                if (isCustomHours) {
                                  try {
                                    const parsed = JSON.parse(operatingHours);
                                    if (parsed.schedule) {
                                      currentSchedule = parsed.schedule;
                                    }
                                  } catch (err) {
                                    console.error("Failed to parse custom operating hours", err);
                                  }
                                }
                                setTempSchedule(currentSchedule);
                                setIsHoursModalOpen(true);
                              } else {
                                setOperatingHours(val);
                              }
                            }}
                            style={{ fontSize: "13px", padding: "8px 12px", border: "1px solid #cbd5e1" }}
                          >
                            <option value="Use Space's hours">Use Space's hours</option>
                            <option value="Always On">Always On</option>
                            <option value="custom">Custom Operating Hours</option>
                          </select>
                          {isCustomHours && (
                            <button
                              type="button"
                              onClick={() => {
                                let currentSchedule = DEFAULT_WEEKLY_SCHEDULE;
                                try {
                                  const parsed = JSON.parse(operatingHours);
                                  if (parsed.schedule) {
                                    currentSchedule = parsed.schedule;
                                  }
                                } catch (err) {
                                  console.error("Failed to parse custom operating hours", err);
                                }
                                setTempSchedule(currentSchedule);
                                setIsHoursModalOpen(true);
                              }}
                        style={{
                          alignSelf: "flex-start",
                          marginTop: "6px",
                          fontSize: "12px",
                          color: "#10b981",
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          fontWeight: 700,
                          textDecoration: "underline"
                        }}
                      >
                        Edit Schedule
                      </button>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Scale/Fit Mode */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Scale Mode</label>
                    <select
                      value={scaleMode}
                      onChange={(e) => setScaleMode(e.target.value)}
                      style={{ fontSize: "13px", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "6px" }}
                    >
                      <option value="fit">Fit to Screen (Aspect Ratio preserved)</option>
                      <option value="fill">Fill Screen (Cropped to fit)</option>
                      <option value="stretch">Stretch to Fill (Distorted)</option>
                    </select>
                    <p style={{ margin: 0, fontSize: "11px", color: "#94a3b8" }}>
                      Controls how images/videos scale to fit this screen. Saved when you click "Save Settings".
                    </p>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
                  <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>Advanced Settings</h3>
                  
                  {/* Location field */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Location</label>
                    <input
                      type="text"
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      placeholder="e.g. 2nd Floor Office"
                      style={{ fontSize: "13px", padding: "8px 12px", border: "1px solid #cbd5e1" }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingSettings}
                  style={{
                    backgroundColor: "#10b981",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 700,
                    fontSize: "14px",
                    padding: "10px",
                    width: "100%",
                    borderRadius: "6px",
                    cursor: "pointer",
                    marginTop: "12px"
                  }}
                >
                  {savingSettings ? "Saving Settings..." : "Save Settings"}
                </button>
              </form>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Set Content Modal Overlay */}
      {isModalOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(15, 23, 42, 0.45)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          {/* Modal Panel */}
          <div style={{
            width: "820px",
            height: "560px",
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "16px 24px",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                Set content to {device.name || "Unnamed Screen"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  padding: "4px",
                  cursor: "pointer",
                  color: "#94a3b8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal search header bar */}
            <div style={{
              padding: "12px 24px",
              backgroundColor: "#f8fafc",
              borderBottom: "1px solid #e2e8f0"
            }}>
              <div style={{ position: "relative", width: "100%" }}>
                <svg style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "16px",
                  height: "16px",
                  color: "#94a3b8",
                  pointerEvents: "none"
                }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder={modalTab === "playlists" ? "Search Playlists" : "Search Media Items"}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 36px",
                    fontSize: "14px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px"
                  }}
                />
              </div>
            </div>

            {/* Modal Body: Left sidebar menu + Right selection list */}
            <div style={{ display: "flex", flexGrow: 1, minHeight: "0" }}>
              {/* Left sidebar inside modal */}
              <div style={{
                width: "200px",
                backgroundColor: "#ffffff",
                display: "flex",
                flexDirection: "column",
                padding: "12px 8px",
                borderRight: "1px solid #e2e8f0"
              }}>
                <span style={{ fontSize: "10px", color: "#6b7280", fontWeight: 700, padding: "8px", textTransform: "uppercase" }}>Content Types</span>
                
                {/* Playlists Button */}
                <button
                  type="button"
                  onClick={() => {
                    setModalTab("playlists");
                    setSelectedMediaId(null);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 12px",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                    backgroundColor: modalTab === "playlists" ? "#10b981" : "transparent",
                    color: modalTab === "playlists" ? "#ffffff" : "#475569"
                  }}
                >
                  <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span>Playlists</span>
                </button>
 
                {/* Media Button */}
                <button
                  type="button"
                  onClick={() => {
                    setModalTab("media");
                    setSelectedPlaylistId(null);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 12px",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                    backgroundColor: modalTab === "media" ? "#10b981" : "transparent",
                    color: modalTab === "media" ? "#ffffff" : "#475569"
                  }}
                >
                  <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Media</span>
                </button>
              </div>

              {/* Right selection list inside modal */}
              <div style={{ flexGrow: 1, padding: "16px 24px", overflowY: "auto" }}>
                
                {modalMessage && (
                  <div style={{
                    backgroundColor: modalMessage.includes("success") ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                    border: modalMessage.includes("success") ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "6px",
                    padding: "12px",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: modalMessage.includes("success") ? "#10b981" : "#ef4444",
                    marginBottom: "16px"
                  }}>
                    {modalMessage}
                  </div>
                )}

                {modalTab === "playlists" ? (
                  filteredPlaylists.length === 0 ? (
                    <div style={{ padding: "48px 0", textAlign: "center", color: "#64748b" }}>
                      <p>No playlists found.</p>
                      <Link href="/playlists" style={{ color: "#10b981", fontWeight: 700 }}>Create Playlists</Link>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {filteredPlaylists.map((p) => {
                        const isSelected = selectedPlaylistId === p.id;
                        return (
                          <div
                            key={p.id}
                            onClick={() => setSelectedPlaylistId(p.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "12px 16px",
                              border: isSelected ? "2.5px solid #10b981" : "1px solid #cbd5e1",
                              borderRadius: "8px",
                              backgroundColor: isSelected ? "rgba(16, 185, 129, 0.04)" : "#ffffff",
                              cursor: "pointer"
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <svg style={{ width: 20, height: 20, color: "#10b981" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                              <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{p.name}</span>
                            </div>
                            <span style={{ fontSize: "12px", color: "#64748b" }}>{p.item_count} items</span>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  // Media Items Tab + Direct Upload Section
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    
                    {/* Direct upload bar */}
                    <div style={{
                      padding: "16px",
                      border: "1.5px dashed #cbd5e1",
                      borderRadius: "8px",
                      backgroundColor: "#f8fafc",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px"
                    }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
                        Upload a new visual directly to this space
                      </div>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={handleMediaUpload}
                        disabled={uploadingFile}
                        style={{ display: "none" }}
                        id="modal-direct-upload"
                      />
                      <label
                        htmlFor="modal-direct-upload"
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#10b981",
                          color: "#ffffff",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: uploadingFile ? "not-allowed" : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px"
                        }}
                      >
                        <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        {uploadingFile ? "Uploading File..." : "Select File to Upload"}
                      </label>
                      {uploadMessage && (
                        <div style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: uploadMessage.includes("success") ? "#10b981" : "#64748b"
                        }}>
                          {uploadMessage}
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Available Media</div>

                    {filteredMedia.length === 0 ? (
                      <div style={{ padding: "24px 0", textAlign: "center", color: "#64748b" }}>
                        <p>No media files uploaded yet.</p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {filteredMedia.map((m) => {
                          const isSelected = selectedMediaId === m.id;
                          return (
                            <div
                              key={m.id}
                              onClick={() => setSelectedMediaId(m.id)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "12px 16px",
                                border: isSelected ? "2.5px solid #10b981" : "1px solid #cbd5e1",
                                borderRadius: "8px",
                                backgroundColor: isSelected ? "rgba(16, 185, 129, 0.04)" : "#ffffff",
                                cursor: "pointer"
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                {m.mime_type.startsWith("image/") ? (
                                  <img
                                    src={m.media_url}
                                    alt=""
                                    style={{ width: "32px", height: "32px", borderRadius: "4px", objectFit: "cover" }}
                                  />
                                ) : (
                                  <div style={{ width: "32px", height: "32px", borderRadius: "4px", backgroundColor: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                                    <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  </div>
                                )}
                                <div>
                                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{m.filename}</div>
                                  <div style={{ fontSize: "11px", color: "#64748b" }}>{m.mime_type}</div>
                                </div>
                              </div>
                              <span style={{ fontSize: "12px", color: "#64748b" }}>
                                {Math.round(m.size_bytes / 1024)} KB
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer actions */}
            <div style={{
              padding: "16px 24px",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <div>
                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  Content will always be playing on screen.
                </span>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={publishing}
                  style={{
                    backgroundColor: "#ffffff",
                    color: "#334155",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    padding: "8px 16px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePublishContent}
                  disabled={publishing || (!selectedPlaylistId && !selectedMediaId)}
                  style={{
                    backgroundColor: "#10b981",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 16px",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  {publishing ? "Publishing..." : "Confirm"}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Custom Operating Hours Modal */}
      {isHoursModalOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(15, 23, 42, 0.45)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1001
        }}>
          <div style={{
            width: "680px",
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }}>
            {/* Header */}
            <div style={{
              padding: "18px 24px",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                Custom Operating Hours
              </h3>
              <button
                onClick={() => setIsHoursModalOpen(false)}
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  padding: "4px",
                  cursor: "pointer",
                  color: "#94a3b8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Sub-label */}
            <div style={{
              padding: "16px 24px 0 24px",
              fontSize: "10px",
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}>
              Hours
            </div>

            {/* Body */}
            <div style={{
              padding: "16px 24px 24px 24px",
              display: "flex",
              flexDirection: "column",
              gap: "14px"
            }}>
              {DAYS_OF_WEEK.map((day) => {
                const daySched = tempSchedule[day];
                const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);

                return (
                  <div key={day} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "24px",
                    minHeight: "44px"
                  }}>
                    {/* Day label */}
                    <div style={{ width: "110px", fontSize: "14px", fontWeight: 600, color: "#334155", flexShrink: 0 }}>
                      {dayLabel}
                    </div>

                    {/* Controls */}
                    <div style={{ flexGrow: 1, display: "flex", justifyContent: "flex-start" }}>
                      {daySched.enabled ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <TimePicker
                            value={daySched.start}
                            onChange={(val) => {
                              setTempSchedule({
                                ...tempSchedule,
                                [day]: { ...daySched, start: val }
                              });
                            }}
                          />
                          <span style={{ color: "#94a3b8", fontSize: "14px" }}>–</span>
                          <TimePicker
                            value={daySched.end}
                            onChange={(val) => {
                              setTempSchedule({
                                ...tempSchedule,
                                [day]: { ...daySched, end: val }
                              });
                            }}
                          />
                        </div>
                      ) : (
                        <div style={{
                          backgroundColor: "#f8fafc",
                          borderRadius: "6px",
                          border: "1px solid #e2e8f0",
                          padding: "6px 16px",
                          fontSize: "12px",
                          color: "#64748b",
                          textAlign: "left",
                          flexGrow: 1,
                          maxWidth: "360px",
                          boxSizing: "border-box"
                        }}>
                          <span style={{ fontWeight: 600 }}>No hours set.</span> Screens will be asleep.
                        </div>
                      )}
                    </div>

                    {/* Toggle Switch */}
                    <div
                      onClick={() => {
                        setTempSchedule({
                          ...tempSchedule,
                          [day]: { ...daySched, enabled: !daySched.enabled }
                        });
                      }}
                      style={{
                        width: "44px",
                        height: "24px",
                        backgroundColor: daySched.enabled ? "#d1fae5" : "#e2e8f0",
                        borderRadius: "12px",
                        position: "relative",
                        cursor: "pointer",
                        transition: "background-color 0.2s ease",
                        flexShrink: 0
                      }}
                    >
                      <div style={{
                        width: "18px",
                        height: "18px",
                        backgroundColor: daySched.enabled ? "#10b981" : "#ffffff",
                        borderRadius: "50%",
                        position: "absolute",
                        top: "3px",
                        left: daySched.enabled ? "23px" : "3px",
                        transition: "left 0.2s ease, background-color 0.2s ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{
              padding: "16px 24px 24px 24px",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "center"
            }}>
              <button
                type="button"
                onClick={() => {
                  setOperatingHours(JSON.stringify({ type: "custom", schedule: tempSchedule }));
                  setIsHoursModalOpen(false);
                }}
                style={{
                  backgroundColor: "#10b981",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "10px 64px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "background-color 0.15s ease, transform 0.1s ease",
                  boxShadow: "0 4px 6px -1px rgba(16, 185, 129, 0.2), 0 2px 4px -1px rgba(16, 185, 129, 0.1)"
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#059669")}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#10b981")}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS adjustments */}
      <style jsx global>{`
        body {
          overflow-y: hidden; /* prevents global page double scroll */
        }
        @keyframes slideIn {
          from {
            transform: translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>

    </div>
  );
}
