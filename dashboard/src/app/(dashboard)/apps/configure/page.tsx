"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ClockPreview, ClockSettings, ClockTools, DEFAULT_CLOCK_CONFIG, normalizeClockConfig } from "@/components/clock/ClockStudio";
import { WeatherPreview, WeatherSettings, WeatherTools, DEFAULT_WEATHER_CONFIG, normalizeWeatherConfig } from "@/components/weather/WeatherStudio";
import { RssPreview, RssSettings, DEFAULT_RSS_CONFIG, normalizeRssConfig } from "@/components/rss/RssStudio";
import { NoticePreview, NoticeSettings, DEFAULT_NOTICE_CONFIG, normalizeNoticeConfig } from "@/components/notice/NoticeStudio";
import { QrPreview, QrSettings, DEFAULT_QR_CONFIG, normalizeQrConfig } from "@/components/qrcode/QrStudio";
import { WayfindingPreview, WayfindingSettings, DEFAULT_WAYFINDING_CONFIG, normalizeWayfindingConfig } from "@/components/wayfinding/WayfindingStudio";
import { EventsPreview, EventsSettings, EventsTools, DEFAULT_EVENTS_CONFIG, normalizeEventsConfig } from "@/components/events/EventsStudio";
import { HotelGuidePreview, HotelGuideSettings, DEFAULT_HOTEL_GUIDE_CONFIG, normalizeHotelGuideConfig } from "@/components/hotel-guide/HotelGuideStudio";
import { createRestaurantMenuTemplate, RestaurantMenuPreview, RestaurantMenuSettings, RestaurantMenuTextTools, normalizeRestaurantMenuConfig, type RestaurantMenuTemplateId } from "@/components/restaurant-menu/RestaurantMenuStudio";

type AppType = "clock" | "weather" | "rss" | "notice" | "qrcode" | "wayfinding" | "events" | "hotel-guide" | "restaurant-menu";
const APP_TYPES: AppType[] = ["clock", "weather", "rss", "notice", "qrcode", "wayfinding", "events", "hotel-guide", "restaurant-menu"];
const APP_META: Record<AppType, { icon: string; defaultName: string }> = {
  clock: { icon: "🕒", defaultName: "New Modern Clock" },
  weather: { icon: "🌤️", defaultName: "New Weather Display" },
  rss: { icon: "📰", defaultName: "New RSS Feed" },
  notice: { icon: "📢", defaultName: "New Notice" },
  qrcode: { icon: "▦", defaultName: "New QR Code" },
  wayfinding: { icon: "⌖", defaultName: "Lobby Wayfinding" },
  events: { icon: "▤", defaultName: "Today's Events" },
  "hotel-guide": { icon: "i", defaultName: "Hotel Guide" },
  "restaurant-menu": { icon: "≡", defaultName: "New Restaurant Menu" }
};

function AppConfigureForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const editId = searchParams.get("id");
  const requestedType = searchParams.get("type");
  const createType = APP_TYPES.includes(requestedType as AppType) ? requestedType as AppType : null;
  const [loadedType, setLoadedType] = useState<AppType | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [instanceName, setInstanceName] = useState("");
  const [previewOrientation, setPreviewOrientation] = useState<"landscape" | "portrait">(createType === "restaurant-menu" ? "portrait" : "landscape");

  // App type determination
  const appType: AppType = useMemo(() => {
    if (createType) return createType;
    if (loadedType) return loadedType;
    return "clock"; // default fallback
  }, [createType, loadedType]);

  // Unified dynamic configuration state
  const [config, setConfig] = useState<Record<string, any>>({});
  const changeMenu = (next: Record<string, any>) => setConfig(next);

  // Load initial configurations if editing
  useEffect(() => {
    if (!editId) {
      // Set default configurations for new instances
      setInstanceName(APP_META[appType].defaultName);
      if (appType === "clock") {
        setConfig(normalizeClockConfig({ ...DEFAULT_CLOCK_CONFIG, layout: searchParams.get("template") ?? "split" }));
      } else if (appType === "weather") {
        setConfig(normalizeWeatherConfig({ ...DEFAULT_WEATHER_CONFIG, layout: searchParams.get("template") ?? "overview" }));
      } else if (appType === "rss") {
        setConfig(DEFAULT_RSS_CONFIG);
      } else if (appType === "notice") {
        setConfig(DEFAULT_NOTICE_CONFIG);
      } else if (appType === "qrcode") {
        setConfig(DEFAULT_QR_CONFIG);
      } else if (appType === "wayfinding") {
        setConfig(DEFAULT_WAYFINDING_CONFIG);
      } else if (appType === "events") {
        setConfig(normalizeEventsConfig({ ...DEFAULT_EVENTS_CONFIG, layout: searchParams.get("template") ?? "agenda" }));
      } else if (appType === "hotel-guide") {
        setConfig(DEFAULT_HOTEL_GUIDE_CONFIG);
      } else if (appType === "restaurant-menu") {
        const requestedTemplate = searchParams.get("template");
        const templateId: RestaurantMenuTemplateId = requestedTemplate === "snack" || requestedTemplate === "restaurant" || requestedTemplate === "cafe" || requestedTemplate === "breakfast" ? requestedTemplate : "pizza";
        setConfig(createRestaurantMenuTemplate(templateId));
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
            const itemType: AppType = APP_TYPES.includes(storageType as AppType)
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
                            : itemType === "restaurant-menu"
                              ? normalizeRestaurantMenuConfig(itemConfig)
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
      alert("Please enter an app name.");
      return;
    }

    setSaving(true);
    if (appType === "weather" && !String(config.city ?? "").trim()) {
      alert("Please enter a city or location.");
      setSaving(false);
      return;
    }
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
        alert(errorData.message || "The configuration could not be saved.");
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
        <h3>Loading app settings...</h3>
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
      case "restaurant-menu":
        return <RestaurantMenuSettings config={config} onChange={(nextConfig) => setConfig(nextConfig)} />;
    }
  };

  // Render dynamic interactive Preview panel on the right side
  const renderLivePreview = () => {
    switch (appType) {
      case "clock":
        return <ClockPreview config={config} orientation={previewOrientation} onChange={setConfig} />;
      case "weather":
        return <WeatherPreview config={config} orientation={previewOrientation} onChange={setConfig} />;
      case "rss":
        return <RssPreview config={config} />;
      case "notice":
        return <NoticePreview config={config} />;
      case "qrcode":
        return <QrPreview config={config} />;
      case "wayfinding":
        return <WayfindingPreview config={config} />;
      case "events":
        return <EventsPreview config={config} onChange={setConfig} orientation={previewOrientation} />;
      case "hotel-guide":
        return <HotelGuidePreview config={config} />;
      case "restaurant-menu":
        return <RestaurantMenuPreview config={config} orientation={previewOrientation} onChange={changeMenu} />;
    }
  };

  return (
    <form onSubmit={handleSave} className="app-studio-shell" style={{ display: "flex", flexDirection: "column", minHeight: "100%", backgroundColor: "#f4f5f7" }}>
      {/* Configure Page Header */}
      <header className="app-studio-header" style={{
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        padding: "16px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "24px"
      }}>
        {/* Left: Icon and Instance name input */}
        <div className="app-studio-title" style={{ display: "flex", alignItems: "center", gap: "16px", flexGrow: 1, maxWidth: "500px" }}>
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
            {APP_META[appType].icon}
          </div>

          <input
            type="text"
            placeholder="App name..."
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
        <div className="app-studio-actions" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
            {saving ? "Saving..." : "Save and Close"}
          </button>
        </div>
      </header>

      {/* Main Split Layout Content */}
      <div className={`app-studio-grid ${appType === "clock" || appType === "restaurant-menu" || appType === "weather" || appType === "events" ? "canvas-studio-grid" : ""}`} style={{
        display: "grid",
        gridTemplateColumns: appType === "restaurant-menu" || appType === "clock" || appType === "weather" || appType === "events" ? "76px minmax(0, 1fr)" : "1fr 1fr",
        padding: appType === "restaurant-menu" || appType === "clock" || appType === "weather" || appType === "events" ? "0 32px 40px 0" : "32px",
        gap: appType === "restaurant-menu" || appType === "clock" || appType === "weather" || appType === "events" ? "20px" : "32px",
        flexGrow: 1,
        maxWidth: appType === "restaurant-menu" || appType === "clock" || appType === "weather" || appType === "events" ? "none" : "1200px",
        margin: appType === "restaurant-menu" || appType === "clock" || appType === "weather" || appType === "events" ? "0" : "0 auto",
        width: "100%"
      }}>
        {/* Left Side: Form Settings */}
        {appType !== "restaurant-menu" && appType !== "clock" && appType !== "weather" && appType !== "events" && <div className="app-studio-settings" style={{
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
            App Settings
          </h3>

          {renderConfigForm()}
        </div>}

        {appType === "restaurant-menu" && <RestaurantMenuTextTools config={config} onChange={changeMenu} />}
        {appType === "clock" && <ClockTools config={config} onChange={setConfig} />}
        {appType === "weather" && <WeatherTools config={config} onChange={setConfig} />}
        {appType === "events" && <EventsTools config={config} onChange={setConfig} />}

        {/* Right Side: Live Interactive Mockup Preview */}
        <div className="app-studio-preview" style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          position: appType === "restaurant-menu" || appType === "clock" || appType === "weather" || appType === "events" ? "relative" : "sticky",
          top: appType === "restaurant-menu" || appType === "clock" || appType === "weather" || appType === "events" ? undefined : "32px",
          height: "fit-content"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Live Screen Preview</span>
            <div className="preview-orientation-switch" role="group" aria-label="Preview orientation">
              <button type="button" aria-pressed={previewOrientation === "landscape"} onClick={() => setPreviewOrientation("landscape")}>16:9</button>
              <button type="button" aria-pressed={previewOrientation === "portrait"} onClick={() => setPreviewOrientation("portrait")}>{appType === "restaurant-menu" && (config.theme === "paper" || config.theme === "snack") ? "Portrait (A4)" : "9:16"}</button>
            </div>
          </div>

          <div className={`configure-preview-frame ${previewOrientation} ${appType === "restaurant-menu" || appType === "clock" || appType === "weather" || appType === "events" ? "restaurant-menu-workspace" : ""}`} style={appType === "restaurant-menu" && (config.theme === "paper" || config.theme === "snack") && previewOrientation === "portrait" ? { aspectRatio: "210/297", width: "min(100%, calc((100vh - 230px) * .7071))" } : undefined}>
            {renderLivePreview()}
          </div>

          {appType !== "restaurant-menu" && <div style={{ fontSize: "12px", color: "#94a3b8", textAlign: "center", lineHeight: "1.5" }}>
            {appType === "weather" ? "Sample weather preview. Published screens load live conditions for your selected location." : "Changes appear in the preview as you type. Use the controls above to check landscape and portrait layouts."}
          </div>}
        </div>
      </div>
    </form>
  );
}

export default function ConfigurePage() {
  return (
    <Suspense fallback={<div style={{ padding: "48px", textAlign: "center", color: "#64748b" }}>Loading configuration...</div>}>
      <AppConfigureForm />
    </Suspense>
  );
}
