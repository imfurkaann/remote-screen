"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";

type UploadedMedia = {
  id: string;
  filename: string;
  checksum_sha256: string;
};

type PlaylistRow = {
  id: string;
  name: string;
  version: number;
  item_count: number;
  updated_at: string;
};

type DeviceRow = {
  id: string;
  hardware_id: string;
  status: string;
};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? payload.code ?? "request_failed");
  }
  return payload;
}

/* ─── Small SVG icons ─────────────────────────────────────── */
function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconPlaylist() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M3 12h12M3 18h9" />
      <circle cx="19" cy="16" r="3" />
      <path d="M22 10v6" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
function IconSend() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}
function IconItems() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

/* ─── Modal ────────────────────────────────────────────────── */
interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  media: UploadedMedia[];
  devices: DeviceRow[];
  isBusy: boolean;
  onSubmit: (e: FormEvent) => Promise<void>;
  playlistName: string;
  setPlaylistName: (v: string) => void;
  selectedMediaIds: string[];
  setSelectedMediaIds: (ids: string[]) => void;
  selectedDeviceIds: string[];
  setSelectedDeviceIds: (ids: string[]) => void;
  onFileUpload: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  statusMessage: string | null;
}

function CreateModal({
  open,
  onClose,
  media,
  devices,
  isBusy,
  onSubmit,
  playlistName,
  setPlaylistName,
  selectedMediaIds,
  setSelectedMediaIds,
  selectedDeviceIds,
  setSelectedDeviceIds,
  onFileUpload,
  statusMessage,
}: CreateModalProps) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)",
      animation: "fadeIn 0.15s ease",
    }}>
      <div style={{
        background: "#ffffff",
        borderRadius: 16,
        width: "100%",
        maxWidth: 520,
        boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
        overflow: "hidden",
        animation: "slideUp 0.2s ease",
      }}>
        {/* Modal header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
              New Playlist
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Upload media and configure your playlist
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              padding: 6,
              cursor: "pointer",
              color: "#94a3b8",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconClose />
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: "24px", display: "grid", gap: 20, maxHeight: "70vh", overflowY: "auto" }}>
          {/* Upload */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
              Upload Media
            </label>
            <label style={{
              display: "flex", alignItems: "center", gap: 10,
              border: "2px dashed #e2e8f0", borderRadius: 10, padding: "14px 16px",
              cursor: "pointer", transition: "border-color 0.15s",
              color: "#64748b", fontSize: 14,
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#10b981")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#e2e8f0")}
            >
              <IconUpload />
              <span>Choose image or video file…</span>
              <input type="file" accept="image/*,video/*" onChange={onFileUpload} disabled={isBusy} style={{ display: "none" }} />
            </label>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#94a3b8" }}>
              {media.length} media file{media.length !== 1 ? "s" : ""} available
            </p>
          </div>

          {/* Form */}
          <form id="create-playlist-form" onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                Playlist Name
              </label>
              <input
                name="playlistName"
                placeholder="e.g. Morning Campaign"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                required
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                Select Media Items
                <span style={{ marginLeft: 6, fontWeight: 400, textTransform: "none", fontSize: 11 }}>(hold Ctrl / ⌘ for multiple)</span>
              </label>
              <select
                multiple
                value={selectedMediaIds}
                onChange={(e) =>
                  setSelectedMediaIds(
                    Array.from(e.target.selectedOptions).map((o) => o.value)
                  )
                }
                style={{ width: "100%", minHeight: 110, boxSizing: "border-box" }}
              >
                {media.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.filename}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                Publish Targets (Devices)
              </label>
              <select
                multiple
                value={selectedDeviceIds}
                onChange={(e) =>
                  setSelectedDeviceIds(
                    Array.from(e.target.selectedOptions).map((o) => o.value)
                  )
                }
                style={{ width: "100%", minHeight: 100, boxSizing: "border-box" }}
              >
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.hardware_id} — {device.status}
                  </option>
                ))}
              </select>
            </div>

            {statusMessage && (
              <div style={{
                background: statusMessage.startsWith("Playlist created") || statusMessage.startsWith("Uploaded")
                  ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                border: `1px solid ${statusMessage.startsWith("Playlist created") || statusMessage.startsWith("Uploaded")
                  ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                color: statusMessage.startsWith("Playlist created") || statusMessage.startsWith("Uploaded")
                  ? "#059669" : "#dc2626",
              }}>
                {statusMessage}
              </div>
            )}
          </form>
        </div>

        {/* Modal footer */}
        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid #e2e8f0",
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
        }}>
          <button type="button" className="secondary" onClick={onClose} disabled={isBusy}>
            Cancel
          </button>
          <button type="submit" form="create-playlist-form" disabled={isBusy} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isBusy ? "Saving…" : "Create Playlist"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>
  );
}

/* ─── Playlist Card ────────────────────────────────────────── */
function PlaylistCard({
  playlist,
  onPublish,
  isBusy,
}: {
  playlist: PlaylistRow;
  onPublish: (id: string) => void;
  isBusy: boolean;
}) {
  const initials = playlist.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: 12,
      padding: "18px 20px",
      display: "flex",
      alignItems: "center",
      gap: 16,
      transition: "box-shadow 0.2s ease, border-color 0.2s ease",
      cursor: "default",
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.07)";
        (e.currentTarget as HTMLDivElement).style.borderColor = "#cbd5e1";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
        (e.currentTarget as HTMLDivElement).style.borderColor = "#e2e8f0";
      }}
    >
      {/* Thumbnail / initials */}
      <div style={{
        width: 48,
        height: 48,
        borderRadius: 10,
        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontSize: 16,
        fontWeight: 700,
        color: "#ffffff",
        letterSpacing: "-0.5px",
      }}>
        {initials}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {playlist.name}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 5 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748b" }}>
            <IconItems />
            {playlist.item_count} item{playlist.item_count !== 1 ? "s" : ""}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748b" }}>
            <IconClock />
            v{playlist.version}
          </span>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {new Date(playlist.updated_at).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <button
        type="button"
        disabled={isBusy}
        onClick={() => onPublish(playlist.id)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
          borderRadius: 8,
          flexShrink: 0,
        }}
      >
        <IconSend />
        Publish
      </button>
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────── */
export default function PlaylistsPage() {
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [playlistName, setPlaylistName] = useState("Main Campaign");
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);

  const sortedMedia = useMemo(
    () => [...media].sort((a, b) => a.filename.localeCompare(b.filename)),
    [media]
  );

  // "Single Media:" ile başlayanlar gerçek playlist değil — filtrele
  const realPlaylists = useMemo(
    () => playlists.filter((p) => !p.name.startsWith("Single Media:")),
    [playlists]
  );

  const filteredPlaylists = useMemo(
    () =>
      realPlaylists.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [realPlaylists, searchQuery]
  );

  const loadMedia = async () => {
    try {
      const payload = await fetchJson<{ media?: UploadedMedia[] }>(
        "/api/content/media",
        { cache: "no-store" }
      );
      setMedia(payload.media ?? []);
    } catch {
      // non-fatal
    }
  };

  const loadPlaylists = async () => {
    const payload = await fetchJson<{ playlists?: PlaylistRow[] }>(
      "/api/content/playlists",
      { cache: "no-store" }
    );
    setPlaylists(payload.playlists ?? []);
  };

  const loadDevices = async () => {
    const payload = await fetchJson<{ devices?: DeviceRow[] }>(
      "/api/content/devices",
      { cache: "no-store" }
    );
    setDevices(payload.devices ?? []);
  };

  useEffect(() => {
    const run = async () => {
      try {
        await Promise.all([loadMedia(), loadPlaylists(), loadDevices()]);
      } catch {
        setPublishStatus("Failed to load data.");
      }
    };
    run().catch(() => setPublishStatus("Failed to load initial data."));
  }, []);

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const payload = await fetchJson<{ media?: UploadedMedia }>(
        "/api/content/media/upload",
        { method: "POST", body: form }
      );
      if (!payload.media) throw new Error("upload_failed");
      setStatusMessage(`Uploaded ${payload.media.filename}`);
      await loadMedia();
    } catch (error) {
      setStatusMessage(`Upload failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      event.target.value = "";
    }
  };

  const handleCreatePlaylist = async (event: FormEvent) => {
    event.preventDefault();
    if (!playlistName.trim() || selectedMediaIds.length === 0) {
      setStatusMessage("Playlist name and at least one media item are required.");
      return;
    }
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const items = selectedMediaIds.map((mediaId, index) => ({
        media_id: mediaId,
        duration_ms: 10_000,
        position: index,
      }));
      await fetchJson<{ playlist?: { id: string } }>("/api/content/playlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: playlistName.trim(), items }),
      });
      await loadPlaylists();
      setStatusMessage("Playlist created successfully.");
      setTimeout(() => {
        setShowModal(false);
        setStatusMessage(null);
      }, 1200);
    } catch (error) {
      setStatusMessage(`Create failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handlePublish = async (playlistId: string) => {
    if (selectedDeviceIds.length === 0) {
      setPublishStatus("Open the 'New Playlist' modal and select at least one target device before publishing.");
      return;
    }
    setIsBusy(true);
    setPublishStatus(null);
    try {
      await fetchJson(`/api/content/playlists/${playlistId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_ids: selectedDeviceIds }),
      });
      await loadPlaylists();
      setPublishStatus("Playlist published — SYNC_CONTENT dispatched.");
    } catch (error) {
      setPublishStatus(`Publish failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <>
      <CreateModal
        open={showModal}
        onClose={() => { setShowModal(false); setStatusMessage(null); }}
        media={sortedMedia}
        devices={devices}
        isBusy={isBusy}
        onSubmit={handleCreatePlaylist}
        playlistName={playlistName}
        setPlaylistName={setPlaylistName}
        selectedMediaIds={selectedMediaIds}
        setSelectedMediaIds={setSelectedMediaIds}
        selectedDeviceIds={selectedDeviceIds}
        setSelectedDeviceIds={setSelectedDeviceIds}
        onFileUpload={handleFileUpload}
        statusMessage={statusMessage}
      />

      <div style={{ padding: "32px 36px", minHeight: "100vh", background: "#f4f5f7" }}>
        {/* ── Page Header ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 28,
          gap: 16,
          flexWrap: "wrap",
        }}>
          {/* Left: title */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.5px" }}>
              Playlists
            </h1>
          </div>

          {/* Right: search + button */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute", left: 11, top: "50%",
                transform: "translateY(-50%)",
                color: "#94a3b8", display: "flex", pointerEvents: "none",
              }}>
                <IconSearch />
              </span>
              <input
                type="search"
                placeholder="Search playlists…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  paddingLeft: 36,
                  paddingRight: 14,
                  width: 220,
                  height: 38,
                  border: "1px solid #dde1ea",
                  borderRadius: 9,
                  fontSize: 13.5,
                  background: "#ffffff",
                  outline: "none",
                }}
              />
            </div>

            <Link
              href="/playlists/new"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 38,
                padding: "0 16px",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 9,
                whiteSpace: "nowrap",
                background: "#10b981",
                color: "#ffffff",
                textDecoration: "none",
                border: "none",
              }}
            >
              <IconPlus />
              New Playlist
            </Link>
          </div>
        </div>

        {/* ── Publish status banner ── */}
        {publishStatus && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: publishStatus.includes("failed") || publishStatus.includes("Failed")
              ? "rgba(239,68,68,0.06)" : "rgba(16,185,129,0.06)",
            border: `1px solid ${publishStatus.includes("failed") || publishStatus.includes("Failed")
              ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)"}`,
            borderRadius: 10,
            padding: "10px 16px",
            marginBottom: 20,
            fontSize: 13,
            color: publishStatus.includes("failed") || publishStatus.includes("Failed")
              ? "#dc2626" : "#059669",
          }}>
            <span>{publishStatus}</span>
            <button
              type="button"
              onClick={() => setPublishStatus(null)}
              style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: "inherit", display: "flex" }}
            >
              <IconClose />
            </button>
          </div>
        )}

        {/* ── Filter tabs ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
          <div style={{
            background: "#0f172a",
            color: "#ffffff",
            borderRadius: 999,
            padding: "4px 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            userSelect: "none",
          }}>
            All {realPlaylists.length}
          </div>
        </div>

        {/* ── Playlist list ── */}
        {filteredPlaylists.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "64px 24px",
            border: "2px dashed #e2e8f0",
            borderRadius: 16,
            background: "#fafbfc",
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "rgba(16,185,129,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              color: "#10b981",
            }}>
              <IconPlaylist />
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600, color: "#0f172a" }}>
              {searchQuery ? "No playlists found" : "No playlists yet"}
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b" }}>
              {searchQuery
                ? `No results for "${searchQuery}"`
                : "Create your first playlist and push it to your screens."}
            </p>
            {!searchQuery && (
              <button type="button" onClick={() => setShowModal(true)} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <IconPlus />
                New Playlist
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filteredPlaylists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                onPublish={handlePublish}
                isBusy={isBusy}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
