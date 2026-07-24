"use client";

import { useMemo } from "react";

export type QrConfig = {
  contentType: "url" | "text" | "wifi";
  url: string;
  text: string;
  ssid: string;
  password: string;
  security: "WPA" | "WEP" | "nopass";
  hiddenNetwork: boolean;
  title: string;
  description: string;
  layout: "card" | "split" | "minimal";
  theme: "midnight" | "paper" | "emerald" | "ocean";
  foregroundColor: string;
  backgroundColor: string;
  showFrame: boolean;
};

export const DEFAULT_QR_CONFIG: QrConfig = {
  contentType: "url",
  url: "https://example.com",
  text: "Bizi ziyaret ettiğiniz için teşekkür ederiz.",
  ssid: "Guest_WiFi",
  password: "",
  security: "WPA",
  hiddenNetwork: false,
  title: "Kameranızı açın ve tarayın",
  description: "İçeriğe güvenli ve hızlı biçimde ulaşın.",
  layout: "split",
  theme: "emerald",
  foregroundColor: "#0f172a",
  backgroundColor: "#ffffff",
  showFrame: true
};

const THEMES = {
  midnight: { name: "Gece", note: "Seçkin ve koyu", bg: "linear-gradient(145deg,#09090b 0%,#18181b 55%,#27272a 100%)", text: "#fafafa", muted: "#a1a1aa", line: "rgba(255,255,255,.1)", accent: "#fbbf24", surface: "rgba(255,255,255,.055)" },
  paper: { name: "Açık", note: "Temiz ve yalın", bg: "linear-gradient(145deg,#fff 0%,#f5f5f4 100%)", text: "#1c1917", muted: "#78716c", line: "rgba(28,25,23,.11)", accent: "#0f766e", surface: "rgba(255,255,255,.75)" },
  emerald: { name: "Zümrüt", note: "Canlı ve güvenli", bg: "linear-gradient(145deg,#022c22 0%,#065f46 52%,#047857 100%)", text: "#ecfdf5", muted: "#a7f3d0", line: "rgba(255,255,255,.14)", accent: "#6ee7b7", surface: "rgba(255,255,255,.075)" },
  ocean: { name: "Okyanus", note: "Modern ve ferah", bg: "linear-gradient(145deg,#071a24 0%,#0c4a6e 50%,#075985 100%)", text: "#f0f9ff", muted: "#bae6fd", line: "rgba(255,255,255,.14)", accent: "#67e8f9", surface: "rgba(255,255,255,.075)" }
} as const;

function validColor(value: unknown, fallback: string): string {
  const color = String(value ?? "");
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function luminance(color: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return .2126 * (channels[0] ?? 0) + .7152 * (channels[1] ?? 0) + .0722 * (channels[2] ?? 0);
}

export function qrContrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

export function normalizeQrConfig(input: Record<string, unknown>): QrConfig {
  let foregroundColor = validColor(input.foregroundColor, DEFAULT_QR_CONFIG.foregroundColor);
  let backgroundColor = validColor(input.backgroundColor, DEFAULT_QR_CONFIG.backgroundColor);
  if (qrContrast(foregroundColor, backgroundColor) < 4.5 || luminance(foregroundColor) > luminance(backgroundColor)) {
    foregroundColor = DEFAULT_QR_CONFIG.foregroundColor;
    backgroundColor = DEFAULT_QR_CONFIG.backgroundColor;
  }
  return {
    contentType: input.contentType === "text" || input.contentType === "wifi" ? input.contentType : "url",
    url: typeof input.url === "string" && input.url.trim() ? input.url.trim().slice(0, 1200) : DEFAULT_QR_CONFIG.url,
    text: typeof input.text === "string" && input.text.trim() ? input.text.trim().slice(0, 500) : DEFAULT_QR_CONFIG.text,
    ssid: typeof input.ssid === "string" && input.ssid.trim() ? input.ssid.trim().slice(0, 128) : DEFAULT_QR_CONFIG.ssid,
    password: typeof input.password === "string" ? input.password.slice(0, 128) : "",
    security: input.security === "WEP" || input.security === "nopass" ? input.security : "WPA",
    hiddenNetwork: input.hiddenNetwork === true,
    title: typeof input.title === "string" && input.title.trim() ? input.title.trim().slice(0, 120) : DEFAULT_QR_CONFIG.title,
    description: typeof input.description === "string" ? input.description.trim().slice(0, 300) : DEFAULT_QR_CONFIG.description,
    layout: input.layout === "card" || input.layout === "minimal" ? input.layout : "split",
    theme: input.theme === "paper" || input.theme === "midnight" || input.theme === "ocean" ? input.theme : "emerald",
    foregroundColor,
    backgroundColor,
    showFrame: input.showFrame !== false
  };
}

function escapeWifi(value: string): string {
  return value.replace(/([\\;,":])/g, "\\$1");
}

export function buildQrPayload(config: QrConfig): string {
  if (config.contentType === "text") return config.text;
  if (config.contentType === "wifi") {
    const password = config.security === "nopass" ? "" : escapeWifi(config.password);
    return `WIFI:T:${config.security};S:${escapeWifi(config.ssid)};P:${password};H:${config.hiddenNetwork ? "true" : "false"};;`;
  }
  return config.url;
}

const sectionStyle = { display: "flex", flexDirection: "column" as const, gap: 12, padding: 16, border: "1px solid #e2e8f0", borderRadius: 14, background: "#fff" };
const labelStyle = { fontSize: 12, fontWeight: 750, color: "#334155", letterSpacing: ".01em" };

function Choice({ selected, title, note, onClick }: { selected: boolean; title: string; note?: string; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} style={{ flex: 1, minWidth: 0, padding: "11px 12px", borderRadius: 10, border: selected ? "1px solid #047857" : "1px solid #dbe3ec", background: selected ? "#ecfdf5" : "#fff", color: selected ? "#047857" : "#334155", cursor: "pointer", textAlign: "left", boxShadow: selected ? "0 0 0 2px rgba(4,120,87,.08)" : "none" }}><span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{title}</span>{note && <span style={{ display: "block", marginTop: 3, fontSize: 10, color: selected ? "#059669" : "#94a3b8" }}>{note}</span>}</button>;
}

function Toggle({ label, note, checked, onChange }: { label: string; note: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, cursor: "pointer" }}><span><span style={{ display: "block", fontSize: 13, fontWeight: 750, color: "#334155" }}>{label}</span><span style={{ display: "block", marginTop: 2, fontSize: 10, lineHeight: 1.4, color: "#94a3b8" }}>{note}</span></span><span style={{ position: "relative", width: 40, height: 22, flexShrink: 0, borderRadius: 999, background: checked ? "#047857" : "#cbd5e1" }}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} /><span style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(15,23,42,.28)", transition: "left 160ms ease" }} /></span></label>;
}

export function QrSettings({ config: raw, onChange }: { config: Record<string, unknown>; onChange: (next: QrConfig) => void }) {
  const config = normalizeQrConfig(raw);
  const update = <K extends keyof QrConfig>(key: K, value: QrConfig[K]) => onChange({ ...config, [key]: value });
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ padding: "0 2px 4px" }}><div style={{ fontSize: 15, fontWeight: 850, color: "#0f172a" }}>Modern QR Code</div><p style={{ margin: "5px 0 0", fontSize: 11, lineHeight: 1.5, color: "#64748b" }}>Web bağlantısı, metin veya Wi‑Fi erişimi için taranabilir ekranlar oluşturun.</p></div>
    <section style={sectionStyle}>
      <span style={labelStyle}>İçerik türü</span>
      <div style={{ display: "flex", gap: 8 }}><Choice selected={config.contentType === "url"} title="Bağlantı" note="Web sayfası" onClick={() => update("contentType", "url")} /><Choice selected={config.contentType === "text"} title="Metin" note="Bilgi paylaşımı" onClick={() => update("contentType", "text")} /><Choice selected={config.contentType === "wifi"} title="Wi‑Fi" note="Kolay bağlantı" onClick={() => update("contentType", "wifi")} /></div>
      {config.contentType === "url" && <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={labelStyle}>Hedef bağlantı</span><input type="url" required maxLength={1200} placeholder="https://example.com/menu" value={config.url} onChange={(event) => update("url", event.target.value)} style={{ width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1" }} /></label>}
      {config.contentType === "text" && <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={labelStyle}>QR metni</span><textarea required maxLength={500} rows={4} value={config.text} onChange={(event) => update("text", event.target.value)} style={{ width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1", fontFamily: "inherit", resize: "vertical" }} /><span style={{ alignSelf: "flex-end", fontSize: 9, color: "#94a3b8" }}>{config.text.length}/500</span></label>}
      {config.contentType === "wifi" && <>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={labelStyle}>Ağ adı (SSID)</span><input type="text" required maxLength={128} value={config.ssid} onChange={(event) => update("ssid", event.target.value)} style={{ width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1" }} /></label>
        <div><span style={labelStyle}>Güvenlik</span><div style={{ display: "flex", gap: 8, marginTop: 7 }}><Choice selected={config.security === "WPA"} title="WPA/WPA2" onClick={() => update("security", "WPA")} /><Choice selected={config.security === "WEP"} title="WEP" onClick={() => update("security", "WEP")} /><Choice selected={config.security === "nopass"} title="Şifresiz" onClick={() => update("security", "nopass")} /></div></div>
        {config.security !== "nopass" && <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={labelStyle}>Wi‑Fi şifresi</span><input type="password" maxLength={128} value={config.password} onChange={(event) => update("password", event.target.value)} autoComplete="new-password" style={{ width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1" }} /></label>}
        <Toggle label="Gizli ağ" note="SSID yayını kapalı ağlar için kullanın" checked={config.hiddenNetwork} onChange={(checked) => update("hiddenNetwork", checked)} />
      </>}
    </section>
    <section style={sectionStyle}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={labelStyle}>Başlık</span><input type="text" required maxLength={120} value={config.title} onChange={(event) => update("title", event.target.value)} style={{ width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1" }} /></label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={labelStyle}>Açıklama</span><textarea maxLength={300} rows={3} value={config.description} onChange={(event) => update("description", event.target.value)} style={{ width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1", fontFamily: "inherit", resize: "vertical" }} /></label>
    </section>
    <section style={sectionStyle}>
      <span style={labelStyle}>Görünüm</span>
      <div style={{ display: "flex", gap: 8 }}><Choice selected={config.layout === "card"} title="Kart" note="Ortalanmış" onClick={() => update("layout", "card")} /><Choice selected={config.layout === "split"} title="Bölünmüş" note="Metin ve kod" onClick={() => update("layout", "split")} /><Choice selected={config.layout === "minimal"} title="Minimal" note="Büyük QR" onClick={() => update("layout", "minimal")} /></div>
    </section>
    <section style={sectionStyle}>
      <span style={labelStyle}>Tema</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>{(Object.keys(THEMES) as QrConfig["theme"][]).map((key) => { const item = THEMES[key]; const selected = config.theme === key; return <button type="button" key={key} aria-pressed={selected} onClick={() => update("theme", key)} style={{ display: "flex", alignItems: "center", gap: 9, padding: 9, borderRadius: 10, border: selected ? "1px solid #047857" : "1px solid #dbe3ec", background: selected ? "#ecfdf5" : "#fff", cursor: "pointer", textAlign: "left" }}><span style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: item.bg, border: `1px solid ${item.line}` }} /><span><span style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#334155" }}>{item.name}</span><span style={{ display: "block", fontSize: 9, color: "#94a3b8" }}>{item.note}</span></span></button>; })}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{[["foregroundColor", "QR rengi"], ["backgroundColor", "QR zemini"]].map(([key, label]) => <label key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}><span style={{ fontSize: 10, color: "#64748b" }}>{label}</span><input type="color" value={config[key as "foregroundColor" | "backgroundColor"]} onChange={(event) => update(key as "foregroundColor" | "backgroundColor", event.target.value)} style={{ width: 38, height: 30, padding: 2, border: "1px solid #cbd5e1", borderRadius: 8 }} /></label>)}</div>
      <span style={{ padding: "8px 10px", borderRadius: 8, background: "#f0fdf4", color: "#166534", fontSize: 10, lineHeight: 1.4 }}>QR renkleri taranabilirlik için otomatik kontrast korumasına sahiptir.</span>
      <Toggle label="QR çerçevesini göster" note="Kodu arka plandan ayıran kartı görüntüler" checked={config.showFrame} onChange={(checked) => update("showFrame", checked)} />
    </section>
  </div>;
}

function PreviewCode({ config, size = 122 }: { config: QrConfig; size?: number }) {
  const payload = buildQrPayload(config);
  const cells = useMemo(() => {
    let seed = 2166136261;
    for (let index = 0; index < payload.length; index += 1) seed = Math.imul(seed ^ payload.charCodeAt(index), 16777619);
    const finder = (x: number, y: number, ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7 && (x === ox || x === ox + 6 || y === oy || y === oy + 6 || (x >= ox + 2 && x <= ox + 4 && y >= oy + 2 && y <= oy + 4));
    return Array.from({ length: 21 * 21 }, (_, index) => {
      const x = index % 21, y = Math.floor(index / 21);
      const inFinderArea = (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
      if (inFinderArea) return finder(x, y, 0, 0) || finder(x, y, 14, 0) || finder(x, y, 0, 14);
      seed = Math.imul(seed ^ (index + 1), 16777619);
      return (seed >>> 29) % 2 === 1;
    });
  }, [payload]);
  return <div style={{ width: size, height: size, display: "grid", gridTemplateColumns: "repeat(21,1fr)", padding: "8%", borderRadius: 10, background: config.backgroundColor, boxShadow: config.showFrame ? "0 16px 36px rgba(0,0,0,.18)" : "none" }}>{cells.map((dark, index) => <span key={index} style={{ background: dark ? config.foregroundColor : config.backgroundColor }} />)}</div>;
}

export function QrPreview({ config: raw }: { config: Record<string, unknown> }) {
  const config = useMemo(() => normalizeQrConfig(raw), [raw]);
  const theme = THEMES[config.theme];
  const frame = { position: "relative" as const, width: "100%", minHeight: 320, aspectRatio: "16/9", overflow: "hidden", borderRadius: 18, color: theme.text, background: theme.bg, border: `1px solid ${theme.line}`, boxShadow: "0 30px 80px rgba(15,23,42,.24)", fontFamily: "Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" };
  const typeLabel = config.contentType === "wifi" ? "WI‑FI" : config.contentType === "text" ? "BİLGİ" : "HIZLI ERİŞİM";
  return <div style={frame}>
    <span style={{ position: "absolute", width: "55%", aspectRatio: "1", right: "-18%", top: "-55%", borderRadius: "50%", background: theme.accent, opacity: .13, filter: "blur(75px)" }} />
    {config.layout === "split" && <div style={{ position: "relative", height: "100%", minHeight: 320, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(220px,.72fr)", alignItems: "center", padding: "7%" }}><div style={{ paddingRight: "10%" }}><span style={{ color: theme.accent, fontSize: 10, fontWeight: 900, letterSpacing: ".15em" }}>{typeLabel}</span><h2 style={{ margin: "14px 0 0", fontSize: "clamp(29px,4.8vw,55px)", lineHeight: 1.03, letterSpacing: "-.045em" }}>{config.title}</h2><p style={{ maxWidth: "85%", margin: "15px 0 0", color: theme.muted, fontSize: "clamp(11px,1.45vw,16px)", lineHeight: 1.55 }}>{config.description}</p></div><div style={{ height: "100%", display: "grid", placeItems: "center", borderLeft: `1px solid ${theme.line}` }}><PreviewCode config={config} size={148} /></div></div>}
    {config.layout === "card" && <div style={{ position: "relative", height: "100%", minHeight: 320, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 13, padding: "6%", textAlign: "center" }}><span style={{ color: theme.accent, fontSize: 9, fontWeight: 900, letterSpacing: ".15em" }}>{typeLabel}</span><h2 style={{ margin: 0, fontSize: "clamp(20px,3vw,34px)", lineHeight: 1.05 }}>{config.title}</h2><PreviewCode config={config} size={128} /><p style={{ margin: 0, color: theme.muted, fontSize: 10 }}>{config.description}</p></div>}
    {config.layout === "minimal" && <div style={{ position: "relative", height: "100%", minHeight: 320, display: "grid", placeItems: "center", padding: "5%" }}><PreviewCode config={config} size={205} /><span style={{ position: "absolute", left: "5%", bottom: "5%", color: theme.muted, fontSize: 10, fontWeight: 700 }}>{config.title}</span></div>}
  </div>;
}
