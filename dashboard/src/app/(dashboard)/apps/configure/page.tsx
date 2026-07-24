"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ClockPreview, ClockSettings, DEFAULT_CLOCK_CONFIG, normalizeClockConfig } from "@/components/clock/ClockStudio";
import { WeatherPreview, WeatherSettings, DEFAULT_WEATHER_CONFIG, normalizeWeatherConfig } from "@/components/weather/WeatherStudio";
import { RssPreview, RssSettings, DEFAULT_RSS_CONFIG, normalizeRssConfig } from "@/components/rss/RssStudio";
import { NoticePreview, NoticeSettings, DEFAULT_NOTICE_CONFIG, normalizeNoticeConfig } from "@/components/notice/NoticeStudio";
import { QrPreview, QrSettings, DEFAULT_QR_CONFIG, normalizeQrConfig } from "@/components/qrcode/QrStudio";
import { WayfindingPreview, WayfindingSettings, DEFAULT_WAYFINDING_CONFIG, normalizeWayfindingConfig } from "@/components/wayfinding/WayfindingStudio";
import { EventsPreview, EventsSettings, DEFAULT_EVENTS_CONFIG, normalizeEventsConfig } from "@/components/events/EventsStudio";
import { HotelGuidePreview, HotelGuideSettings, DEFAULT_HOTEL_GUIDE_CONFIG, normalizeHotelGuideConfig } from "@/components/hotel-guide/HotelGuideStudio";

type AppType = "clock" | "weather" | "rss" | "notice" | "qrcode" | "wayfinding" | "events" | "hotel-guide";

function AppConfigureForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const editId = searchParams.get("id");
  const createType = searchParams.get("type") as AppType | null;
  const [loadedType, setLoadedType] = useState<AppType | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [instanceName, setInstanceName] = useState("");

  // App type determination
  const appType: AppType = useMemo(() => {
    if (createType) return createType;
    if (loadedType) return loadedType;
    return "clock"; // default fallback
  }, [createType, loadedType]);

  // Unified dynamic configuration state
  const [config, setConfig] = useState<Record<string, any>>({});


  // Load initial configurations if editing
  useEffect(() => {
    if (!editId) {
      // Set default configurations for new instances
      setInstanceName(`New ${appType.charAt(0).toUpperCase() + appType.slice(1)} Instance`);
      if (appType === "clock") {
        setInstanceName("Yeni Modern Saat");
        setConfig(DEFAULT_CLOCK_CONFIG);
      } else if (appType === "weather") {
        setInstanceName("Yeni Hava Durumu");
        setConfig(DEFAULT_WEATHER_CONFIG);
      } else if (appType === "rss") {
        setInstanceName("Yeni RSS Akışı");
        setConfig(DEFAULT_RSS_CONFIG);
      } else if (appType === "notice") {
        setInstanceName("Yeni Duyuru");
        setConfig(DEFAULT_NOTICE_CONFIG);
      } else if (appType === "qrcode") {
        setInstanceName("Yeni QR Kod");
        setConfig(DEFAULT_QR_CONFIG);
      } else if (appType === "wayfinding") {
        setInstanceName("Lobi Yönlendirme");
        setConfig(DEFAULT_WAYFINDING_CONFIG);
      } else if (appType === "events") {
        setInstanceName("Bugünün Etkinlikleri");
        setConfig(DEFAULT_EVENTS_CONFIG);
      } else if (appType === "hotel-guide") {
        setInstanceName("Otel Rehberi");
        setConfig(DEFAULT_HOTEL_GUIDE_CONFIG);
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
            const itemConfig = item.app_config || item.appConfig || {};
            const storageType = String(item.storage_path || "").replace("app://", "").split("?")[0] ?? "";
            const itemType: AppType = ["clock", "weather", "rss", "notice", "qrcode", "wayfinding", "events", "hotel-guide"].includes(storageType)
              ? storageType as AppType
              : appType;
            setLoadedType(itemType);
            setConfig(itemType === "clock"
              ? normalizeClockConfig(itemConfig)
              : itemType === "weather"
                ? normalizeWeatherConfig(itemConfig)
                : itemType === "rss"
                  ? normalizeRssConfig(itemConfig)
                  : itemType === "notice"
                    ? normalizeNoticeConfig(itemConfig)
                    : itemType === "qrcode"
                      ? normalizeQrConfig(itemConfig)
                      : itemType === "wayfinding"
                        ? normalizeWayfindingConfig(itemConfig)
                        : itemType === "events"
                          ? normalizeEventsConfig(itemConfig)
                          : itemType === "hotel-guide"
                            ? normalizeHotelGuideConfig(itemConfig)
                            : itemConfig);
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
          <ClockSettings
            config={config}
            onChange={(nextConfig) => setConfig(nextConfig)}
          />
        );
      case "weather":
        return (
          <WeatherSettings
            config={config}
            onChange={(nextConfig) => setConfig(nextConfig)}
          />
        );
      case "rss":
        return (
          <RssSettings
            config={config}
            onChange={(nextConfig) => setConfig(nextConfig)}
          />
        );
      case "notice":
        return (
          <NoticeSettings
            config={config}
            onChange={(nextConfig) => setConfig(nextConfig)}
          />
        );
      case "qrcode":
        return (
          <QrSettings
            config={config}
            onChange={(nextConfig) => setConfig(nextConfig)}
          />
        );
      case "wayfinding":
        return <WayfindingSettings config={config} onChange={(nextConfig) => setConfig(nextConfig)} />;
      case "events":
        return <EventsSettings config={config} onChange={(nextConfig) => setConfig(nextConfig)} />;
      case "hotel-guide":
        return <HotelGuideSettings config={config} onChange={(nextConfig) => setConfig(nextConfig)} />;
    }
  };

  // Render dynamic interactive Preview panel on the right side
  const renderLivePreview = () => {
    switch (appType) {
      case "clock":
        return <ClockPreview config={config} />;
      case "weather":
        return <WeatherPreview config={config} />;
      case "rss":
        return <RssPreview config={config} />;
      case "notice":
        return <NoticePreview config={config} />;
      case "qrcode":
        return <QrPreview config={config} />;
      case "wayfinding":
        return <WayfindingPreview config={config} />;
      case "events":
        return <EventsPreview config={config} />;
      case "hotel-guide":
        return <HotelGuidePreview config={config} />;
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
            {appType === "clock" ? "🕒" : appType === "weather" ? "🌤️" : appType === "rss" ? "📰" : appType === "notice" ? "📢" : appType === "qrcode" ? "📱" : appType === "wayfinding" ? "⌖" : appType === "events" ? "▦" : "i"}
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
