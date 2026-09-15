"use client";
import { useEffect, useMemo, useState } from "react";

export type ClockConfig = {
  timezone: string; locale: "tr" | "en"; format: "24h" | "12h";
  layout: "digital" | "analog" | "split"; theme: "paper"; primaryColor: string;
  heading: string; caption: string; showSeconds: boolean; showDate: boolean; showTimezone: boolean;
};
export const DEFAULT_CLOCK_CONFIG: ClockConfig = {
  timezone: "Europe/Istanbul", locale: "en", format: "24h", layout: "split",
  theme: "paper", primaryColor: "#9b8159", heading: "LOCAL TIME", caption: "Every moment matters.",
  showSeconds: true, showDate: true, showTimezone: true
};
export const CLOCK_TEMPLATES = [
  { id: "digital" as const, name: "Executive Digital", description: "Generous typography. Quiet precision." },
  { id: "analog" as const, name: "Heritage Analog", description: "A classic dial with refined brass details." },
  { id: "split" as const, name: "Signature Split", description: "A balanced time and date composition." }
];
export function normalizeClockConfig(input: Record<string, unknown>): ClockConfig {
  let timezone = typeof input.timezone === "string" ? input.timezone : DEFAULT_CLOCK_CONFIG.timezone;
  try { if (timezone !== "local") new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); }
  catch { timezone = DEFAULT_CLOCK_CONFIG.timezone; }
  return {
    timezone, locale: input.locale === "tr" ? "tr" : "en", format: input.format === "12h" ? "12h" : "24h",
    layout: input.layout === "digital" || input.layout === "analog" ? input.layout : "split",
    theme: "paper", primaryColor: "#9b8159",
    heading: typeof input.heading === "string" ? input.heading.slice(0, 80) : DEFAULT_CLOCK_CONFIG.heading,
    caption: typeof input.caption === "string" ? input.caption.slice(0, 140) : DEFAULT_CLOCK_CONFIG.caption,
    showSeconds: input.showSeconds !== false, showDate: input.showDate !== false, showTimezone: input.showTimezone !== false
  };
}
export function ClockSettings({ config, onChange }: { config: Record<string, unknown>; onChange: (next: ClockConfig) => void }) {
  const value = normalizeClockConfig(config);
  const update = (patch: Partial<ClockConfig>) => onChange({ ...value, ...patch });
  const zones = useMemo(() => ["local", ...Intl.supportedValuesOf("timeZone")], []);
  if (!zones.includes(value.timezone)) zones.push(value.timezone);
  return <div className="clock-settings">
    <h3>Clock settings</h3>
    <label>Display type<select value={value.layout} onChange={e => update({ layout: e.target.value as ClockConfig["layout"] })}>{CLOCK_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label>Time zone<select value={value.timezone} onChange={e => update({ timezone: e.target.value })}>{zones.map(zone => <option key={zone} value={zone}>{zone === "local" ? "Device local time" : zone.replaceAll("_", " ")}</option>)}</select></label>
    <label>Time format<select value={value.format} onChange={e => update({ format: e.target.value as ClockConfig["format"] })}><option value="24h">24-hour</option><option value="12h">12-hour (AM / PM)</option></select></label>
    <label>Date language<select value={value.locale} onChange={e => update({ locale: e.target.value as ClockConfig["locale"] })}><option value="en">English</option><option value="tr">Turkish</option></select></label>
    <label>Heading<input maxLength={80} value={value.heading} onChange={e => update({ heading: e.target.value })} /></label>
    <label>Caption<textarea maxLength={140} value={value.caption} onChange={e => update({ caption: e.target.value })} /></label>
    {([ ["showSeconds", "Show seconds"], ["showDate", "Show date"], ["showTimezone", "Show time zone"] ] as const).map(([key, label]) => <label className="clock-toggle" key={key}>{label}<input type="checkbox" checked={value[key]} onChange={e => update({ [key]: e.target.checked })} /></label>)}
  </div>;
}
export function ClockTools({ config, onChange }: { config: Record<string, unknown>; onChange: (next: ClockConfig) => void }) {
  const [open, setOpen] = useState(false);
  return <aside className="restaurant-editor-rail clock-editor-rail"><button className="restaurant-tool-tile" type="button" aria-expanded={open} onClick={() => setOpen(!open)}><span className="restaurant-tool-icon">◷</span>Clock</button>{open && <div className="restaurant-text-panel clock-options-panel"><button className="clock-panel-close" type="button" aria-label="Close clock settings" onClick={() => setOpen(false)}>×</button><ClockSettings config={config} onChange={onChange} /></div>}</aside>;
}
export function ClockPreview({ config: raw, onChange, orientation = "landscape" }: { config: Record<string, unknown>; onChange?: (next: ClockConfig) => void; orientation?: "landscape" | "portrait" }) {
  const config = useMemo(() => normalizeClockConfig(raw), [raw]);
  const [now, setNow] = useState<Date | null>(null);
  const [editing, setEditing] = useState<"heading" | "caption" | null>(null);
  useEffect(() => { setNow(new Date()); const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  const timeZone = config.timezone === "local" ? undefined : config.timezone;
  const date = now ?? new Date("2026-01-01T07:10:00Z");
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", ...(config.format === "12h" ? { hour12: true } : { hourCycle: "h23" as const }) }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  const dateText = new Intl.DateTimeFormat(config.locale === "tr" ? "tr-TR" : "en-GB", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
  const text = (key: "heading" | "caption") => onChange ? editing === key
    ? <input autoFocus aria-label={"Edit " + key} maxLength={key === "heading" ? 80 : 140} value={config[key]} onChange={e => onChange({ ...config, [key]: e.target.value })} onBlur={() => setEditing(null)} onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); setEditing(null); } }} />
    : <button type="button" aria-label={"Edit " + key} onClick={() => setEditing(key)}>{config[key] || "Add " + key}</button>
    : config[key];
  const h = Number(part("hour")), m = Number(part("minute")), s = Number(part("second"));
  return <div className={"elegant-clock " + orientation} data-layout={config.layout} data-testid="clock-canvas">
    <div className="clock-heading">{text("heading")}</div>
    <div className="clock-composition">
      {config.layout === "analog" ? <svg className="clock-dial" viewBox="0 0 400 400" role="img" aria-label={part("hour") + ":" + part("minute")}>
        <circle cx="200" cy="200" r="193" fill="#fff" stroke="#c8baa4" strokeWidth="1" /><circle cx="200" cy="200" r="186" fill="none" stroke="#e8e3dc" />
        {Array.from({ length: 60 }, (_, i) => <line key={i} x1="200" y1="23" x2="200" y2={i % 5 ? 29 : 38} stroke={i % 5 ? "#c4beb4" : "#393a39"} strokeWidth={i % 5 ? 1 : 2} transform={"rotate(" + i * 6 + " 200 200)"} />)}
        {[12, 3, 6, 9].map((n, i) => <text key={n} x={[200, 351, 200, 49][i]} y={[70, 209, 347, 209][i]} textAnchor="middle" fontFamily="Georgia,serif" fontSize="26" fill="#303737">{n}</text>)}
        <line x1="200" y1="207" x2="200" y2="104" stroke="#273331" strokeWidth="6" strokeLinecap="round" transform={"rotate(" + (h * 30 + m / 2) + " 200 200)"} />
        <line x1="200" y1="212" x2="200" y2="58" stroke="#273331" strokeWidth="3" strokeLinecap="round" transform={"rotate(" + (m * 6 + s / 10) + " 200 200)"} />
        {config.showSeconds && <line x1="200" y1="225" x2="200" y2="46" stroke="#9b8159" strokeWidth="1.2" transform={"rotate(" + s * 6 + " 200 200)"} />}<circle cx="200" cy="200" r="5" fill="#9b8159" />
      </svg> : <div className="clock-digits"><span>{part("hour")}<i>:</i>{part("minute")}</span>{config.showSeconds && <small>{part("second")}</small>}{part("dayPeriod") && <em>{part("dayPeriod")}</em>}</div>}
      <div className="clock-meta">{config.showDate && <div className="clock-date">{dateText}</div>}{config.showTimezone && <div className="clock-zone">{config.timezone === "local" ? "Local time" : config.timezone.split("/").at(-1)?.replaceAll("_", " ")}</div>}</div>
    </div>
    <div className="clock-caption">{text("caption")}</div>
  </div>;
}
