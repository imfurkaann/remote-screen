"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import PairScreenModal from "../../../components/PairScreenModal";
import ScreenPowerBadge from "@/components/ScreenPowerBadge";
import { useConfirm } from "@/components/ConfirmProvider";
import { buildDeviceQuery } from "@/lib/device-query";
import { useFleetSocket } from "@/lib/use-fleet-socket";
import { mergeDeviceStatus } from "@/lib/fleet-events";
import { getDevicePresence } from "@/lib/device-presence";
import { getScreenPowerState } from "@/lib/screen-power";

type DeviceItem = {
  id: string;
  hardware_id: string;
  name?: string | null;
  location?: string | null;
  status: string;
  last_seen_at?: string | null;
  last_heartbeat_at?: string | null;
  screen_on?: boolean | null;
  current_playlist_id?: string | null;
  screen_group?: string | null;
};

type PlaylistItem = {
  id: string;
  name: string;
  item_count: number;
  items?: { mime_type?: string; filename?: string }[];
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="copy-btn"
      title="Copy Screen ID"
      style={{
        marginLeft: 6,
        verticalAlign: "middle",
        background: "none",
        border: "none",
        padding: "4px",
        cursor: "pointer",
        color: "#94a3b8",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "4px",
        transition: "all 0.15s ease"
      }}
      type="button"
    >
      {copied ? (
        <svg style={{ width: 14, height: 14, color: "var(--primary)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
        </svg>
      )}
    </button>
  );
}

const STATUS_STYLE: Record<
  "online" | "degraded" | "offline",
  { bg: string; color: string; border: string; label: string; dot?: string }
> = {
  online: {
    bg: "rgba(16,185,129,0.1)",
    color: "#10b981",
    border: "1px solid rgba(16,185,129,0.2)",
    label: "ONLINE",
    dot: "#10b981"
  },
  degraded: {
    bg: "rgba(245,158,11,0.1)",
    color: "#d97706",
    border: "1px solid rgba(245,158,11,0.25)",
    label: "DEGRADED",
    dot: "#f59e0b"
  },
  offline: {
    bg: "#e2e8f0",
    color: "#64748b",
    border: "1px solid #cbd5e1",
    label: "OFFLINE"
  }
};

export default function ScreensPage() {
  const confirm = useConfirm();
  const [screens, setScreens] = useState<DeviceItem[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  // Ticks every 30 s so status badges update without a page refresh.
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Pairing Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Screens Manager Modal State
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [managerSearch, setManagerSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // New Group Modal State
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupSelectedIds, setGroupSelectedIds] = useState<Set<string>>(new Set());
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);

  useFleetSocket({
    onConnectionChange: setLiveConnected,
    onDeviceStatus: (event) => {
      setNowMs(Date.now());
      setScreens((current) => mergeDeviceStatus(current, event));
    }
  });

  const handleDeleteScreen = async (deviceId: string, hardwareId: string, screenName?: string | null) => {
    const displayName = screenName || hardwareId;
    const confirmed = await confirm({
      title: "Ekranı Sil",
      message: `"${displayName}" isimli ekranı sistemden tamamen silmek istediğinize emin misiniz?`,
      confirmText: "Sil",
      cancelText: "Vazgeç",
      type: "danger"
    });
    if (!confirmed) return;

    setDeletingId(deviceId);
    try {
      const res = await fetch(`/api/content/devices/${deviceId}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setScreens((prev) => prev.filter((s) => s.id !== deviceId));
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateGroup = async () => {
    const name = groupName.trim();
    if (!name || groupSelectedIds.size === 0) return;
    setGroupSaving(true);
    try {
      const response = await fetch("/api/content/devices/bulk", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_ids: Array.from(groupSelectedIds), screen_group: name })
      });
      if (!response.ok) {
        throw new Error("Failed to assign the selected screens to the group.");
      }
      // Optimistic update
      setScreens((prev) =>
        prev.map((s) =>
          groupSelectedIds.has(s.id) ? { ...s, screen_group: name } : s
        )
      );
      setIsGroupModalOpen(false);
      setGroupName("");
      setGroupSelectedIds(new Set());
      setGroupSearch("");
    } finally {
      setGroupSaving(false);
    }
  };


  const loadScreens = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const query = buildDeviceQuery({ page, limit: 100, search: searchTerm });
      const devicesPromise = fetch(`/api/content/devices?${query.toString()}`, { cache: "no-store" });
      const playlistsPromise = silent
        ? Promise.resolve<Response | null>(null)
        : fetch("/api/content/playlists", { cache: "no-store" });
      const [devicesRes, playlistsRes] = await Promise.all([devicesPromise, playlistsPromise]);
      if (devicesRes.status === 401 || devicesRes.status === 403 || playlistsRes?.status === 401 || playlistsRes?.status === 403) {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login?redirect=/screens";
        return;
      }
      if (!devicesRes.ok) throw new Error("Failed to load screens list.");
      const devPayload = (await devicesRes.json()) as {
        devices?: DeviceItem[];
        total?: number;
        totalPages?: number;
      };
      setScreens(devPayload.devices ?? []);
      setTotal(devPayload.total ?? 0);
      setTotalPages(devPayload.totalPages ?? 1);
      if (playlistsRes?.ok) {
        const plPayload = (await playlistsRes.json()) as { playlists?: PlaylistItem[] };
        setPlaylists(plPayload.playlists ?? []);
      }
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "An error occurred while loading screens.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Playlist ID → playlist lookup map
  const playlistMap = useMemo(() => {
    const map = new Map<string, PlaylistItem>();
    for (const pl of playlists) map.set(pl.id, pl);
    return map;
  }, [playlists]);

  useEffect(() => {
    const initialTimer = setTimeout(() => void loadScreens(), 300);
    const refreshTimer = setInterval(() => {
      setNowMs(Date.now());
      if (document.visibilityState === "visible") void loadScreens(true);
    }, 60_000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(refreshTimer);
    };
  }, [page, searchTerm]);

  // Search is performed by MongoDB so the browser only handles the current bounded page.
  const filteredScreens = screens;

  // Derived: screens grouped by screen_group (must come after filteredScreens)
  const groupedScreens = useMemo(() => {
    const groups = new Map<string, DeviceItem[]>();
    for (const s of filteredScreens) {
      const g = s.screen_group && s.screen_group !== "Ungrouped" ? s.screen_group : "Ungrouped";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(s);
    }
    // Named groups alphabetically, Ungrouped always last
    const sorted = new Map<string, DeviceItem[]>();
    const named = Array.from(groups.keys()).filter((k) => k !== "Ungrouped").sort();
    for (const k of named) sorted.set(k, groups.get(k)!);
    if (groups.has("Ungrouped")) sorted.set("Ungrouped", groups.get("Ungrouped")!);
    return sorted;
  }, [filteredScreens]);

  const openPairModal = () => {
    setIsModalOpen(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", backgroundColor: "#f4f5f7" }}>
      {/* Edge-to-Edge White Header */}
      <header style={{
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        padding: "16px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "24px"
      }}>
        {/* Title */}
        <h1 title={liveConnected ? "Live connection active" : "Live connection reconnecting"} style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>
          Screens
        </h1>

        {/* Search Input in Middle */}
        <div style={{ position: "relative", flexGrow: 1, maxWidth: "500px" }}>
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
            placeholder="Search Screens"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            style={{
              width: "100%",
              padding: "8px 12px 8px 36px",
              fontSize: "14px",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              backgroundColor: "#ffffff",
              color: "#0f172a"
            }}
          />
        </div>

        {/* New Screen Button (Opens Modal) */}
        <button
          onClick={openPairModal}
          type="button"
          style={{
            backgroundColor: "var(--primary)",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: "14px",
            padding: "10px 18px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            transition: "background-color 0.15s ease"
          }}
        >
          New Screen
        </button>
      </header>

      {/* Main Inner Content Body */}
      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: "20px" }}>
        
        {/* Action Buttons Row */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px", fontSize: "14px", color: "#64748b", flexWrap: "wrap" }}>
          
          <button
            onClick={() => void loadScreens()}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "#0f172a",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <span>Refresh</span>
          </button>

          <span style={{ color: "#cbd5e1" }}>|</span>

          <button
            onClick={() => { setGroupName(""); setGroupSelectedIds(new Set()); setGroupSearch(""); setIsGroupModalOpen(true); }}
            style={{
              background: "none", border: "none", padding: 0,
              cursor: "pointer", color: "#64748b",
              display: "flex", alignItems: "center", gap: "6px"
            }}
          >
            <span>+ New Group</span>
          </button>

          <button
            onClick={() => { setManagerSearch(""); setIsManagerOpen(true); }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
            </svg>
            <span>Screens Manager</span>
          </button>

          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "16px" }}>
            {/* light bulb */}
            <svg style={{ width: 18, height: 18, cursor: "pointer" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            {/* checkbox */}
            <svg style={{ width: 18, height: 18, cursor: "pointer" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            </svg>
          </span>
        </div>

        {/* Screens List Container Card */}
        {error ? (
          <div style={{ padding: "24px", color: "var(--danger)", display: "flex", alignItems: "center", gap: "8px", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        ) : null}

        {loading && screens.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#64748b", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <p>Loading screens list...</p>
          </div>
        ) : screens.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "64px 32px",
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px"
          }}>
            <svg style={{ width: 64, height: 64, color: "#94a3b8" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h4 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>No Screens Connected</h4>
            <p style={{ margin: 0, color: "#64748b", fontSize: "14px", maxWidth: "400px" }}>
              Start by connecting a new screen to your account.
            </p>
            <button onClick={openPairModal} type="button" style={{ marginTop: "8px" }}>Pair Screen</button>
          </div>
        ) : filteredScreens.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#64748b", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <p>No screens match your search query.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {Array.from(groupedScreens.entries()).map(([groupName, groupScreens]) => (
              <div key={groupName}>
                {/* Group Header — hidden for single Ungrouped section */}
                {(groupedScreens.size > 1 || groupName !== "Ungrouped") && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    marginBottom: "6px", padding: "0 4px"
                  }}>
                    <svg style={{ width: 14, height: 14, color: "#94a3b8", flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                    </svg>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                      {groupName}
                    </span>
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                      {groupScreens.length} screen{groupScreens.length !== 1 ? "s" : ""}
                    </span>
                    <div style={{ flex: 1, height: 1, backgroundColor: "#e2e8f0" }} />
                  </div>
                )}

                {/* Screens in this group */}
                <div style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  overflow: "hidden",
                  borderLeft: groupName !== "Ungrouped" ? "3px solid var(--primary)" : undefined
                }}>
                  {groupScreens.map((screen, idx) => (
                    <Link
                      href={`/screens/${screen.id}`}
                      key={screen.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "20px 32px",
                        borderBottom: idx === groupScreens.length - 1 ? "none" : "1px solid #f1f5f9",
                        transition: "background-color 0.15s ease",
                        gap: "32px",
                        textDecoration: "none",
                        color: "inherit",
                        cursor: "pointer"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8fafc"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                    >
                      {/* Left: Screen Monitor Icon */}
                      <div style={{
                        width: "44px", height: "32px",
                        backgroundColor: "#ffffff",
                        border: "1.5px solid #000000",
                        borderRadius: "4px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#000000", flexShrink: 0
                      }}>
                        <svg style={{ width: 18, height: 18 }} fill="currentColor" viewBox="0 0 24 24">
                          <path d="M19 2H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H5V4h14v10zm-7 4l-2 3h6l-2-3z" />
                        </svg>
                      </div>

                      {/* Details */}
                      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                            {screen.name || "Unnamed Screen"}
                          </span>
                          <span style={{ fontSize: "12px", color: "#94a3b8", fontFamily: "monospace" }}>
                            ({screen.hardware_id})
                          </span>
                          <CopyButton text={screen.id} />
                        </div>
                      </div>

                      {/* NOW PLAYING */}
                      {(() => {
                        const pl = screen.current_playlist_id ? playlistMap.get(screen.current_playlist_id) : null;
                        const firstItem = pl?.items?.[0];
                        const firstMime = firstItem?.mime_type ?? "";
                        const isVideo = firstMime.startsWith("video/");
                        if (!pl) return (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "220px" }}>
                            <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.5px" }}>NOW PLAYING</span>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#94a3b8", fontStyle: "italic" }}>
                              <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                              <span>Nothing playing</span>
                            </div>
                          </div>
                        );
                        if (pl.item_count === 1 && firstItem) return (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "220px" }}>
                            <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.5px" }}>NOW PLAYING</span>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#64748b" }}>
                              {isVideo
                                ? <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                : <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              }
                              <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }} title={firstItem.filename}>
                                {firstItem.filename ?? "Unknown file"}
                              </span>
                            </div>
                          </div>
                        );
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "220px" }}>
                            <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.5px" }}>NOW PLAYING</span>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#64748b" }}>
                              <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10" /></svg>
                              <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "160px" }} title={pl.name}>{pl.name}</span>
                              <span style={{ fontSize: "11px", color: "#94a3b8", flexShrink: 0 }}>{pl.item_count} items</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Status badge */}
                      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {(() => {
                          const status = getDevicePresence({
                            status: screen.status,
                            lastHeartbeatAt: screen.last_heartbeat_at
                          }, nowMs);
                          const s = STATUS_STYLE[status];
                          const screenPower = getScreenPowerState(status, screen.screen_on);
                          return (
                            <>
                              <span style={{
                              display: "inline-flex", alignItems: "center", gap: "8px",
                              padding: "6px 12px", borderRadius: "999px",
                              fontSize: "12px", fontWeight: 700, textTransform: "uppercase",
                              backgroundColor: s.bg,
                              color: s.color,
                              border: s.border
                            }}>
                              {s.dot && (
                                <span style={{
                                  width: 8, height: 8,
                                  backgroundColor: s.dot,
                                  borderRadius: "50%",
                                  display: "inline-block",
                                  // Pulse animation only for online state
                                  animation: status === "online" ? "pulse 2s infinite" : undefined
                                }} />
                              )}
                                {s.label}
                              </span>
                              <ScreenPowerBadge state={screenPower} />
                            </>
                          );
                        })()}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {total > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontSize: 13 }}>
            <span>{total.toLocaleString()} screens · Page {page} of {totalPages}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Previous
              </button>
              <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reusable Pairing Modal */}
      <PairScreenModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => void loadScreens()}
      />
      
      {/* ── Screens Manager Modal ──────────────────────────── */}
      {isManagerOpen && (
        <div style={{
          position: "fixed", inset: 0,
          backgroundColor: "rgba(15,23,42,0.45)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            width: "560px", maxHeight: "80vh",
            backgroundColor: "#ffffff",
            borderRadius: "14px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.12)",
            border: "1px solid #e2e8f0",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            animation: "fadeIn 0.2s ease-out"
          }}>
            {/* Header */}
            <div style={{
              padding: "20px 24px",
              borderBottom: "1px solid #e2e8f0",
              display: "flex", alignItems: "center", justifyContent: "space-between"
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Screens Manager</h3>
                <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#94a3b8" }}>{total.toLocaleString()} screen{total !== 1 ? "s" : ""} total</p>
              </div>
              <button onClick={() => setIsManagerOpen(false)} type="button" style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#94a3b8", display: "flex", alignItems: "center",
                justifyContent: "center", borderRadius: "50%", padding: "4px"
              }}>
                <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search Bar */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ position: "relative" }}>
                <svg style={{
                  position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                  width: 15, height: 15, color: "#94a3b8", pointerEvents: "none"
                }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by screen name or location..."
                  value={managerSearch}
                  onChange={(e) => setManagerSearch(e.target.value)}
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 34px",
                    fontSize: "14px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    backgroundColor: "#f8fafc",
                    color: "#0f172a",
                    outline: "none"
                  }}
                />
              </div>
            </div>

            {/* Screen List */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {(() => {
                const term = managerSearch.toLowerCase().trim();
                const filtered = screens.filter((s) =>
                  !term ||
                  (s.name ?? "").toLowerCase().includes(term) ||
                  (s.location ?? "").toLowerCase().includes(term) ||
                  s.hardware_id.toLowerCase().includes(term)
                );

                if (filtered.length === 0) {
                  return (
                    <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>
                      No screens match your search.
                    </div>
                  );
                }

                return filtered.map((screen, idx) => (
                  <div key={screen.id} style={{
                    display: "flex", alignItems: "center",
                    padding: "14px 24px",
                    borderBottom: idx === filtered.length - 1 ? "none" : "1px solid #f1f5f9",
                    gap: "12px"
                  }}>
                    {/* Status dot */}
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      backgroundColor: screen.status === "online" ? "#10b981" : "#cbd5e1"
                    }} />

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {screen.name ?? "Unnamed Screen"}
                      </div>
                      <div style={{ fontSize: "12px", color: "#94a3b8",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {screen.location ? `${screen.location} · ` : ""}{screen.hardware_id}
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        void handleDeleteScreen(screen.id, screen.hardware_id, screen.name);
                      }}
                      disabled={deletingId === screen.id}
                      title="Delete screen"
                      style={{
                        background: "none", border: "none",
                        cursor: deletingId === screen.id ? "not-allowed" : "pointer", 
                        color: deletingId === screen.id ? "#cbd5e1" : "#94a3b8",
                        padding: "4px", borderRadius: "6px",
                        display: "flex", alignItems: "center",
                        transition: "color 0.15s"
                      }}
                      onMouseEnter={(e) => {
                        if (deletingId !== screen.id) {
                          e.currentTarget.style.color = "#ef4444";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (deletingId !== screen.id) {
                          e.currentTarget.style.color = "#94a3b8";
                        }
                      }}
                    >
                      <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── New Group Modal ──────────────────────────────────── */}
      {isGroupModalOpen && (
        <div style={{
          position: "fixed", inset: 0,
          backgroundColor: "rgba(15,23,42,0.5)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1100
        }}>
          <div style={{
            width: "520px", maxHeight: "85vh",
            backgroundColor: "#ffffff",
            borderRadius: "14px",
            boxShadow: "0 24px 48px rgba(0,0,0,0.14)",
            border: "1px solid #e2e8f0",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            animation: "fadeIn 0.2s ease-out"
          }}>
            {/* Header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>New Group</h3>
                <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#94a3b8" }}>Create a group and assign screens to it</p>
              </div>
              <button onClick={() => setIsGroupModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px", borderRadius: "50%", display: "flex" }}>
                <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Group Name */}
            <div style={{ padding: "20px 24px 0" }}>
              <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155", display: "block", marginBottom: "6px" }}>
                Group Name <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Lobby Displays, Floor 2"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                autoFocus
                style={{
                  width: "100%", padding: "10px 12px", fontSize: "14px",
                  border: "1px solid #cbd5e1", borderRadius: "8px",
                  color: "#0f172a", outline: "none", boxSizing: "border-box"
                }}
              />
            </div>

            {/* Screen Selector */}
            <div style={{ padding: "16px 24px 0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
                  Assign Screens <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 400 }}>({groupSelectedIds.size} selected)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setGroupSelectedIds(groupSelectedIds.size === screens.length ? new Set() : new Set(screens.map(s => s.id)))}
                  style={{ fontSize: "12px", color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                >
                  {groupSelectedIds.size === screens.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              {/* Search */}
              <div style={{ position: "relative", marginBottom: "8px" }}>
                <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#94a3b8", pointerEvents: "none" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Filter screens..."
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  style={{
                    width: "100%", padding: "7px 10px 7px 30px", fontSize: "13px",
                    border: "1px solid #e2e8f0", borderRadius: "7px",
                    backgroundColor: "#f8fafc", color: "#0f172a", outline: "none", boxSizing: "border-box"
                  }}
                />
              </div>
            </div>

            {/* Screen list */}
            <div style={{ overflowY: "auto", flex: 1, padding: "0 24px 16px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {screens
                .filter((s) => {
                  const t = groupSearch.toLowerCase().trim();
                  return !t || (s.name ?? "").toLowerCase().includes(t) || (s.location ?? "").toLowerCase().includes(t) || s.hardware_id.toLowerCase().includes(t);
                })
                .map((screen) => {
                  const checked = groupSelectedIds.has(screen.id);
                  return (
                    <label key={screen.id} style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      backgroundColor: checked ? "rgba(99,102,241,0.05)" : "transparent",
                      border: checked ? "1px solid rgba(99,102,241,0.2)" : "1px solid transparent",
                      transition: "all 0.1s"
                    }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = new Set(groupSelectedIds);
                          checked ? next.delete(screen.id) : next.add(screen.id);
                          setGroupSelectedIds(next);
                        }}
                        style={{ width: 15, height: 15, accentColor: "var(--primary)", flexShrink: 0 }}
                      />
                      <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, backgroundColor: screen.status === "online" ? "#10b981" : "#cbd5e1" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {screen.name ?? "Unnamed Screen"}
                        </div>
                        <div style={{ fontSize: "11px", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {screen.screen_group && screen.screen_group !== "Ungrouped" && (
                            <span style={{ color: "#6366f1", marginRight: 4 }}>({screen.screen_group})</span>
                          )}
                          {screen.location ? `${screen.location} · ` : ""}{screen.hardware_id}
                        </div>
                      </div>
                    </label>
                  );
                })}
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", color: "#94a3b8" }}>
                {groupSelectedIds.size > 0 ? `${groupSelectedIds.size} screen${groupSelectedIds.size !== 1 ? "s" : ""} will be moved to "${groupName || "..."}"` : "Select at least one screen"}
              </span>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setIsGroupModalOpen(false)}
                  style={{ padding: "8px 16px", fontSize: "13px", fontWeight: 600, border: "1px solid #cbd5e1", borderRadius: "7px", background: "#fff", cursor: "pointer", color: "#334155" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateGroup}
                  disabled={!groupName.trim() || groupSelectedIds.size === 0 || groupSaving}
                  style={{
                    padding: "8px 20px", fontSize: "13px", fontWeight: 700,
                    border: "none", borderRadius: "7px", cursor: "pointer",
                    backgroundColor: !groupName.trim() || groupSelectedIds.size === 0 ? "#e2e8f0" : "var(--primary)",
                    color: !groupName.trim() || groupSelectedIds.size === 0 ? "#94a3b8" : "#fff",
                    transition: "all 0.15s"
                  }}
                >
                  {groupSaving ? "Saving..." : "Create Group"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
