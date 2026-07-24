"use client";

import React, { useState, useEffect } from "react";

interface AppDetailsModalProps {
  open: boolean;
  onClose: () => void;
  appId: string | null;
  onGet: (appId: string) => void;
  isAdded?: boolean;
}

type FeatureCard = {
  header: string;
  type: string;
};

type AppDetails = {
  title: string;
  subtitle: string;
  icon: string;
  iconBg: string;
  features: FeatureCard[];
  aboutPoints: { title: string; desc: string }[];
  categories: string[];
};

// Rich details for each app
const APP_DETAILS_DATA: Record<string, AppDetails> = {
  clock: {
    title: "Clock",
    subtitle: "A calm, modern clock designed for every screen.",
    icon: "🕒",
    iconBg: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
    features: [
      { header: "A modern digital clock with clear typography", type: "clock-digital" },
      { header: "A balanced split layout for time and date", type: "clock-split" }
    ],
    aboutPoints: [
      { title: "Three focused clock layouts", desc: "Choose a digital, analog or split layout without unnecessary complexity." },
      { title: "Show only what matters", desc: "Turn seconds, date and timezone labels on or off independently." },
      { title: "Choose any time zone in the world", desc: "Display the time zone relevant to your location." }
    ],
    categories: ["Discover", "All Apps", "Internal Communication"]
  },
  weather: {
    title: "Weather App",
    subtitle: "Modern, reliable weather conditions and multi-day forecasts designed for every screen.",
    icon: "🌤️",
    iconBg: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    features: [
      { header: "Show current conditions with clear, modern details", type: "weather-today" },
      { header: "Add a responsive 3 or 5-day forecast for any location", type: "weather-forecast" }
    ],
    aboutPoints: [
      { title: "Reliable live updates", desc: "Automatically refreshes current conditions and keeps the last successful data during connection interruptions." },
      { title: "Flexible presentation", desc: "Choose Celsius or Fahrenheit, Turkish or English, and detailed or minimal layouts." },
      { title: "Responsive forecasts", desc: "Display a clear 3 or 5-day outlook in landscape and portrait orientations." }
    ],
    categories: ["Discover", "All Apps", "Live Feeds"]
  },
  rss: {
    title: "RSS News Feed",
    subtitle: "Turn RSS and Atom sources into modern, resilient news experiences for every screen.",
    icon: "📰",
    iconBg: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
    features: [
      { header: "Run a smooth, readable ticker with intelligent feed caching", type: "rss-ticker" },
      { header: "Present headlines as focused cards or a split editorial layout", type: "rss-cards" }
    ],
    aboutPoints: [
      { title: "RSS and Atom support", desc: "Connect secure public feeds from publishers, company blogs, or internal news sources." },
      { title: "Fleet-ready delivery", desc: "Shared caching prevents thousands of screens from repeatedly requesting the same source." },
      { title: "Connection resilience", desc: "Screens keep the last successful stories visible and recover automatically when connectivity returns." }
    ],
    categories: ["Live Feeds", "All Apps"]
  },
  notice: {
    title: "Notice Board",
    subtitle: "Create modern welcome screens, company announcements, and high-visibility alerts.",
    icon: "📢",
    iconBg: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
    features: [
      { header: "Create polished welcomes and editorial company announcements", type: "notice-welcome" },
      { header: "Broadcast high-visibility warnings across every screen", type: "notice-alert" }
    ],
    aboutPoints: [
      { title: "Three responsive layouts", desc: "Use centered, editorial, or banner compositions for every message type." },
      { title: "Accessible emphasis", desc: "Use clear symbols, controlled colors, and readable typography to set the right priority." },
      { title: "Safe content rendering", desc: "Long messages and special characters are bounded and displayed as safe text." }
    ],
    categories: ["Internal Communication", "All Apps", "Bespoke Content Creation"]
  },
  qrcode: {
    title: "QR Code Generator",
    subtitle: "Create offline-ready QR experiences for links, text, and Wi-Fi access.",
    icon: "📱",
    iconBg: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
    features: [
      { header: "Let visitors join Wi-Fi networks with a single scan", type: "qr-wifi" },
      { header: "Share menus, forms, links, or plain text without external services", type: "qr-url" }
    ],
    aboutPoints: [
      { title: "Automatic contrast protection", desc: "Unsafe color combinations automatically return to a scan-friendly dark-on-light pair." },
      { title: "Flexible content types", desc: "Generate standards-compatible web, text, and secured Wi-Fi payloads." },
      { title: "No CDN dependency", desc: "QR matrices are generated locally and remain available without internet access." }
    ],
    categories: ["Content & Files", "All Apps", "Miscellaneous"]
  },
  wayfinding: {
    title: "Hotel Wayfinding",
    subtitle: "Help every guest reach hotel amenities and event spaces with confidence.",
    icon: "⌖",
    iconBg: "linear-gradient(135deg, #b7791f 0%, #78350f 100%)",
    features: [
      { header: "Build a clear lobby directory for multiple hotel destinations", type: "wayfinding-directory" },
      { header: "Focus corridor and lift screens on one prominent direction", type: "wayfinding-spotlight" }
    ],
    aboutPoints: [
      { title: "Screen-specific directions", desc: "Give every lobby, floor and corridor screen its own current location and destination arrows." },
      { title: "Flexible hotel layouts", desc: "Show up to six destinations or focus the entire screen on one important route." },
      { title: "Offline by design", desc: "Directions remain available on the player without maps, APIs or internet connectivity." }
    ],
    categories: ["Hospitality", "All Apps", "Internal Communication"]
  },
  events: {
    title: "Events & Meetings", subtitle: "Keep guests informed with a clear, always-current venue schedule.", icon: "▦",
    iconBg: "linear-gradient(135deg, #2563eb 0%, #172554 100%)",
    features: [{ header: "Show today’s meetings with rooms, times and directions", type: "events-schedule" }, { header: "Highlight sessions in progress automatically", type: "events-live" }],
    aboutPoints: [{ title: "Automatic live status", desc: "Updates upcoming, live and finished states directly on the screen." }, { title: "Venue-ready directions", desc: "Guide delegates to each room with clear directional arrows." }, { title: "Offline schedule", desc: "The published schedule continues to work during internet interruptions." }],
    categories: ["Hospitality", "All Apps", "Live Feeds"]
  },
  "hotel-guide": {
    title: "Hotel Guide", subtitle: "A polished directory for every guest service and amenity.", icon: "i",
    iconBg: "linear-gradient(135deg, #0f766e 0%, #134e4a 100%)",
    features: [{ header: "Present hotel services in a clear card directory", type: "guide-grid" }, { header: "Feature priority amenities with richer information", type: "guide-featured" }],
    aboutPoints: [{ title: "Everything in one place", desc: "Show dining, spa, Wi-Fi, concierge, transport and more." }, { title: "Useful service details", desc: "Publish opening hours, short descriptions and internal contacts." }, { title: "Made for every screen", desc: "Responsive layouts work in guest rooms, lobbies and lift areas." }],
    categories: ["Hospitality", "All Apps", "Internal Communication"]
  }
};

export default function AppDetailsModal({ open, onClose, appId, onGet, isAdded = false }: AppDetailsModalProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [liveTime, setLiveTime] = useState("");

  // Update live clock mockup time
  useEffect(() => {
    if (!open) return;
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      setLiveTime(`${hours}:${minutes}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [open]);

  // Reset slide index when changing app details
  useEffect(() => {
    setSlideIndex(0);
  }, [appId]);

  if (!open || !appId) return null;

  // Retrieve details or default back to clock
  const details = (APP_DETAILS_DATA[appId] || APP_DETAILS_DATA.clock) as AppDetails;

  const nextSlide = () => {
    setSlideIndex((prev) => (prev + 1) % details.features.length);
  };

  const prevSlide = () => {
    setSlideIndex((prev) => (prev - 1 + details.features.length) % details.features.length);
  };

  // Render the mockup screen for the gallery slider
  const renderMockup = (type: string) => {
    const screenStyle: React.CSSProperties = {
      width: "220px",
      height: "125px",
      backgroundColor: "#0d0e12",
      borderRadius: "6px",
      border: "3px solid #1f2937",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      color: "#ffffff",
      fontFamily: "monospace",
      overflow: "hidden",
      position: "relative",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
    };

    switch (type) {
      case "clock-digital":
        return (
          <div style={screenStyle}>
            <div style={{ fontSize: "10px", color: "#6b7280", position: "absolute", top: "10px" }}>NEW YORK</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
              <span style={{ fontSize: "12px", fontWeight: "bold", color: "#9ca3af" }}>AM</span>
              <span style={{ fontSize: "28px", fontWeight: 800, color: "#ffffff", fontFamily: "sans-serif" }}>10:10</span>
            </div>
            <div style={{ fontSize: "10px", color: "#10b981", marginTop: "4px", fontWeight: "bold" }}>THURSDAY 24</div>
          </div>
        );
      case "clock-split":
        return (
          <div style={{ ...screenStyle, background: "linear-gradient(145deg, #101827, #07111f)", fontFamily: "system-ui, sans-serif" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.8fr", alignItems: "stretch", width: "86%", height: "58px" }}>
              <div style={{ display: "flex", alignItems: "center", fontSize: "27px", fontWeight: 800, letterSpacing: "-1.5px" }}>
                10<span style={{ color: "#6ee7b7", padding: "0 2px" }}>:</span>10
              </div>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingLeft: "12px", borderLeft: "1px solid rgba(255,255,255,0.14)", textAlign: "left" }}>
                <span style={{ width: "18px", height: "3px", marginBottom: "auto", borderRadius: "999px", background: "#6ee7b7" }} />
                <span style={{ fontSize: "7px", fontWeight: 700 }}>Thursday, 24 July</span>
                <span style={{ marginTop: "3px", fontSize: "6px", color: "#6ee7b7", letterSpacing: "0.8px" }}>ISTANBUL</span>
              </div>
            </div>
          </div>
        );
      case "weather-today":
        return (
          <div style={{ ...screenStyle, background: "linear-gradient(145deg,#075985,#0284c7 52%,#38bdf8)", fontFamily: "system-ui, sans-serif", alignItems: "stretch", padding: "13px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div><div style={{ fontSize: "9px", fontWeight: 800 }}>İstanbul</div><div style={{ marginTop: "2px", fontSize: "6px", color: "#dbeafe" }}>Parçalı bulutlu</div></div>
              <div style={{ width: "23px", height: "23px", display: "grid", placeItems: "center", borderRadius: "8px", background: "rgba(255,255,255,.13)", color: "#fde68a" }}>☀</div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", marginTop: "auto" }}><span style={{ fontSize: "34px", lineHeight: .85, fontWeight: 800, letterSpacing: "-2px" }}>22</span><span style={{ margin: "1px 0 0 3px", fontSize: "10px", color: "#fde68a", fontWeight: 800 }}>°C</span></div>
          </div>
        );
      case "weather-forecast":
        return (
          <div style={{ ...screenStyle, background: "linear-gradient(145deg,#020617,#0f172a 52%,#172554)", fontFamily: "system-ui, sans-serif", alignItems: "stretch", padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: "9px", fontWeight: 800 }}>İstanbul</span><span style={{ fontSize: "14px", color: "#67e8f9" }}>☀</span></div>
            <div style={{ display: "flex", alignItems: "baseline", marginTop: "4px" }}><span style={{ fontSize: "26px", lineHeight: 1, fontWeight: 800 }}>22</span><span style={{ fontSize: "8px", color: "#67e8f9", fontWeight: 800 }}>°C</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", marginTop: "auto", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,.12)", fontSize: "6px" }}>
              {["Bugün", "Cmt", "Paz", "Pzt", "Sal"].map((day, index) => <div key={day} style={{ textAlign: "center", borderLeft: index ? "1px solid rgba(255,255,255,.1)" : "none" }}><div style={{ color: "#a5b4fc" }}>{day}</div><div style={{ margin: "2px 0", color: index === 0 ? "#67e8f9" : "#fff", fontSize: "9px" }}>{["☀", "☁", "☂", "☁", "☀"][index]}</div><strong>{[24, 22, 20, 21, 23][index]}°</strong></div>)}
            </div>
          </div>
        );
      case "rss-ticker":
        return (
          <div style={{ ...screenStyle, background: "linear-gradient(145deg,#09090b,#18181b 55%,#27272a)", fontFamily: "system-ui, sans-serif", alignItems: "stretch", justifyContent: "space-between", padding: "13px 0 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0 14px", color: "#a1a1aa", fontSize: "6px", fontWeight: 800, letterSpacing: ".8px" }}><span>GÜNDEM</span><span>CANLI AKIŞ</span></div>
            <div style={{ maxWidth: "72%", padding: "0 14px 8px", fontSize: "14px", lineHeight: 1.05, fontWeight: 800, letterSpacing: "-.3px" }}>Gündemi sade ve kesintisiz biçimde takip edin.</div>
            <div style={{ height: "23px", display: "flex", alignItems: "center", overflow: "hidden", borderTop: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.055)" }}><span style={{ alignSelf: "stretch", display: "grid", placeItems: "center", padding: "0 9px", background: "#fbbf24", color: "#18181b", fontSize: "6px", fontWeight: 900 }}>GÜNDEM</span><span style={{ paddingLeft: "9px", whiteSpace: "nowrap", fontSize: "7px", fontWeight: 700 }}>Yeni nesil enerji yatırımları açıklandı  •  Akıllı ulaşım sistemleri genişliyor</span></div>
          </div>
        );
      case "rss-cards":
        return (
          <div style={{ ...screenStyle, background: "linear-gradient(145deg,#071a24,#0c4a6e 55%,#075985)", fontFamily: "system-ui, sans-serif", alignItems: "stretch", justifyContent: "space-between", padding: "13px 15px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#67e8f9", fontSize: "6px", fontWeight: 900, letterSpacing: ".8px" }}><span>ŞİRKET HABERLERİ</span><span style={{ color: "#bae6fd" }}>01 / 10</span></div>
            <div><div style={{ maxWidth: "90%", fontSize: "14px", lineHeight: 1.07, fontWeight: 800, letterSpacing: "-.3px" }}>Sürdürülebilir büyüme için yeni yol haritası paylaşıldı</div><div style={{ maxWidth: "75%", marginTop: "5px", color: "#bae6fd", fontSize: "6px", lineHeight: 1.4 }}>Yeni program, ekiplerin önümüzdeki dönem hedeflerini ve uygulama takvimini kapsıyor.</div></div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#bae6fd", fontSize: "6px" }}><span>12 dk önce</span><span style={{ width: "28%", height: "2px", background: "rgba(255,255,255,.14)" }}><span style={{ display: "block", width: "45%", height: "100%", background: "#67e8f9" }} /></span></div>
          </div>
        );
      case "notice-welcome":
        return (
          <div style={{ ...screenStyle, background: "linear-gradient(145deg,#1e1b4b,#312e81 52%,#5b21b6)", alignItems: "stretch", padding: "14px 16px", fontFamily: "system-ui, sans-serif" }}>
            <div style={{ color: "#c4b5fd", fontSize: "6px", fontWeight: 900, letterSpacing: ".8px" }}>EKİP DUYURUSU</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 42px", alignItems: "center", flex: 1 }}><div><div style={{ fontSize: "15px", lineHeight: 1.02, fontWeight: 800 }}>Ekibimize hoş geldiniz</div><div style={{ marginTop: "5px", color: "#ddd6fe", fontSize: "6px", lineHeight: 1.4 }}>Yeni çalışma dönemimiz bugün başlıyor.</div></div><div style={{ width: "38px", height: "38px", display: "grid", placeItems: "center", borderLeft: "1px solid rgba(255,255,255,.15)", color: "#c4b5fd", fontSize: "18px" }}>✦</div></div>
          </div>
        );
      case "notice-alert":
        return (
          <div style={{ ...screenStyle, background: "linear-gradient(145deg,#450a0a,#991b1b 58%,#dc2626)", alignItems: "stretch", padding: "15px 17px", fontFamily: "system-ui, sans-serif" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", height: "100%" }}><div style={{ width: "36px", height: "36px", display: "grid", placeItems: "center", flexShrink: 0, border: "1px solid rgba(255,255,255,.18)", borderRadius: "10px", color: "#fde68a", fontSize: "18px", fontWeight: 900 }}>!</div><div><div style={{ color: "#fde68a", fontSize: "6px", fontWeight: 900, letterSpacing: ".8px" }}>ÖNEMLİ DUYURU</div><div style={{ marginTop: "4px", fontSize: "14px", lineHeight: 1.05, fontWeight: 800 }}>Planlı güvenlik tatbikatı</div><div style={{ marginTop: "5px", color: "#fecaca", fontSize: "6px" }}>Bugün saat 14.00’te başlayacaktır.</div></div></div>
          </div>
        );
      case "qr-wifi":
        return (
          <div style={{ ...screenStyle, background: "linear-gradient(145deg,#022c22,#065f46 55%,#047857)", flexDirection: "row", gap: "14px", padding: "14px", fontFamily: "system-ui, sans-serif" }}>
            <div style={{ textAlign: "left", flex: 1 }}><div style={{ color: "#6ee7b7", fontSize: "6px", fontWeight: 900, letterSpacing: ".8px" }}>WI-FI</div><div style={{ marginTop: "5px", fontSize: "12px", lineHeight: 1.05, fontWeight: 800 }}>Misafir ağına bağlanın</div><div style={{ marginTop: "5px", color: "#a7f3d0", fontSize: "6px" }}>Kameranızı açın ve tarayın.</div></div><div style={{ width: "58px", height: "58px", display: "grid", gridTemplateColumns: "repeat(9,1fr)", padding: "5px", background: "#fff", borderRadius: "7px" }}>{Array.from({ length: 81 }).map((_, i) => <span key={i} style={{ background: ((i * 7 + Math.floor(i / 9) * 3) % 11) < 5 ? "#0f172a" : "#fff" }} />)}</div>
          </div>
        );
      case "qr-url":
        return (
          <div style={{ ...screenStyle, background: "linear-gradient(145deg,#fff,#f5f5f4)", color: "#1c1917", flexDirection: "row-reverse", gap: "14px", padding: "14px", fontFamily: "system-ui, sans-serif" }}>
            <div style={{ textAlign: "left", flex: 1 }}><div style={{ color: "#0f766e", fontSize: "6px", fontWeight: 900, letterSpacing: ".8px" }}>HIZLI ERİŞİM</div><div style={{ marginTop: "5px", fontSize: "12px", lineHeight: 1.05, fontWeight: 800 }}>Menüyü görüntüleyin</div><div style={{ marginTop: "5px", color: "#78716c", fontSize: "6px" }}>Tek taramayla içeriğe ulaşın.</div></div><div style={{ width: "58px", height: "58px", display: "grid", gridTemplateColumns: "repeat(9,1fr)", padding: "5px", background: "#fff", borderRadius: "7px", boxShadow: "0 7px 18px rgba(0,0,0,.12)" }}>{Array.from({ length: 81 }).map((_, i) => <span key={i} style={{ background: ((i * 5 + Math.floor(i / 9) * 7) % 13) < 6 ? "#0f172a" : "#fff" }} />)}</div>
          </div>
        );
      case "wayfinding-directory":
        return (
          <div style={{ ...screenStyle, background: "linear-gradient(145deg,#07111f,#0f1f33 58%,#162942)", alignItems: "stretch", justifyContent: "flex-start", padding: "12px 14px", fontFamily: "system-ui, sans-serif" }}>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "7px", borderBottom: "1px solid rgba(255,255,255,.12)" }}>
              <span style={{ color: "#f6c453", fontSize: "6px", fontWeight: 900, letterSpacing: ".8px" }}>OTEL REHBERİ</span>
              <span style={{ fontSize: "6px", color: "#a8b6c7" }}>● ANA LOBİ</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginTop: "8px" }}>
              {[["←", "Resepsiyon"], ["→", "Restoran"], ["↗", "Toplantı"], ["↙", "Spa"]].map(([arrow, label]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px", border: "1px solid rgba(255,255,255,.1)", borderRadius: "7px", background: "rgba(255,255,255,.05)" }}>
                  <span style={{ color: "#f6c453", fontSize: "14px" }}>{arrow}</span>
                  <span style={{ fontSize: "7px", fontWeight: 800 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case "wayfinding-spotlight":
        return (
          <div style={{ ...screenStyle, background: "linear-gradient(145deg,#fffdf8,#f5efe3 58%,#e9dfce)", color: "#29251f", flexDirection: "row", alignItems: "center", gap: "16px", padding: "17px", fontFamily: "system-ui, sans-serif" }}>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ color: "#a85d27", fontSize: "6px", fontWeight: 900, letterSpacing: ".8px" }}>SAĞA DÖNÜN</div>
              <div style={{ marginTop: "5px", fontSize: "17px", lineHeight: 1, fontWeight: 850 }}>Balo Salonu</div>
              <div style={{ marginTop: "7px", color: "#746b5e", fontSize: "6px" }}>2. Kat · 3 dk yürüme</div>
            </div>
            <div style={{ width: "62px", height: "62px", display: "grid", placeItems: "center", borderRadius: "20px", border: "1px solid rgba(168,93,39,.25)", background: "rgba(168,93,39,.08)", color: "#a85d27", fontSize: "38px" }}>→</div>
          </div>
        );
      case "events-schedule":
      case "events-live":
        return <div style={{ ...screenStyle, background: "linear-gradient(145deg,#080d18,#111c2e,#1b2a42)", alignItems: "stretch", padding: "12px 14px", fontFamily: "system-ui,sans-serif" }}><div style={{ display: "flex", justifyContent: "space-between", color: "#60a5fa", fontSize: 6, fontWeight: 900 }}><span>BUGÜNÜN ETKİNLİKLERİ</span><span>24 TEMMUZ</span></div><div style={{ display: "grid", gap: 5, marginTop: 8 }}>{[["09:30", "Yönetim Toplantısı", "→"], ["11:30", "Turizm Konferansı", "↑"], ["15:00", "Dijital Atölye", "←"]].map((event, index) => <div key={event[0]} style={{ display: "grid", gridTemplateColumns: "28px 1fr 15px", padding: 6, border: `1px solid ${index === 1 ? "#60a5fa" : "rgba(255,255,255,.1)"}`, borderRadius: 6, background: "rgba(255,255,255,.05)", fontSize: 7 }}><b style={{ color: index === 1 ? "#60a5fa" : "#fff" }}>{event[0]}</b><span>{event[1]}</span><b style={{ color: "#60a5fa", fontSize: 11 }}>{event[2]}</b></div>)}</div></div>;
      case "guide-grid":
      case "guide-featured":
        return <div style={{ ...screenStyle, background: "linear-gradient(145deg,#071522,#10283c,#183952)", alignItems: "stretch", padding: "12px 14px", fontFamily: "system-ui,sans-serif" }}><div style={{ color: "#d7b46a", fontSize: 6, fontWeight: 900 }}>OTEL REHBERİ</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 9 }}>{[["🍽", "Kahvaltı"], ["✦", "Spa"], ["⌁", "Wi-Fi"], ["i", "Concierge"]].map(item => <div key={item[1]} style={{ display: "flex", alignItems: "center", gap: 7, padding: 8, border: "1px solid rgba(255,255,255,.1)", borderRadius: 7, background: "rgba(255,255,255,.05)" }}><span style={{ color: "#d7b46a", fontSize: 12 }}>{item[0]}</span><b style={{ fontSize: 7 }}>{item[1]}</b></div>)}</div></div>;
      default:
        return <div style={screenStyle}>🌐</div>;
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 1100,
      background: "rgba(15, 23, 42, 0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backdropFilter: "blur(4px)",
    }}>
      {/* Modal Container */}
      <div style={{
        background: "#f8fafc",
        borderRadius: "16px",
        width: "90%",
        maxWidth: "840px",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        border: "1px solid #cbd5e1",
        animation: "modalSlideIn 0.25s ease-out"
      }}>
        
        {/* Top Header Card */}
        <div style={{
          backgroundColor: "#ffffff",
          padding: "24px 32px",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "relative"
        }}>
          {/* Left Block: Icon & Titles */}
          <div style={{ display: "flex", alignItems: "center", gap: "20px", minWidth: 0, flex: 1 }}>
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "12px",
              background: details.iconBg,
              color: "#ffffff",
              fontSize: "28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}>
              {details.icon}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>
                {details.title}
              </h2>
              <p style={{ margin: 0, fontSize: "14px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {details.subtitle}
              </p>
            </div>
          </div>

          {/* Right Block: Buttons & Close */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={() => alert("App guides are available in our Help center!")}
              style={{
                backgroundColor: "#ffffff",
                color: "#334155",
                fontWeight: 700,
                fontSize: "13px",
                padding: "10px 18px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8fafc"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#ffffff"}
            >
              App Guide
            </button>
            <button
              onClick={() => onGet(appId)}
              style={{
                backgroundColor: "#eab308", // Yellow color as requested in image template
                color: "#000000",
                fontWeight: 700,
                fontSize: "13px",
                padding: "10px 22px",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#ca8a04"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#eab308"}
            >
              {isAdded ? "Add Another" : "Get"}
            </button>
            
            {/* Close Cross Button */}
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "#64748b",
                cursor: "pointer",
                padding: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                marginLeft: "8px"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#f1f5f9";
                e.currentTarget.style.color = "#0f172a";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "#64748b";
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Feature Gallery Showcase Section */}
        <div style={{
          padding: "24px 32px",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f1f5f9"
        }}>
          {/* Left Navigation Arrow */}
          <button
            onClick={prevSlide}
            style={{
              position: "absolute",
              left: "16px",
              zIndex: 10,
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              backgroundColor: "#ffffff",
              border: "1px solid #cbd5e1",
              color: "#334155",
              fontSize: "16px",
              fontWeight: "bold",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 5px rgba(0,0,0,0.05)"
            }}
          >
            ‹
          </button>

          {/* Slider Container showing current card */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "24px",
            width: "100%",
            maxWidth: "760px",
            justifyItems: "center"
          }}>
            {details.features.map((feat, index) => {
              // Highlight selected slide or show both on larger desktop widths
              const isVisible = index === slideIndex;
              return (
                <div
                  key={feat.type}
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "12px",
                    padding: "16px 20px",
                    width: "100%",
                    maxWidth: "340px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                    animation: isVisible ? "slideFadeIn 0.3s ease-out" : "none"
                  }}
                >
                  <h4 style={{
                    margin: 0,
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#1e293b",
                    textAlign: "center",
                    lineHeight: "1.4",
                    minHeight: "36px",
                    display: "flex",
                    alignItems: "center"
                  }}>
                    {feat.header}
                  </h4>
                  {renderMockup(feat.type)}
                </div>
              );
            })}
          </div>

          {/* Right Navigation Arrow */}
          <button
            onClick={nextSlide}
            style={{
              position: "absolute",
              right: "16px",
              zIndex: 10,
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              backgroundColor: "#ffffff",
              border: "1px solid #cbd5e1",
              color: "#334155",
              fontSize: "16px",
              fontWeight: "bold",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 5px rgba(0,0,0,0.05)"
            }}
          >
            ›
          </button>
        </div>

        {/* Details & Specs Information Area */}
        <div style={{
          backgroundColor: "#ffffff",
          padding: "32px",
          display: "flex",
          flexDirection: "column",
          gap: "24px"
        }}>
          {/* About points list */}
          <div>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 800, color: "#1e293b" }}>
              About this app
            </h3>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "24px"
            }}>
              {details.aboutPoints.map((point) => (
                <div key={point.title} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <h5 style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                    {point.title}
                  </h5>
                  <p style={{ margin: 0, fontSize: "13px", color: "#64748b", lineHeight: "1.5" }}>
                    {point.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <hr style={{ border: "none", borderTop: "1px solid #f1f5f9", margin: 0 }} />

          {/* Categories tag list */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#64748b" }}>
              Categories:
            </span>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {details.categories.map((cat) => (
                <span
                  key={cat}
                  style={{
                    backgroundColor: "#f1f5f9",
                    color: "#475569",
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: "20px"
                  }}
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>
        </div>

      </div>

      <style jsx global>{`
        @keyframes modalSlideIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideFadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
