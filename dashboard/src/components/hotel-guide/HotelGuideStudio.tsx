"use client";

import { useMemo } from "react";

export type HotelService = { id: string; name: string; description: string; hours: string; contact: string; icon: "restaurant" | "spa" | "wifi" | "fitness" | "pool" | "concierge" | "shuttle" | "other" };
export type HotelGuideConfig = {
  hotelName: string; heading: string; welcome: string; locale: "tr" | "en"; theme: "navy" | "cream" | "forest";
  accentColor: string; layout: "grid" | "featured"; services: HotelService[]; showContact: boolean; footer: string;
};
const ICONS: Record<HotelService["icon"], string> = { restaurant: "🍽", spa: "✦", wifi: "⌁", fitness: "◆", pool: "≈", concierge: "i", shuttle: "↗", other: "•" };
const THEMES = {
  navy: { name: "Lacivert", bg: "linear-gradient(145deg,#071522,#10283c 58%,#183952)", surface: "rgba(255,255,255,.065)", text: "#f8fafc", muted: "#a8bdcc", line: "rgba(255,255,255,.12)", accent: "#d7b46a" },
  cream: { name: "Krem", bg: "linear-gradient(145deg,#fffdf7,#f5efe2 58%,#e8dcc7)", surface: "rgba(255,255,255,.72)", text: "#28231c", muted: "#766b5d", line: "rgba(40,35,28,.12)", accent: "#9a5b2b" },
  forest: { name: "Orman", bg: "linear-gradient(145deg,#092b25,#12483d 58%,#1b5f50)", surface: "rgba(255,255,255,.07)", text: "#f0fdf9", muted: "#b8ddd4", line: "rgba(255,255,255,.13)", accent: "#e7c778" }
} as const;
export const DEFAULT_HOTEL_GUIDE_CONFIG: HotelGuideConfig = {
  hotelName: "Grand Hotel", heading: "Otel Rehberi", welcome: "Konaklamanız boyunca ihtiyaç duyabileceğiniz tüm hizmetler.",
  locale: "tr", theme: "navy", accentColor: "#d7b46a", layout: "grid",
  services: [
    { id: "breakfast", name: "Kahvaltı", description: "Açık büfe restoran", hours: "07:00 – 10:30", contact: "Dahili 201", icon: "restaurant" },
    { id: "spa", name: "Spa & Wellness", description: "Masaj, sauna ve bakım", hours: "09:00 – 22:00", contact: "Dahili 305", icon: "spa" },
    { id: "wifi", name: "Misafir Wi-Fi", description: "Ağ: GrandHotel_Guest", hours: "7/24", contact: "Resepsiyon", icon: "wifi" },
    { id: "concierge", name: "Concierge", description: "Transfer ve şehir önerileri", hours: "08:00 – 23:00", contact: "Dahili 0", icon: "concierge" }
  ], showContact: true, footer: "Acil ihtiyaçlarınız için resepsiyona günün her saati ulaşabilirsiniz."
};
const text = (value: unknown, fallback: string, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
const color = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(value ?? "")) ? String(value) : fallback;
export function normalizeHotelGuideConfig(input: Record<string, unknown>): HotelGuideConfig {
  const theme: HotelGuideConfig["theme"] = input.theme === "cream" || input.theme === "forest" ? input.theme : "navy";
  const services = Array.isArray(input.services) ? input.services.slice(0, 8).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return []; const item = raw as Record<string, unknown>; const name = text(item.name, "", 80); if (!name) return [];
    const icon = typeof item.icon === "string" && item.icon in ICONS ? item.icon as HotelService["icon"] : "other";
    return [{ id: text(item.id, `service-${index + 1}`, 64).replace(/[^a-zA-Z0-9_-]/g, "-"), name, description: typeof item.description === "string" ? item.description.trim().slice(0, 140) : "", hours: typeof item.hours === "string" ? item.hours.trim().slice(0, 50) : "", contact: typeof item.contact === "string" ? item.contact.trim().slice(0, 50) : "", icon } as HotelService];
  }) : DEFAULT_HOTEL_GUIDE_CONFIG.services;
  return {
    hotelName: text(input.hotelName, DEFAULT_HOTEL_GUIDE_CONFIG.hotelName, 80), heading: text(input.heading, DEFAULT_HOTEL_GUIDE_CONFIG.heading, 100),
    welcome: typeof input.welcome === "string" ? input.welcome.trim().slice(0, 220) : DEFAULT_HOTEL_GUIDE_CONFIG.welcome,
    locale: input.locale === "en" ? "en" : "tr", theme, accentColor: color(input.accentColor, THEMES[theme].accent),
    layout: input.layout === "featured" ? "featured" : "grid", services: services.length ? services : DEFAULT_HOTEL_GUIDE_CONFIG.services,
    showContact: input.showContact !== false, footer: typeof input.footer === "string" ? input.footer.trim().slice(0, 180) : DEFAULT_HOTEL_GUIDE_CONFIG.footer
  };
}
const section = { display: "flex", flexDirection: "column" as const, gap: 10, padding: 15, border: "1px solid #e2e8f0", borderRadius: 14, background: "#fff" };
const input = { width: "100%", padding: "9px 10px", borderRadius: 9, border: "1px solid #cbd5e1" };
const label = { fontSize: 11, fontWeight: 750, color: "#334155" };
export function HotelGuideSettings({ config: raw, onChange }: { config: Record<string, unknown>; onChange: (next: HotelGuideConfig) => void }) {
  const config = normalizeHotelGuideConfig(raw); const set = <K extends keyof HotelGuideConfig>(key: K, value: HotelGuideConfig[K]) => onChange({ ...config, [key]: value });
  const patch = (index: number, value: Partial<HotelService>) => set("services", config.services.map((service, i) => i === index ? { ...service, ...value } : service));
  const add = () => config.services.length < 8 && set("services", [...config.services, { id: `service-${Date.now().toString(36)}`, name: config.locale === "tr" ? "Yeni Hizmet" : "New Service", description: "", hours: "", contact: "", icon: "other" }]);
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div><strong style={{ color: "#0f172a" }}>Otel Rehberi</strong><p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 11 }}>Misafirlerin tüm otel hizmetlerine tek ekrandan ulaşmasını sağlayın.</p></div>
    <section style={section}>
      <label style={label}>Otel adı<input maxLength={80} value={config.hotelName} onChange={e => set("hotelName", e.target.value)} style={{ ...input, display: "block", marginTop: 6 }} /></label>
      <label style={label}>Başlık<input maxLength={100} value={config.heading} onChange={e => set("heading", e.target.value)} style={{ ...input, display: "block", marginTop: 6 }} /></label>
      <label style={label}>Karşılama metni<textarea maxLength={220} rows={3} value={config.welcome} onChange={e => set("welcome", e.target.value)} style={{ ...input, display: "block", marginTop: 6, resize: "vertical" }} /></label>
      <div style={{ display: "flex", gap: 8 }}>{(["tr", "en"] as const).map(locale => <button type="button" key={locale} onClick={() => set("locale", locale)} style={{ flex: 1, padding: 9, borderRadius: 9, border: config.locale === locale ? "1px solid #9a5b2b" : "1px solid #cbd5e1", background: config.locale === locale ? "#fff7ed" : "#fff", fontWeight: 800 }}>{locale === "tr" ? "Türkçe" : "English"}</button>)}</div>
      <div style={{ display: "flex", gap: 8 }}>{(["grid", "featured"] as const).map(layout => <button type="button" key={layout} onClick={() => set("layout", layout)} style={{ flex: 1, padding: 9, borderRadius: 9, border: config.layout === layout ? "1px solid #9a5b2b" : "1px solid #cbd5e1", background: config.layout === layout ? "#fff7ed" : "#fff", fontWeight: 800 }}>{layout === "grid" ? "Kartlar" : "Öne Çıkan"}</button>)}</div>
    </section>
    <section style={section}>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span style={label}>Hizmetler ({config.services.length}/8)</span><button type="button" onClick={add} disabled={config.services.length >= 8} style={{ padding: "7px 9px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#f8fafc", fontWeight: 800 }}>+ Ekle</button></div>
      {config.services.map((service, index) => <div key={service.id} style={{ display: "grid", gap: 7, padding: 11, border: "1px solid #e2e8f0", borderRadius: 11, background: "#f8fafc" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><b style={{ fontSize: 11, color: "#475569" }}>Hizmet {index + 1}</b><button type="button" disabled={config.services.length <= 1} onClick={() => set("services", config.services.filter((_, i) => i !== index))} style={{ border: 0, background: "none", color: "#dc2626", fontSize: 11 }}>Sil</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 92px", gap: 7 }}><input aria-label="Hizmet adı" maxLength={80} value={service.name} onChange={e => patch(index, { name: e.target.value })} style={input} /><select aria-label="Simge" value={service.icon} onChange={e => patch(index, { icon: e.target.value as HotelService["icon"] })} style={input}>{Object.entries(ICONS).map(([key, value]) => <option key={key} value={key}>{value} {key}</option>)}</select></div>
        <input aria-label="Hizmet açıklaması" maxLength={140} value={service.description} onChange={e => patch(index, { description: e.target.value })} placeholder="Kısa açıklama" style={input} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}><input aria-label="Çalışma saatleri" maxLength={50} value={service.hours} onChange={e => patch(index, { hours: e.target.value })} placeholder="07:00 – 22:00" style={input} /><input aria-label="İletişim" maxLength={50} value={service.contact} onChange={e => patch(index, { contact: e.target.value })} placeholder="Dahili 201" style={input} /></div>
      </div>)}
    </section>
    <section style={section}>
      <span style={label}>Tema</span><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7 }}>{(Object.keys(THEMES) as HotelGuideConfig["theme"][]).map(key => <button type="button" key={key} onClick={() => onChange({ ...config, theme: key, accentColor: THEMES[key].accent })} style={{ padding: 8, borderRadius: 9, border: config.theme === key ? "1px solid #9a5b2b" : "1px solid #cbd5e1", background: config.theme === key ? "#fff7ed" : "#fff" }}><span style={{ display: "block", height: 23, borderRadius: 6, background: THEMES[key].bg }} /><b style={{ display: "block", marginTop: 5, fontSize: 9 }}>{THEMES[key].name}</b></button>)}</div>
      <label style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>İletişim bilgisini göster<input type="checkbox" checked={config.showContact} onChange={e => set("showContact", e.target.checked)} /></label>
      <label style={label}>Alt bilgi<textarea maxLength={180} rows={2} value={config.footer} onChange={e => set("footer", e.target.value)} style={{ ...input, display: "block", marginTop: 6 }} /></label>
    </section>
  </div>;
}
export function HotelGuidePreview({ config: raw }: { config: Record<string, unknown> }) {
  const config = useMemo(() => normalizeHotelGuideConfig(raw), [raw]); const theme = THEMES[config.theme]; const shown = config.layout === "featured" ? config.services.slice(0, 4) : config.services.slice(0, 6);
  const words = config.locale === "tr" ? { hours: "SAATLER", contact: "İLETİŞİM" } : { hours: "HOURS", contact: "CONTACT" };
  return <div style={{ width: "100%", minHeight: 320, aspectRatio: "16/9", overflow: "hidden", borderRadius: 18, color: theme.text, background: theme.bg, boxShadow: "0 30px 80px rgba(15,23,42,.24)", fontFamily: "Inter,system-ui,sans-serif" }}><div style={{ height: "100%", minHeight: 320, display: "grid", gridTemplateRows: "auto 1fr auto", padding: "5% 6%" }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 20, paddingBottom: "2.7%", borderBottom: `1px solid ${theme.line}` }}><div><div style={{ color: config.accentColor, fontSize: 8, fontWeight: 900, letterSpacing: ".16em" }}>{config.hotelName}</div><h2 style={{ margin: "5px 0 0", fontSize: "clamp(22px,3.2vw,40px)" }}>{config.heading}</h2></div><p style={{ maxWidth: "48%", margin: 0, alignSelf: "flex-end", color: theme.muted, fontSize: 10, lineHeight: 1.5, textAlign: "right" }}>{config.welcome}</p></header>
    <main style={{ display: "grid", gridTemplateColumns: config.layout === "featured" ? "repeat(2,1fr)" : "repeat(3,1fr)", gap: 8, alignContent: "center", padding: "3% 0" }}>{shown.map((service, index) => <article key={service.id} style={{ display: "grid", gridTemplateColumns: "36px 1fr", gap: 10, minWidth: 0, padding: config.layout === "featured" ? "16px" : "12px", border: `1px solid ${theme.line}`, borderRadius: 13, background: index === 0 && config.layout === "featured" ? `${config.accentColor}15` : theme.surface }}><span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 11, color: config.accentColor, border: `1px solid ${config.accentColor}35`, fontSize: 18 }}>{ICONS[service.icon]}</span><div style={{ minWidth: 0 }}><strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: config.layout === "featured" ? 15 : 13 }}>{service.name}</strong>{service.description && <small style={{ display: "block", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: theme.muted, fontSize: 8 }}>{service.description}</small>}<div style={{ marginTop: 9, color: theme.muted, fontSize: 7 }}>{service.hours && <span>{words.hours} · <b style={{ color: theme.text }}>{service.hours}</b></span>}{config.showContact && service.contact && <span style={{ display: "block", marginTop: 3 }}>{words.contact} · <b style={{ color: config.accentColor }}>{service.contact}</b></span>}</div></div></article>)}</main>
    <footer style={{ paddingTop: "2.4%", borderTop: `1px solid ${theme.line}`, color: theme.muted, fontSize: 9, textAlign: "center" }}>{config.footer}</footer>
  </div></div>;
}
