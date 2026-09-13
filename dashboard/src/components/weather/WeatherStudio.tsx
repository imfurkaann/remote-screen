"use client";

import { useMemo } from "react";

export type WeatherConfig = {
  city: string;
  units: "metric" | "imperial";
  locale: "tr" | "en";
  layout: "overview" | "minimal";
  theme: "sky" | "midnight" | "paper" | "sunset";
  forecastDays: 3 | 5;
  showForecast: boolean;
  showDetails: boolean;
};

export const DEFAULT_WEATHER_CONFIG: WeatherConfig = {
  city: "İstanbul",
  units: "metric",
  locale: "tr",
  layout: "overview",
  theme: "sky",
  forecastDays: 5,
  showForecast: true,
  showDetails: true
};

const THEMES = {
  sky: {
    name: "Gökyüzü",
    note: "Ferah ve canlı",
    background: "linear-gradient(145deg,#075985 0%,#0284c7 45%,#38bdf8 100%)",
    surface: "rgba(255,255,255,.13)",
    text: "#f8fafc",
    muted: "#dbeafe",
    line: "rgba(255,255,255,.2)",
    accent: "#fde68a"
  },
  midnight: {
    name: "Gece",
    note: "Koyu ve sakin",
    background: "linear-gradient(145deg,#020617 0%,#0f172a 48%,#172554 100%)",
    surface: "rgba(255,255,255,.055)",
    text: "#f8fafc",
    muted: "#a5b4fc",
    line: "rgba(255,255,255,.11)",
    accent: "#67e8f9"
  },
  paper: {
    name: "Açık",
    note: "Temiz ve yalın",
    background: "linear-gradient(145deg,#ffffff 0%,#eff6ff 55%,#e0f2fe 100%)",
    surface: "rgba(255,255,255,.72)",
    text: "#0f172a",
    muted: "#64748b",
    line: "rgba(15,23,42,.1)",
    accent: "#0369a1"
  },
  sunset: {
    name: "Gün Batımı",
    note: "Sıcak ve seçkin",
    background: "linear-gradient(145deg,#431407 0%,#9a3412 48%,#f97316 100%)",
    surface: "rgba(255,255,255,.11)",
    text: "#fff7ed",
    muted: "#fed7aa",
    line: "rgba(255,255,255,.18)",
    accent: "#fef3c7"
  }
} as const;

export function normalizeWeatherConfig(input: Record<string, unknown>): WeatherConfig {
  const oldTheme = String(input.theme ?? "");
  const theme: WeatherConfig["theme"] =
    oldTheme === "midnight" || oldTheme === "dark"
      ? "midnight"
      : oldTheme === "paper" || oldTheme === "light"
        ? "paper"
        : oldTheme === "sunset" || oldTheme === "warm"
          ? "sunset"
          : "sky";
  const rawCity = typeof input.city === "string" ? input.city.slice(0, 120) : DEFAULT_WEATHER_CONFIG.city;

  return {
    city: rawCity,
    units: input.units === "imperial" ? "imperial" : "metric",
    locale: input.locale === "en" ? "en" : "tr",
    layout: input.layout === "minimal" ? "minimal" : "overview",
    theme,
    forecastDays: input.forecastDays === 3 ? 3 : 5,
    showForecast: input.showForecast !== false,
    showDetails: input.showDetails !== false
  };
}

const sectionStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 12,
  padding: 16,
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  background: "#fff"
};
const labelStyle = { fontSize: 12, fontWeight: 750, color: "#334155", letterSpacing: ".01em" };

function Choice({
  selected,
  title,
  note,
  onClick
}: {
  selected: boolean;
  title: string;
  note?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 0,
        padding: "11px 12px",
        borderRadius: 10,
        border: selected ? "1px solid #0369a1" : "1px solid #dbe3ec",
        background: selected ? "#f0f9ff" : "#fff",
        color: selected ? "#075985" : "#334155",
        cursor: "pointer",
        textAlign: "left",
        boxShadow: selected ? "0 0 0 2px rgba(3,105,161,.08)" : "none"
      }}
    >
      <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{title}</span>
      {note && <span style={{ display: "block", marginTop: 3, fontSize: 10, color: selected ? "#0369a1" : "#94a3b8" }}>{note}</span>}
    </button>
  );
}

function Toggle({
  label,
  note,
  checked,
  onChange
}: {
  label: string;
  note: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, cursor: "pointer" }}>
      <span>
        <span style={{ display: "block", fontSize: 13, fontWeight: 750, color: "#334155" }}>{label}</span>
        <span style={{ display: "block", marginTop: 2, fontSize: 10, lineHeight: 1.4, color: "#94a3b8" }}>{note}</span>
      </span>
      <span style={{ position: "relative", width: 40, height: 22, flexShrink: 0, borderRadius: 999, background: checked ? "#0369a1" : "#cbd5e1" }}>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} />
        <span style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(15,23,42,.28)", transition: "left 160ms ease" }} />
      </span>
    </label>
  );
}

export function WeatherSettings({
  config: raw,
  onChange
}: {
  config: Record<string, unknown>;
  onChange: (next: WeatherConfig) => void;
}) {
  const config = normalizeWeatherConfig(raw);
  const update = <K extends keyof WeatherConfig>(key: K, value: WeatherConfig[K]) => onChange({ ...config, [key]: value });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ padding: "0 2px 4px" }}>
        <div style={{ fontSize: 15, fontWeight: 850, color: "#0f172a" }}>Modern Hava Durumu</div>
        <p style={{ margin: "5px 0 0", fontSize: 11, lineHeight: 1.5, color: "#64748b" }}>
          Konumu, görünümü ve ekranda gösterilecek hava durumu ayrıntılarını belirleyin.
        </p>
      </div>

      <section style={sectionStyle}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Şehir veya konum</span>
          <input
            type="text"
            required
            maxLength={120}
            placeholder="Örn. İstanbul, Londra, Berlin"
            value={config.city}
            onChange={(event) => update("city", event.target.value)}
            style={{ width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1", color: "#0f172a", background: "#fff" }}
          />
          <span style={{ fontSize: 10, lineHeight: 1.4, color: "#94a3b8" }}>İlçe adı ekleyerek daha kesin sonuç alabilirsiniz.</span>
        </label>
      </section>

      <section style={sectionStyle}>
        <span style={labelStyle}>Görünüm</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Choice selected={config.layout === "overview"} title="Genel bakış" note="Detay ve tahmin" onClick={() => update("layout", "overview")} />
          <Choice selected={config.layout === "minimal"} title="Minimal" note="Anlık durum" onClick={() => update("layout", "minimal")} />
        </div>
      </section>

      <section style={sectionStyle}>
        <span style={labelStyle}>Tema</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
          {(Object.keys(THEMES) as WeatherConfig["theme"][]).map((key) => {
            const item = THEMES[key];
            const selected = config.theme === key;
            return (
              <button
                type="button"
                key={key}
                aria-pressed={selected}
                onClick={() => update("theme", key)}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: 9, borderRadius: 10, border: selected ? "1px solid #0369a1" : "1px solid #dbe3ec", background: selected ? "#f0f9ff" : "#fff", cursor: "pointer", textAlign: "left" }}
              >
                <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: item.background, border: `1px solid ${item.line}` }} />
                <span>
                  <span style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#334155" }}>{item.name}</span>
                  <span style={{ display: "block", marginTop: 1, fontSize: 9, color: "#94a3b8" }}>{item.note}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section style={sectionStyle}>
        <div>
          <span style={labelStyle}>Sıcaklık birimi</span>
          <div style={{ display: "flex", gap: 8, marginTop: 7 }}>
            <Choice selected={config.units === "metric"} title="Celsius" note="°C · km/sa" onClick={() => update("units", "metric")} />
            <Choice selected={config.units === "imperial"} title="Fahrenheit" note="°F · mph" onClick={() => update("units", "imperial")} />
          </div>
        </div>
        <div>
          <span style={labelStyle}>Dil</span>
          <div style={{ display: "flex", gap: 8, marginTop: 7 }}>
            <Choice selected={config.locale === "tr"} title="Türkçe" onClick={() => update("locale", "tr")} />
            <Choice selected={config.locale === "en"} title="English" onClick={() => update("locale", "en")} />
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <Toggle label="Hava tahminini göster" note="Gelecek günlerin en düşük ve en yüksek sıcaklıklarını ekler" checked={config.showForecast} onChange={(checked) => update("showForecast", checked)} />
        {config.showForecast && (
          <>
            <div style={{ height: 1, background: "#eef2f7" }} />
            <div>
              <span style={labelStyle}>Tahmin süresi</span>
              <div style={{ display: "flex", gap: 8, marginTop: 7 }}>
                <Choice selected={config.forecastDays === 3} title="3 gün" onClick={() => update("forecastDays", 3)} />
                <Choice selected={config.forecastDays === 5} title="5 gün" onClick={() => update("forecastDays", 5)} />
              </div>
            </div>
          </>
        )}
        <div style={{ height: 1, background: "#eef2f7" }} />
        <Toggle label="Ayrıntıları göster" note="Hissedilen sıcaklık, nem ve rüzgâr bilgilerini ekler" checked={config.showDetails} onChange={(checked) => update("showDetails", checked)} />
      </section>
    </div>
  );
}

const SAMPLE = {
  tr: {
    condition: "Parçalı bulutlu",
    feels: "Hissedilen",
    humidity: "Nem",
    wind: "Rüzgâr",
    days: ["Bugün", "Cmt", "Paz", "Pzt", "Sal"]
  },
  en: {
    condition: "Partly cloudy",
    feels: "Feels like",
    humidity: "Humidity",
    wind: "Wind",
    days: ["Today", "Sat", "Sun", "Mon", "Tue"]
  }
};

export function WeatherPreview({ config: raw }: { config: Record<string, unknown> }) {
  const config = useMemo(() => normalizeWeatherConfig(raw), [raw]);
  const theme = THEMES[config.theme];
  const text = SAMPLE[config.locale];
  const fahrenheit = config.units === "imperial";
  const temperatures = fahrenheit
    ? [{ high: 75, low: 64 }, { high: 72, low: 63 }, { high: 68, low: 59 }, { high: 70, low: 61 }, { high: 73, low: 63 }]
    : [{ high: 24, low: 18 }, { high: 22, low: 17 }, { high: 20, low: 15 }, { high: 21, low: 16 }, { high: 23, low: 17 }];
  const glyphs = ["☀", "☁", "☂", "☁", "☀"];

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: 320,
        aspectRatio: "16/9",
        borderRadius: 18,
        overflow: "hidden",
        color: theme.text,
        background: theme.background,
        border: `1px solid ${theme.line}`,
        boxShadow: "0 30px 80px rgba(15,23,42,.22)",
        fontFamily: "Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
      }}
    >
      <span aria-hidden="true" style={{ position: "absolute", width: "52%", aspectRatio: "1", right: "-12%", top: "-46%", borderRadius: "50%", background: theme.accent, opacity: config.theme === "paper" ? .12 : .16, filter: "blur(70px)" }} />
      <span aria-hidden="true" style={{ position: "absolute", width: "34%", aspectRatio: "1", left: "-10%", bottom: "-45%", borderRadius: "50%", background: "#fff", opacity: .07, filter: "blur(60px)" }} />

      <div style={{ position: "relative", zIndex: 1, height: "100%", minHeight: 320, display: "flex", flexDirection: "column", padding: "6%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
          <div>
            <div style={{ fontSize: "clamp(17px,2.5vw,28px)", fontWeight: 780, letterSpacing: "-.025em" }}>{config.city}</div>
            <div style={{ marginTop: 5, color: theme.muted, fontSize: "clamp(10px,1.1vw,13px)", fontWeight: 650 }}>{text.condition}</div>
          </div>
          <div style={{ width: 45, height: 45, display: "grid", placeItems: "center", borderRadius: 14, background: theme.surface, border: `1px solid ${theme.line}`, color: theme.accent, fontSize: 27 }}>☀</div>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: config.layout === "minimal" ? "center" : "space-between", gap: "6%" }}>
          <div style={{ display: "flex", alignItems: "flex-start", lineHeight: .85, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ fontSize: "clamp(68px,12vw,126px)", fontWeight: 720, letterSpacing: "-.075em" }}>{fahrenheit ? "72" : "22"}</span>
            <span style={{ margin: "5px 0 0 7px", color: theme.accent, fontSize: "clamp(17px,2.6vw,29px)", fontWeight: 800 }}>°{fahrenheit ? "F" : "C"}</span>
          </div>

          {config.layout === "overview" && config.showDetails && (
            <div style={{ minWidth: "31%", display: "grid", gap: 8 }}>
              {[
                [text.feels, fahrenheit ? "70°" : "21°"],
                [text.humidity, "%64"],
                [text.wind, fahrenheit ? "7 mph" : "12 km/sa"]
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 18, padding: "7px 9px", borderRadius: 9, background: theme.surface, border: `1px solid ${theme.line}`, fontSize: "clamp(9px,1vw,12px)" }}>
                  <span style={{ color: theme.muted }}>{label}</span><strong>{value}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        {config.layout === "overview" && config.showForecast && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${config.forecastDays},minmax(0,1fr))`, borderTop: `1px solid ${theme.line}`, paddingTop: "3.5%" }}>
            {temperatures.slice(0, config.forecastDays).map((item, index) => (
              <div key={text.days[index]} style={{ textAlign: "center", borderLeft: index ? `1px solid ${theme.line}` : "none", fontSize: "clamp(9px,1vw,12px)" }}>
                <div style={{ color: theme.muted, fontWeight: 700 }}>{text.days[index]}</div>
                <div style={{ margin: "4px 0", color: index === 0 ? theme.accent : theme.text, fontSize: "clamp(16px,2vw,23px)" }}>{glyphs[index]}</div>
                <div style={{ fontWeight: 800 }}>{item.high}° <span style={{ color: theme.muted, fontWeight: 600 }}>{item.low}°</span></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
