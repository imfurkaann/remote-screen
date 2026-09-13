"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppDetailsModal from "@/components/AppDetailsModal";
import PublishModal from "@/components/PublishModal";
import { useConfirm } from "@/components/ConfirmProvider";

// Definition for available App Store apps
type AppStoreItem = {
  id: string;
  name: string;
  description: string;
  icon: string;
  iconBg: string;
  category: string;
  isPremium?: boolean;
  isAdded?: boolean;
};

// Definition for user's configured app instances (fetched from backend)
type MyAppInstance = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string;
  media_url: string;
  created_at: string;
  storage_path?: string;
};

// Available categories matching the functional apps
const CATEGORIES = [
  "All Apps",
  "Discover",
  "Live Feeds",
  "Internal Communication",
  "Hospitality",
  "Food & Beverage",
  "Content & Files"
];
const CATEGORY_LABELS: Record<string, string> = {
  "All Apps": "Tüm Uygulamalar",
  Discover: "Keşfet",
  "Live Feeds": "Canlı Akışlar",
  "Internal Communication": "Kurumsal İletişim",
  Hospitality: "Konaklama",
  "Food & Beverage": "Yeme & İçme",
  "Content & Files": "İçerik & Dosyalar"
};

// App Store catalog matching the user's requirements and popular options
const APP_STORE_CATALOG: AppStoreItem[] = [
  {
    id: "clock",
    name: "Modern Saat",
    description: "Saat dilimi, renk ve görünürlük seçenekleriyle dijital, analog veya bölünmüş saat oluşturun.",
    icon: "🕒",
    iconBg: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
    category: "Discover"
  },
  {
    id: "weather",
    name: "Hava Durumu",
    description: "Canlı hava bilgisi, çevrimdışı önbellek ve 3 veya 5 günlük tahminleri her ekranda yayınlayın.",
    icon: "🌤️",
    iconBg: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    category: "Discover"
  },
  {
    id: "rss",
    name: "RSS Haber Akışı",
    description: "RSS ve Atom kaynaklarını kayan bant, kart veya editoryal düzende güvenilir biçimde yayınlayın.",
    icon: "📰",
    iconBg: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
    category: "Live Feeds"
  },
  {
    id: "notice",
    name: "Duyuru Panosu",
    description: "Karşılama ekranları, kurumsal duyurular ve yüksek görünürlüklü uyarılar hazırlayın.",
    icon: "📢",
    iconBg: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
    category: "Internal Communication"
  },
  {
    id: "qrcode",
    name: "QR Kod Oluşturucu",
    description: "Bağlantı, metin ve Wi‑Fi için otomatik kontrast korumalı, çevrimdışı çalışan QR ekranları oluşturun.",
    icon: "📱",
    iconBg: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
    category: "Content & Files"
  },
  {
    id: "wayfinding",
    name: "Otel Yönlendirme",
    description: "Misafirleri lobi, kat ve hizmet alanlarına ekrana özel, anlaşılır yönlendirmelerle ulaştırın.",
    icon: "⌖",
    iconBg: "linear-gradient(135deg, #b7791f 0%, #78350f 100%)",
    category: "Hospitality"
  },
  {
    id: "events",
    name: "Etkinlik & Toplantı",
    description: "Günün etkinliklerini, salonları, canlı durum bilgisini ve yönleri lobi ekranlarında yayınlayın.",
    icon: "▦",
    iconBg: "linear-gradient(135deg, #2563eb 0%, #172554 100%)",
    category: "Hospitality"
  },
  {
    id: "hotel-guide",
    name: "Otel Rehberi",
    description: "Restoran, spa, Wi‑Fi, concierge ve diğer hizmetleri saat ve iletişim bilgileriyle sunun.",
    icon: "i",
    iconBg: "linear-gradient(135deg, #0f766e 0%, #134e4a 100%)",
    category: "Hospitality"
  },
  {
    id: "restaurant-menu",
    name: "Restoran Menüsü",
    description: "Kafe, kahvaltı ve restoranlar için fiyatları saniyeler içinde güncellenebilen modern dijital menüler oluşturun.",
    icon: "≡",
    iconBg: "linear-gradient(135deg, #9a3412 0%, #431407 100%)",
    category: "Food & Beverage"
  }
];

export default function AppsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<"store" | "my-apps">("store");
  const [selectedCategory, setSelectedCategory] = useState("All Apps");
  const [searchTerm, setSearchTerm] = useState("");
  
  // App details modal state
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  // App instances state
  const [myApps, setMyApps] = useState<MyAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load configured app instances from standard media API
  const loadMyApps = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/content/media", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        // Apps are stored as Media items with mimeType "text/html"
        const htmlApps = (data.media ?? []).filter(
          (m: any) => m.mime_type === "text/html"
        );
        setMyApps(htmlApps);
      }
    } catch (err) {
      console.error("Failed to load my apps:", err);
    } finally {
      setLoading(false);
    }
  };

  // Playlists and Publish Modal State
  const [playlists, setPlaylists] = useState<{ id: string; name: string }[]>([]);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [activePublishId, setActivePublishId] = useState<string | null>(null);
  const [activePublishName, setActivePublishName] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  // Load playlists to find wrapper playlists
  const loadPlaylists = async () => {
    try {
      const res = await fetch("/api/content/playlists", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setPlaylists(data.playlists ?? []);
      }
    } catch (err) {
      console.error("Failed to load playlists", err);
    }
  };

  const handleSetToScreen = async (app: MyAppInstance) => {
    const targetPlaylistName = `Single Media: ${app.filename}`;
    
    // Check if wrapper playlist already exists
    const existingPlaylist = playlists.find((p) => p.name === targetPlaylistName);
    
    if (existingPlaylist) {
      setActivePublishId(existingPlaylist.id);
      setActivePublishName(existingPlaylist.name);
      setPublishModalOpen(true);
    } else {
      setIsPublishing(true);
      try {
        // Create wrapper playlist
        const createPlaylistRes = await fetch("/api/content/playlists", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: targetPlaylistName,
            items: [
              {
                media_id: app.id,
                duration_ms: 10000,
                position: 0
              }
            ]
          })
        });

        const createdPayload = await createPlaylistRes.json();
        if (!createPlaylistRes.ok) {
          throw new Error(createdPayload.message || "Failed to create playlist wrapper");
        }

        const newPlaylist = createdPayload.playlist;
        setPlaylists((prev) => [...prev, newPlaylist]);
        
        setActivePublishId(newPlaylist.id);
        setActivePublishName(newPlaylist.name);
        setPublishModalOpen(true);
      } catch (err) {
        console.error(err);
        alert("Failed to prepare screen setup for this app.");
      } finally {
        setIsPublishing(false);
      }
    }
  };

  const handlePublishConfirm = async (selectedIds: string[]) => {
    if (!activePublishId || selectedIds.length === 0) return;
    setIsPublishing(true);
    try {
      const res = await fetch(`/api/content/playlists/${activePublishId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          device_ids: selectedIds
        })
      });
      if (res.ok) {
        setPublishModalOpen(false);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "Failed to publish app to selected screens.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to publish app.");
    } finally {
      setIsPublishing(false);
    }
  };

  useEffect(() => {
    void loadMyApps();
    void loadPlaylists();
  }, []);

  // Filtered App Store catalog based on search and category selections
  const filteredCatalog = useMemo(() => {
    return APP_STORE_CATALOG.filter((app) => {
      const matchSearch =
        app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.description.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchCategory =
        selectedCategory === "All Apps" ||
        (selectedCategory === "Premium" && app.isPremium) ||
        app.category === selectedCategory;

      return matchSearch && matchCategory;
    });
  }, [searchTerm, selectedCategory]);

  // Filtered My Apps based on search query
  const filteredMyApps = useMemo(() => {
    return myApps.filter((app) =>
      app.filename.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [myApps, searchTerm]);

  // Delete an app instance (calls standard media delete endpoint)
  const handleDeleteInstance = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const confirmed = await confirm({
      title: "Uygulamayı Sil",
      message: "Bu uygulama örneğini silmek istediğinize emin misiniz?",
      confirmText: "Uygulamayı Sil",
      cancelText: "Vazgeç",
      type: "danger"
    });
    if (!confirmed) return;
    
    setDeletingId(id);
    try {
      const res = await fetch(`/api/content/media/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setMyApps((prev) => prev.filter((app) => app.id !== id));
      } else {
        alert("Failed to delete app instance.");
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("An error occurred during deletion.");
    } finally {
      setDeletingId(null);
    }
  };

  // Callback when clicking "Get" in the AppDetailsModal
  const handleGetApp = (appId: string) => {
    setIsDetailsOpen(false);
    router.push(`/apps/configure?type=${appId}`);
  };

  // Helper to get meta information for configured instances
  const getAppMeta = (storagePath?: string) => {
    const path = (storagePath || "").toLowerCase();
    if (path.includes("clock")) {
      return { name: "Clock", icon: "🕒", color: "#3b82f6" };
    }
    if (path.includes("weather")) {
      return { name: "Weather App", icon: "🌤️", color: "#f59e0b" };
    }
    if (path.includes("rss")) {
      return { name: "RSS News Feed", icon: "📰", color: "#ef4444" };
    }
    if (path.includes("notice")) {
      return { name: "Notice Board", icon: "📢", color: "#8b5cf6" };
    }
    if (path.includes("qrcode")) {
      return { name: "QR Code", icon: "📱", color: "#10b981" };
    }
    if (path.includes("wayfinding")) {
      return { name: "Hotel Wayfinding", icon: "⌖", color: "#b7791f" };
    }
    if (path.includes("events")) {
      return { name: "Events & Meetings", icon: "▦", color: "#2563eb" };
    }
    if (path.includes("hotel-guide")) {
      return { name: "Hotel Guide", icon: "i", color: "#0f766e" };
    }
    if (path.includes("restaurant-menu")) {
      return { name: "Restoran Menüsü", icon: "≡", color: "#9a3412" };
    }
    return { name: "Web App", icon: "🌐", color: "#6b7280" };
  };

  return (
    <div className="apps-page-shell" style={{ display: "flex", flexDirection: "column", minHeight: "100%", backgroundColor: "#f4f5f7" }}>
      {/* Premium Dashboard Header */}
      <header className="apps-page-header" style={{
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        padding: "16px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "24px"
      }}>
        {/* Title */}
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px" }}>
          Uygulamalar
        </h1>

        {/* Search Bar in Middle */}
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
            placeholder={activeTab === "store" ? "Uygulamalarda ara..." : "Uygulamalarımda ara..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px 10px 38px",
              fontSize: "14px",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              backgroundColor: "#f8fafc",
              color: "#0f172a",
              outline: "none",
              transition: "all 0.2s"
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--primary)";
              e.target.style.boxShadow = "0 0 0 3px rgba(16, 185, 129, 0.1)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e2e8f0";
              e.target.style.boxShadow = "none";
            }}
          />
        </div>

        {/* Request App Button */}
        <button
          onClick={() => alert("Uygulama talebiniz alındı.")}
          type="button"
          style={{
            backgroundColor: "#ffffff",
            color: "#334155",
            fontWeight: 700,
            fontSize: "14px",
            padding: "10px 18px",
            borderRadius: "8px",
            border: "1px solid #cbd5e1",
            cursor: "pointer",
            transition: "all 0.2s"
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
          Uygulama Talep Et
        </button>
      </header>

      {/* Main Tabs Navigation */}
      <div style={{
        display: "flex",
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        padding: "0 32px"
      }}>
        <button
          onClick={() => { setActiveTab("store"); setSearchTerm(""); }}
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "store" ? "3px solid var(--primary)" : "3px solid transparent",
            color: activeTab === "store" ? "var(--primary)" : "#64748b",
            fontSize: "14px",
            fontWeight: 700,
            padding: "16px 20px",
            cursor: "pointer",
            transition: "all 0.2s"
          }}
        >
          UYGULAMA MAĞAZASI
        </button>
        <button
          onClick={() => { setActiveTab("my-apps"); setSearchTerm(""); void loadMyApps(); }}
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "my-apps" ? "3px solid var(--primary)" : "3px solid transparent",
            color: activeTab === "my-apps" ? "var(--primary)" : "#64748b",
            fontSize: "14px",
            fontWeight: 700,
            padding: "16px 20px",
            cursor: "pointer",
            transition: "all 0.2s"
          }}
        >
          UYGULAMALARIM ({myApps.length})
        </button>
      </div>

      {/* Workspace Inner Wrapper */}
      <div className="apps-page-content" style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: "24px" }}>
        
        {/* APP STORE VIEW */}
        {activeTab === "store" && (
          <>
            {/* Category Pills Row */}
            <div style={{
              display: "flex",
              gap: "8px",
              overflowX: "auto",
              paddingBottom: "8px",
              flexWrap: "wrap"
            }}>
              {CATEGORIES.map((cat) => {
                const isActive = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      backgroundColor: isActive ? "#0f172a" : "#ffffff",
                      color: isActive ? "#ffffff" : "#475569",
                      border: "1px solid #e2e8f0",
                      borderRadius: "20px",
                      padding: "6px 16px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.backgroundColor = "#f8fafc";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.backgroundColor = "#ffffff";
                    }}
                  >
                    {CATEGORY_LABELS[cat] ?? cat}
                    {cat === "Premium" && (
                      <span style={{
                        fontSize: "9px",
                        fontWeight: 700,
                        backgroundColor: "#3b82f6",
                        color: "#ffffff",
                        padding: "2px 5px",
                        borderRadius: "4px",
                        marginLeft: "6px"
                      }}>PRO</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Title Section */}
            <div style={{ marginTop: "8px" }}>
              <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#1e293b" }}>
                {CATEGORY_LABELS[selectedCategory] ?? selectedCategory} <span style={{ color: "#94a3b8", fontWeight: 500, fontSize: "16px", marginLeft: "6px" }}>{filteredCatalog.length}</span>
              </h2>
            </div>

            {/* App Catalog Grid */}
            {filteredCatalog.length === 0 ? (
              <div style={{ padding: "48px", textAlign: "center", color: "#64748b", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <p>Aramanız veya filtrenizle eşleşen uygulama bulunamadı.</p>
              </div>
            ) : (
              <div className="app-catalog-grid" style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                gap: "20px"
              }}>
                {filteredCatalog.map((app) => (
                  <div className="app-catalog-card"
                    key={app.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${app.name} ayrıntılarını aç`}
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      padding: "20px",
                      display: "flex",
                      gap: "16px",
                      cursor: "pointer",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                      transition: "all 0.2s",
                      position: "relative",
                      overflow: "hidden"
                    }}
                    onClick={() => {
                      setSelectedAppId(app.id);
                      setIsDetailsOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedAppId(app.id);
                        setIsDetailsOpen(true);
                      }
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-3px)";
                      e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.06)";
                      e.currentTarget.style.borderColor = "#cbd5e1";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.02)";
                      e.currentTarget.style.borderColor = "#e2e8f0";
                    }}
                  >
                    {/* App Icon Container */}
                    <div style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "10px",
                      background: app.iconBg,
                      color: "#ffffff",
                      fontSize: "24px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}>
                      {app.icon}
                    </div>

                    {/* App Text Info */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                          {app.name}
                        </span>
                        {app.isPremium && (
                          <span style={{
                            fontSize: "9px",
                            fontWeight: 800,
                            backgroundColor: "#eff6ff",
                            color: "#2563eb",
                            border: "1px solid rgba(37,99,235,0.2)",
                            padding: "1px 5px",
                            borderRadius: "4px"
                          }}>PRO</span>
                        )}
                      </div>
                      <p style={{
                        margin: 0,
                        fontSize: "13px",
                        color: "#64748b",
                        lineHeight: "1.5",
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical"
                      }}>
                        {app.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* MY APPS VIEW */}
        {activeTab === "my-apps" && (
          <>
            {/* Title Section */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#1e293b" }}>
                Yapılandırılmış Uygulamalarım
              </h2>
              <button
                onClick={() => { setActiveTab("store"); setSelectedCategory("All Apps"); }}
                style={{
                  backgroundColor: "var(--primary)",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 700,
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px 14px",
                  cursor: "pointer"
                }}
              >
                + Yeni Uygulama
              </button>
            </div>

            {/* Apps Loading/State rendering */}
            {loading ? (
              <div style={{ padding: "48px", textAlign: "center", color: "#64748b", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <p>Yapılandırılmış uygulamalar yükleniyor...</p>
              </div>
            ) : myApps.length === 0 ? (
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
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  backgroundColor: "#f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px"
                }}>
                  ⚙️
                </div>
                <h4 style={{ margin: 0, fontSize: "17px", color: "#0f172a", fontWeight: 700 }}>Henüz Uygulama Oluşturulmadı</h4>
                <p style={{ margin: 0, color: "#64748b", fontSize: "14px", maxWidth: "420px", lineHeight: "1.6" }}>
                  Saat, hava durumu, duyuru veya restoran menüsü gibi içerikleri oluşturmak için mağazadan bir uygulama seçin.
                </p>
                <button
                  onClick={() => { setActiveTab("store"); setSelectedCategory("All Apps"); }}
                  type="button"
                  style={{
                    backgroundColor: "var(--primary)",
                    color: "#ffffff",
                    fontWeight: 700,
                    padding: "8px 16px",
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer"
                  }}
                >
                  Uygulama Mağazasına Git
                </button>
              </div>
            ) : filteredMyApps.length === 0 ? (
              <div style={{ padding: "48px", textAlign: "center", color: "#64748b", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <p>Aramanızla eşleşen yapılandırılmış uygulama bulunamadı.</p>
              </div>
            ) : (
              /* Configured list */
              <div style={{
                backgroundColor: "#ffffff",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                overflow: "hidden"
              }}>
                {filteredMyApps.map((app, idx) => {
                  const meta = getAppMeta(app.storage_path);
                  return (
                    <div className="configured-app-row"
                      key={app.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`${app.filename} uygulamasını düzenle`}
                      onClick={() => router.push(`/apps/configure?id=${app.id}`)}
                      onKeyDown={(event) => {
                        if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
                          event.preventDefault();
                          router.push(`/apps/configure?id=${app.id}`);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "16px 24px",
                        borderBottom: idx === filteredMyApps.length - 1 ? "none" : "1px solid #f1f5f9",
                        transition: "background-color 0.15s ease",
                        gap: "24px",
                        justifyContent: "space-between",
                        cursor: "pointer"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8fafc"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                    >
                      {/* Left Block: Icon and details */}
                      <div style={{ display: "flex", alignItems: "center", gap: "16px", minWidth: 0, flex: 1 }}>
                        <div style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "8px",
                          backgroundColor: `${meta.color}15`,
                          color: meta.color,
                          fontSize: "20px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0
                        }}>
                          {meta.icon}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
                          <span style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {app.filename}
                          </span>
                          <span style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            {meta.name}
                          </span>
                        </div>
                      </div>

                      {/* Middle Block: Created Date */}
                      <div className="configured-app-date" style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "12px", color: "#64748b", flexShrink: 0, width: "160px" }}>
                        <span style={{ fontWeight: 500 }}>Oluşturulma Tarihi</span>
                        <span style={{ fontWeight: 600, color: "#334155" }}>
                          {new Date(app.created_at).toLocaleDateString("tr-TR", {
                            year: "numeric",
                            month: "short",
                            day: "numeric"
                          })}
                        </span>
                      </div>

                      {/* Right Block: Actions */}
                      <div className="configured-app-actions" style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                        <Link
                          href={`/api/content/media/preview?path=${encodeURIComponent(app.media_url)}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            backgroundColor: "#f1f5f9",
                            color: "#475569",
                            fontWeight: 600,
                            fontSize: "12px",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            textDecoration: "none",
                            transition: "all 0.15s ease"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#e2e8f0";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "#f1f5f9";
                          }}
                        >
                          Önizle
                        </Link>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleSetToScreen(app);
                          }}
                          style={{
                            backgroundColor: "rgba(16, 185, 129, 0.08)",
                            color: "#10b981",
                            fontWeight: 600,
                            fontSize: "12px",
                            padding: "6px 12px",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            transition: "all 0.15s ease"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(16, 185, 129, 0.15)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(16, 185, 129, 0.08)";
                          }}
                        >
                          Ekrana Gönder
                        </button>
                        <button
                          onClick={(e) => void handleDeleteInstance(app.id, e)}
                          disabled={deletingId === app.id}
                          style={{
                            backgroundColor: "rgba(239, 68, 68, 0.08)",
                            color: "#ef4444",
                            fontWeight: 600,
                            fontSize: "12px",
                            padding: "6px 12px",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            transition: "all 0.15s ease"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.15)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.08)";
                          }}
                        >
                          {deletingId === app.id ? "..." : "Sil"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <AppDetailsModal
        open={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        appId={selectedAppId}
        onGet={handleGetApp}
        isAdded={selectedAppId ? myApps.some((app) => (app.storage_path || "").toLowerCase().includes(selectedAppId.toLowerCase())) : false}
      />

      {/* Screen assignment modal for widgets */}
      <PublishModal
        open={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        playlistId={activePublishId || ""}
        playlistName={activePublishName}
        playlists={playlists}
        onConfirm={handlePublishConfirm}
        isBusy={isPublishing}
      />
    </div>
  );
}
