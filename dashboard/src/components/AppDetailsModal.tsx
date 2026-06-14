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
    subtitle: "Display time and date with customizable themes and styles.",
    icon: "🕒",
    iconBg: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
    features: [
      { header: "A simple & clean digital clock that displays your location's time", type: "clock-digital" },
      { header: "Choose the style, format and theme of your clock", type: "clock-flip" }
    ],
    aboutPoints: [
      { title: "Choose from three clock styles", desc: "Choose between a digital, flip or minimal clock to match your style." },
      { title: "Include todays date along side the time", desc: "Display the day and date to never miss a day." },
      { title: "Choose any time zone in the world", desc: "Display the time zone relevant to your location." }
    ],
    categories: ["Discover", "All Apps", "Internal Communication"]
  },
  weather: {
    title: "Weather App",
    subtitle: "Real-time weather forecasts and conditions formatted for digital signs.",
    icon: "🌤️",
    iconBg: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    features: [
      { header: "Display up-to-date temperature and hourly predictions", type: "weather-today" },
      { header: "Automatically display readings by location with 3-day view", type: "weather-forecast" }
    ],
    aboutPoints: [
      { title: "Real-time updates", desc: "Always up-to-date conditions retrieved directly from global weather networks." },
      { title: "Celsius and Fahrenheit", desc: "Configure temperature metrics to suit your regional viewers." },
      { title: "3-Day forecast cards", desc: "Give your audience forecast outlooks at a single glance." }
    ],
    categories: ["Discover", "All Apps", "Live Feeds"]
  },
  rss: {
    title: "RSS News Feed",
    subtitle: "Display scrolling news tickers or headline cards from any RSS source.",
    icon: "📰",
    iconBg: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
    features: [
      { header: "Scroll news tickers continuously at the bottom of the screen", type: "rss-ticker" },
      { header: "Display large news cards with summaries and visual cards", type: "rss-cards" }
    ],
    aboutPoints: [
      { title: "Any RSS feed URL", desc: "Simply input standard feeds like BBC News, Reuters, or internal blogs." },
      { title: "Adjustable scroll speeds", desc: "Ensure news is comfortable to read with speed settings." },
      { title: "Clean card layouts", desc: "Animate cards smoothly for dynamic, eye-catching text rotations." }
    ],
    categories: ["Live Feeds", "All Apps"]
  },
  notice: {
    title: "Notice Board",
    subtitle: "Post visual bulletin board slides, welcome signs, or warnings.",
    icon: "📢",
    iconBg: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
    features: [
      { header: "Create welcoming announcements or company milestones", type: "notice-welcome" },
      { header: "Broadcast warnings and critical notifications", type: "notice-alert" }
    ],
    aboutPoints: [
      { title: "Rich visual banners", desc: "Make text pop with colorful backgrounds and gradients." },
      { title: "Integrated icons", desc: "Select icons like Info, Warning, Alert, or Checkmarks to call attention." },
      { title: "Slide-up entrances", desc: "Add subtle animations to notices for premium visual appeal." }
    ],
    categories: ["Internal Communication", "All Apps", "Bespoke Content Creation"]
  },
  qrcode: {
    title: "QR Code Generator",
    subtitle: "Display QR Codes instantly to direct viewers to website links.",
    icon: "📱",
    iconBg: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
    features: [
      { header: "Direct visitors to Wi-Fi credentials or feedback forms", type: "qr-wifi" },
      { header: "Display menu lists and contact URLs easily", type: "qr-url" }
    ],
    aboutPoints: [
      { title: "High-contrast QR generation", desc: "Ensures codes scan quickly from across the room." },
      { title: "Custom headings", desc: "Accompany the QR code with actionable headers like 'Scan Me' or 'Wi-Fi Name'." },
      { title: "Fully offline capable", desc: "Saves code details locally, continuing to render even when internet is lost." }
    ],
    categories: ["Content & Files", "All Apps", "Miscellaneous"]
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
      case "clock-flip":
        return (
          <div style={screenStyle}>
            <div style={{ display: "flex", gap: "6px" }}>
              <div style={{ padding: "6px 8px", backgroundColor: "#1f2937", borderRadius: "4px", fontSize: "20px", fontWeight: "bold", borderBottom: "2px solid #111827" }}>10</div>
              <div style={{ padding: "6px 8px", backgroundColor: "#1f2937", borderRadius: "4px", fontSize: "20px", fontWeight: "bold", borderBottom: "2px solid #111827" }}>10</div>
            </div>
            <div style={{ fontSize: "9px", color: "#9ca3af", marginTop: "8px" }}>AM · EST</div>
          </div>
        );
      case "weather-today":
        return (
          <div style={screenStyle}>
            <div style={{ fontSize: "10px", color: "#9ca3af" }}>LONDON</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
              <span style={{ fontSize: "24px" }}>🌤️</span>
              <span style={{ fontSize: "24px", fontWeight: "bold" }}>21°C</span>
            </div>
            <div style={{ fontSize: "9px", color: "#10b981", marginTop: "4px" }}>Wind: 12 km/h · Clear</div>
          </div>
        );
      case "weather-forecast":
        return (
          <div style={screenStyle}>
            <div style={{ fontSize: "9px", color: "#9ca3af", marginBottom: "4px" }}>ISTANBUL 3-DAY</div>
            <div style={{ display: "flex", gap: "10px", fontSize: "10px" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span>Mon</span><span>☀️</span><span style={{ fontWeight: "bold" }}>24°</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", borderLeft: "1px solid #1f2937", paddingLeft: "8px" }}>
                <span>Tue</span><span>🌧️</span><span style={{ fontWeight: "bold" }}>18°</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", borderLeft: "1px solid #1f2937", paddingLeft: "8px" }}>
                <span>Wed</span><span>🌤️</span><span style={{ fontWeight: "bold" }}>22°</span>
              </div>
            </div>
          </div>
        );
      case "rss-ticker":
        return (
          <div style={screenStyle}>
            <div style={{ width: "100%", height: "80%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", padding: "8px", textAlign: "center", color: "#9ca3af" }}>
              Breaking: Major Tech Release Confirmed!
            </div>
            <div style={{ width: "100%", height: "20px", backgroundColor: "#b91c1c", color: "#ffffff", fontSize: "9px", display: "flex", alignItems: "center", padding: "0 6px", whiteSpace: "nowrap" }}>
              ⚡ LIVE NEWS TICKER: Market response shows massive gain...
            </div>
          </div>
        );
      case "rss-cards":
        return (
          <div style={screenStyle}>
            <div style={{ padding: "10px", width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <span style={{ fontSize: "8px", color: "#ef4444", fontWeight: "bold" }}>REUTERS</span>
              <p style={{ margin: 0, fontSize: "11px", fontWeight: "bold", lineHeight: "1.3", color: "#ffffff" }}>NASA Mars Mission Encounters Groundbreaking Soil Samples</p>
              <span style={{ fontSize: "8px", color: "#9ca3af" }}>2 mins ago</span>
            </div>
          </div>
        );
      case "notice-welcome":
        return (
          <div style={{ ...screenStyle, background: "linear-gradient(135deg, #4c1d95 0%, #1e1b4b 100%)" }}>
            <div style={{ fontSize: "22px" }}>👋</div>
            <h4 style={{ margin: "2px 0 0", fontSize: "12px", fontWeight: "bold" }}>Welcome Furkan!</h4>
            <p style={{ margin: 0, fontSize: "8px", color: "#c084fc", marginTop: "2px" }}>DeepMind Signage Guest Space</p>
          </div>
        );
      case "notice-alert":
        return (
          <div style={{ ...screenStyle, background: "#7f1d1d" }}>
            <div style={{ fontSize: "20px" }}>⚠️</div>
            <h4 style={{ margin: "2px 0 0", fontSize: "11px", fontWeight: "bold", textTransform: "uppercase" }}>Fire Drill</h4>
            <p style={{ margin: 0, fontSize: "8px", color: "#fca5a5", marginTop: "2px" }}>Scheduled for 2:00 PM today</p>
          </div>
        );
      case "qr-wifi":
        return (
          <div style={screenStyle}>
            <span style={{ fontSize: "9px", color: "#9ca3af", marginBottom: "4px" }}>GUEST WI-FI</span>
            {/* Simulated QR Code */}
            <div style={{ width: "45px", height: "45px", backgroundColor: "#ffffff", padding: "3px", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "2px" }}>
              {Array.from({ length: 25 }).map((_, i) => (
                <div key={i} style={{ backgroundColor: Math.random() > 0.45 ? "#000000" : "#ffffff" }} />
              ))}
            </div>
            <span style={{ fontSize: "8px", color: "#10b981", marginTop: "4px", fontWeight: "bold" }}>SSID: Office_Guest</span>
          </div>
        );
      case "qr-url":
        return (
          <div style={screenStyle}>
            <span style={{ fontSize: "8px", color: "#9ca3af", marginBottom: "4px" }}>SCAN FOR MENU</span>
            <div style={{ width: "45px", height: "45px", backgroundColor: "#ffffff", padding: "3px", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "2px" }}>
              {Array.from({ length: 25 }).map((_, i) => (
                <div key={i} style={{ backgroundColor: Math.random() > 0.4 ? "#000000" : "#ffffff" }} />
              ))}
            </div>
            <span style={{ fontSize: "8px", color: "#3b82f6", marginTop: "4px" }}>Scan to browse items</span>
          </div>
        );
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
