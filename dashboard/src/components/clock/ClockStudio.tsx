"use client";

import { useEffect, useMemo, useState } from "react";

export type ClockConfig = {
  timezone: string;
  locale: "tr" | "en";
  format: "24h" | "12h";
  layout: "digital" | "analog" | "split";
  theme: "midnight" | "paper" | "aurora" | "warm";
  primaryColor: string;
  showSeconds: boolean;
  showDate: boolean;
  showTimezone: boolean;
};

export const DEFAULT_CLOCK_CONFIG: ClockConfig = {
  timezone: "Europe/Istanbul",
  locale: "tr",
  format: "24h",
  layout: "split",
  theme: "midnight",
  primaryColor: "#6ee7b7",
  showSeconds: true,
  showDate: true,
  showTimezone: true
};

const TIMEZONES = [
  { label: "Cihazın yerel saati", value: "local" },
  { label: "İstanbul", value: "Europe/Istanbul" },
  { label: "Londra", value: "Europe/London" },
  { label: "Paris", value: "Europe/Paris" },
  { label: "New York", value: "America/New_York" },
  { label: "Los Angeles", value: "America/Los_Angeles" },
  { label: "Dubai", value: "Asia/Dubai" },
  { label: "Tokyo", value: "Asia/Tokyo" },
  { label: "Singapur", value: "Asia/Singapore" },
  { label: "Sidney", value: "Australia/Sydney" }
];

const THEMES = {
  midnight: { name: "Gece", note: "Derin ve sakin", bg: "linear-gradient(145deg,#101827 0%,#07111f 58%,#050a12 100%)", text: "#f8fafc", muted: "#94a3b8", border: "rgba(255,255,255,.1)", shadow: "0 30px 80px rgba(2,6,23,.42)" },
  paper: { name: "Açık", note: "Temiz ve aydınlık", bg: "linear-gradient(145deg,#fff 0%,#eef2f7 100%)", text: "#0f172a", muted: "#64748b", border: "rgba(15,23,42,.1)", shadow: "0 30px 80px rgba(71,85,105,.18)" },
  aurora: { name: "Aurora", note: "Canlı ve modern", bg: "linear-gradient(145deg,#071a24 0%,#102a33 48%,#172554 100%)", text: "#f0fdfa", muted: "#a5f3fc", border: "rgba(125,211,252,.18)", shadow: "0 30px 90px rgba(6,182,212,.18)" },
  warm: { name: "Gün Batımı", note: "Sıcak ve seçkin", bg: "linear-gradient(145deg,#2a1714 0%,#42231d 50%,#1c1012 100%)", text: "#fff7ed", muted: "#fed7aa", border: "rgba(253,186,116,.18)", shadow: "0 30px 90px rgba(154,52,18,.22)" }
} as const;

const ACCENTS: Record<ClockConfig["theme"], string> = {
  midnight: "#6ee7b7",
  paper: "#0f766e",
  aurora: "#67e8f9",
  warm: "#fdba74"
};

export function normalizeClockConfig(input: Record<string, unknown>): ClockConfig {
  const oldLayout = String(input.layout ?? "");
  const layout: ClockConfig["layout"] = oldLayout === "analog" ? "analog" : oldLayout === "digital" ? "digital" : oldLayout === "split" || oldLayout === "hybrid" ? "split" : "split";
  const oldTheme = String(input.theme ?? "");
  const theme: ClockConfig["theme"] = oldTheme === "paper" || oldTheme === "light" ? "paper" : oldTheme === "aurora" || oldTheme === "oceanic" ? "aurora" : oldTheme === "warm" || oldTheme === "sunset" ? "warm" : "midnight";
  const color = String(input.primaryColor ?? "");
  return {
    timezone: typeof input.timezone === "string" && input.timezone ? input.timezone : DEFAULT_CLOCK_CONFIG.timezone,
    locale: input.locale === "en" ? "en" : "tr",
    format: input.format === "12h" ? "12h" : "24h",
    layout,
    theme,
    primaryColor: /^#[0-9a-f]{6}$/i.test(color) ? color : ACCENTS[theme],
    showSeconds: input.showSeconds !== false,
    showDate: input.showDate !== false,
    showTimezone: input.showTimezone !== false
  };
}

const sectionStyle = { display: "flex", flexDirection: "column" as const, gap: 12, padding: 16, border: "1px solid #e2e8f0", borderRadius: 14, background: "#fff" };
const labelStyle = { fontSize: 12, fontWeight: 750, color: "#334155", letterSpacing: ".01em" };

function Choice({ selected, title, note, onClick }: { selected: boolean; title: string; note?: string; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} style={{ flex: 1, minWidth: 0, textAlign: "left", padding: "11px 12px", borderRadius: 10, border: selected ? "1px solid #0f766e" : "1px solid #dbe3ec", background: selected ? "#f0fdfa" : "#fff", color: selected ? "#115e59" : "#334155", cursor: "pointer", boxShadow: selected ? "0 0 0 2px rgba(15,118,110,.08)" : "none" }}>
    <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{title}</span>
    {note && <span style={{ display: "block", marginTop: 3, fontSize: 10, color: selected ? "#0f766e" : "#94a3b8" }}>{note}</span>}
  </button>;
}

function Toggle({ label, note, checked, onChange }: { label: string; note: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, cursor: "pointer" }}>
    <span><span style={{ display: "block", fontSize: 13, fontWeight: 750, color: "#334155" }}>{label}</span><span style={{ display: "block", marginTop: 2, fontSize: 10, lineHeight: 1.4, color: "#94a3b8" }}>{note}</span></span>
    <span style={{ position: "relative", width: 40, height: 22, flexShrink: 0, borderRadius: 999, background: checked ? "#0f766e" : "#cbd5e1" }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} />
      <span style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(15,23,42,.28)", transition: "left 160ms ease" }} />
    </span>
  </label>;
}

export function ClockSettings({ config, onChange }: { config: Record<string, unknown>; onChange: (next: ClockConfig) => void }) {
  const value = normalizeClockConfig(config);
  const update = <K extends keyof ClockConfig>(key: K, nextValue: ClockConfig[K]) => onChange({ ...value, [key]: nextValue });
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ padding: "0 2px 4px" }}><div style={{ fontSize: 15, fontWeight: 850, color: "#0f172a" }}>Modern Clock</div><p style={{ margin: "5px 0 0", fontSize: 11, lineHeight: 1.5, color: "#64748b" }}>Görünümü seçin, rengi uyarlayın ve ekranda gösterilecek bilgileri belirleyin.</p></div>
    <section style={sectionStyle}>
      <span style={labelStyle}>Görünüm</span>
      <div style={{ display: "flex", gap: 8 }}>
        <Choice selected={value.layout === "digital"} title="Dijital" note="Büyük ve net" onClick={() => update("layout", "digital")} />
        <Choice selected={value.layout === "analog"} title="Analog" note="Modern kadran" onClick={() => update("layout", "analog")} />
        <Choice selected={value.layout === "split"} title="Bölünmüş" note="Saat ve tarih" onClick={() => update("layout", "split")} />
      </div>
    </section>
    <section style={sectionStyle}>
      <span style={labelStyle}>Tema</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
        {(Object.keys(THEMES) as ClockConfig["theme"][]).map((key) => { const item = THEMES[key]; const selected = value.theme === key; return <button type="button" key={key} aria-pressed={selected} onClick={() => onChange({ ...value, theme: key, primaryColor: ACCENTS[key] })} style={{ display: "flex", alignItems: "center", gap: 9, padding: 9, borderRadius: 10, border: selected ? "1px solid #0f766e" : "1px solid #dbe3ec", background: selected ? "#f0fdfa" : "#fff", cursor: "pointer", textAlign: "left" }}>
          <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: item.bg, border: `1px solid ${item.border}` }} />
          <span><span style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#334155" }}>{item.name}</span><span style={{ display: "block", marginTop: 1, fontSize: 9, color: "#94a3b8" }}>{item.note}</span></span>
        </button>; })}
      </div>
      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}><span style={labelStyle}>Vurgu rengi</span><span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 10, fontFamily: "monospace", color: "#64748b" }}>{value.primaryColor.toUpperCase()}</span><input aria-label="Vurgu rengi" type="color" value={value.primaryColor} onChange={(event) => update("primaryColor", event.target.value)} style={{ width: 38, height: 30, padding: 2, border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer" }} /></span></label>
    </section>
    <section style={sectionStyle}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={labelStyle}>Saat dilimi</span><select value={value.timezone} onChange={(event) => update("timezone", event.target.value)} style={{ width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1", color: "#0f172a", background: "#fff" }}>{TIMEZONES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <div><span style={labelStyle}>Saat biçimi</span><div style={{ display: "flex", gap: 8, marginTop: 7 }}><Choice selected={value.format === "24h"} title="24 saat" onClick={() => update("format", "24h")} /><Choice selected={value.format === "12h"} title="12 saat" onClick={() => update("format", "12h")} /></div></div>
      <div><span style={labelStyle}>Dil</span><div style={{ display: "flex", gap: 8, marginTop: 7 }}><Choice selected={value.locale === "tr"} title="Türkçe" onClick={() => update("locale", "tr")} /><Choice selected={value.locale === "en"} title="English" onClick={() => update("locale", "en")} /></div></div>
    </section>
    <section style={sectionStyle}>
      <Toggle label="Saniyeyi göster" note="Canlı saniye bilgisini ekler" checked={value.showSeconds} onChange={(checked) => update("showSeconds", checked)} /><div style={{ height: 1, background: "#eef2f7" }} />
      <Toggle label="Tarihi göster" note="Gün ve tarih bilgisini ekler" checked={value.showDate} onChange={(checked) => update("showDate", checked)} /><div style={{ height: 1, background: "#eef2f7" }} />
      <Toggle label="Saat dilimini göster" note="Kullanılan bölgeyi belirtir" checked={value.showTimezone} onChange={(checked) => update("showTimezone", checked)} />
    </section>
  </div>;
}

type TimeParts = { hour: string; minute: string; second: string; period: string; date: string; timezone: string; h: number; m: number; s: number };
function getTimeParts(config: ClockConfig, now: Date): TimeParts {
  const locale = config.locale === "tr" ? "tr-TR" : "en-GB";
  const timeZone = config.timezone === "local" ? undefined : config.timezone;
  const display = new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: config.format === "12h", hourCycle: config.format === "24h" ? "h23" : undefined }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => display.find((part) => part.type === type)?.value ?? "";
  const raw = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(raw.find((part) => part.type === type)?.value ?? 0);
  return { hour: read("hour").padStart(2, "0"), minute: read("minute").padStart(2, "0"), second: read("second").padStart(2, "0"), period: read("dayPeriod"), date: new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now), timezone: config.timezone === "local" ? (config.locale === "tr" ? "Yerel saat" : "Local time") : config.timezone.split("/").at(-1)?.replaceAll("_", " ") ?? config.timezone, h: number("hour"), m: number("minute"), s: number("second") };
}

function Digital({ time, config, compact = false }: { time: TimeParts; config: ClockConfig; compact?: boolean }) {
  return <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}><span style={{ fontSize: compact ? "clamp(46px,9vw,88px)" : "clamp(68px,14vw,138px)", lineHeight: .88, letterSpacing: "-.065em", fontWeight: 720 }}>{time.hour}<span style={{ color: config.primaryColor, padding: "0 .055em" }}>:</span>{time.minute}</span>{config.showSeconds && <span style={{ marginLeft: ".5em", fontSize: compact ? "clamp(16px,2.5vw,28px)" : "clamp(20px,3vw,34px)", fontWeight: 650, color: config.primaryColor }}>{time.second}</span>}{time.period && <span style={{ marginLeft: ".5em", fontSize: "clamp(10px,1.5vw,16px)", fontWeight: 750, opacity: .65 }}>{time.period}</span>}</div>;
}

function Analog({ time, config }: { time: TimeParts; config: ClockConfig }) {
  const hour = (time.h % 12) * 30 + time.m * .5; const minute = time.m * 6 + time.s * .1; const second = time.s * 6;
  const hand = (width: number, height: string, angle: number, color: string) => ({ position: "absolute" as const, left: "50%", bottom: "50%", width, height, borderRadius: 999, background: color, transformOrigin: "50% 100%", transform: `translateX(-50%) rotate(${angle}deg)` });
  return <div aria-label={`${time.hour}:${time.minute}`} style={{ position: "relative", width: "min(52%,245px)", aspectRatio: "1", borderRadius: "50%", border: "1px solid currentColor", color: "inherit", boxShadow: "inset 0 0 0 8px rgba(255,255,255,.025),0 20px 50px rgba(0,0,0,.18)" }}>
    {Array.from({ length: 60 }, (_, index) => <span key={index} style={{ position: "absolute", inset: 0, transform: `rotate(${index * 6}deg)` }}><span style={{ position: "absolute", top: "4%", left: "50%", width: index % 5 === 0 ? 2 : 1, height: index % 5 === 0 ? "5.5%" : "2.2%", borderRadius: 2, background: "currentColor", opacity: index % 5 === 0 ? .76 : .2, transform: "translateX(-50%)" }} /></span>)}
    <span style={hand(5, "25%", hour, "currentColor")} /><span style={hand(3, "35%", minute, "currentColor")} />{config.showSeconds && <span style={hand(1, "39%", second, config.primaryColor)} />}<span style={{ position: "absolute", left: "50%", top: "50%", width: 11, height: 11, borderRadius: "50%", background: config.primaryColor, boxShadow: `0 0 0 4px ${config.primaryColor}33`, transform: "translate(-50%,-50%)" }} />
  </div>;
}

export function ClockPreview({ config: raw }: { config: Record<string, unknown> }) {
  const config = useMemo(() => normalizeClockConfig(raw), [raw]); const [now, setNow] = useState(() => new Date()); const theme = THEMES[config.theme]; const time = getTimeParts(config, now);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  const meta = <div style={{ textAlign: config.layout === "split" ? "left" : "center" }}>{config.showDate && <div style={{ fontSize: "clamp(12px,1.8vw,20px)", fontWeight: 650, textTransform: "capitalize", letterSpacing: "-.01em" }}>{time.date}</div>}{config.showTimezone && <div style={{ marginTop: config.showDate ? 7 : 0, fontSize: "clamp(9px,1.1vw,12px)", fontWeight: 750, letterSpacing: ".12em", textTransform: "uppercase", color: config.primaryColor }}>{time.timezone}</div>}</div>;
  return <div style={{ position: "relative", width: "100%", minHeight: 320, aspectRatio: "16/9", borderRadius: 18, overflow: "hidden", color: theme.text, background: theme.bg, border: `1px solid ${theme.border}`, boxShadow: theme.shadow, fontFamily: "Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
    <span aria-hidden="true" style={{ position: "absolute", width: "56%", aspectRatio: "1", left: "-16%", top: "-42%", borderRadius: "50%", background: config.primaryColor, opacity: config.theme === "paper" ? .07 : .12, filter: "blur(80px)" }} />
    <span aria-hidden="true" style={{ position: "absolute", width: "38%", aspectRatio: "1", right: "-10%", bottom: "-40%", borderRadius: "50%", background: config.primaryColor, opacity: config.theme === "paper" ? .05 : .09, filter: "blur(70px)" }} />
    {config.layout === "digital" && <div style={{ position: "relative", zIndex: 1, height: "100%", minHeight: 320, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 25, padding: "8%" }}><Digital time={time} config={config} />{meta}</div>}
    {config.layout === "analog" && <div style={{ position: "relative", zIndex: 1, height: "100%", minHeight: 320, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "5%" }}><Analog time={time} config={config} />{meta}</div>}
    {config.layout === "split" && <div style={{ position: "relative", zIndex: 1, height: "100%", minHeight: 320, display: "grid", gridTemplateColumns: "minmax(0,1.7fr) minmax(180px,.8fr)", alignItems: "stretch", padding: "6%" }}><div style={{ display: "flex", flexDirection: "column", justifyContent: "center", paddingRight: "8%" }}><Digital time={time} config={config} compact /></div><div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "8% 0 8% 14%", borderLeft: `1px solid ${theme.border}` }}><span style={{ width: 30, height: 4, borderRadius: 999, background: config.primaryColor }} />{meta}</div></div>}
  </div>;
}