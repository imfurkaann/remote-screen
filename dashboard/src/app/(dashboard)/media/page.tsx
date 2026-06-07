"use client";

import { useState, useEffect, useMemo, ChangeEvent } from "react";
import Link from "next/link";
import PublishModal from "../../../components/PublishModal";

type MediaItem = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string;
  media_url: string;
  created_at?: string;
};

interface PlaylistRow {
  id: string;
  name: string;
  item_count: number;
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? payload.code ?? "request_failed");
  }
  return payload;
}

/* ─── Premium SVG Icons ────────────────────────────────────── */
function IconUpload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconPlaylistPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="20" y2="12" />
      <line x1="8" y1="18" x2="16" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
      <path d="M19 16v6M16 19h6" />
    </svg>
  );
}

function IconSetToScreen() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function IconViewList() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function IconViewGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ─── Format Bytes Helper ─────────────────────────────────── */
function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/* ─── Map Mime-Type to Kind ───────────────────────────────── */
function getFriendlyKind(mime: string, filename: string): string {
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime === "application/pdf" || filename.endsWith(".pdf")) return "Document";
  if (mime.startsWith("text/") || filename.endsWith(".txt") || filename.endsWith(".doc") || filename.endsWith(".docx")) return "Document";
  return "Binary";
}

/* ─── Format Uploaded At Date ─────────────────────────────── */
function formatUploadedAt(dateStr?: string) {
  if (!dateStr) return "Uploaded on Apr 1, 2026, 12:48 PM by Furkan Çelik";
  try {
    const d = new Date(dateStr);
    const formatted = d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
    return `Uploaded on ${formatted} by Furkan Çelik`;
  } catch {
    return "Uploaded on Apr 1, 2026, 12:48 PM by Furkan Çelik";
  }
}

/* ─── File Thumbnail Helper ───────────────────────────────── */
function FileThumbnail({ item }: { item: MediaItem }) {
  const isImage = item.mime_type.startsWith("image/");
  if (isImage) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={item.media_url}
        alt={item.filename}
        style={{
          width: 44,
          height: 40,
          objectFit: "cover",
          borderRadius: 4,
          border: "1px solid #e2e8f0"
        }}
      />
    );
  }

  const isPdf = item.mime_type === "application/pdf" || item.filename.endsWith(".pdf");
  const isVideo = item.mime_type.startsWith("video/");

  return (
    <div style={{
      width: 44,
      height: 40,
      backgroundColor: isPdf ? "#fee2e2" : isVideo ? "#dbeafe" : "#f1f5f9",
      color: isPdf ? "#ef4444" : isVideo ? "#2563eb" : "#64748b",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 4,
      border: "1px solid #e2e8f0"
    }}>
      {isPdf ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ) : isVideo ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="23 7 16 12 23 17" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      )}
    </div>
  );
}

/* ─── Delete Confirmation Modal ──────────────────────────────── */
interface DeleteConfirmModalProps {
  open: boolean;
  onClose: () => void;
  mediaName: string;
  onConfirm: () => Promise<void>;
  isBusy: boolean;
  errorMessage?: string | null;
}

function DeleteConfirmModal({
  open,
  onClose,
  mediaName,
  onConfirm,
  isBusy,
  errorMessage,
}: DeleteConfirmModalProps) {
  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1050,
      background: "rgba(15, 23, 42, 0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "#ffffff",
        borderRadius: 12,
        width: "100%",
        maxWidth: 420,
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        border: "1px solid #e2e8f0",
      }}>
        <div style={{ padding: "20px 24px" }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
            Delete Media
          </h3>
          <p style={{ margin: "12px 0 0", fontSize: 14, color: "#64748b", lineHeight: "1.5" }}>
            Are you sure you want to delete <strong>"{mediaName}"</strong>? This action cannot be undone.
          </p>

          {errorMessage && (
            <div style={{
              marginTop: 12,
              padding: "10px 12px",
              backgroundColor: "#fef2f2",
              color: "#b91c1c",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 500,
              border: "1px solid #fca5a5"
            }}>
              {errorMessage}
            </div>
          )}
        </div>
        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid #e2e8f0",
          backgroundColor: "#f8fafc",
          display: "flex",
          gap: 12,
          justifyContent: "flex-end",
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            style={{
              backgroundColor: "#ffffff",
              color: "#334155",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            style={{
              backgroundColor: "var(--danger)",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            {isBusy ? "Deleting..." : "Delete Media"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Add to Playlist Modal ─────────────────────────────────── */
interface AddToPlaylistModalProps {
  open: boolean;
  onClose: () => void;
  mediaItem: MediaItem | null;
  playlists: PlaylistRow[];
  onConfirm: (playlistId: string) => Promise<void>;
  isBusy: boolean;
}

function AddToPlaylistModal({
  open,
  onClose,
  mediaItem,
  playlists,
  onConfirm,
  isBusy,
}: AddToPlaylistModalProps) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      setSearch("");
    }
  }, [open]);

  if (!open || !mediaItem) return null;

  const filteredPlaylists = playlists.filter(
    (p) =>
      !p.name.toLowerCase().startsWith("single media:") &&
      p.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1050,
      background: "rgba(15, 23, 42, 0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "#ffffff",
        borderRadius: 12,
        width: "100%",
        maxWidth: 480,
        maxHeight: "80vh",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        border: "1px solid #e2e8f0",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
            Add to Playlist
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              padding: 4,
              cursor: "pointer",
              color: "#94a3b8",
              display: "flex"
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
          <div style={{ position: "relative" }}>
            <div style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
              color: "#94a3b8", display: "flex", alignItems: "center", pointerEvents: "none"
            }}>
              <IconSearch />
            </div>
            <input
              type="text"
              placeholder="Search playlists..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 38px",
                fontSize: "14px",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                boxSizing: "border-box",
                outline: "none"
              }}
            />
          </div>
        </div>

        {/* Playlists List */}
        <div style={{ flexGrow: 1, overflowY: "auto", padding: "12px 24px", minHeight: 180 }}>
          {isBusy ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "40px 0" }}>
              <div className="spinner" />
            </div>
          ) : filteredPlaylists.length === 0 ? (
            <div style={{ textAlign: "center", color: "#64748b", padding: "32px 0", fontSize: 14 }}>
              No playlists found.
            </div>
          ) : (
            filteredPlaylists.map((pl) => (
              <div
                key={pl.id}
                onClick={() => !isBusy && onConfirm(pl.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "1px solid #f1f5f9",
                  marginBottom: "8px",
                  cursor: isBusy ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                  backgroundColor: "#ffffff"
                }}
                className="playlist-item-hover"
              >
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0, paddingRight: 12 }}>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {pl.name}
                  </span>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    {pl.item_count} {pl.item_count === 1 ? "item" : "items"}
                  </span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid #e2e8f0",
          backgroundColor: "#f8fafc",
          display: "flex",
          justifyContent: "flex-end",
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            style={{
              backgroundColor: "#ffffff",
              color: "#334155",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MediaPage() {
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Notifications
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ text: string; ok: boolean } | null>(null);

  // Deletion state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [activeDeleteId, setActiveDeleteId] = useState("");
  const [activeDeleteName, setActiveDeleteName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Add to Playlist state
  const [addToPlaylistOpen, setAddToPlaylistOpen] = useState(false);
  const [activeAddToPlaylistMedia, setActiveAddToPlaylistMedia] = useState<MediaItem | null>(null);

  // Publish to Screen state
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [activePublishId, setActivePublishId] = useState("");
  const [activePublishName, setActivePublishName] = useState("");

  // Layout and Folder states
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [folders, setFolders] = useState<string[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [mediaFolderMap, setMediaFolderMap] = useState<Record<string, string>>({});

  // Modals for Folder management
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [moveMediaItem, setMoveMediaItem] = useState<MediaItem | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [renameFolderTarget, setRenameFolderTarget] = useState<string | null>(null);
  const [renameFolderNewName, setRenameFolderNewName] = useState("");
  const [renameModalOpen, setRenameModalOpen] = useState(false);

  useEffect(() => {
    const savedMode = localStorage.getItem("media_view_mode");
    if (savedMode === "list" || savedMode === "grid") {
      setViewMode(savedMode);
    }
    const savedFolders = localStorage.getItem("media_folders");
    if (savedFolders) {
      setFolders(JSON.parse(savedFolders));
    }
    const savedMap = localStorage.getItem("media_folder_map");
    if (savedMap) {
      setMediaFolderMap(JSON.parse(savedMap));
    }
  }, []);

  const triggerToast = (message: string, type: "success" | "error") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (folders.includes(name)) {
      triggerToast("Folder already exists", "error");
      return;
    }
    const updated = [...folders, name];
    setFolders(updated);
    localStorage.setItem("media_folders", JSON.stringify(updated));
    setNewFolderName("");
    setNewFolderModalOpen(false);
    triggerToast(`Folder "${name}" created`, "success");
  };

  const handleDeleteFolder = (folderName: string) => {
    if (!window.confirm(`Are you sure you want to delete folder "${folderName}"? Content inside will be moved to root.`)) {
      return;
    }
    const updatedFolders = folders.filter((f) => f !== folderName);
    setFolders(updatedFolders);
    localStorage.setItem("media_folders", JSON.stringify(updatedFolders));

    const updatedMap = { ...mediaFolderMap };
    Object.keys(updatedMap).forEach((key) => {
      if (updatedMap[key] === folderName) {
        delete updatedMap[key];
      }
    });
    setMediaFolderMap(updatedMap);
    localStorage.setItem("media_folder_map", JSON.stringify(updatedMap));

    if (currentFolder === folderName) {
      setCurrentFolder(null);
    }
    triggerToast(`Folder "${folderName}" deleted`, "success");
  };

  const handleRenameFolder = () => {
    const oldName = renameFolderTarget;
    const newName = renameFolderNewName.trim();
    if (!oldName || !newName) return;
    if (oldName === newName) {
      setRenameModalOpen(false);
      return;
    }
    if (folders.includes(newName)) {
      triggerToast("Folder with that name already exists", "error");
      return;
    }

    const updatedFolders = folders.map((f) => (f === oldName ? newName : f));
    setFolders(updatedFolders);
    localStorage.setItem("media_folders", JSON.stringify(updatedFolders));

    const updatedMap = { ...mediaFolderMap };
    Object.keys(updatedMap).forEach((key) => {
      if (updatedMap[key] === oldName) {
        updatedMap[key] = newName;
      }
    });
    setMediaFolderMap(updatedMap);
    localStorage.setItem("media_folder_map", JSON.stringify(updatedMap));

    if (currentFolder === oldName) {
      setCurrentFolder(newName);
    }
    setRenameModalOpen(false);
    setRenameFolderTarget(null);
    setRenameFolderNewName("");
    triggerToast("Folder renamed successfully", "success");
  };

  const handleMoveMedia = (folderName: string | null) => {
    if (!moveMediaItem) return;
    const updatedMap = { ...mediaFolderMap };
    if (folderName) {
      updatedMap[moveMediaItem.id] = folderName;
    } else {
      delete updatedMap[moveMediaItem.id];
    }
    setMediaFolderMap(updatedMap);
    localStorage.setItem("media_folder_map", JSON.stringify(updatedMap));
    setMoveModalOpen(false);
    setMoveMediaItem(null);
    triggerToast(`Moved to ${folderName || "Library root"}`, "success");
  };

  const loadMedia = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const payload = await fetchJson<{ media?: MediaItem[] }>("/api/content/media", { cache: "no-store" });
      setMediaList(payload.media ?? []);
    } catch (err) {
      setErrorMsg(`Failed to load media files: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadPlaylists = async () => {
    try {
      const payload = await fetchJson<{ playlists?: PlaylistRow[] }>("/api/content/playlists", { cache: "no-store" });
      setPlaylists(payload.playlists ?? []);
    } catch (err) {
      console.error("Failed to load playlists", err);
    }
  };

  useEffect(() => {
    void loadMedia();
    void loadPlaylists();
  }, []);

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const payload = await fetchJson<{ media?: MediaItem }>("/api/content/media/upload", {
        method: "POST",
        body: formData,
      });

      if (payload.media) {
        setUploadStatus({
          text: `✓ File "${payload.media.filename}" uploaded successfully.`,
          ok: true,
        });
        setMediaList((prev) => [payload.media!, ...prev]);
        
        // Auto-assign to current folder if one is active
        if (currentFolder) {
          const updatedMap = { ...mediaFolderMap, [payload.media.id]: currentFolder };
          setMediaFolderMap(updatedMap);
          localStorage.setItem("media_folder_map", JSON.stringify(updatedMap));
        }

        triggerToast(`Uploaded "${payload.media.filename}" successfully`, "success");
      } else {
        throw new Error("Upload response was empty.");
      }
    } catch (err) {
      setUploadStatus({
        text: `Upload failed: ${(err as Error).message}`,
        ok: false,
      });
      triggerToast(`Upload failed: ${(err as Error).message}`, "error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const openDeleteModal = (id: string, name: string) => {
    setActiveDeleteId(id);
    setActiveDeleteName(name);
    setDeleteConfirmOpen(true);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await fetchJson(`/api/content/media/${activeDeleteId}`, { method: "DELETE" });
      setMediaList((prev) => prev.filter((item) => item.id !== activeDeleteId));
      setDeleteConfirmOpen(false);
      triggerToast("Media deleted successfully", "success");
    } catch (err) {
      setDeleteError((err as Error).message);
      triggerToast(`Delete failed: ${(err as Error).message}`, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  /* Add to Playlist Actions */
  const openAddToPlaylist = (media: MediaItem) => {
    setActiveAddToPlaylistMedia(media);
    setAddToPlaylistOpen(true);
  };

  const handleAddToPlaylistConfirm = async (playlistId: string) => {
    if (!activeAddToPlaylistMedia || !playlistId) return;
    setIsBusy(true);
    try {
      // 1. Fetch the selected playlist details
      const res = await fetchJson<{ playlist?: any }>(`/api/content/playlists/${playlistId}`);
      if (!res.playlist) {
        throw new Error("Playlist not found");
      }

      // 2. Append the media item to the playlist items list
      const existingItems = res.playlist.items ?? [];
      const newPosition = existingItems.length;

      const updatedItems = [
        ...existingItems.map((it: any) => ({
          media_id: it.media_id || it.mediaId,
          duration_ms: it.duration_ms || it.durationMs || 10000,
          position: it.position
        })),
        {
          media_id: activeAddToPlaylistMedia.id,
          duration_ms: 10000,
          position: newPosition
        }
      ];

      // 3. Update the playlist via PUT
      await fetchJson(`/api/content/playlists/${playlistId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: res.playlist.name,
          items: updatedItems
        })
      });

      // 4. Update the local playlists list so that item counts reflect the change
      setPlaylists((prev) =>
        prev.map((pl) =>
          pl.id === playlistId ? { ...pl, item_count: updatedItems.length } : pl
        )
      );

      setAddToPlaylistOpen(false);
      triggerToast(`Successfully added "${activeAddToPlaylistMedia.filename}" to "${res.playlist.name}"`, "success");
    } catch (error) {
      triggerToast(`Failed to add to playlist: ${(error as Error).message}`, "error");
    } finally {
      setIsBusy(false);
    }
  };

  /* Set to Screen Actions (Playback) */
  const handleSetToScreen = async (media: MediaItem) => {
    setIsBusy(true);
    try {
      const targetPlaylistName = `Single Media: ${media.filename}`;
      // Check if wrapper playlist already exists
      const existingPlaylist = playlists.find((p) => p.name === targetPlaylistName);
      let playlistIdToPublish = "";

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
                media_id: media.id,
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
        
        // Load updated playlists list
        await loadPlaylists();
      }

      if (!playlistIdToPublish) {
        throw new Error("Failed to resolve content playlist");
      }

      setActivePublishId(playlistIdToPublish);
      setActivePublishName(media.filename);
      setPublishModalOpen(true);
    } catch (error) {
      triggerToast(`Failed to initiate screen playback: ${(error as Error).message}`, "error");
    } finally {
      setIsBusy(false);
    }
  };

  const handlePublishConfirm = async (selectedDeviceIds: string[]) => {
    if (!activePublishId || selectedDeviceIds.length === 0) return;
    setIsBusy(true);
    try {
      await fetchJson(`/api/content/playlists/${activePublishId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_ids: selectedDeviceIds }),
      });
      setPublishModalOpen(false);
      triggerToast(`Successfully playing content on selected screen(s).`, "success");
    } catch (error) {
      triggerToast(`Publish failed: ${(error as Error).message}`, "error");
    } finally {
      setIsBusy(false);
    }
  };

  const filteredMedia = useMemo(() => {
    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase();
      return mediaList.filter((m) => m.filename.toLowerCase().includes(lower));
    }
    return mediaList.filter((m) => {
      const folder = mediaFolderMap[m.id] || null;
      return folder === currentFolder;
    });
  }, [mediaList, searchQuery, currentFolder, mediaFolderMap]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", backgroundColor: "#f4f5f7" }}>
      
      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: "fixed",
          top: "24px",
          right: "24px",
          backgroundColor: notification.type === "success" ? "#10b981" : "#ef4444",
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
          {notification.type === "success" ? (
            <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
          {notification.message}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        mediaName={activeDeleteName}
        onConfirm={confirmDelete}
        isBusy={isDeleting}
        errorMessage={deleteError}
      />

      {/* Add to Playlist Modal */}
      <AddToPlaylistModal
        open={addToPlaylistOpen}
        onClose={() => setAddToPlaylistOpen(false)}
        mediaItem={activeAddToPlaylistMedia}
        playlists={playlists}
        onConfirm={handleAddToPlaylistConfirm}
        isBusy={isBusy}
      />

      {/* Set to Screen / Publish Modal */}
      <PublishModal
        open={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        playlistId={activePublishId}
        playlistName={activePublishName}
        playlists={playlists}
        onConfirm={handlePublishConfirm}
        isBusy={isBusy}
      />

      {/* Premium Header Layout matching ScreenCloud */}
      <header style={{
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        padding: "16px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "24px"
      }}>
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>
          Media
        </h1>

        {/* Custom Search bar in the center */}
        <div style={{ position: "relative", flexGrow: 1, maxWidth: "580px" }}>
          <div style={{
            position: "absolute",
            left: "14px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "#94a3b8",
            display: "flex",
            alignItems: "center",
            pointerEvents: "none"
          }}>
            <IconSearch />
          </div>
          <input
            type="text"
            placeholder="Search Media"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px 10px 42px",
              fontSize: "14px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              backgroundColor: "#ffffff",
              color: "#0f172a",
              outline: "none"
            }}
          />
        </div>

        {/* Yellow brand Upload Button */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <label
            style={{
              backgroundColor: "#eab308",
              color: "#0f172a",
              fontWeight: 700,
              fontSize: "14px",
              padding: "11px 22px",
              borderRadius: "8px",
              border: "none",
              cursor: uploading ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.15s ease",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              opacity: uploading ? 0.7 : 1
            }}
            className="yellow-upload-btn"
          >
            <IconUpload />
            {uploading ? "Uploading..." : "Upload"}
            <input
              type="file"
              onChange={handleUpload}
              disabled={uploading}
              style={{ display: "none" }}
            />
          </label>
        </div>
      </header>

      {/* Main Body Layout */}
      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: "20px" }}>
        
        {/* Subheader matching screen layout */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #e2e8f0",
          paddingBottom: "12px"
        }}>
          {/* Breadcrumbs Navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span
              onClick={() => setCurrentFolder(null)}
              style={{
                fontSize: "18px",
                fontWeight: currentFolder ? 500 : 700,
                color: currentFolder ? "#ca8a04" : "#0f172a",
                cursor: currentFolder ? "pointer" : "default",
                transition: "color 0.15s ease"
              }}
              className="breadcrumb-root"
            >
              Library
            </span>
            {currentFolder && (
              <>
                <span style={{ color: "#94a3b8", fontSize: "16px" }}>/</span>
                <span style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                  {currentFolder}
                </span>
                <div style={{ display: "flex", gap: "6px", marginLeft: "12px" }}>
                  <button
                    onClick={() => {
                      setRenameFolderTarget(currentFolder);
                      setRenameFolderNewName(currentFolder);
                      setRenameModalOpen(true);
                    }}
                    style={{
                      background: "#f1f5f9",
                      border: "none",
                      borderRadius: "6px",
                      padding: "4px 8px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#475569",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                    className="rename-folder-btn"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleDeleteFolder(currentFolder)}
                    style={{
                      background: "#fee2e2",
                      border: "none",
                      borderRadius: "6px",
                      padding: "4px 8px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#dc2626",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                    className="delete-folder-btn"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {/* New Folder Button */}
            <button
              onClick={() => {
                setNewFolderName("");
                setNewFolderModalOpen(true);
              }}
              style={{
                background: "none",
                border: "none",
                color: "#475569",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                fontWeight: 600,
                padding: "6px 10px",
                borderRadius: "6px"
              }}
              className="subheader-btn"
            >
              <IconFolder />
              <span>New Folder</span>
            </button>

            {/* View layout switches */}
            <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden", backgroundColor: "#ffffff" }}>
              <button
                onClick={() => {
                  setViewMode("list");
                  localStorage.setItem("media_view_mode", "list");
                }}
                style={{
                  background: viewMode === "list" ? "#f1f5f9" : "none",
                  border: "none",
                  padding: "6px 10px",
                  color: viewMode === "list" ? "#ca8a04" : "#64748b",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center"
                }}
                title="List View"
              >
                <IconViewList />
              </button>
              <button
                onClick={() => {
                  setViewMode("grid");
                  localStorage.setItem("media_view_mode", "grid");
                }}
                style={{
                  background: viewMode === "grid" ? "#f1f5f9" : "none",
                  border: "none",
                  padding: "6px 10px",
                  color: viewMode === "grid" ? "#ca8a04" : "#64748b",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center"
                }}
                title="Grid View"
              >
                <IconViewGrid />
              </button>
            </div>
          </div>
        </div>

        {/* Refresh Row & Status message */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <button
            onClick={() => { void loadMedia(); void loadPlaylists(); }}
            disabled={loading}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "#0f172a",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "14px"
            }}
          >
            <IconRefresh />
            <span>Refresh</span>
          </button>

          {uploadStatus && (
            <div style={{
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor: uploadStatus.ok ? "#f0fdf4" : "#fef2f2",
              color: uploadStatus.ok ? "#16a34a" : "#dc2626",
              fontSize: "13px",
              fontWeight: 500,
              border: `1px solid ${uploadStatus.ok ? "#bbf7d0" : "#fca5a5"}`
            }}>
              {uploadStatus.text}
            </div>
          )}
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div style={{
            padding: "16px 20px",
            backgroundColor: "#fef2f2",
            color: "#991b1b",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 500,
            border: "1px solid #fca5a5"
          }}>
            {errorMsg}
          </div>
        )}

        {/* Folders Section - Only show when at root and not searching */}
        {!currentFolder && !searchQuery.trim() && folders.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#64748b" }}>Folders</h3>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "16px"
            }}>
              {folders.map((folderName) => {
                const count = mediaList.filter((m) => mediaFolderMap[m.id] === folderName).length;
                return (
                  <div
                    key={folderName}
                    onClick={() => setCurrentFolder(folderName)}
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "16px",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px"
                    }}
                    className="folder-card"
                  >
                    <div style={{ color: "#eab308", display: "flex", alignItems: "center" }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
                      </svg>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flexGrow: 1 }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {folderName}
                      </span>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        {count} {count === 1 ? "item" : "items"}
                      </span>
                    </div>
                    
                    {/* Hover Folder Controls */}
                    <div
                      style={{ display: "flex", gap: "2px" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          setRenameFolderTarget(folderName);
                          setRenameFolderNewName(folderName);
                          setRenameModalOpen(true);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "#94a3b8",
                          padding: "4px",
                          borderRadius: "4px"
                        }}
                        className="folder-action-btn"
                        title="Rename Folder"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteFolder(folderName)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "#94a3b8",
                          padding: "4px",
                          borderRadius: "4px"
                        }}
                        className="folder-action-btn-danger"
                        title="Delete Folder"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <div className="spinner" />
          </div>
        ) : filteredMedia.length === 0 ? (
          <div style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "80px 32px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
          }}>
            <div style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: "#f1f5f9",
              color: "#94a3b8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <IconFolder />
            </div>
            <h3 style={{ margin: 0, fontSize: 18, color: "#0f172a", fontWeight: 700 }}>
              {searchQuery.trim() 
                ? "No matching files" 
                : currentFolder 
                  ? "This folder is empty" 
                  : "Your Media Library is empty"}
            </h3>
            <p style={{ margin: 0, fontSize: 14, color: "#64748b", maxWidth: "360px", lineHeight: "1.5" }}>
              {searchQuery.trim() 
                ? "We couldn't find any media files matching your search term."
                : currentFolder 
                  ? "Upload files or move items here to organize your library."
                  : "Upload images or video files to display them in playlists across your screens."}
            </p>
          </div>
        ) : (
          /* Files Rendering */
          viewMode === "grid" ? (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "20px"
            }}>
              {filteredMedia.map((media) => {
                const isImage = media.mime_type.startsWith("image/");
                const friendlyKind = getFriendlyKind(media.mime_type, media.filename);
                const fileFolder = mediaFolderMap[media.id] || null;

                return (
                  <div
                    key={media.id}
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      overflow: "hidden",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      display: "flex",
                      flexDirection: "column",
                      transition: "transform 0.15s ease, box-shadow 0.15s ease"
                    }}
                    className="grid-card"
                  >
                    {/* Media Preview Area */}
                    <div style={{
                      height: "150px",
                      backgroundColor: "#f8fafc",
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderBottom: "1px solid #e2e8f0",
                      overflow: "hidden"
                    }}>
                      {isImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={media.media_url}
                          alt={media.filename}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover"
                          }}
                        />
                      ) : (
                        <div style={{ color: "#94a3b8" }}>
                          {media.mime_type === "application/pdf" || media.filename.endsWith(".pdf") ? (
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                            </svg>
                          ) : media.mime_type.startsWith("video/") ? (
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <polygon points="23 7 16 12 23 17" />
                              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                            </svg>
                          ) : (
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                          )}
                        </div>
                      )}

                      {/* Folder Location badge during search */}
                      {searchQuery.trim() && (
                        <span style={{
                          position: "absolute",
                          top: "10px",
                          left: "10px",
                          backgroundColor: "rgba(15, 23, 42, 0.75)",
                          color: "#ffffff",
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: "4px",
                          backdropFilter: "blur(4px)"
                        }}>
                          {fileFolder ? `Folder: ${fileFolder}` : "Root"}
                        </span>
                      )}
                    </div>

                    {/* Metadata & Actions */}
                    <div style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px", flexGrow: 1 }}>
                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: "14px",
                            fontWeight: 700,
                            color: "#0f172a",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                          }}
                          title={media.filename}
                        >
                          {media.filename}
                        </span>
                        <span style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                          {formatBytes(media.size_bytes)} • {friendlyKind}
                        </span>
                      </div>

                      <div style={{
                        marginTop: "auto",
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "6px"
                      }}>
                        <button
                          onClick={() => openAddToPlaylist(media)}
                          style={{
                            backgroundColor: "#f0fdf4",
                            color: "#16a34a",
                            border: "1px solid #bbf7d0",
                            borderRadius: "6px",
                            padding: "6px 4px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px"
                          }}
                          className="btn-action-add"
                        >
                          <IconPlaylistPlus />
                          <span>Playlist</span>
                        </button>

                        <button
                          onClick={() => handleSetToScreen(media)}
                          style={{
                            backgroundColor: "#eff6ff",
                            color: "#1d4ed8",
                            border: "1px solid #bfdbfe",
                            borderRadius: "6px",
                            padding: "6px 4px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px"
                          }}
                          className="btn-action-set"
                        >
                          <IconSetToScreen />
                          <span>Play</span>
                        </button>

                        <button
                          onClick={() => {
                            setMoveMediaItem(media);
                            setMoveModalOpen(true);
                          }}
                          style={{
                            backgroundColor: "#f8fafc",
                            color: "#475569",
                            border: "1px solid #e2e8f0",
                            borderRadius: "6px",
                            padding: "6px 4px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px"
                          }}
                          className="btn-action-move"
                        >
                          <IconFolder />
                          <span>Move</span>
                        </button>

                        <button
                          onClick={() => openDeleteModal(media.id, media.filename)}
                          style={{
                            backgroundColor: "#fef2f2",
                            color: "#dc2626",
                            border: "1px solid #fca5a5",
                            borderRadius: "6px",
                            padding: "6px 4px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px"
                          }}
                          className="btn-action-remove"
                        >
                          <IconTrash />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Premium Table List View */
            <div style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
                    <th style={{ padding: "14px 20px", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Recent <span style={{ fontSize: "9px", marginLeft: "4px" }}>▼</span>
                    </th>
                    <th style={{ padding: "14px 20px", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Kind
                    </th>
                    <th style={{ padding: "14px 20px", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Size
                    </th>
                    <th style={{ padding: "14px 20px", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMedia.map((media) => {
                    const friendlyKind = getFriendlyKind(media.mime_type, media.filename);
                    const fileFolder = mediaFolderMap[media.id] || null;

                    return (
                      <tr
                        key={media.id}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          transition: "background-color 0.15s ease"
                        }}
                        className="table-row-hover"
                      >
                        {/* RECENT */}
                        <td style={{ padding: "12px 20px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                            <FileThumbnail item={media} />
                            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                              <span
                                style={{
                                  fontSize: "14px",
                                  fontWeight: 700,
                                  color: "#0f172a",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis"
                                }}
                                title={media.filename}
                              >
                                {media.filename}
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "2px" }}>
                                <span style={{ fontSize: "11px", color: "#64748b" }}>
                                  {formatUploadedAt(media.created_at)}
                                </span>
                                {searchQuery.trim() && (
                                  <span style={{
                                    backgroundColor: "#f1f5f9",
                                    color: "#ca8a04",
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    padding: "1px 6px",
                                    borderRadius: "4px",
                                    border: "1px solid #fef08a",
                                  }}>
                                    Folder: {fileFolder || "Root"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* KIND */}
                        <td style={{ padding: "12px 20px", fontSize: "13px", color: "#475569", fontWeight: 500 }}>
                          {friendlyKind}
                        </td>

                        {/* SIZE */}
                        <td style={{ padding: "12px 20px", fontSize: "13px", color: "#475569", fontWeight: 500 }}>
                          {formatBytes(media.size_bytes)}
                        </td>

                        {/* ACTIONS */}
                        <td style={{ padding: "12px 20px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "8px", alignItems: "center", justifyContent: "flex-end" }}>
                            
                            {/* Move folder */}
                            <button
                              onClick={() => {
                                setMoveMediaItem(media);
                                setMoveModalOpen(true);
                              }}
                              style={{
                                backgroundColor: "#f8fafc",
                                color: "#475569",
                                border: "1px solid #cbd5e1",
                                borderRadius: "6px",
                                padding: "6px 12px",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                transition: "all 0.15s ease"
                              }}
                              className="btn-action-move"
                              title="Move Folder"
                            >
                              <IconFolder />
                              <span>Move</span>
                            </button>

                            {/* Add to Playlist button */}
                            <button
                              onClick={() => openAddToPlaylist(media)}
                              style={{
                                backgroundColor: "#f0fdf4",
                                color: "#16a34a",
                                border: "1px solid #bbf7d0",
                                borderRadius: "6px",
                                padding: "6px 12px",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                transition: "all 0.15s ease"
                              }}
                              className="btn-action-add"
                              title="Add to Playlist"
                            >
                              <IconPlaylistPlus />
                              <span>Add to Playlist</span>
                            </button>

                            {/* Set to Screen button */}
                            <button
                              onClick={() => handleSetToScreen(media)}
                              style={{
                                backgroundColor: "#eff6ff",
                                color: "#1d4ed8",
                                border: "1px solid #bfdbfe",
                                borderRadius: "6px",
                                padding: "6px 12px",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                transition: "all 0.15s ease"
                              }}
                              className="btn-action-set"
                              title="Set to Screen"
                            >
                              <IconSetToScreen />
                              <span>Set to Screen</span>
                            </button>

                            {/* Remove button */}
                            <button
                              onClick={() => openDeleteModal(media.id, media.filename)}
                              style={{
                                backgroundColor: "#fef2f2",
                                color: "#dc2626",
                                border: "1px solid #fca5a5",
                                borderRadius: "6px",
                                padding: "6px 12px",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                transition: "all 0.15s ease"
                              }}
                              className="btn-action-remove"
                              title="Remove Media"
                            >
                              <IconTrash />
                              <span>Remove</span>
                            </button>

                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* CREATE FOLDER MODAL */}
      {newFolderModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1050,
          background: "rgba(15, 23, 42, 0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: 12,
            width: "100%",
            maxWidth: 400,
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            border: "1px solid #e2e8f0",
          }}>
            <div style={{ padding: "20px 24px" }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
                Create New Folder
              </h3>
              <input
                type="text"
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                }}
                autoFocus
                style={{
                  width: "100%",
                  marginTop: 16,
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                  outline: "none"
                }}
              />
            </div>
            <div style={{
              padding: "16px 24px",
              borderTop: "1px solid #e2e8f0",
              backgroundColor: "#f8fafc",
              display: "flex",
              gap: 12,
              justifyContent: "flex-end",
            }}>
              <button
                type="button"
                onClick={() => setNewFolderModalOpen(false)}
                style={{
                  backgroundColor: "#ffffff",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateFolder}
                style={{
                  backgroundColor: "#eab308",
                  color: "#0f172a",
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENAME FOLDER MODAL */}
      {renameModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1050,
          background: "rgba(15, 23, 42, 0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: 12,
            width: "100%",
            maxWidth: 400,
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            border: "1px solid #e2e8f0",
          }}>
            <div style={{ padding: "20px 24px" }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
                Rename Folder
              </h3>
              <input
                type="text"
                placeholder="Folder name..."
                value={renameFolderNewName}
                onChange={(e) => setRenameFolderNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameFolder();
                }}
                autoFocus
                style={{
                  width: "100%",
                  marginTop: 16,
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                  outline: "none"
                }}
              />
            </div>
            <div style={{
              padding: "16px 24px",
              borderTop: "1px solid #e2e8f0",
              backgroundColor: "#f8fafc",
              display: "flex",
              gap: 12,
              justifyContent: "flex-end",
            }}>
              <button
                type="button"
                onClick={() => {
                  setRenameModalOpen(false);
                  setRenameFolderTarget(null);
                }}
                style={{
                  backgroundColor: "#ffffff",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRenameFolder}
                style={{
                  backgroundColor: "#eab308",
                  color: "#0f172a",
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MOVE MEDIA MODAL */}
      {moveModalOpen && moveMediaItem && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1050,
          background: "rgba(15, 23, 42, 0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: 12,
            width: "100%",
            maxWidth: 440,
            maxHeight: "80vh",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            border: "1px solid #e2e8f0",
          }}>
            <div style={{
              padding: "20px 24px",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
                Move to Folder
              </h3>
              <button
                type="button"
                onClick={() => setMoveModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 4,
                  cursor: "pointer",
                  color: "#94a3b8",
                  display: "flex"
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            
            <div style={{ padding: "12px 24px", color: "#64748b", fontSize: "13px" }}>
              Move <strong>{moveMediaItem.filename}</strong> to:
            </div>

            <div style={{ flexGrow: 1, overflowY: "auto", padding: "12px 24px", minHeight: 180, display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Root option */}
              <div
                onClick={() => handleMoveMedia(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  backgroundColor: !(mediaFolderMap[moveMediaItem.id]) ? "#fefcbf" : "#ffffff",
                  borderColor: !(mediaFolderMap[moveMediaItem.id]) ? "#fef08a" : "#e2e8f0",
                }}
                className="playlist-item-hover"
              >
                <span style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
                  [Library Root]
                </span>
                {!(mediaFolderMap[moveMediaItem.id]) && <IconCheck />}
              </div>

              {/* Folder list */}
              {folders.map((folderName) => (
                <div
                  key={folderName}
                  onClick={() => handleMoveMedia(folderName)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    backgroundColor: mediaFolderMap[moveMediaItem.id] === folderName ? "#fefcbf" : "#ffffff",
                    borderColor: mediaFolderMap[moveMediaItem.id] === folderName ? "#fef08a" : "#e2e8f0",
                  }}
                  className="playlist-item-hover"
                >
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
                    {folderName}
                  </span>
                  {mediaFolderMap[moveMediaItem.id] === folderName && <IconCheck />}
                </div>
              ))}
            </div>

            <div style={{
              padding: "16px 24px",
              borderTop: "1px solid #e2e8f0",
              backgroundColor: "#f8fafc",
              display: "flex",
              justifyContent: "flex-end",
            }}>
              <button
                type="button"
                onClick={() => setMoveModalOpen(false)}
                style={{
                  backgroundColor: "#ffffff",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(37, 99, 235, 0.1);
          border-top-color: #eab308;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .yellow-upload-btn:hover {
          background-color: #ca8a04 !important;
        }
        .subheader-btn:hover {
          background-color: #f1f5f9 !important;
          color: #0f172a !important;
        }
        .table-row-hover:hover {
          background-color: #fafbfd !important;
        }
        .btn-action-add:hover {
          background-color: #dcfce7 !important;
          border-color: #86efac !important;
        }
        .btn-action-set:hover {
          background-color: #dbeafe !important;
          border-color: #93c5fd !important;
        }
        .btn-action-remove:hover {
          background-color: #fee2e2 !important;
          border-color: #fca5a5 !important;
        }
        .playlist-item-hover:hover {
          background-color: #f8fafc !important;
          border-color: #cbd5e1 !important;
        }
        .breadcrumb-root:hover {
          color: #eab308 !important;
        }
        .folder-card:hover {
          border-color: #eab308 !important;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
        }
        .folder-card .folder-action-btn,
        .folder-card .folder-action-btn-danger {
          opacity: 0;
          transition: opacity 0.15s ease;
        }
        .folder-card:hover .folder-action-btn,
        .folder-card:hover .folder-action-btn-danger {
          opacity: 1;
        }
        .folder-action-btn:hover {
          background-color: #f1f5f9 !important;
          color: #ca8a04 !important;
        }
        .folder-action-btn-danger:hover {
          background-color: #fee2e2 !important;
          color: #dc2626 !important;
        }
        .grid-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
        }
        .btn-action-move:hover {
          background-color: #f1f5f9 !important;
          border-color: #cbd5e1 !important;
        }
      `}</style>
    </div>
  );
}
