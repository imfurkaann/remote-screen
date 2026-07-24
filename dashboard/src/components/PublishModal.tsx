"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import PairScreenModal from "./PairScreenModal";
import { buildDeviceQuery } from "@/lib/device-query";

interface DeviceRow {
  id: string;
  hardware_id: string;
  name?: string | null;
  location?: string | null;
  status: string;
  current_playlist_id?: string | null;
}

interface PlaylistRow {
  id: string;
  name: string;
}

interface PublishModalProps {
  open: boolean;
  onClose: () => void;
  playlistId: string;
  playlistName: string;
  playlists: PlaylistRow[];
  onConfirm: (selectedDeviceIds: string[]) => Promise<void>;
  isBusy: boolean;
}

export default function PublishModal({
  open,
  onClose,
  playlistId,
  playlistName,
  playlists,
  onConfirm,
  isBusy,
}: PublishModalProps) {
  // Screen query states
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPairModalOpen, setIsPairModalOpen] = useState(false);

  // Set Content Dropdown States
  const [isSetContentDropdownOpen, setIsSetContentDropdownOpen] = useState(false);
  const [contentType, setContentType] = useState<"always" | "schedule" | "cast">("always");

  // Selection state (retained across page changes/search queries)
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Map for resolving playlist names
  const playlistMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const pl of playlists) {
      map.set(pl.id, pl.name);
    }
    return map;
  }, [playlists]);

  // Load screens
  const fetchScreens = async (pageNum: number, searchVal: string, append = false) => {
    setIsLoading(true);
    try {
      const queryParams = buildDeviceQuery({ page: pageNum, limit: 15, search: searchVal });


      const res = await fetch(`/api/content/devices?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to load screens");

      const payload = (await res.json()) as {
        devices: DeviceRow[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };

      if (append) {
        setDevices((prev) => {
          // Avoid duplicate items
          const existingIds = new Set(prev.map((d) => d.id));
          const newItems = payload.devices.filter((d) => !existingIds.has(d.id));
          return [...prev, ...newItems];
        });
      } else {
        setDevices(payload.devices);
      }

      setTotalPages(payload.totalPages);
      // Only set totalCount on empty search queries to determine if the workspace has 0 screens globally
      if (searchVal === "") {
        setTotalCount(payload.total);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger loading when modal opens
  useEffect(() => {
    if (open) {
      setPage(1);
      setDevices([]);
      setSelectedDeviceIds(new Set());
      void fetchScreens(1, "");
    }
  }, [open]);

  // Debounced search trigger
  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      void fetchScreens(1, val);
    }, 300);
  };

  // Infinite Scroll bottom detection
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || isLoading || page >= totalPages) return;

    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 60) {
      const nextPage = page + 1;
      setPage(nextPage);
      void fetchScreens(nextPage, search, true);
    }
  };

  const toggleDevice = (id: string) => {
    const next = new Set(selectedDeviceIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedDeviceIds(next);
  };

  // Select All toggler (only toggles screens currently loaded/visible in the list)
  const isAllVisibleSelected = useMemo(() => {
    if (devices.length === 0) return false;
    return devices.every((d) => selectedDeviceIds.has(d.id));
  }, [devices, selectedDeviceIds]);

  const toggleSelectAllVisible = () => {
    const next = new Set(selectedDeviceIds);
    if (isAllVisibleSelected) {
      // Remove all visible ones
      for (const d of devices) {
        next.delete(d.id);
      }
    } else {
      // Add all visible ones
      for (const d of devices) {
        next.add(d.id);
      }
    }
    setSelectedDeviceIds(next);
  };

  const handleConfirm = () => {
    if (selectedDeviceIds.size === 0) return;
    void onConfirm(Array.from(selectedDeviceIds));
  };

  if (!open) return null;

  // Render pairing modal
  const handlePairSuccess = (newDeviceId: string) => {
    // Select newly paired screen and refresh list
    const next = new Set(selectedDeviceIds);
    next.add(newDeviceId);
    setSelectedDeviceIds(next);
    setSearch("");
    setPage(1);
    void fetchScreens(1, "");
  };

  const hasNoScreensGlobally = totalCount === 0;

  return (
    <>
      <div style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}>
        <div style={{
          background: "#ffffff",
          borderRadius: 12,
          width: "100%",
          maxWidth: 900,
          height: "80vh",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          border: "1px solid #e2e8f0"
        }}>
          {/* Header */}
          <div style={{
            padding: "20px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
              Select screens to play {playlistName}
            </h2>
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

          {/* Search & Select All Block (only if they have screens) */}
          {!hasNoScreensGlobally && (
            <div style={{
              padding: "16px 24px",
              backgroundColor: "#ffffff",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              gap: 16
            }}>
              <div style={{ position: "relative", flexGrow: 1 }}>
                <svg style={{
                  position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                  width: 16, height: 16, color: "#94a3b8", pointerEvents: "none"
                }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search Screens"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px 10px 38px",
                    fontSize: "14px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    boxSizing: "border-box",
                    outline: "none"
                  }}
                />
              </div>

              {/* Select All Toggle Box */}
              <div
                onClick={toggleSelectAllVisible}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 38,
                  height: 38,
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  cursor: "pointer",
                  backgroundColor: isAllVisibleSelected ? "rgba(16,185,129,0.08)" : "#ffffff",
                  borderColor: isAllVisibleSelected ? "#10b981" : "#cbd5e1",
                }}
                title="Select / Deselect all visible screens"
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4, border: isAllVisibleSelected ? "none" : "1.5px solid #cbd5e1",
                  background: isAllVisibleSelected ? "#10b981" : "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {isAllVisibleSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4.5"><path d="M20 6 9 17l-5-5" /></svg>}
                </div>
              </div>
            </div>
          )}

          {/* Body Content */}
          <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {hasNoScreensGlobally ? (
              /* Global Empty State: No Screens Paired */
              <div style={{
                flexGrow: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px",
                textAlign: "center",
                backgroundColor: "#ffffff"
              }}>
                <div style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: "#0f172a",
                  marginBottom: 12
                }}>
                  Your screens will live here
                </div>
                <div style={{
                  fontSize: 14,
                  color: "#64748b",
                  maxWidth: 500,
                  lineHeight: "1.6",
                  marginBottom: 28
                }}>
                  Adding a screen is as simple as downloading the ScreenCloud app and entering the pairing code. You can even use your TV screen at home, it's that simple.
                </div>
                <button
                  type="button"
                  onClick={() => setIsPairModalOpen(true)}
                  style={{
                    backgroundColor: "#ffffff",
                    color: "#0f172a",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    padding: "12px 24px",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    transition: "all 0.15s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#f8fafc";
                    e.currentTarget.style.borderColor = "#94a3b8";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#ffffff";
                    e.currentTarget.style.borderColor = "#cbd5e1";
                  }}
                >
                  Add New Screen
                </button>
              </div>
            ) : (
              /* Signage Screens List View */
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                {/* Headers */}
                <div style={{
                  display: "flex",
                  padding: "12px 24px",
                  borderBottom: "1px solid #e2e8f0",
                  backgroundColor: "#f8fafc",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#64748b",
                  letterSpacing: "0.5px"
                }}>
                  <div style={{ flex: 4 }}>NAME</div>
                  <div style={{ flex: 3 }}>PLAYING/CASTING</div>
                  <div style={{ flex: 2, textAlign: "right" }}>STATUS</div>
                </div>

                {/* Scrollable list */}
                <div
                  ref={scrollContainerRef}
                  onScroll={handleScroll}
                  style={{
                    flexGrow: 1,
                    overflowY: "auto",
                    padding: "0 24px"
                  }}
                >
                  {devices.length === 0 && !isLoading ? (
                    <div style={{ textAlign: "center", color: "#64748b", padding: "48px 0", fontSize: 14 }}>
                      No screens match your search query.
                    </div>
                  ) : (
                    <>
                      {devices.map((d) => {
                        const checked = selectedDeviceIds.has(d.id);
                        const plName = d.current_playlist_id ? playlistMap.get(d.current_playlist_id) : null;

                        return (
                          <div
                            key={d.id}
                            onClick={() => toggleDevice(d.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              padding: "16px 0",
                              borderBottom: "1px solid #f1f5f9",
                              cursor: "pointer",
                              transition: "background-color 0.1s"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8fafc"}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                          >
                            {/* Checkbox indicator */}
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              flex: 4,
                              minWidth: 0,
                              paddingRight: 16
                            }}>
                              <div style={{
                                width: 18, height: 18, borderRadius: 4, border: checked ? "none" : "1.5px solid #cbd5e1",
                                background: checked ? "#10b981" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                              }}>
                                {checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4.5"><path d="M20 6 9 17l-5-5" /></svg>}
                              </div>

                              {/* Screen Details */}
                              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                                <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {d.name || "Unnamed Screen"}
                                </span>
                                <span style={{ fontSize: "12px", color: "#64748b", fontFamily: "monospace" }}>
                                  {d.hardware_id}
                                </span>
                              </div>
                            </div>

                            {/* Playing Playlist Status */}
                            <div style={{ flex: 3, display: "flex", alignItems: "center", gap: 6, fontSize: "13px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {plName ? (
                                <>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 17V7l7 5-7 5z" /></svg>
                                  <span style={{ fontWeight: 500 }} title={plName}>{plName}</span>
                                </>
                              ) : (
                                <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Nothing playing</span>
                              )}
                            </div>

                            {/* Status badge */}
                            <div style={{ flex: 2, display: "flex", justifyContent: "flex-end" }}>
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                padding: "4px 10px", borderRadius: "999px",
                                fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
                                backgroundColor: d.status === "online" ? "rgba(16,185,129,0.1)" : "#f1f5f9",
                                color: d.status === "online" ? "#10b981" : "#64748b",
                              }}>
                                {d.status === "online" && (
                                  <span style={{ width: 6, height: 6, backgroundColor: "#10b981", borderRadius: "50%", display: "inline-block" }} />
                                )}
                                {d.status === "online" ? "ONLINE" : "OFFLINE"}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {isLoading && (
                        <div style={{ textAlign: "center", color: "#64748b", padding: "16px 0", fontSize: 13 }}>
                          Loading more screens...
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "16px 24px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#ffffff"
          }}>
            {/* Set Content Dropdown options */}
            {!hasNoScreensGlobally ? (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setIsSetContentDropdownOpen(!isSetContentDropdownOpen)}
                  style={{
                    backgroundColor: "#ffffff",
                    color: "#0f172a",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    padding: "8px 14px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                  <span>
                    {contentType === "always" ? "Set Content" : contentType === "schedule" ? "Set Schedule" : "Cast Content"}
                  </span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ transform: isSetContentDropdownOpen ? "rotate(180deg)" : "none" }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {/* Dropdown Card */}
                {isSetContentDropdownOpen && (
                  <div style={{
                    position: "absolute",
                    bottom: "100%",
                    left: 0,
                    marginBottom: 8,
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                    zIndex: 100,
                    width: 220,
                    padding: 4
                  }}>
                    <div
                      onClick={() => { setContentType("always"); setIsSetContentDropdownOpen(false); }}
                      style={{
                        padding: "8px 12px",
                        fontSize: 13,
                        borderRadius: 6,
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: contentType === "always" ? "rgba(16,185,129,0.06)" : "transparent",
                        color: contentType === "always" ? "#059669" : "#334155",
                        fontWeight: contentType === "always" ? 600 : 500
                      }}
                    >
                      <span>Always Play</span>
                      {contentType === "always" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                    </div>

                    <div
                      onClick={() => { setContentType("schedule"); setIsSetContentDropdownOpen(false); }}
                      style={{
                        padding: "8px 12px",
                        fontSize: 13,
                        borderRadius: 6,
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: contentType === "schedule" ? "rgba(16,185,129,0.06)" : "transparent",
                        color: contentType === "schedule" ? "#059669" : "#334155",
                        fontWeight: contentType === "schedule" ? 600 : 500
                      }}
                    >
                      <span>Scheduled playing</span>
                      {contentType === "schedule" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                    </div>

                    <div
                      onClick={() => { setContentType("cast"); setIsSetContentDropdownOpen(false); }}
                      style={{
                        padding: "8px 12px",
                        fontSize: 13,
                        borderRadius: 6,
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: contentType === "cast" ? "rgba(16,185,129,0.06)" : "transparent",
                        color: contentType === "cast" ? "#059669" : "#334155",
                        fontWeight: contentType === "cast" ? 600 : 500
                      }}
                    >
                      <span>Temporary Casting</span>
                      {contentType === "cast" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                    </div>
                  </div>
                )}

                <span style={{ fontSize: "12px", color: "#64748b", marginLeft: 8, verticalAlign: "middle" }}>
                  {contentType === "always" ? "Content will always be playing" : contentType === "schedule" ? "Content will play on schedule" : "Content will cast temporarily"}
                </span>
              </div>
            ) : (
              <div />
            )}

            {/* Cancel/Confirm action buttons */}
            <div style={{ display: "flex", gap: 12 }}>
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
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              {!hasNoScreensGlobally ? (
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isBusy || selectedDeviceIds.size === 0}
                  style={{
                    backgroundColor: selectedDeviceIds.size > 0 ? "var(--primary)" : "#e2e8f0",
                    color: selectedDeviceIds.size > 0 ? "#ffffff" : "#94a3b8",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 20px",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: selectedDeviceIds.size > 0 ? "pointer" : "not-allowed",
                    boxShadow: selectedDeviceIds.size > 0 ? "0 1px 2px rgba(0,0,0,0.05)" : "none"
                  }}
                >
                  {isBusy ? "Publishing..." : `Confirm (${selectedDeviceIds.size})`}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsPairModalOpen(true)}
                  style={{
                    backgroundColor: "var(--primary)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 20px",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                  }}
                >
                  Pair Screen
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Screen pairing overlay */}
      <PairScreenModal
        open={isPairModalOpen}
        onClose={() => setIsPairModalOpen(false)}
        onSuccess={handlePairSuccess}
      />
    </>
  );
}
