"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/* ─── Types ──────────────────────────────────────────────── */
type MediaFile = {
  id: string;
  filename: string;
  checksum_sha256: string;
  media_url?: string | null;
  mime_type?: string | null;
};

type PlaylistItem = {
  uid: string; // unique key for react + drag
  media: MediaFile;
  durationMs: number;
};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "request_failed");
  return data;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

function getFileType(filename: string): "image" | "video" | "file" {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].includes(ext)) return "image";
  if (["mp4", "mov", "avi", "webm", "mkv"].includes(ext)) return "video";
  return "file";
}

function fmtDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600).toString().padStart(2, "0");
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function previewUrl(mediaUrl: string | null | undefined) {
  if (!mediaUrl) return null;
  return `/api/content/media/preview?path=${encodeURIComponent(mediaUrl)}`;
}

function trimName(name: string, max = 26) {
  if (name.length <= max) return name;
  const ext = name.includes(".") ? "." + name.split(".").pop() : "";
  return name.slice(0, max - 1 - ext.length) + "…" + ext;
}

/* ─── Icons ──────────────────────────────────────────────── */
const IconArrowLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
);
const IconTag = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l7.29-7.29a1 1 0 0 0 0-1.41z" /><path d="M7 7h.01" />
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IconClose = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
);
const IconUpload = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);
const IconGrip = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="5" r="1" fill="currentColor" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="19" r="1" fill="currentColor" />
    <circle cx="15" cy="5" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="19" r="1" fill="currentColor" />
  </svg>
);
const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
  </svg>
);
const IconImage = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
  </svg>
);
const IconFilm = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2" /><path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5" />
  </svg>
);
const IconFile = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
  </svg>
);

function FileTypeIcon({ filename }: { filename: string }) {
  const t = getFileType(filename);
  return t === "image" ? <span style={{ color: "#10b981" }}><IconImage /></span>
    : t === "video" ? <span style={{ color: "#6366f1" }}><IconFilm /></span>
      : <span style={{ color: "#94a3b8" }}><IconFile /></span>;
}

/* ─── Thumbnail ──────────────────────────────────────────── */
function Thumb({ file, size = 44 }: { file: MediaFile; size?: number }) {
  const [err, setErr] = useState(false);
  const type = getFileType(file.filename);
  const url = previewUrl(file.media_url);
  const showImg = (type === "image" || type === "video") && url && !err;
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, overflow: "hidden", flexShrink: 0,
      border: "1px solid #e8edf3", background: "#f8fafc",
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative",
    }}>
      {showImg
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt={file.filename} onError={() => setErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : <FileTypeIcon filename={file.filename} />}
      {type === "video" && showImg && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.28)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
        </div>
      )}
    </div>
  );
}

/* ─── Add Content Modal ──────────────────────────────────── */
function AddContentModal({
  open, onClose, allMedia, onAddMedia, onNewUpload, playlistName,
}: {
  open: boolean;
  onClose: () => void;
  allMedia: MediaFile[];
  onAddMedia: (files: MediaFile[]) => void;
  onNewUpload: (file: MediaFile) => void;
  playlistName: string;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const filtered = allMedia.filter(f =>
    f.filename.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleAdd = () => {
    const toAdd = allMedia.filter(f => selected.has(f.id));
    onAddMedia(toAdd);
    setSelected(new Set());
    onClose();
  };

  const doUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const payload = await fetchJson<{ media?: MediaFile }>("/api/content/media/upload", { method: "POST", body: form });
      if (!payload.media) throw new Error("upload_failed");
      setUploadMsg({ text: `✓ "${payload.media.filename}" uploaded successfully`, ok: true });
      onNewUpload(payload.media);
      // automatically select the uploaded file
      setSelected(prev => new Set([...prev, payload.media!.id]));
    } catch (e) {
      setUploadMsg({ text: `Error: ${(e as Error).message}`, ok: false });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000,
      backgroundColor: "rgba(15, 23, 42, 0.45)",
      backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}
      onClick={e => e.target === e.currentTarget && onClose()}>
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
        flexDirection: "column",
        animation: "fadeIn 0.15s ease",
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
            Set content to {playlistName || "Unnamed Playlist"}
          </h3>
          <button
            onClick={onClose}
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
            <IconClose />
          </button>
        </div>

        {/* Modal search header bar */}
        <div style={{
          padding: "12px 24px",
          backgroundColor: "#f8fafc",
          borderBottom: "1px solid #e2e8f0"
        }}>
          <div style={{ position: "relative", width: "100%" }}>
            <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", display: "flex", pointerEvents: "none" }}>
              <IconSearch />
            </span>
            <input
              type="text"
              placeholder="Search Media Items"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 36px",
                fontSize: "14px",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                boxSizing: "border-box",
                outline: "none"
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
            
            {/* Media Button */}
            <button
              type="button"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 12px",
                width: "100%",
                textAlign: "left",
                border: "none",
                borderRadius: "6px",
                cursor: "default",
                fontSize: "13px",
                fontWeight: 600,
                backgroundColor: "#10b981",
                color: "#ffffff"
              }}
            >
              <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Media</span>
            </button>
          </div>

          {/* Right selection list inside modal */}
          <div style={{ flexGrow: 1, padding: "16px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
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
                onChange={doUpload}
                disabled={uploading}
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
                  cursor: uploading ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {uploading ? "Uploading File..." : "Select File to Upload"}
              </label>
              {uploadMsg && (
                <div style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: uploadMsg.ok ? "#10b981" : "#ef4444"
                }}>
                  {uploadMsg.text}
                </div>
              )}
            </div>

            <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Available Media</div>

            {filtered.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: "#64748b" }}>
                <p>No media files uploaded yet.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {filtered.map((m) => {
                  const sel = selected.has(m.id);
                  const type = getFileType(m.filename);
                  return (
                    <div
                      key={m.id}
                      onClick={() => toggle(m.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 16px",
                        border: sel ? "2.5px solid #10b981" : "1px solid #cbd5e1",
                        borderRadius: "8px",
                        backgroundColor: sel ? "rgba(16, 185, 129, 0.04)" : "#ffffff",
                        cursor: "pointer"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <Thumb file={m} size={36} />
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{m.filename}</div>
                          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "capitalize" }}>{type}</div>
                        </div>
                      </div>
                      
                      {/* Checkbox */}
                      <div style={{
                        width: 20, height: 20, borderRadius: 6, border: sel ? "none" : "1.5px solid #cbd5e1",
                        background: sel ? "#10b981" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s",
                      }}>
                        {sel && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                      </div>
                    </div>
                  );
                })}
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
              Content will be added to playlist.
            </span>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              type="button"
              onClick={onClose}
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
              onClick={handleAdd}
              disabled={selected.size === 0}
              style={{
                backgroundColor: selected.size > 0 ? "#10b981" : "#e2e8f0",
                color: selected.size > 0 ? "#ffffff" : "#94a3b8",
                border: "none",
                borderRadius: "6px",
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: selected.size > 0 ? "pointer" : "not-allowed"
              }}
            >
              Confirm {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
    </div>
  );
}

/* ─── Sidebar Media Item ─────────────────────────────────── */
function SidebarItem({ file, onAdd }: { file: MediaFile; onAdd: (f: MediaFile) => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9, cursor: "pointer", transition: "background 0.15s", position: "relative", background: hover ? "#f1f5f9" : "transparent" }}
    >
      {/* Thumb with + overlay */}
      <div style={{ position: "relative", flexShrink: 0 }} onClick={() => onAdd(file)}>
        <Thumb file={file} size={44} />
        {hover && (
          <div style={{
            position: "absolute", inset: 0, borderRadius: 8,
            background: "rgba(16,185,129,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "opacity 0.15s",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }} onClick={() => onAdd(file)}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{trimName(file.filename)}</p>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8", textTransform: "capitalize" }}>{getFileType(file.filename)}</p>
      </div>
    </div>
  );
}

/* ─── Playlist Item Row ──────────────────────────────────── */
function PlaylistItemRow({
  item, index, total,
  onRemove, onDurationChange,
  onDragStart, onDragOver, onDrop,
}: {
  item: PlaylistItem;
  index: number;
  total: number;
  onRemove: (uid: string) => void;
  onDurationChange: (uid: string, ms: number) => void;
  onDragStart: (i: number) => void;
  onDragOver: (i: number) => void;
  onDrop: () => void;
}) {
  const [hover, setHover] = useState(false);
  const type = getFileType(item.media.filename);
  const secs = item.durationMs / 1000;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={e => { e.preventDefault(); onDragOver(index); }}
      onDrop={onDrop}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px",
        background: "#fff",
        border: "1px solid #e8edf3",
        borderRadius: 12,
        marginBottom: 8,
        cursor: "grab",
        transition: "box-shadow 0.15s, border-color 0.15s",
        boxShadow: hover ? "0 2px 12px rgba(0,0,0,0.07)" : "none",
        borderColor: hover ? "#cbd5e1" : "#e8edf3",
      }}
    >
      {/* Drag handle */}
      <div style={{ color: "#cbd5e1", cursor: "grab", flexShrink: 0 }}>
        <IconGrip />
      </div>

      {/* Index */}
      <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", width: 18, textAlign: "center", flexShrink: 0 }}>{index + 1}</span>

      {/* Thumbnail */}
      <Thumb file={item.media} size={48} />

      {/* Name + type */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.media.filename}
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8", textTransform: "capitalize" }}>
          {type}
        </p>
      </div>

      {/* Duration */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", background: "#f8fafc" }}>
          <button onClick={() => onDurationChange(item.uid, Math.max(1000, item.durationMs - 5000))}
            style={{ background: "none", border: "none", padding: "4px 8px", cursor: "pointer", color: "#64748b", fontSize: 15 }}>-</button>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", minWidth: 36, textAlign: "center" }}>{secs}s</span>
          <button onClick={() => onDurationChange(item.uid, item.durationMs + 5000)}
            style={{ background: "none", border: "none", padding: "4px 8px", cursor: "pointer", color: "#64748b", fontSize: 15 }}>+</button>
        </div>
        <span style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{fmtDuration(item.durationMs)}</span>
      </div>

      {/* Remove */}
      <button onClick={() => onRemove(item.uid)} style={{
        background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 7,
        color: hover ? "#ef4444" : "#cbd5e1", transition: "color 0.15s, background 0.15s",
        display: "flex", alignItems: "center",
      }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
        <IconTrash />
      </button>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────── */
export default function NewPlaylistPage() {
  const router = useRouter();
  const [playlistName, setPlaylistName] = useState("New Playlist");
  const [editingName, setEditingName] = useState(false);
  const [allMedia, setAllMedia] = useState<MediaFile[]>([]);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [mediaSearch, setMediaSearch] = useState("");
  const [mediaPage, setMediaPage] = useState(1);
  const [mediaTotalPages, setMediaTotalPages] = useState(1);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"recent" | "media">("media");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const creationRequestId = useRef(crypto.randomUUID());
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const dragFrom = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  /* Load only the visible media page; server-side search keeps large libraries responsive. */
  useEffect(() => {
    setMediaPage(1);
  }, [mediaSearch]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setMediaLoading(true);
      try {
        const query = new URLSearchParams({ page: String(mediaPage), limit: "50" });
        if (mediaSearch.trim()) query.set("search", mediaSearch.trim());
        const payload = await fetchJson<{ media?: MediaFile[]; totalPages?: number }>(
          `/api/content/media?${query.toString()}`,
          { cache: "no-store", signal: controller.signal }
        );
        setAllMedia(payload.media ?? []);
        setMediaTotalPages(payload.totalPages ?? 1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setSaveMsg({ text: "Medya listesi yüklenemedi.", ok: false });
      } finally {
        if (!controller.signal.aborted) setMediaLoading(false);
      }
    }, mediaSearch.trim() ? 250 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mediaPage, mediaSearch]);

  const filteredMedia = allMedia.filter(f => !f.filename.startsWith("Single Media:"));
  const recentMedia = filteredMedia.slice(0, 8);
  const displayedMedia = sidebarTab === "recent" ? recentMedia : filteredMedia;

  /* add single item */
  const addMedia = useCallback((file: MediaFile) => {
    setItems(prev => [...prev, { uid: uid(), media: file, durationMs: 10_000 }]);
  }, []);

  /* add multiple */
  const addMultiple = useCallback((files: MediaFile[]) => {
    setItems(prev => [...prev, ...files.map(f => ({ uid: uid(), media: f, durationMs: 10_000 }))]);
  }, []);

  const removeItem = (u: string) => setItems(prev => prev.filter(i => i.uid !== u));

  const changeDuration = (u: string, ms: number) =>
    setItems(prev => prev.map(i => i.uid === u ? { ...i, durationMs: ms } : i));

  /* drag reorder */
  const handleDragStart = (i: number) => { dragFrom.current = i; };
  const handleDragOver = (i: number) => { dragOver.current = i; };
  const handleDrop = () => {
    if (dragFrom.current === null || dragOver.current === null) return;
    if (dragFrom.current === dragOver.current) return;
    setItems(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragFrom.current!, 1);
      if (moved) {
        next.splice(dragOver.current!, 0, moved);
      }
      dragFrom.current = null;
      dragOver.current = null;
      return next;
    });
  };

  /* new upload from modal */
  const handleNewUpload = (file: MediaFile) => {
    setAllMedia(prev => [file, ...prev]);
  };

  /* total duration */
  const totalMs = items.reduce((acc, i) => acc + i.durationMs, 0);

  /* save */
  const handleSave = async () => {
    if (!playlistName.trim() || items.length === 0) {
      setSaveMsg({ text: "Playlist adı ve en az bir medya gerekli.", ok: false });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      await fetchJson("/api/content/playlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: playlistName.trim(),
          items: items.map((item, idx) => ({
            media_id: item.media.id,
            duration_ms: item.durationMs,
            position: idx,
          })),
        }),
      });
      setSaveMsg({ text: "Playlist kaydedildi!", ok: true });
      setTimeout(() => router.push("/playlists"), 900);
    } catch (e) {
      setSaveMsg({ text: `Hata: ${(e as Error).message}`, ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AddContentModal
        open={showModal}
        onClose={() => setShowModal(false)}
        allMedia={allMedia.filter(f => !f.filename.startsWith("Single Media:"))}
        onAddMedia={addMultiple}
        onNewUpload={handleNewUpload}
        playlistName={playlistName}
      />

      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f4f5f7" }}>

        {/* ── Top Bar ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 58, background: "#fff", borderBottom: "1px solid #e8edf3", flexShrink: 0, gap: 12 }}>
          {/* Left */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Link href="/playlists" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, color: "#64748b", background: "#f1f5f9", textDecoration: "none", flexShrink: 0 }}>
              <IconArrowLeft />
            </Link>
            <div style={{ minWidth: 0 }}>
              {editingName ? (
                <input value={playlistName} onChange={e => setPlaylistName(e.target.value)}
                  onBlur={() => setEditingName(false)}
                  onKeyDown={e => { if (e.key === "Enter") setEditingName(false); }}
                  autoFocus
                  style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", border: "none", borderBottom: "2px solid #10b981", outline: "none", background: "transparent", padding: "2px 4px", width: 240 }} />
              ) : (
                <h2 onClick={() => setEditingName(true)} title="Yeniden adlandır için tıkla"
                  style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a", cursor: "text", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280 }}>
                  {playlistName}
                </h2>
              )}

            </div>
          </div>

          {/* Right */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {saveMsg && (
              <span style={{ fontSize: 12, fontWeight: 500, color: saveMsg.ok ? "#059669" : "#dc2626" }}>{saveMsg.text}</span>
            )}
            <button onClick={() => setShowModal(true)} style={{
              display: "flex", alignItems: "center", gap: 7, background: "#fff",
              border: "1.5px solid #e2e8f0", color: "#334155", fontWeight: 600, fontSize: 13,
              padding: "0 14px", height: 36, borderRadius: 8, cursor: "pointer",
              transition: "border-color 0.15s, color 0.15s",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#10b981"; (e.currentTarget as HTMLButtonElement).style.color = "#10b981"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e2e8f0"; (e.currentTarget as HTMLButtonElement).style.color = "#334155"; }}>
              <IconPlus />
              Add Content
            </button>
            <button onClick={handleSave} disabled={saving} style={{
              background: saving ? "#6ee7b7" : "#10b981", border: "none", color: "#fff",
              fontWeight: 700, fontSize: 13, padding: "0 20px", height: 36,
              borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", transition: "background 0.15s",
            }}>
              {saving ? "Kaydediliyor…" : "Save"}
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* ── Main Content ── */}
          <div style={{ flex: 1, overflow: "auto", padding: "28px 36px" }}>
            {/* Duration */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Duration</p>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" }}>{fmtDuration(totalMs)}</p>
            </div>

            {/* Playlist items or empty state */}
            {items.length === 0 ? (
              <div style={{ textAlign: "center", padding: "64px 24px", border: "2px dashed #e2e8f0", borderRadius: 16, background: "#fff" }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(16,185,129,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "#10b981" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M3 12h12M3 18h9" /><circle cx="19" cy="16" r="3" /><path d="M22 10v6" />
                  </svg>
                </div>
                <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>This playlist needs feeding</h3>
                <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748b", lineHeight: 1.6, maxWidth: 320, marginInline: "auto" }}>
                  Drag or add content from your library in the right sidebar. You can move things up or down in order.
                </p>
                <button onClick={() => setShowModal(true)} style={{
                  display: "inline-flex", alignItems: "center", gap: 8, background: "#fff",
                  border: "1.5px solid #e2e8f0", color: "#334155", fontWeight: 600, fontSize: 14,
                  padding: "0 20px", height: 40, borderRadius: 10, cursor: "pointer",
                }}>
                  <IconPlus />
                  Add Content
                </button>
              </div>
            ) : (
              <div>
                {items.map((item, idx) => (
                  <PlaylistItemRow
                    key={item.uid}
                    item={item}
                    index={idx}
                    total={items.length}
                    onRemove={removeItem}
                    onDurationChange={changeDuration}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Right Sidebar ── */}
          <div style={{ width: 296, background: "#fff", borderLeft: "1px solid #e8edf3", display: "flex", flexDirection: "column", flexShrink: 0 }}>
            {/* CONTENT tab */}
            <div style={{ display: "flex", borderBottom: "1px solid #e8edf3" }}>
              <div style={{
                flex: 1,
                textAlign: "center",
                padding: "13px 0",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.6px",
                color: "#10b981",
                borderBottom: "2px solid #10b981"
              }}>
                CONTENT
              </div>
            </div>

            {/* Search */}
            <div style={{ padding: "10px 12px 6px", position: "relative" }}>
              <span style={{ position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", display: "flex", pointerEvents: "none" }}><IconSearch /></span>
              <input type="search" placeholder="Search content…" value={mediaSearch} onChange={e => setMediaSearch(e.target.value)}
                style={{ width: "100%", paddingLeft: 30, paddingRight: 10, height: 33, border: "1px solid #e8edf3", borderRadius: 7, fontSize: 13, background: "#f8fafc", boxSizing: "border-box", outline: "none" }} />
            </div>

            {/* Sub-tabs */}
            <div style={{ display: "flex", gap: 0, padding: "0 12px 8px", borderBottom: "1px solid #f1f5f9" }}>
              {(["recent", "media"] as const).map(t => (
                <button key={t} onClick={() => setSidebarTab(t)} type="button" style={{
                  background: sidebarTab === t ? "#f0fdf9" : "none", border: "none", borderRadius: 7,
                  padding: "5px 12px", fontSize: 13, fontWeight: sidebarTab === t ? 700 : 500,
                  color: sidebarTab === t ? "#10b981" : "#64748b", cursor: "pointer",
                }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
              {(["Templates", "Apps"] as const).map(t => (
                <button key={t} type="button" style={{ background: "none", border: "none", borderRadius: 7, padding: "5px 12px", fontSize: 13, color: "#94a3b8", cursor: "pointer" }}>{t}</button>
              ))}
            </div>

            {/* Library heading */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px 4px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>Library</span>
              <button onClick={() => setShowModal(true)} title="Medya yükle" style={{
                width: 24, height: 24, borderRadius: 6, background: "#f0fdf9", border: "1px solid rgba(16,185,129,0.2)",
                color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
              }}>
                <IconPlus />
              </button>
            </div>

            {/* Media list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 2px 12px" }}>
              {displayedMedia.length === 0 ? (
                <p style={{ textAlign: "center", fontSize: 13, color: "#94a3b8", margin: "32px 0" }}>Medya bulunamadı</p>
              ) : (
                displayedMedia.map(f => (
                  <SidebarItem key={f.id} file={f} onAdd={addMedia} />
                ))
              )}
            </div>
            {sidebarTab === "media" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderTop: "1px solid #e8edf3" }}>
                <button type="button" disabled={mediaPage <= 1 || mediaLoading} onClick={() => setMediaPage(page => Math.max(1, page - 1))}>Önceki</button>
                <span style={{ fontSize: 12, color: "#64748b" }}>{mediaLoading ? "Yükleniyor…" : `${mediaPage} / ${mediaTotalPages}`}</span>
                <button type="button" disabled={mediaPage >= mediaTotalPages || mediaLoading} onClick={() => setMediaPage(page => Math.min(mediaTotalPages, page + 1))}>Sonraki</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
