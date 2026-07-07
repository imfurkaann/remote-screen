"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import PublishModal from "../../../components/PublishModal";
import { useConfirm } from "@/components/ConfirmProvider";

type PlaylistRow = {
  id: string;
  name: string;
  version: number;
  item_count: number;
  updated_at: string;
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



/* ─── Playlist Row Component ────────────────────────────────── */
function PlaylistRowComponent({
  playlist,
  isLast,
  onPublishClick,
  onDeleteClick,
  isBusy,
}: {
  playlist: PlaylistRow;
  isLast: boolean;
  onPublishClick: (id: string, name: string) => void;
  onDeleteClick: (id: string, name: string) => void;
  isBusy: boolean;
}) {
  const initials = playlist.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const handlePublishClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onPublishClick(playlist.id, playlist.name);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onDeleteClick(playlist.id, playlist.name);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "20px 32px",
        borderBottom: isLast ? "none" : "1px solid #f1f5f9",
        transition: "background-color 0.15s ease",
        gap: "32px",
        textDecoration: "none",
        color: "inherit",
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8fafc"}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
    >
      {/* Icon / Initials */}
      <Link href={`/playlists/${playlist.id}`} style={{ display: "flex", alignItems: "center", gap: "32px", flexGrow: 1, textDecoration: "none", color: "inherit" }}>
        <div style={{
          width: "44px", height: "32px",
          background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
          borderRadius: "4px",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#ffffff", flexShrink: 0,
          fontSize: "13px",
          fontWeight: 700,
          letterSpacing: "-0.5px",
        }}>
          {initials}
        </div>

        {/* Details */}
        <div style={{
          flexGrow: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              {playlist.name}
            </span>
          </div>
        </div>
      </Link>

      {/* Playlist Stats */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "220px" }}>
        <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.5px" }}>PLAYLIST INFO</span>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "13px", color: "#64748b" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <IconItems />
            {playlist.item_count} item{playlist.item_count !== 1 ? "s" : ""}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <IconClock />
            v{playlist.version}
          </span>
        </div>
      </div>

      {/* Updated Date */}
      <div style={{ minWidth: "120px", display: "flex", flexDirection: "column", gap: "4px" }}>
        <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.5px" }}>LAST MODIFIED</span>
        <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 500 }}>
          {new Date(playlist.updated_at).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      </div>

      {/* Actions */}
      <div style={{ flexShrink: 0, display: "flex", gap: "8px", alignItems: "center" }}>
        <button
          type="button"
          disabled={isBusy}
          onClick={handleDeleteClick}
          style={{
            backgroundColor: "#ffffff",
            color: "var(--danger)",
            fontWeight: 700,
            fontSize: "12px",
            padding: "6px 14px",
            borderRadius: "6px",
            border: "1px solid var(--danger)",
            cursor: "pointer",
            transition: "all 0.15s ease"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--danger)";
            e.currentTarget.style.color = "#ffffff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#ffffff";
            e.currentTarget.style.color = "var(--danger)";
          }}
        >
          Delete
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={handlePublishClick}
          style={{
            backgroundColor: "var(--primary)",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: "12px",
            padding: "6px 14px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            transition: "background-color 0.15s ease"
          }}
        >
          Publish
        </button>
      </div>
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────── */
export default function PlaylistsPage() {
  const confirm = useConfirm();
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [publishStatus, setPublishStatus] = useState<string | null>(null);

  // Publish Modal State
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [activePublishId, setActivePublishId] = useState<string | null>(null);
  const [activePublishName, setActivePublishName] = useState("");

  const realPlaylists = useMemo(
    () => playlists.filter((p) => !p.name.toLowerCase().startsWith("single media:")),
    [playlists]
  );

  const filteredPlaylists = useMemo(
    () =>
      realPlaylists.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [realPlaylists, searchQuery]
  );

  const loadPlaylists = async () => {
    const payload = await fetchJson<{ playlists?: PlaylistRow[] }>(
      "/api/content/playlists",
      { cache: "no-store" }
    );
    setPlaylists(payload.playlists ?? []);
  };

  useEffect(() => {
    loadPlaylists().catch(() => setPublishStatus("Failed to load playlists."));
  }, []);

  const openPublishModal = (playlistId: string, playlistName: string) => {
    setActivePublishId(playlistId);
    setActivePublishName(playlistName);
    setPublishModalOpen(true);
  };

  const handlePublishConfirm = async (selectedIds: string[]) => {
    if (!activePublishId || selectedIds.length === 0) return;
    setIsBusy(true);
    setPublishStatus(null);
    try {
      await fetchJson(`/api/content/playlists/${activePublishId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_ids: selectedIds }),
      });
      await loadPlaylists();
      setPublishStatus(`Playlist published to selected screens.`);
      setPublishModalOpen(false);
    } catch (error) {
      setPublishStatus(`Publish failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const openDeleteModal = async (playlistId: string, playlistName: string) => {
    const confirmed = await confirm({
      title: "Oynatma Listesini Sil",
      message: `"${playlistName}" isimli oynatma listesini silmek istediğinize emin misiniz? Bu işlem geri alınamaz ve bu oynatma listesini oynatan tüm cihazlarda yayın durdurulur.`,
      confirmText: "Sil",
      cancelText: "Vazgeç",
      type: "danger"
    });
    if (!confirmed) return;

    setIsBusy(true);
    setPublishStatus(null);
    try {
      await fetch(`/api/content/playlists/${playlistId}`, {
        method: "DELETE",
      });
      await loadPlaylists();
      setPublishStatus(`Playlist "${playlistName}" was deleted.`);
    } catch (error) {
      setPublishStatus(`Delete failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <>
      <PublishModal
        open={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        playlistId={activePublishId || ""}
        playlistName={activePublishName}
        playlists={playlists}
        onConfirm={handlePublishConfirm}
        isBusy={isBusy}
      />



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
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>
            Playlists
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
              placeholder="Search Playlists"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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

          {/* New Playlist Button */}
          <Link
            href="/playlists/new"
            style={{
              backgroundColor: "var(--primary)",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "14px",
              padding: "10px 18px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background-color 0.15s ease"
            }}
          >
            New Playlist
          </Link>
        </header>

        {/* Main Inner Content Body */}
        <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* Action Buttons Row */}
          <div style={{ display: "flex", alignItems: "center", gap: "20px", fontSize: "14px", color: "#64748b", flexWrap: "wrap" }}>
            <button
              onClick={loadPlaylists}
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
          </div>

          {/* Publish status banner */}
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

          {/* Playlist list container card */}
          {filteredPlaylists.length === 0 ? (
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
              <div style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: "rgba(16,185,129,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
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
                <Link
                  href="/playlists/new"
                  style={{
                    backgroundColor: "var(--primary)",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "14px",
                    padding: "10px 18px",
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "none"
                  }}
                >
                  New Playlist
                </Link>
              )}
            </div>
          ) : (
            <div style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              overflow: "hidden",
            }}>
              {filteredPlaylists.map((playlist, idx) => (
                <PlaylistRowComponent
                  key={playlist.id}
                  playlist={playlist}
                  isLast={idx === filteredPlaylists.length - 1}
                  onPublishClick={openPublishModal}
                  onDeleteClick={openDeleteModal}
                  isBusy={isBusy}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
