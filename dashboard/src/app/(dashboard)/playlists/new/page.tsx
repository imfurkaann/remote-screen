"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ─── Types ──────────────────────────────────────────────── */
type MediaFile = {
  id: string;
  filename: string;
  checksum_sha256: string;
  media_url?: string | null;
  mime_type?: string | null;
  created_at?: string;
};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "request_failed");
  return data;
}

/* ─── Icons ──────────────────────────────────────────────── */
function IconArrowLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
function IconTag() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l7.29-7.29a1 1 0 0 0 0-1.41z" />
      <path d="M7 7h.01" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
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
function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
function IconImage() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}
function IconFilm() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2" />
      <path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5" />
    </svg>
  );
}
function IconFile() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

/* ─── Helpers ────────────────────────────────────────────── */
function getFileType(filename: string): "image" | "video" | "file" {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].includes(ext)) return "image";
  if (["mp4", "mov", "avi", "webm", "mkv"].includes(ext)) return "video";
  return "file";
}

function FileTypeIcon({ filename }: { filename: string }) {
  const type = getFileType(filename);
  if (type === "image") return <span style={{ color: "#10b981" }}><IconImage /></span>;
  if (type === "video") return <span style={{ color: "#6366f1" }}><IconFilm /></span>;
  return <span style={{ color: "#94a3b8" }}><IconFile /></span>;
}

function formatName(filename: string, maxLen = 28): string {
  if (filename.length <= maxLen) return filename;
  const ext = filename.includes(".") ? "." + filename.split(".").pop() : "";
  return filename.slice(0, maxLen - 3 - ext.length) + "…" + ext;
}

/* ─── Upload Modal ────────────────────────────────────────── */
function UploadModal({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: (file: MediaFile) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    setProgress(`Uploading ${file.name}…`);
    try {
      const form = new FormData();
      form.append("file", file);
      const payload = await fetchJson<{ media?: MediaFile }>("/api/content/media/upload", {
        method: "POST",
        body: form,
      });
      if (!payload.media) throw new Error("upload_failed");
      setProgress(`✓ ${payload.media.filename} uploaded`);
      setTimeout(() => {
        onUploaded(payload.media!);
        setProgress(null);
        onClose();
      }, 900);
    } catch (e) {
      setError(`Upload failed: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) doUpload(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) doUpload(file);
    e.target.value = "";
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(5px)",
        animation: "fadeIn 0.15s ease",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "#ffffff",
        borderRadius: 18,
        width: "100%",
        maxWidth: 480,
        boxShadow: "0 32px 80px rgba(0,0,0,0.2)",
        overflow: "hidden",
        animation: "slideUp 0.2s ease",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px",
          borderBottom: "1px solid #f1f5f9",
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
              Add Content
            </h3>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#94a3b8" }}>
              Upload an image or video to your library
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#f8fafc", border: "none", borderRadius: 8,
              width: 32, height: 32, display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer", color: "#94a3b8",
            }}
          >
            <IconClose />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "24px" }}>
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? "#10b981" : "#e2e8f0"}`,
              borderRadius: 14,
              padding: "48px 24px",
              textAlign: "center",
              cursor: "pointer",
              transition: "all 0.2s ease",
              background: dragging ? "rgba(16,185,129,0.04)" : "#fafbfc",
            }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: "rgba(16,185,129,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 14px",
              color: "#10b981",
            }}>
              <IconUpload />
            </div>
            <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>
              {dragging ? "Drop to upload" : "Drag & drop your file here"}
            </p>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "#94a3b8" }}>
              or click to browse
            </p>
            <span style={{
              display: "inline-block",
              background: "#f1f5f9",
              borderRadius: 99,
              padding: "4px 14px",
              fontSize: 12,
              color: "#64748b",
              fontWeight: 500,
            }}>
              JPG, PNG, GIF, WEBP, MP4, MOV, WEBM
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              disabled={uploading}
              style={{ display: "none" }}
            />
          </div>

          {/* Progress / error */}
          {progress && (
            <div style={{
              marginTop: 14,
              padding: "10px 14px",
              background: "rgba(16,185,129,0.06)",
              border: "1px solid rgba(16,185,129,0.2)",
              borderRadius: 10,
              fontSize: 13,
              color: "#059669",
              fontWeight: 500,
            }}>
              {progress}
            </div>
          )}
          {error && (
            <div style={{
              marginTop: 14,
              padding: "10px 14px",
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 10,
              fontSize: 13,
              color: "#dc2626",
            }}>
              {error}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(18px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>
  );
}

/* ─── Media Thumb ─────────────────────────────────────────── */
function MediaThumb({ file }: { file: MediaFile }) {
  const type = getFileType(file.filename);
  const [imgError, setImgError] = useState(false);

  // Build proxy URL: /api/content/media/preview?path=/uploads/...
  const previewUrl = file.media_url && !imgError
    ? `/api/content/media/preview?path=${encodeURIComponent(file.media_url)}`
    : null;

  const showThumb = (type === "image" || type === "video") && previewUrl;

  return (
    <div
      title={file.filename}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 9,
        cursor: "pointer",
        transition: "background 0.15s",
        userSelect: "none",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "#f1f5f9")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {/* Thumbnail or icon box */}
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 8,
        overflow: "hidden",
        flexShrink: 0,
        background: type === "image" ? "rgba(16,185,129,0.06)"
          : type === "video" ? "rgba(99,102,241,0.06)" : "#f1f5f9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid #e8edf3",
        position: "relative",
      }}>
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={file.filename}
            onError={() => setImgError(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <FileTypeIcon filename={file.filename} />
        )}
        {/* Video play overlay */}
        {type === "video" && showThumb && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.25)",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}
      </div>

      {/* Name + type */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {formatName(file.filename)}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8", textTransform: "capitalize" }}>
          {type}
        </p>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────── */
export default function NewPlaylistPage() {
  const [playlistName, setPlaylistName] = useState("New Playlist");
  const [editingName, setEditingName] = useState(false);
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [mediaSearch, setMediaSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"recent" | "media">("media");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  /* Load media */
  useEffect(() => {
    fetchJson<{ media?: MediaFile[] }>("/api/content/media", { cache: "no-store" })
      .then((p) => setMedia(p.media ?? []))
      .catch(() => {});
  }, []);

  /* Filter + sort */
  const filteredMedia = media
    .filter((f) =>
      !f.filename.startsWith("Single Media:") &&
      f.filename.toLowerCase().includes(mediaSearch.toLowerCase())
    )
    .sort((a, b) => a.filename.localeCompare(b.filename));

  /* Recent = last 5 by created_at or just first 5 */
  const recentMedia = [...media]
    .sort((a, b) => {
      if (a.created_at && b.created_at) return b.created_at.localeCompare(a.created_at);
      return 0;
    })
    .slice(0, 5);

  const displayedMedia = activeTab === "recent" ? recentMedia : filteredMedia;

  const handleUploadDone = (file: MediaFile) => {
    setMedia((prev) => [file, ...prev]);
  };

  return (
    <>
      <UploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploaded={handleUploadDone}
      />

      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f8fafc" }}>

        {/* ── Top Bar ────────────────────────────────────────── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          height: 60,
          background: "#ffffff",
          borderBottom: "1px solid #e8edf3",
          flexShrink: 0,
          gap: 12,
        }}>
          {/* Left: back + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <Link
              href="/playlists"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 32, height: 32, borderRadius: 8,
                color: "#64748b", background: "#f1f5f9",
                textDecoration: "none", flexShrink: 0,
                transition: "background 0.15s",
              }}
            >
              <IconArrowLeft />
            </Link>

            <div style={{ minWidth: 0 }}>
              {editingName ? (
                <input
                  ref={nameInputRef}
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                  onBlur={() => setEditingName(false)}
                  onKeyDown={(e) => { if (e.key === "Enter") setEditingName(false); }}
                  autoFocus
                  style={{
                    fontSize: 17, fontWeight: 700, color: "#0f172a",
                    border: "none", borderBottom: "2px solid #10b981",
                    outline: "none", background: "transparent",
                    padding: "2px 4px", width: 260,
                  }}
                />
              ) : (
                <h2
                  onClick={() => setEditingName(true)}
                  style={{
                    margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a",
                    cursor: "text", whiteSpace: "nowrap", overflow: "hidden",
                    textOverflow: "ellipsis", maxWidth: 320,
                    padding: "2px 4px", borderRadius: 4,
                    transition: "background 0.15s",
                  }}
                  title="Click to rename"
                >
                  {playlistName}
                </h2>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
                <span style={{ color: "#94a3b8", display: "flex" }}><IconTag /></span>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>add tags</span>
              </div>
            </div>
          </div>

          {/* Right: action buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* Preview - placeholder */}
            <button
              type="button"
              style={{
                background: "#f1f5f9", border: "none", color: "#475569",
                fontWeight: 600, fontSize: 13, padding: "0 16px", height: 36,
                borderRadius: 8, cursor: "pointer",
              }}
            >
              Preview
            </button>
            {/* Publish - placeholder */}
            <button
              type="button"
              style={{
                background: "#10b981", border: "none", color: "#ffffff",
                fontWeight: 700, fontSize: 13, padding: "0 20px", height: 36,
                borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              Publish
            </button>
          </div>
        </div>

        {/* ── Body (main + sidebar) ──────────────────────────── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* ── Main Content Area ────────────────────────────── */}
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "auto",
            padding: "28px 36px",
          }}>
            {/* Duration + Add Content */}
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 32 }}>
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Total Duration
                </p>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" }}>
                  00:00:00
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "#ffffff",
                  border: "1.5px solid #e2e8f0",
                  color: "#334155",
                  fontWeight: 600, fontSize: 14,
                  padding: "0 20px", height: 40,
                  borderRadius: 10, cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  transition: "all 0.15s",
                  marginLeft: 12,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#10b981";
                  (e.currentTarget as HTMLButtonElement).style.color = "#10b981";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#e2e8f0";
                  (e.currentTarget as HTMLButtonElement).style.color = "#334155";
                }}
              >
                <IconPlus />
                Add Content
              </button>
            </div>

            {/* Empty state illustration */}
            <div style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "40px 24px",
            }}>
              {/* SVG illustration */}
              <div style={{ marginBottom: 28, position: "relative" }}>
                {/* Background circle */}
                <div style={{
                  width: 180, height: 180, borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 70%, transparent 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative",
                }}>
                  {/* Floating cards */}
                  <div style={{
                    position: "absolute", top: 20, left: 10,
                    background: "#ffffff", borderRadius: 10,
                    padding: "10px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                    display: "flex", alignItems: "center", gap: 10,
                    width: 130, transform: "rotate(-4deg)",
                  }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M21 2H3v16h5v4l4-4h9V2zm-10 9H8V7h3v4zm5 0h-3V7h3v4z" /></svg>
                    </div>
                    <div>
                      <div style={{ height: 6, width: 60, background: "#e2e8f0", borderRadius: 3, marginBottom: 4 }} />
                      <div style={{ height: 6, width: 40, background: "#f1f5f9", borderRadius: 3 }} />
                    </div>
                  </div>

                  <div style={{
                    position: "absolute", top: 60, right: 0,
                    background: "#ffffff", borderRadius: 10,
                    padding: "10px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                    display: "flex", alignItems: "center", gap: 10,
                    width: 130, transform: "rotate(3deg)",
                  }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: "#1d9bf0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.5-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.2-1.95-.5v.03c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 0 1-1.93.07 4.28 4.28 0 0 0 4 2.98 8.521 8.521 0 0 1-5.33 1.84c-.34 0-.68-.02-1.02-.06C3.44 20.29 5.7 21 8.12 21 16 21 20.33 14.46 20.33 8.79c0-.19 0-.37-.01-.56.84-.6 1.56-1.36 2.14-2.23z" /></svg>
                    </div>
                    <div>
                      <div style={{ height: 6, width: 60, background: "#e2e8f0", borderRadius: 3, marginBottom: 4 }} />
                      <div style={{ height: 6, width: 40, background: "#f1f5f9", borderRadius: 3 }} />
                    </div>
                  </div>

                  <div style={{
                    position: "absolute", bottom: 20, left: 20,
                    background: "#ffffff", borderRadius: 10,
                    padding: "10px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                    display: "flex", alignItems: "center", gap: 10,
                    width: 130, transform: "rotate(-2deg)",
                  }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                    <div>
                      <div style={{ height: 6, width: 60, background: "#e2e8f0", borderRadius: 3, marginBottom: 4 }} />
                      <div style={{ height: 6, width: 40, background: "#f1f5f9", borderRadius: 3 }} />
                    </div>
                  </div>

                  {/* Green dot */}
                  <div style={{
                    position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
                    width: 8, height: 8, borderRadius: "50%",
                    background: "#10b981",
                    boxShadow: "0 0 0 4px rgba(16,185,129,0.2)",
                  }} />
                </div>
              </div>

              <h3 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
                This playlist needs feeding
              </h3>
              <p style={{ margin: "0 0 24px", fontSize: 14, color: "#64748b", maxWidth: 360, lineHeight: 1.6 }}>
                Drag or add content from your library in the right sidebar.
                You can move things up or down in order and change the duration.
              </p>

              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "#10b981", border: "none", color: "#ffffff",
                  fontWeight: 600, fontSize: 14,
                  padding: "0 22px", height: 42,
                  borderRadius: 10, cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(16,185,129,0.3)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#059669";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 16px rgba(16,185,129,0.4)";
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#10b981";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 12px rgba(16,185,129,0.3)";
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                }}
              >
                <IconPlus />
                Add Content
              </button>
            </div>
          </div>

          {/* ── Right Sidebar ─────────────────────────────────── */}
          <div style={{
            width: 300,
            background: "#ffffff",
            borderLeft: "1px solid #e8edf3",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}>
            {/* CONTENT / SETTINGS tabs */}
            <div style={{
              display: "flex",
              borderBottom: "1px solid #e8edf3",
            }}>
              {(["CONTENT", "SETTINGS"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  style={{
                    flex: 1,
                    background: "none",
                    border: "none",
                    borderBottom: tab === "CONTENT" ? "2px solid #10b981" : "2px solid transparent",
                    padding: "14px 0",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.6px",
                    color: tab === "CONTENT" ? "#10b981" : "#94a3b8",
                    cursor: "pointer",
                    transition: "color 0.15s",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ padding: "12px 14px 8px", position: "relative" }}>
              <span style={{
                position: "absolute", left: 26, top: "50%", transform: "translateY(-50%)",
                color: "#94a3b8", display: "flex", pointerEvents: "none",
              }}>
                <IconSearch />
              </span>
              <input
                type="search"
                placeholder="Search content…"
                value={mediaSearch}
                onChange={(e) => setMediaSearch(e.target.value)}
                style={{
                  width: "100%",
                  paddingLeft: 34, paddingRight: 12,
                  height: 34,
                  border: "1px solid #e8edf3",
                  borderRadius: 8,
                  fontSize: 13,
                  background: "#f8fafc",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            {/* Sub-tabs: Recent / Media / Canvas / Apps */}
            <div style={{ display: "flex", gap: 0, padding: "0 14px 10px", borderBottom: "1px solid #f1f5f9" }}>
              {(["recent", "media"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    background: activeTab === tab ? "#f0fdf9" : "none",
                    border: "none",
                    borderRadius: 7,
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: activeTab === tab ? 600 : 500,
                    color: activeTab === tab ? "#10b981" : "#64748b",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
              {/* Canvas & Apps - placeholder */}
              {(["Canvas", "Apps"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  style={{
                    background: "none", border: "none",
                    borderRadius: 7, padding: "6px 14px",
                    fontSize: 13, fontWeight: 500,
                    color: "#94a3b8", cursor: "pointer",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Library heading + upload button */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 14px 6px",
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Library
              </span>
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                title="Upload new media"
                style={{
                  width: 26, height: 26, borderRadius: 6,
                  background: "#f0fdf9", border: "1px solid rgba(16,185,129,0.2)",
                  color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", padding: 0,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(16,185,129,0.15)")}
                onMouseLeave={e => (e.currentTarget.style.background = "#f0fdf9")}
              >
                <IconPlus />
              </button>
            </div>

            {/* Media list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 4px 12px" }}>
              {displayedMedia.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 16px" }}>
                  <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
                    {mediaSearch ? "No results found" : "No media uploaded yet"}
                  </p>
                  {!mediaSearch && (
                    <button
                      type="button"
                      onClick={() => setShowUploadModal(true)}
                      style={{
                        marginTop: 12,
                        background: "none", border: "1px solid #e2e8f0",
                        borderRadius: 8, padding: "6px 14px",
                        fontSize: 12, color: "#64748b", cursor: "pointer",
                        display: "inline-flex", alignItems: "center", gap: 6,
                      }}
                    >
                      <IconPlus />
                      Upload media
                    </button>
                  )}
                </div>
              ) : (
                displayedMedia.map((file) => (
                  <MediaThumb key={file.id} file={file} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
