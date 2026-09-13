"use client";

import { useMemo } from "react";

export type WayfindingDirection =
  | "up"
  | "up-right"
  | "right"
  | "down-right"
  | "down"
  | "down-left"
  | "left"
  | "up-left";

export type WayfindingDestination = {
  id: string;
  name: string;
  details: string;
  floor: string;
  distance: string;
  direction: WayfindingDirection;
};

export type WayfindingConfig = {
  hotelName: string;
  currentLocation: string;
  locale: "tr" | "en";
  layout: "directory" | "spotlight";
  theme: "midnight" | "sand" | "emerald";
  accentColor: string;
  destinations: WayfindingDestination[];
  showFloor: boolean;
  showDistance: boolean;
  footer: string;
};

const DIRECTIONS: Record<WayfindingDirection, { symbol: string; tr: string; en: string }> = {
  up: { symbol: "↑", tr: "Düz ilerleyin", en: "Continue straight" },
  "up-right": { symbol: "↗", tr: "Sağa ilerleyin", en: "Continue right" },
  right: { symbol: "→", tr: "Sağa dönün", en: "Turn right" },
  "down-right": { symbol: "↘", tr: "Sağ arkanızda", en: "Behind you, right" },
  down: { symbol: "↓", tr: "Arkanızda", en: "Behind you" },
  "down-left": { symbol: "↙", tr: "Sol arkanızda", en: "Behind you, left" },
  left: { symbol: "←", tr: "Sola dönün", en: "Turn left" },
  "up-left": { symbol: "↖", tr: "Sola ilerleyin", en: "Continue left" }
};

const THEMES = {
  midnight: {
    name: "Gece",
    note: "Şık ve yüksek kontrast",
    background: "linear-gradient(145deg,#07111f 0%,#0f1f33 58%,#162942 100%)",
    surface: "rgba(255,255,255,.065)",
    text: "#f8fafc",
    muted: "#a8b6c7",
    line: "rgba(255,255,255,.12)",
    accent: "#f6c453"
  },
  sand: {
    name: "Kum",
    note: "Sıcak ve aydınlık",
    background: "linear-gradient(145deg,#fffdf8 0%,#f5efe3 58%,#e9dfce 100%)",
    surface: "rgba(255,255,255,.68)",
    text: "#29251f",
    muted: "#746b5e",
    line: "rgba(41,37,31,.13)",
    accent: "#a85d27"
  },
  emerald: {
    name: "Zümrüt",
    note: "Doğal ve sakin",
    background: "linear-gradient(145deg,#052e2b 0%,#064e46 58%,#0f6257 100%)",
    surface: "rgba(255,255,255,.07)",
    text: "#f0fdfa",
    muted: "#b7ddd6",
    line: "rgba(255,255,255,.13)",
    accent: "#f4d58d"
  }
} as const;

export const DEFAULT_WAYFINDING_CONFIG: WayfindingConfig = {
  hotelName: "Grand Hotel",
  currentLocation: "Ana Lobi",
  locale: "tr",
  layout: "directory",
  theme: "midnight",
  accentColor: "#f6c453",
  destinations: [
    { id: "reception", name: "Resepsiyon", details: "Giriş katı", floor: "Lobi", distance: "1 dk", direction: "left" },
    { id: "restaurant", name: "Restoran", details: "Kahvaltı ve akşam yemeği", floor: "1. Kat", distance: "2 dk", direction: "right" },
    { id: "meeting", name: "Toplantı Salonları", details: "Balo salonu ve fuaye", floor: "2. Kat", distance: "3 dk", direction: "up-right" },
    { id: "spa", name: "Spa & Wellness", details: "Havuz ve fitness", floor: "-1. Kat", distance: "4 dk", direction: "down-left" }
  ],
  showFloor: true,
  showDistance: true,
  footer: "Yardıma mı ihtiyacınız var? Resepsiyon ekibimiz size yardımcı olabilir."
};

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function safeId(value: unknown, fallback: string): string {
  return (typeof value === "string" && value ? value : fallback).slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function validColor(value: unknown, fallback: string): string {
  const candidate = String(value ?? "");
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
}

function normalizeDestination(value: unknown, index: number): WayfindingDestination | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const name = cleanText(input.name, "", 80);
  const direction = typeof input.direction === "string" && input.direction in DIRECTIONS
    ? input.direction as WayfindingDirection
    : "up";
  return {
    id: safeId(input.id, `destination-${index + 1}`),
    name,
    details: typeof input.details === "string" ? input.details.slice(0, 120) : "",
    floor: typeof input.floor === "string" ? input.floor.slice(0, 40) : "",
    distance: typeof input.distance === "string" ? input.distance.slice(0, 30) : "",
    direction
  };
}

export function normalizeWayfindingConfig(input: Record<string, unknown>): WayfindingConfig {
  const theme: WayfindingConfig["theme"] =
    input.theme === "sand" || input.theme === "emerald" ? input.theme : "midnight";
  const destinations = Array.isArray(input.destinations)
    ? input.destinations
      .slice(0, 6)
      .map(normalizeDestination)
      .filter((item): item is WayfindingDestination => item !== null)
    : DEFAULT_WAYFINDING_CONFIG.destinations;

  return {
    hotelName: cleanText(input.hotelName, DEFAULT_WAYFINDING_CONFIG.hotelName, 80),
    currentLocation: cleanText(input.currentLocation, DEFAULT_WAYFINDING_CONFIG.currentLocation, 80),
    locale: input.locale === "en" ? "en" : "tr",
    layout: input.layout === "spotlight" ? "spotlight" : "directory",
    theme,
    accentColor: validColor(input.accentColor, THEMES[theme].accent),
    destinations: destinations.length > 0 ? destinations : DEFAULT_WAYFINDING_CONFIG.destinations,
    showFloor: input.showFloor !== false,
    showDistance: input.showDistance !== false,
    footer: typeof input.footer === "string"
      ? input.footer.trim().slice(0, 180)
      : DEFAULT_WAYFINDING_CONFIG.footer
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
const inputStyle = { width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1", color: "#0f172a", background: "#fff" };

function Choice({ selected, title, note, onClick }: { selected: boolean; title: string; note?: string; onClick: () => void }) {
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
        border: selected ? "1px solid #b7791f" : "1px solid #dbe3ec",
        background: selected ? "#fffbeb" : "#fff",
        color: selected ? "#92400e" : "#334155",
        cursor: "pointer",
        textAlign: "left",
        boxShadow: selected ? "0 0 0 2px rgba(183,121,31,.08)" : "none"
      }}
    >
      <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{title}</span>
      {note && <span style={{ display: "block", marginTop: 3, fontSize: 10, color: selected ? "#b45309" : "#94a3b8" }}>{note}</span>}
    </button>
  );
}

export function WayfindingSettings({
  config: raw,
  onChange
}: {
  config: Record<string, unknown>;
  onChange: (next: WayfindingConfig) => void;
}) {
  const config = normalizeWayfindingConfig(raw);
  const update = <K extends keyof WayfindingConfig>(key: K, value: WayfindingConfig[K]) =>
    onChange({ ...config, [key]: value });
  const updateDestination = (index: number, patch: Partial<WayfindingDestination>) =>
    update("destinations", config.destinations.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const removeDestination = (index: number) => {
    if (config.destinations.length <= 1) return;
    update("destinations", config.destinations.filter((_, itemIndex) => itemIndex !== index));
  };
  const addDestination = () => {
    if (config.destinations.length >= 6) return;
    update("destinations", [
      ...config.destinations,
      {
        id: `destination-${Date.now().toString(36)}`,
        name: config.locale === "tr" ? "Yeni Alan" : "New Destination",
        details: "",
        floor: "",
        distance: "",
        direction: "up"
      }
    ]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ padding: "0 2px 4px" }}>
        <div style={{ fontSize: 15, fontWeight: 850, color: "#0f172a" }}>Otel Yönlendirme</div>
        <p style={{ margin: "5px 0 0", fontSize: 11, lineHeight: 1.5, color: "#64748b" }}>
          Lobi, asansör ve koridor ekranları için çevrimdışı çalışan yönlendirmeler oluşturun.
        </p>
      </div>

      <section style={sectionStyle}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Otel adı</span>
          <input type="text" maxLength={80} value={config.hotelName} onChange={(event) => update("hotelName", event.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Ekranın bulunduğu konum</span>
          <input type="text" maxLength={80} value={config.currentLocation} onChange={(event) => update("currentLocation", event.target.value)} style={inputStyle} />
        </label>
        <div>
          <span style={labelStyle}>Dil</span>
          <div style={{ display: "flex", gap: 8, marginTop: 7 }}>
            <Choice selected={config.locale === "tr"} title="Türkçe" onClick={() => update("locale", "tr")} />
            <Choice selected={config.locale === "en"} title="English" onClick={() => update("locale", "en")} />
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <span style={labelStyle}>Yerleşim</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Choice selected={config.layout === "directory"} title="Alan Rehberi" note="Birden fazla hedef" onClick={() => update("layout", "directory")} />
          <Choice selected={config.layout === "spotlight"} title="Tek Hedef" note="Büyük yön oku" onClick={() => update("layout", "spotlight")} />
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <span style={labelStyle}>Hedefler</span>
            <div style={{ marginTop: 3, fontSize: 10, color: "#94a3b8" }}>
              {config.layout === "spotlight" ? "İlk hedef ekranda gösterilir." : "En fazla 6 hedef eklenebilir."}
            </div>
          </div>
          <button
            type="button"
            onClick={addDestination}
            disabled={config.destinations.length >= 6}
            style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#334155", fontSize: 11, fontWeight: 800, cursor: config.destinations.length >= 6 ? "not-allowed" : "pointer", opacity: config.destinations.length >= 6 ? .5 : 1 }}
          >
            + Hedef ekle
          </button>
        </div>

        {config.destinations.map((destination, index) => (
          <div key={destination.id} style={{ display: "flex", flexDirection: "column", gap: 9, padding: 12, border: "1px solid #e2e8f0", borderRadius: 12, background: "#f8fafc" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong style={{ fontSize: 11, color: "#475569" }}>Hedef {index + 1}</strong>
              <button type="button" aria-label={`Hedef ${index + 1} sil`} onClick={() => removeDestination(index)} disabled={config.destinations.length <= 1} style={{ border: 0, background: "transparent", color: "#dc2626", fontSize: 11, fontWeight: 750, cursor: config.destinations.length <= 1 ? "not-allowed" : "pointer", opacity: config.destinations.length <= 1 ? .4 : 1 }}>Sil</button>
            </div>
            <input aria-label={`Hedef ${index + 1} adı`} type="text" maxLength={80} value={destination.name} onChange={(event) => updateDestination(index, { name: event.target.value })} placeholder="Alan adı" style={inputStyle} />
            <input aria-label={`Hedef ${index + 1} açıklaması`} type="text" maxLength={120} value={destination.details} onChange={(event) => updateDestination(index, { details: event.target.value })} placeholder="Kısa açıklama" style={inputStyle} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input aria-label={`Hedef ${index + 1} katı`} type="text" maxLength={40} value={destination.floor} onChange={(event) => updateDestination(index, { floor: event.target.value })} placeholder="Kat" style={inputStyle} />
              <input aria-label={`Hedef ${index + 1} mesafesi`} type="text" maxLength={30} value={destination.distance} onChange={(event) => updateDestination(index, { distance: event.target.value })} placeholder="2 dk" style={inputStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 5 }}>
              {(Object.keys(DIRECTIONS) as WayfindingDirection[]).map((direction) => (
                <button
                  type="button"
                  key={direction}
                  title={DIRECTIONS[direction][config.locale]}
                  aria-label={DIRECTIONS[direction][config.locale]}
                  aria-pressed={destination.direction === direction}
                  onClick={() => updateDestination(index, { direction })}
                  style={{ minWidth: 0, padding: "7px 0", borderRadius: 8, border: destination.direction === direction ? "1px solid #b7791f" : "1px solid #dbe3ec", background: destination.direction === direction ? "#fffbeb" : "#fff", color: destination.direction === direction ? "#92400e" : "#475569", fontSize: 17, cursor: "pointer" }}
                >
                  {DIRECTIONS[direction].symbol}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section style={sectionStyle}>
        <span style={labelStyle}>Tema</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
          {(Object.keys(THEMES) as WayfindingConfig["theme"][]).map((key) => {
            const theme = THEMES[key];
            const selected = config.theme === key;
            return (
              <button
                type="button"
                key={key}
                aria-pressed={selected}
                onClick={() => onChange({ ...config, theme: key, accentColor: theme.accent })}
                style={{ padding: 9, borderRadius: 10, border: selected ? "1px solid #b7791f" : "1px solid #dbe3ec", background: selected ? "#fffbeb" : "#fff", cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ display: "block", width: "100%", height: 26, marginBottom: 7, borderRadius: 7, background: theme.background, border: `1px solid ${theme.line}` }} />
                <span style={{ display: "block", fontSize: 10, fontWeight: 800, color: "#334155" }}>{theme.name}</span>
                <span style={{ display: "block", marginTop: 2, fontSize: 8, color: "#94a3b8" }}>{theme.note}</span>
              </button>
            );
          })}
        </div>
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={labelStyle}>Vurgu rengi</span>
          <input type="color" value={config.accentColor} onChange={(event) => update("accentColor", event.target.value)} style={{ width: 52, height: 34, padding: 2, border: "1px solid #cbd5e1", borderRadius: 8 }} />
        </label>
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#475569" }}>
          Kat bilgisini göster
          <input type="checkbox" checked={config.showFloor} onChange={(event) => update("showFloor", event.target.checked)} />
        </label>
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 12, color: "#475569" }}>
          Yürüme süresini göster
          <input type="checkbox" checked={config.showDistance} onChange={(event) => update("showDistance", event.target.checked)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Alt bilgi</span>
          <textarea rows={3} maxLength={180} value={config.footer} onChange={(event) => update("footer", event.target.value)} style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }} />
        </label>
      </section>
    </div>
  );
}

export function WayfindingPreview({ config: raw }: { config: Record<string, unknown> }) {
  const config = useMemo(() => normalizeWayfindingConfig(raw), [raw]);
  const theme = THEMES[config.theme];
  const labels = config.locale === "tr"
    ? { eyebrow: "OTEL REHBERİ", here: "BURADASINIZ", floor: "KAT", walk: "YÜRÜME" }
    : { eyebrow: "HOTEL DIRECTORY", here: "YOU ARE HERE", floor: "FLOOR", walk: "WALK" };
  const destinations = config.layout === "spotlight" ? config.destinations.slice(0, 1) : config.destinations;
  const spotlightDestination = destinations[0] ?? DEFAULT_WAYFINDING_CONFIG.destinations[0]!;

  return (
    <div style={{ position: "relative", width: "100%", minHeight: 320, aspectRatio: "16/9", overflow: "hidden", borderRadius: 18, color: theme.text, background: theme.background, border: `1px solid ${theme.line}`, boxShadow: "0 30px 80px rgba(15,23,42,.24)", fontFamily: "Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <span style={{ position: "absolute", width: "46%", aspectRatio: "1", right: "-17%", top: "-48%", borderRadius: "50%", background: config.accentColor, opacity: .12, filter: "blur(60px)" }} />
      <div style={{ position: "relative", height: "100%", minHeight: 320, display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto", padding: "5.5% 6%" }}>
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, paddingBottom: "3.5%", borderBottom: `1px solid ${theme.line}` }}>
          <div>
            <div style={{ color: config.accentColor, fontSize: 9, fontWeight: 900, letterSpacing: ".17em" }}>{labels.eyebrow}</div>
            <div style={{ marginTop: 5, fontSize: "clamp(15px,2vw,25px)", fontWeight: 820, letterSpacing: "-.025em" }}>{config.hotelName}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: theme.muted, fontSize: 8, fontWeight: 850, letterSpacing: ".12em" }}>{labels.here}</div>
            <div style={{ marginTop: 5, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7, fontSize: "clamp(12px,1.5vw,18px)", fontWeight: 800 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: config.accentColor, boxShadow: `0 0 0 4px ${config.accentColor}2b` }} />
              {config.currentLocation}
            </div>
          </div>
        </header>

        {config.layout === "directory" ? (
          <main style={{ display: "grid", gridTemplateColumns: destinations.length > 3 ? "repeat(2,minmax(0,1fr))" : "1fr", gap: destinations.length > 3 ? "2.5% 3.5%" : "2.5%", alignContent: "center", padding: "3.5% 0" }}>
            {destinations.map((destination) => (
              <div key={destination.id} style={{ minWidth: 0, display: "grid", gridTemplateColumns: "clamp(46px,6vw,74px) minmax(0,1fr) auto", alignItems: "center", gap: "3.5%", padding: destinations.length > 4 ? "2.7% 3%" : "3.5% 3.5%", border: `1px solid ${theme.line}`, borderRadius: 14, background: theme.surface }}>
                <span style={{ display: "grid", placeItems: "center", width: "clamp(43px,5.2vw,67px)", aspectRatio: "1", borderRadius: "30%", color: config.accentColor, background: `${config.accentColor}16`, border: `1px solid ${config.accentColor}35`, fontSize: "clamp(26px,3.5vw,43px)", lineHeight: 1 }}>{DIRECTIONS[destination.direction].symbol}</span>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: destinations.length > 4 ? "clamp(13px,1.45vw,18px)" : "clamp(15px,1.75vw,23px)", letterSpacing: "-.02em" }}>{destination.name}</strong>
                  {destination.details && <span style={{ display: "block", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: theme.muted, fontSize: "clamp(8px,.85vw,12px)" }}>{destination.details}</span>}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", color: theme.muted, fontSize: "clamp(7px,.75vw,10px)", fontWeight: 750, whiteSpace: "nowrap" }}>
                  {config.showFloor && destination.floor && <span>{labels.floor} · <b style={{ color: theme.text }}>{destination.floor}</b></span>}
                  {config.showDistance && destination.distance && <span>{labels.walk} · <b style={{ color: config.accentColor }}>{destination.distance}</b></span>}
                </span>
              </div>
            ))}
          </main>
        ) : (
          <main style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(150px,.72fr)", alignItems: "center", gap: "6%", padding: "5% 2%" }}>
            <div>
              <div style={{ color: theme.muted, fontSize: 9, fontWeight: 850, letterSpacing: ".14em" }}>{DIRECTIONS[spotlightDestination.direction][config.locale]}</div>
              <h2 style={{ margin: "10px 0 0", fontSize: "clamp(34px,6.2vw,76px)", lineHeight: .96, letterSpacing: "-.055em" }}>{spotlightDestination.name}</h2>
              {spotlightDestination.details && <p style={{ margin: "13px 0 0", color: theme.muted, fontSize: "clamp(10px,1.25vw,16px)" }}>{spotlightDestination.details}</p>}
              <div style={{ display: "flex", gap: 9, marginTop: 18 }}>
                {config.showFloor && spotlightDestination.floor && <span style={{ padding: "7px 10px", borderRadius: 999, border: `1px solid ${theme.line}`, background: theme.surface, color: theme.muted, fontSize: 9, fontWeight: 750 }}>{labels.floor} · <b style={{ color: theme.text }}>{spotlightDestination.floor}</b></span>}
                {config.showDistance && spotlightDestination.distance && <span style={{ padding: "7px 10px", borderRadius: 999, border: `1px solid ${theme.line}`, background: theme.surface, color: theme.muted, fontSize: 9, fontWeight: 750 }}>{labels.walk} · <b style={{ color: config.accentColor }}>{spotlightDestination.distance}</b></span>}
              </div>
            </div>
            <div style={{ display: "grid", placeItems: "center", aspectRatio: "1", borderRadius: "33%", border: `1px solid ${config.accentColor}35`, background: `${config.accentColor}12`, color: config.accentColor, fontSize: "clamp(90px,15vw,180px)", lineHeight: 1 }}>{DIRECTIONS[spotlightDestination.direction].symbol}</div>
          </main>
        )}

        <footer style={{ minHeight: 20, paddingTop: "2.5%", borderTop: `1px solid ${theme.line}`, color: theme.muted, fontSize: "clamp(7px,.8vw,11px)", textAlign: "center" }}>{config.footer}</footer>
      </div>
    </div>
  );
}
