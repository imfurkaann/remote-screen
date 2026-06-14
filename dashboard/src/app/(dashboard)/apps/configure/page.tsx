"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type AppType = "clock" | "weather" | "rss" | "notice" | "qrcode";

// Available Timezones for Clock dropdown
const TIMEZONES = [
  { label: "Local Time", value: "local" },
  { label: "Istanbul (GMT+3)", value: "Europe/Istanbul" },
  { label: "London (GMT)", value: "Europe/London" },
  { label: "New York (EST)", value: "America/New_York" },
  { label: "Tokyo (JST)", value: "Asia/Tokyo" },
  { label: "Paris (CET)", value: "Europe/Paris" },
  { label: "Sydney (AEDT)", value: "Australia/Sydney" }
];

function AppConfigureForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const editId = searchParams.get("id");
  const createType = searchParams.get("type") as AppType | null;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [instanceName, setInstanceName] = useState("");
  
  // App type determination
  const appType: AppType = useMemo(() => {
    if (createType) return createType;
    return "clock"; // default fallback
  }, [createType]);

  // Unified dynamic configuration state
  const [config, setConfig] = useState<Record<string, any>>({});

  // Clock preview tick state
  const [previewTime, setPreviewTime] = useState("");
  const [rotation, setRotation] = useState({ hr: 0, min: 0, sec: 0 });

  // Load initial configurations if editing
  useEffect(() => {
    if (!editId) {
      // Set default configurations for new instances
      setInstanceName(`New ${appType.charAt(0).toUpperCase() + appType.slice(1)} Instance`);
      if (appType === "clock") {
        setConfig({ timezone: "local", format: "24h", showSeconds: true, theme: "glassmorphism", layout: "hybrid" });
      } else if (appType === "weather") {
        setConfig({ city: "Istanbul", units: "metric", theme: "glassmorphism" });
      } else if (appType === "rss") {
        setConfig({ rssUrl: "https://feeds.bbci.co.uk/news/rss.xml", speed: "medium", layout: "ticker" });
      } else if (appType === "notice") {
        setConfig({ headline: "Notice Title", body: "Type your message here.", icon: "info", bgColor: "#4c1d95", textColor: "#ffffff" });
      } else if (appType === "qrcode") {
        setConfig({ url: "https://screencloud.com", title: "Scan QR Code", description: "Use your phone camera to scan." });
      }
      return;
    }

    const loadInstance = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/content/media", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const item = (data.media ?? []).find((m: any) => m.id === editId);
          if (item) {
            setInstanceName(item.filename);
            setConfig(item.appConfig || {});
          }
        }
      } catch (err) {
        console.error("Failed to load app instance details", err);
      } finally {
        setLoading(false);
      }
    };

    void loadInstance();
  }, [editId, appType]);

  // Live preview clock updater
  useEffect(() => {
    if (appType !== "clock") return;
    const updatePreviewTime = () => {
      const timezone = config.timezone || "local";
      const format = config.format || "24h";
      const showSeconds = config.showSeconds !== false;

      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone === "local" ? undefined : timezone,
        hour: "numeric",
        minute: "numeric",
        second: showSeconds ? "numeric" : undefined,
        hour12: format === "12h"
      };

      try {
        setPreviewTime(new Intl.DateTimeFormat("en-US", options).format(new Date()));
      } catch {
        setPreviewTime(new Date().toLocaleTimeString());
      }

      // Calculate hand angles for analog/hybrid preview
      const date = new Date();
      let tzDate = date;
      if (timezone !== "local") {
        try {
          tzDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
        } catch (e) {}
      }
      const hr = tzDate.getHours();
      const min = tzDate.getMinutes();
      const sec = tzDate.getSeconds();
      setRotation({
        hr: (hr % 12) * 30 + min * 0.5,
        min: min * 6 + sec * 0.1,
        sec: sec * 6
      });
    };

    updatePreviewTime();
    const timer = setInterval(updatePreviewTime, 1000);
    return () => clearInterval(timer);
  }, [appType, config.timezone, config.format, config.showSeconds]);

  // Handle configuration changes
  const updateConfig = (key: string, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Submit form (Save app instance)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceName.trim()) {
      alert("Please enter an instance name.");
      return;
    }

    setSaving(true);
    try {
      const url = editId ? `/api/apps/update-app/${editId}` : "/api/apps/create-app";
      const method = editId ? "PUT" : "POST";
      const bodyPayload = editId
        ? { name: instanceName.trim(), config }
        : { name: instanceName.trim(), appType, config };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });

      if (res.ok) {
        router.push("/apps");
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.message || "Failed to save configuration.");
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("An unexpected error occurred while saving.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "48px", textAlign: "center", color: "#64748b" }}>
        <h3>Loading app configuration settings...</h3>
      </div>
    );
  }

  // Render the left panel configuration inputs dynamically based on App Type
  const renderConfigForm = () => {
    switch (appType) {
      case "clock":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Timezone</label>
              <select
                value={config.timezone || "local"}
                onChange={(e) => updateConfig("timezone", e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Time Format</label>
              <div style={{ display: "flex", gap: "12px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="format"
                    checked={config.format === "24h"}
                    onChange={() => updateConfig("format", "24h")}
                    style={{ width: "16px", height: "16px", accentColor: "var(--primary)" }}
                  />
                  24-Hour (14:30)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="format"
                    checked={config.format === "12h"}
                    onChange={() => updateConfig("format", "12h")}
                    style={{ width: "16px", height: "16px", accentColor: "var(--primary)" }}
                  />
                  12-Hour (2:30 PM)
                </label>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyItems: "center", gap: "10px" }}>
              <input
                type="checkbox"
                id="showSeconds"
                checked={config.showSeconds !== false}
                onChange={(e) => updateConfig("showSeconds", e.target.checked)}
                style={{ width: "18px", height: "18px", accentColor: "var(--primary)", cursor: "pointer" }}
              />
              <label htmlFor="showSeconds" style={{ fontSize: "14px", fontWeight: 600, color: "#334155", cursor: "pointer" }}>
                Show Seconds ticking
              </label>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Clock Layout</label>
              <select
                value={config.layout || "hybrid"}
                onChange={(e) => updateConfig("layout", e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              >
                <option value="hybrid">Hybrid (Analog + Digital) [Modern]</option>
                <option value="digital">Digital Only</option>
                <option value="analog">Analog Only</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Theme style</label>
              <select
                value={config.theme || "glassmorphism"}
                onChange={(e) => updateConfig("theme", e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              >
                <option value="glassmorphism">Glassmorphism (Dynamic/Modern)</option>
                <option value="dark">Dark Theme</option>
                <option value="light">Light Theme</option>
              </select>
            </div>
          </div>
        );
      case "weather":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>City / Location Name</label>
              <input
                type="text"
                placeholder="e.g. Istanbul, London, Paris"
                value={config.city || ""}
                onChange={(e) => updateConfig("city", e.target.value)}
                required
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Temperature Unit</label>
              <select
                value={config.units || "metric"}
                onChange={(e) => updateConfig("units", e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              >
                <option value="metric">Celsius (°C)</option>
                <option value="imperial">Fahrenheit (°F)</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Theme style</label>
              <select
                value={config.theme || "glassmorphism"}
                onChange={(e) => updateConfig("theme", e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              >
                <option value="glassmorphism">Glassmorphism</option>
                <option value="dark">Dark Mode</option>
                <option value="light">Light Mode</option>
              </select>
            </div>
          </div>
        );
      case "rss":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>RSS Feed URL</label>
              <input
                type="url"
                placeholder="https://example.com/rss.xml"
                value={config.rssUrl || ""}
                onChange={(e) => updateConfig("rssUrl", e.target.value)}
                required
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              />
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                Ensure this is a valid XML RSS feed url (e.g. BBC, Reuters, or blog feeds).
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Ticker Speed</label>
              <select
                value={config.speed || "medium"}
                onChange={(e) => updateConfig("speed", e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              >
                <option value="slow">Slow</option>
                <option value="medium">Medium</option>
                <option value="fast">Fast</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Layout Style</label>
              <select
                value={config.layout || "ticker"}
                onChange={(e) => updateConfig("layout", e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              >
                <option value="ticker">Scrolling Bottom Ticker</option>
                <option value="cards">Full-Screen Cycle Cards</option>
              </select>
            </div>
          </div>
        );
      case "notice":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Headline Title</label>
              <input
                type="text"
                placeholder="Welcome Guest, Emergency Alert etc."
                value={config.headline || ""}
                onChange={(e) => updateConfig("headline", e.target.value)}
                required
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Message Description</label>
              <textarea
                placeholder="Write notice details..."
                value={config.body || ""}
                onChange={(e) => updateConfig("body", e.target.value)}
                rows={4}
                required
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontFamily: "inherit", resize: "none" }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Alert Icon</label>
              <select
                value={config.icon || "info"}
                onChange={(e) => updateConfig("icon", e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              >
                <option value="info">Information (ℹ️)</option>
                <option value="warning">Warning (⚠️)</option>
                <option value="alert">Critical Alert (🚨)</option>
                <option value="checkmark">Success (✅)</option>
                <option value="none">No Icon (Clean)</option>
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Card Background</label>
                <input
                  type="color"
                  value={config.bgColor || "#4c1d95"}
                  onChange={(e) => updateConfig("bgColor", e.target.value)}
                  style={{ width: "100%", height: "40px", padding: "2px", border: "1px solid #cbd5e1", borderRadius: "8px", cursor: "pointer" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Text Color</label>
                <input
                  type="color"
                  value={config.textColor || "#ffffff"}
                  onChange={(e) => updateConfig("textColor", e.target.value)}
                  style={{ width: "100%", height: "40px", padding: "2px", border: "1px solid #cbd5e1", borderRadius: "8px", cursor: "pointer" }}
                />
              </div>
            </div>
          </div>
        );
      case "qrcode":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Target URL / Link</label>
              <input
                type="url"
                placeholder="https://mywebsite.com/menu"
                value={config.url || ""}
                onChange={(e) => updateConfig("url", e.target.value)}
                required
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Header Title</label>
              <input
                type="text"
                placeholder="e.g. Scan Wi-Fi / Visit Menu"
                value={config.title || ""}
                onChange={(e) => updateConfig("title", e.target.value)}
                required
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>Description Text</label>
              <textarea
                placeholder="Instructions on how to scan..."
                value={config.description || ""}
                onChange={(e) => updateConfig("description", e.target.value)}
                rows={3}
                required
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontFamily: "inherit", resize: "none" }}
              />
            </div>
          </div>
        );
    }
  };

  // Render dynamic interactive Preview panel on the right side
  const renderLivePreview = () => {
    const previewContainerStyle: React.CSSProperties = {
      width: "100%",
      height: "300px",
      backgroundColor: config.theme === "light" && appType !== "rss" && appType !== "notice" ? "#f8fafc" : "#0d0e12",
      borderRadius: "16px",
      border: "4px solid #1e293b",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      color: config.theme === "light" && appType !== "rss" && appType !== "notice" ? "#0f172a" : "#ffffff",
      overflow: "hidden",
      position: "relative",
      boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), inset 0 0 40px rgba(0,0,0,0.6)"
    };

    switch (appType) {
      case "clock":
        {
          const theme = config.theme || "glassmorphism";
          const layout = config.layout || "hybrid";
          const isDigital = layout === "digital";
          const isHybrid = layout === "hybrid";
          const showSeconds = config.showSeconds !== false;
          
          return (
            <div style={previewContainerStyle}>
              {isDigital ? (
                <div style={{
                  textAlign: "center",
                  padding: "24px 36px",
                  borderRadius: "16px",
                  background: theme === "glassmorphism" ? "linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)" : theme === "dark" ? "rgba(30, 41, 59, 0.8)" : "rgba(255, 255, 255, 0.9)",
                  border: `1px solid ${theme === "light" ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)"}`,
                  backdropFilter: theme === "glassmorphism" ? "blur(8px)" : "none",
                  minWidth: "240px",
                  color: theme === "light" ? "#0f172a" : "#f8fafc"
                }}>
                  <div style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#10b981",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}>
                    {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(new Date())}
                  </div>
                  <div style={{ fontSize: "42px", fontWeight: 800, margin: "8px 0", letterSpacing: "-1px" }}>
                    {previewTime || "00:00:00"}
                  </div>
                  <div style={{ fontSize: "11px", color: theme === "light" ? "#64748b" : "#94a3b8" }}>
                    {(config.timezone || "local") === "local" ? "Local Device Timezone" : config.timezone}
                  </div>
                </div>
              ) : (
                <div style={{
                  position: "relative",
                  width: "220px",
                  height: "220px",
                  borderRadius: "50%",
                  border: `3px solid ${theme === "light" ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.15)"}`,
                  background: theme === "glassmorphism" ? "radial-gradient(circle, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)" : theme === "dark" ? "rgba(15,23,42,0.6)" : "rgba(255,255,255,0.85)",
                  backdropFilter: theme === "glassmorphism" ? "blur(8px)" : "none",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  {/* Ticks */}
                  <div style={{ position: "absolute", width: "100%", height: "100%", top: 0, left: 0, pointerEvents: "none" }}>
                    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                      <div key={deg} style={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        transform: `rotate(${deg}deg)`
                      }}>
                        <div style={{
                          position: "absolute",
                          top: "6px",
                          left: "50%",
                          width: deg % 90 === 0 ? "3px" : "1.5px",
                          height: deg % 90 === 0 ? "10px" : "6px",
                          backgroundColor: deg % 90 === 0 ? "#10b981" : theme === "light" ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.3)",
                          transform: "translateX(-50%)",
                          borderRadius: "1px"
                        }} />
                      </div>
                    ))}
                  </div>

                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    zIndex: 1,
                    color: theme === "light" ? "#0f172a" : "#f8fafc"
                  }}>
                    <div style={{
                      fontSize: "8px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      color: "#10b981",
                      letterSpacing: "0.5px"
                    }}>
                      {new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric" }).format(new Date())}
                    </div>
                    {isHybrid && (
                      <div style={{
                        fontSize: "18px",
                        fontWeight: 800,
                        margin: "4px 0",
                        letterSpacing: "-0.5px"
                      }}>
                        {previewTime.split(" ")[0]}
                      </div>
                    )}
                    <div style={{ fontSize: "8px", color: theme === "light" ? "#64748b" : "#94a3b8" }}>
                      {(config.timezone || "local") === "local" ? "Local" : config.timezone?.split?.("/")?.[1] || config.timezone}
                    </div>
                  </div>

                  {/* Hands */}
                  <div style={{
                    position: "absolute",
                    bottom: "50%",
                    left: "50%",
                    width: "4px",
                    height: "45px",
                    backgroundColor: theme === "light" ? "#0f172a" : "#f8fafc",
                    borderRadius: "3px",
                    transformOrigin: "50% 100%",
                    transform: `translateX(-50%) rotate(${rotation.hr}deg)`,
                    zIndex: 3
                  }} />
                  <div style={{
                    position: "absolute",
                    bottom: "50%",
                    left: "50%",
                    width: "2.5px",
                    height: "60px",
                    backgroundColor: theme === "light" ? "#334155" : "#cbd5e1",
                    borderRadius: "2px",
                    transformOrigin: "50% 100%",
                    transform: `translateX(-50%) rotate(${rotation.min}deg)`,
                    zIndex: 2
                  }} />
                  {showSeconds && (
                    <div style={{
                      position: "absolute",
                      bottom: "50%",
                      left: "50%",
                      width: "1px",
                      height: "70px",
                      backgroundColor: "#10b981",
                      transformOrigin: "50% 100%",
                      transform: `translateX(-50%) rotate(${rotation.sec}deg)`,
                      zIndex: 4
                    }} />
                  )}
                  <div style={{
                    position: "absolute",
                    width: "6px",
                    height: "6px",
                    backgroundColor: "#10b981",
                    borderRadius: "50%",
                    zIndex: 5
                  }} />
                </div>
              )}
            </div>
          );
        }
      case "weather":
        return (
          <div style={previewContainerStyle}>
            <div style={{
              background: config.theme === "glassmorphism" ? "rgba(255, 255, 255, 0.05)" : config.theme === "dark" ? "rgba(30, 41, 59, 0.8)" : "rgba(255, 255, 255, 0.95)",
              border: `1px solid ${config.theme === "light" ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)"}`,
              backdropFilter: config.theme === "glassmorphism" ? "blur(8px)" : "none",
              borderRadius: "16px",
              padding: "24px",
              width: "280px",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "18px", fontWeight: 800 }}>{config.city || "Istanbul"}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", margin: "12px 0" }}>
                <span style={{ fontSize: "36px" }}>🌤️</span>
                <span style={{ fontSize: "36px", fontWeight: 800 }}>
                  {config.units === "imperial" ? "72°F" : "22°C"}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--primary)", fontWeight: 700, marginBottom: "16px" }}>Partly Cloudy</div>
              
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${config.theme === "light" ? "#e2e8f0" : "#334155"}`, paddingTop: "12px", fontSize: "11px" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ color: "#64748b" }}>Mon</span>
                  <span>☀️</span>
                  <span style={{ fontWeight: "bold" }}>{config.units === "imperial" ? "75°" : "24°"}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ color: "#64748b" }}>Tue</span>
                  <span>☁️</span>
                  <span style={{ fontWeight: "bold" }}>{config.units === "imperial" ? "68°" : "20°"}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ color: "#64748b" }}>Wed</span>
                  <span>🌧️</span>
                  <span style={{ fontWeight: "bold" }}>{config.units === "imperial" ? "64°" : "18°"}</span>
                </div>
              </div>
            </div>
          </div>
        );
      case "rss":
        return (
          <div style={previewContainerStyle}>
            {config.layout === "ticker" ? (
              <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", color: "#64748b", padding: "20px", textAlign: "center" }}>
                  Background media plays here while ticker scrolls at the bottom...
                </div>
                {/* Scrolling Marquee bar */}
                <div style={{ width: "100%", height: "50px", backgroundColor: "#1e293b", borderTop: "2px solid var(--primary)", display: "flex", alignItems: "center", overflow: "hidden" }}>
                  <span style={{ backgroundColor: "var(--primary)", color: "#000000", fontWeight: "bold", fontSize: "11px", padding: "0 14px", height: "100%", display: "flex", alignItems: "center", zIndex: 5 }}>NEWS</span>
                  <div 
                    style={{ overflow: "hidden", whiteSpace: "nowrap", flex: 1 }}
                    dangerouslySetInnerHTML={{ 
                      __html: `<marquee style="color: #ffffff; font-size: 14px; font-weight: 600; margin: 0;">⚡ ${instanceName}: Local news and weather updates streaming live... ✦ Feed parsed successfully.</marquee>` 
                    }}
                  />
                </div>
              </div>
            ) : (
              // Cards layout
              <div style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "16px",
                padding: "24px",
                maxWidth: "280px",
                textAlign: "left"
              }}>
                <span style={{ fontSize: "9px", fontWeight: "bold", color: "var(--primary)" }}>BBC NEWS</span>
                <div style={{ fontSize: "15px", fontWeight: 800, margin: "8px 0", lineHeight: "1.3" }}>
                  New solar panels yield double performance metrics
                </div>
                <div style={{ fontSize: "11px", color: "#94a3b8", lineHeight: "1.4" }}>
                  A brand new testing site confirms solar panels generated peak capacities...
                </div>
              </div>
            )}
          </div>
        );
      case "notice":
        return (
          <div style={previewContainerStyle}>
            <div style={{
              backgroundColor: config.bgColor || "#4c1d95",
              color: config.textColor || "#ffffff",
              padding: "24px 32px",
              borderRadius: "20px",
              width: "280px",
              textAlign: "center",
              boxShadow: "0 10px 15px -3px rgba(0,0,0,0.3)"
            }}>
              {config.icon !== "none" && (
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>
                  {config.icon === "info" ? "ℹ️" : config.icon === "warning" ? "⚠️" : config.icon === "alert" ? "🚨" : "✅"}
                </div>
              )}
              <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: 800 }}>
                {config.headline || "Notice"}
              </h3>
              <p style={{ margin: 0, fontSize: "12px", opacity: 0.9, lineHeight: "1.5" }}>
                {config.body || "Notice message details."}
              </p>
            </div>
          </div>
        );
      case "qrcode":
        return (
          <div style={previewContainerStyle}>
            <div style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px",
              padding: "24px",
              textAlign: "center",
              width: "240px"
            }}>
              <div style={{ fontSize: "14px", fontWeight: 800, marginBottom: "12px" }}>
                {config.title || "Scan the QR Code"}
              </div>
              {/* Fake QR Image Grid */}
              <div style={{
                backgroundColor: "#ffffff",
                padding: "12px",
                borderRadius: "10px",
                display: "inline-block",
                marginBottom: "12px"
              }}>
                <div style={{ width: "90px", height: "90px", display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "2px" }}>
                  {Array.from({ length: 36 }).map((_, i) => (
                    <div key={i} style={{ backgroundColor: Math.random() > 0.45 ? "#000000" : "#ffffff" }} />
                  ))}
                </div>
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8", lineHeight: "1.4" }}>
                {config.description || "Point camera to scan URL link."}
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", minHeight: "100%", backgroundColor: "#f4f5f7" }}>
      {/* Configure Page Header */}
      <header style={{
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        padding: "16px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "24px"
      }}>
        {/* Left: Icon and Instance name input */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexGrow: 1, maxWidth: "500px" }}>
          <div style={{
            width: "40px",
            height: "40px",
            borderRadius: "8px",
            background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
            color: "#ffffff",
            fontSize: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}>
            {appType === "clock" ? "🕒" : appType === "weather" ? "🌤️" : appType === "rss" ? "📰" : appType === "notice" ? "📢" : "📱"}
          </div>
          
          <input
            type="text"
            placeholder="Instance Name..."
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            required
            style={{
              fontSize: "18px",
              fontWeight: 800,
              color: "#0f172a",
              border: "1px solid transparent",
              borderRadius: "6px",
              padding: "6px 10px",
              width: "100%",
              outline: "none",
              backgroundColor: "transparent",
              transition: "all 0.15s"
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#cbd5e1";
              e.target.style.backgroundColor = "#ffffff";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "transparent";
              e.target.style.backgroundColor = "transparent";
            }}
          />
        </div>

        {/* Right buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link
            href="/apps"
            style={{
              backgroundColor: "#ffffff",
              color: "#334155",
              fontWeight: 600,
              fontSize: "13px",
              padding: "10px 18px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              textDecoration: "none",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center"
            }}
          >
            Cancel
          </Link>
          
          <button
            type="submit"
            disabled={saving}
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
            {saving ? "Saving..." : "Save & Close"}
          </button>
        </div>
      </header>

      {/* Main Split Layout Content */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        padding: "32px",
        gap: "32px",
        flexGrow: 1,
        maxWidth: "1200px",
        margin: "0 auto",
        width: "100%"
      }}>
        {/* Left Side: Form Settings */}
        <div style={{
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          padding: "24px 32px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          display: "flex",
          flexDirection: "column",
          gap: "24px"
        }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#1e293b", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
            Widget Configuration
          </h3>
          
          {renderConfigForm()}
        </div>

        {/* Right Side: Live Interactive Mockup Preview */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          position: "sticky",
          top: "32px",
          height: "fit-content"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Live Signage Preview
            </span>
            <span style={{ fontSize: "11px", backgroundColor: "#e2e8f0", color: "#475569", fontWeight: 700, padding: "2px 8px", borderRadius: "20px" }}>
              16:9 Screen
            </span>
          </div>

          {renderLivePreview()}

          <div style={{ fontSize: "12px", color: "#94a3b8", textAlign: "center", lineHeight: "1.5" }}>
            This preview simulates how the widget displays on the physical remote screen. Changes are updated in real-time as you type or adjust configurations.
          </div>
        </div>
      </div>
    </form>
  );
}

export default function ConfigurePage() {
  return (
    <Suspense fallback={<div style={{ padding: "48px", textAlign: "center", color: "#64748b" }}>Loading Configuration Page...</div>}>
      <AppConfigureForm />
    </Suspense>
  );
}
