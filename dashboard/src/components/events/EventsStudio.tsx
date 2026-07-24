"use client";

import { useMemo } from "react";

export type HotelEvent = { id: string; title: string; host: string; room: string; start: string; end: string; direction: "left" | "right" | "up" };
export type EventsConfig = {
  hotelName: string; heading: string; locale: "tr" | "en"; theme: "midnight" | "paper" | "burgundy";
  accentColor: string; events: HotelEvent[]; showHost: boolean; showDirection: boolean; footer: string;
};

const THEMES = {
  midnight: { name: "Gece", bg: "linear-gradient(145deg,#080d18,#111c2e 58%,#1b2a42)", surface: "rgba(255,255,255,.06)", text: "#f8fafc", muted: "#9cabc0", line: "rgba(255,255,255,.12)", accent: "#60a5fa" },
  paper: { name: "Aydınlık", bg: "linear-gradient(145deg,#ffffff,#f3f5f8 58%,#e8edf3)", surface: "rgba(255,255,255,.76)", text: "#172033", muted: "#687387", line: "rgba(23,32,51,.12)", accent: "#2563eb" },
  burgundy: { name: "Bordo", bg: "linear-gradient(145deg,#2a0b15,#541528 58%,#751f35)", surface: "rgba(255,255,255,.07)", text: "#fff7f8", muted: "#e8bcc7", line: "rgba(255,255,255,.13)", accent: "#f4c56b" }
} as const;
const ARROWS = { left: "←", right: "→", up: "↑" } as const;

export const DEFAULT_EVENTS_CONFIG: EventsConfig = {
  hotelName: "Grand Hotel", heading: "Bugünün Etkinlikleri", locale: "tr", theme: "midnight", accentColor: "#60a5fa",
  events: [
    { id: "morning", title: "Yönetim Toplantısı", host: "Atlas Holding", room: "Lale Salonu", start: "09:30", end: "11:00", direction: "right" },
    { id: "conference", title: "Turizm Konferansı", host: "Sektör Buluşmaları", room: "Balo Salonu", start: "11:30", end: "14:00", direction: "up" },
    { id: "workshop", title: "Dijital Dönüşüm Atölyesi", host: "Nova Teknoloji", room: "Orkide Salonu", start: "15:00", end: "17:30", direction: "left" }
  ],
  showHost: true, showDirection: true, footer: "Salon değişiklikleri için resepsiyon ekibimize danışabilirsiniz."
};

const text = (value: unknown, fallback: string, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
const time = (value: unknown, fallback: string) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
const color = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(value ?? "")) ? String(value) : fallback;

export function normalizeEventsConfig(input: Record<string, unknown>): EventsConfig {
  const theme: EventsConfig["theme"] = input.theme === "paper" || input.theme === "burgundy" ? input.theme : "midnight";
  const events = Array.isArray(input.events) ? input.events.slice(0, 10).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>; const title = text(item.title, "", 100);
    if (!title) return [];
    return [{ id: text(item.id, `event-${index + 1}`, 64).replace(/[^a-zA-Z0-9_-]/g, "-"), title, host: typeof item.host === "string" ? item.host.trim().slice(0, 80) : "", room: text(item.room, "-", 60), start: time(item.start, "09:00"), end: time(item.end, "10:00"), direction: item.direction === "left" || item.direction === "up" ? item.direction : "right" } as HotelEvent];
  }) : DEFAULT_EVENTS_CONFIG.events;
  return {
    hotelName: text(input.hotelName, DEFAULT_EVENTS_CONFIG.hotelName, 80), heading: text(input.heading, DEFAULT_EVENTS_CONFIG.heading, 100),
    locale: input.locale === "en" ? "en" : "tr", theme, accentColor: color(input.accentColor, THEMES[theme].accent),
    events: events.length ? events : DEFAULT_EVENTS_CONFIG.events, showHost: input.showHost !== false, showDirection: input.showDirection !== false,
    footer: typeof input.footer === "string" ? input.footer.trim().slice(0, 180) : DEFAULT_EVENTS_CONFIG.footer
  };
}

const section = { display: "flex", flexDirection: "column" as const, gap: 10, padding: 15, border: "1px solid #e2e8f0", borderRadius: 14, background: "#fff" };
const input = { width: "100%", padding: "9px 10px", borderRadius: 9, border: "1px solid #cbd5e1" };
const label = { fontSize: 11, fontWeight: 750, color: "#334155" };

export function EventsSettings({ config: raw, onChange }: { config: Record<string, unknown>; onChange: (next: EventsConfig) => void }) {
  const config = normalizeEventsConfig(raw); const set = <K extends keyof EventsConfig>(key: K, value: EventsConfig[K]) => onChange({ ...config, [key]: value });
  const patch = (index: number, value: Partial<HotelEvent>) => set("events", config.events.map((event, i) => i === index ? { ...event, ...value } : event));
  const add = () => config.events.length < 10 && set("events", [...config.events, { id: `event-${Date.now().toString(36)}`, title: config.locale === "tr" ? "Yeni Etkinlik" : "New Event", host: "", room: "", start: "09:00", end: "10:00", direction: "right" }]);
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div><strong style={{ color: "#0f172a" }}>Etkinlik & Toplantı Panosu</strong><p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 11 }}>Salon programını, saatleri ve yönleri tek ekranda yayınlayın.</p></div>
    <section style={section}>
      <label style={label}>Otel adı<input maxLength={80} value={config.hotelName} onChange={e => set("hotelName", e.target.value)} style={{ ...input, display: "block", marginTop: 6 }} /></label>
      <label style={label}>Pano başlığı<input maxLength={100} value={config.heading} onChange={e => set("heading", e.target.value)} style={{ ...input, display: "block", marginTop: 6 }} /></label>
      <div style={{ display: "flex", gap: 8 }}>{(["tr", "en"] as const).map(locale => <button type="button" key={locale} onClick={() => set("locale", locale)} style={{ flex: 1, padding: 9, borderRadius: 9, border: config.locale === locale ? "1px solid #2563eb" : "1px solid #cbd5e1", background: config.locale === locale ? "#eff6ff" : "#fff", fontWeight: 800, cursor: "pointer" }}>{locale === "tr" ? "Türkçe" : "English"}</button>)}</div>
    </section>
    <section style={section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={label}>Etkinlikler ({config.events.length}/10)</span><button type="button" onClick={add} disabled={config.events.length >= 10} style={{ padding: "7px 9px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#f8fafc", fontWeight: 800 }}>+ Ekle</button></div>
      {config.events.map((event, index) => <div key={event.id} style={{ display: "grid", gap: 8, padding: 11, border: "1px solid #e2e8f0", borderRadius: 11, background: "#f8fafc" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><b style={{ fontSize: 11, color: "#475569" }}>Etkinlik {index + 1}</b><button type="button" disabled={config.events.length <= 1} onClick={() => set("events", config.events.filter((_, i) => i !== index))} style={{ border: 0, background: "none", color: "#dc2626", fontSize: 11 }}>Sil</button></div>
        <input aria-label="Etkinlik adı" maxLength={100} value={event.title} onChange={e => patch(index, { title: e.target.value })} placeholder="Etkinlik adı" style={input} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}><input aria-label="Organizatör" maxLength={80} value={event.host} onChange={e => patch(index, { host: e.target.value })} placeholder="Organizatör" style={input} /><input aria-label="Salon" maxLength={60} value={event.room} onChange={e => patch(index, { room: e.target.value })} placeholder="Salon" style={input} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 7 }}><input aria-label="Başlangıç" type="time" value={event.start} onChange={e => patch(index, { start: e.target.value })} style={input} /><input aria-label="Bitiş" type="time" value={event.end} onChange={e => patch(index, { end: e.target.value })} style={input} /><select aria-label="Yön" value={event.direction} onChange={e => patch(index, { direction: e.target.value as HotelEvent["direction"] })} style={input}><option value="left">←</option><option value="up">↑</option><option value="right">→</option></select></div>
      </div>)}
    </section>
    <section style={section}>
      <span style={label}>Tema</span><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7 }}>{(Object.keys(THEMES) as EventsConfig["theme"][]).map(key => <button type="button" key={key} onClick={() => onChange({ ...config, theme: key, accentColor: THEMES[key].accent })} style={{ padding: 8, borderRadius: 9, border: config.theme === key ? "1px solid #2563eb" : "1px solid #cbd5e1", background: config.theme === key ? "#eff6ff" : "#fff" }}><span style={{ display: "block", height: 23, borderRadius: 6, background: THEMES[key].bg }} /><b style={{ display: "block", marginTop: 5, fontSize: 9 }}>{THEMES[key].name}</b></button>)}</div>
      <label style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>Organizatörü göster<input type="checkbox" checked={config.showHost} onChange={e => set("showHost", e.target.checked)} /></label>
      <label style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>Yön okunu göster<input type="checkbox" checked={config.showDirection} onChange={e => set("showDirection", e.target.checked)} /></label>
      <label style={label}>Alt bilgi<textarea maxLength={180} rows={2} value={config.footer} onChange={e => set("footer", e.target.value)} style={{ ...input, display: "block", marginTop: 6, resize: "vertical" }} /></label>
    </section>
  </div>;
}

const minutes = (value: string) => { const [hour = 0, minute = 0] = value.split(":").map(Number); return hour * 60 + minute; };
function status(event: HotelEvent, now = new Date()) { const current = now.getHours() * 60 + now.getMinutes(); return current >= minutes(event.start) && current < minutes(event.end) ? "live" : current < minutes(event.start) ? "next" : "done"; }

export function EventsPreview({ config: raw }: { config: Record<string, unknown> }) {
  const config = useMemo(() => normalizeEventsConfig(raw), [raw]); const theme = THEMES[config.theme];
  const words = config.locale === "tr" ? { live: "ŞİMDİ", next: "YAKLAŞAN", done: "TAMAMLANDI", room: "SALON" } : { live: "NOW", next: "UPCOMING", done: "FINISHED", room: "ROOM" };
  return <div style={{ width: "100%", minHeight: 320, aspectRatio: "16/9", overflow: "hidden", borderRadius: 18, color: theme.text, background: theme.bg, boxShadow: "0 30px 80px rgba(15,23,42,.24)", fontFamily: "Inter,system-ui,sans-serif" }}>
    <div style={{ height: "100%", minHeight: 320, display: "grid", gridTemplateRows: "auto 1fr auto", padding: "5.5% 6%" }}>
      <header style={{ display: "flex", justifyContent: "space-between", paddingBottom: "3%", borderBottom: `1px solid ${theme.line}` }}><div><div style={{ color: config.accentColor, fontSize: 8, fontWeight: 900, letterSpacing: ".16em" }}>{config.hotelName}</div><h2 style={{ margin: "5px 0 0", fontSize: "clamp(20px,3vw,38px)" }}>{config.heading}</h2></div><div style={{ color: theme.muted, fontSize: 10, fontWeight: 800 }}>{new Intl.DateTimeFormat(config.locale === "tr" ? "tr-TR" : "en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</div></header>
      <main style={{ display: "grid", alignContent: "center", gap: 7, padding: "3% 0" }}>{config.events.slice(0, 6).map(event => { const state = status(event); return <div key={event.id} style={{ display: "grid", gridTemplateColumns: "70px 1fr auto 42px", alignItems: "center", gap: 12, padding: "10px 13px", borderRadius: 12, border: `1px solid ${state === "live" ? config.accentColor : theme.line}`, background: state === "live" ? `${config.accentColor}15` : theme.surface, opacity: state === "done" ? .55 : 1 }}><b style={{ color: state === "live" ? config.accentColor : theme.text, fontSize: 13 }}>{event.start}</b><div><strong style={{ display: "block", fontSize: "clamp(12px,1.4vw,18px)" }}>{event.title}</strong>{config.showHost && event.host && <small style={{ color: theme.muted }}>{event.host}</small>}</div><div style={{ textAlign: "right" }}><small style={{ color: theme.muted, fontSize: 7 }}>{words.room}</small><b style={{ display: "block", fontSize: 11 }}>{event.room}</b><small style={{ color: state === "live" ? config.accentColor : theme.muted, fontSize: 7, fontWeight: 900 }}>{words[state]}</small></div>{config.showDirection && <span style={{ color: config.accentColor, fontSize: 28, textAlign: "right" }}>{ARROWS[event.direction]}</span>}</div>; })}</main>
      <footer style={{ paddingTop: "2.5%", borderTop: `1px solid ${theme.line}`, color: theme.muted, fontSize: 9, textAlign: "center" }}>{config.footer}</footer>
    </div>
  </div>;
}
