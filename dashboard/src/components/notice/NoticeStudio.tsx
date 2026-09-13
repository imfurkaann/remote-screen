"use client";

import { useMemo } from "react";

export type NoticeConfig = {
  eyebrow: string;
  headline: string;
  body: string;
  layout: "centered" | "editorial" | "banner";
  theme: "midnight" | "paper" | "violet" | "alert" | "custom";
  icon: "info" | "warning" | "alert" | "success" | "celebrate" | "none";
  animation: "none" | "fade" | "rise";
  accentColor: string;
  bgColor: string;
  textColor: string;
};

export const DEFAULT_NOTICE_CONFIG: NoticeConfig = {
  eyebrow: "Önemli duyuru",
  headline: "Ekibimize hoş geldiniz",
  body: "Günün önemli duyurularını ve ekip güncellemelerini bu alanda paylaşabilirsiniz.",
  layout: "editorial",
  theme: "violet",
  icon: "celebrate",
  animation: "rise",
  accentColor: "#c4b5fd",
  bgColor: "#312e81",
  textColor: "#ffffff"
};

const THEMES = {
  midnight: { name: "Gece", note: "Seçkin ve sakin", bg: "linear-gradient(145deg,#09090b 0%,#18181b 55%,#27272a 100%)", solid: "#18181b", text: "#fafafa", muted: "#a1a1aa", line: "rgba(255,255,255,.1)", accent: "#fbbf24" },
  paper: { name: "Editoryal", note: "Açık ve net", bg: "linear-gradient(145deg,#fff 0%,#f5f5f4 100%)", solid: "#ffffff", text: "#1c1917", muted: "#78716c", line: "rgba(28,25,23,.11)", accent: "#b91c1c" },
  violet: { name: "Violet", note: "Modern ve sıcak", bg: "linear-gradient(145deg,#1e1b4b 0%,#312e81 50%,#5b21b6 100%)", solid: "#312e81", text: "#faf5ff", muted: "#ddd6fe", line: "rgba(255,255,255,.13)", accent: "#c4b5fd" },
  alert: { name: "Uyarı", note: "Yüksek görünürlük", bg: "linear-gradient(145deg,#450a0a 0%,#991b1b 55%,#dc2626 100%)", solid: "#991b1b", text: "#fff7ed", muted: "#fecaca", line: "rgba(255,255,255,.14)", accent: "#fde68a" },
  custom: { name: "Özel", note: "Kendi renkleriniz", bg: "#312e81", solid: "#312e81", text: "#ffffff", muted: "rgba(255,255,255,.74)", line: "rgba(255,255,255,.13)", accent: "#c4b5fd" }
} as const;

const ICONS: Record<NoticeConfig["icon"], string> = {
  info: "i",
  warning: "!",
  alert: "!",
  success: "✓",
  celebrate: "✦",
  none: ""
};

function validColor(value: unknown, fallback: string): string {
  const color = String(value ?? "");
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

export function normalizeNoticeConfig(input: Record<string, unknown>): NoticeConfig {
  const oldTheme = String(input.theme ?? "");
  const legacyBg = validColor(input.bgColor, DEFAULT_NOTICE_CONFIG.bgColor);
  const theme: NoticeConfig["theme"] =
    oldTheme === "paper" || oldTheme === "light"
      ? "paper"
      : oldTheme === "midnight" || oldTheme === "dark"
        ? "midnight"
        : oldTheme === "alert" || oldTheme === "red"
          ? "alert"
          : oldTheme === "custom" || (input.bgColor !== undefined && legacyBg.toLowerCase() !== "#4c1d95" && legacyBg.toLowerCase() !== "#312e81")
            ? "custom"
            : "violet";
  const themeData = THEMES[theme];
  const rawIcon = input.icon === undefined ? DEFAULT_NOTICE_CONFIG.icon : input.icon === "checkmark" ? "success" : input.icon;
  const icon: NoticeConfig["icon"] = rawIcon === "info" || rawIcon === "warning" || rawIcon === "alert" || rawIcon === "success" || rawIcon === "celebrate" || rawIcon === "none" ? rawIcon : "info";

  return {
    eyebrow: typeof input.eyebrow === "string" ? input.eyebrow.trim().slice(0, 60) : DEFAULT_NOTICE_CONFIG.eyebrow,
    headline: typeof input.headline === "string" ? input.headline.slice(0, 140) : DEFAULT_NOTICE_CONFIG.headline,
    body: typeof input.body === "string" ? input.body.slice(0, 800) : DEFAULT_NOTICE_CONFIG.body,
    layout: input.layout === "centered" || input.layout === "banner" ? input.layout : "editorial",
    theme,
    icon,
    animation: input.animation === "none" || input.animation === "fade" ? input.animation : "rise",
    accentColor: validColor(input.accentColor, themeData.accent),
    bgColor: validColor(input.bgColor, themeData.solid),
    textColor: validColor(input.textColor, input.theme === undefined && input.bgColor === undefined ? DEFAULT_NOTICE_CONFIG.textColor : themeData.text)
  };
}

const sectionStyle = { display: "flex", flexDirection: "column" as const, gap: 12, padding: 16, border: "1px solid #e2e8f0", borderRadius: 14, background: "#fff" };
const labelStyle = { fontSize: 12, fontWeight: 750, color: "#334155", letterSpacing: ".01em" };

function Choice({ selected, title, note, onClick }: { selected: boolean; title: string; note?: string; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} style={{ flex: 1, minWidth: 0, padding: "11px 12px", borderRadius: 10, border: selected ? "1px solid #6d28d9" : "1px solid #dbe3ec", background: selected ? "#f5f3ff" : "#fff", color: selected ? "#5b21b6" : "#334155", cursor: "pointer", textAlign: "left", boxShadow: selected ? "0 0 0 2px rgba(109,40,217,.08)" : "none" }}>
    <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{title}</span>
    {note && <span style={{ display: "block", marginTop: 3, fontSize: 10, color: selected ? "#7c3aed" : "#94a3b8" }}>{note}</span>}
  </button>;
}

export function NoticeSettings({ config: raw, onChange }: { config: Record<string, unknown>; onChange: (next: NoticeConfig) => void }) {
  const config = normalizeNoticeConfig(raw);
  const update = <K extends keyof NoticeConfig>(key: K, value: NoticeConfig[K]) => onChange({ ...config, [key]: value });
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ padding: "0 2px 4px" }}><div style={{ fontSize: 15, fontWeight: 850, color: "#0f172a" }}>Modern Notice Board</div><p style={{ margin: "5px 0 0", fontSize: 11, lineHeight: 1.5, color: "#64748b" }}>Karşılama ekranları, kurum duyuruları ve acil bildirimler oluşturun.</p></div>
    <section style={sectionStyle}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={labelStyle}>Üst etiket</span><input type="text" maxLength={60} placeholder="Önemli duyuru" value={config.eyebrow} onChange={(event) => update("eyebrow", event.target.value)} style={{ width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1" }} /></label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={labelStyle}>Başlık</span><input type="text" required maxLength={140} placeholder="Duyuru başlığı" value={config.headline} onChange={(event) => update("headline", event.target.value)} style={{ width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1" }} /></label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={labelStyle}>Mesaj</span><textarea required maxLength={800} rows={5} placeholder="Duyuru metnini yazın…" value={config.body} onChange={(event) => update("body", event.target.value)} style={{ width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1", fontFamily: "inherit", resize: "vertical" }} /><span style={{ alignSelf: "flex-end", fontSize: 9, color: "#94a3b8" }}>{config.body.length}/800</span></label>
    </section>
    <section style={sectionStyle}>
      <span style={labelStyle}>Görünüm</span>
      <div style={{ display: "flex", gap: 8 }}><Choice selected={config.layout === "centered"} title="Ortalanmış" note="Sade ve güçlü" onClick={() => update("layout", "centered")} /><Choice selected={config.layout === "editorial"} title="Editoryal" note="Başlık ve vurgu" onClick={() => update("layout", "editorial")} /><Choice selected={config.layout === "banner"} title="Banner" note="Yatay duyuru" onClick={() => update("layout", "banner")} /></div>
    </section>
    <section style={sectionStyle}>
      <span style={labelStyle}>Tema</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
        {(Object.keys(THEMES) as NoticeConfig["theme"][]).map((key) => {
          const item = THEMES[key]; const selected = config.theme === key;
          return <button type="button" key={key} aria-pressed={selected} onClick={() => onChange({ ...config, theme: key, accentColor: item.accent, bgColor: item.solid, textColor: item.text })} style={{ display: "flex", alignItems: "center", gap: 9, padding: 9, borderRadius: 10, border: selected ? "1px solid #6d28d9" : "1px solid #dbe3ec", background: selected ? "#f5f3ff" : "#fff", cursor: "pointer", textAlign: "left" }}><span style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: item.bg, border: `1px solid ${item.line}` }} /><span><span style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#334155" }}>{item.name}</span><span style={{ display: "block", fontSize: 9, color: "#94a3b8" }}>{item.note}</span></span></button>;
        })}
      </div>
      {config.theme === "custom" && <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {[["bgColor", "Arka plan"], ["textColor", "Metin"], ["accentColor", "Vurgu"]].map(([key, label]) => <label key={key} style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={{ fontSize: 9, color: "#64748b" }}>{label}</span><input type="color" value={config[key as "bgColor" | "textColor" | "accentColor"]} onChange={(event) => update(key as "bgColor" | "textColor" | "accentColor", event.target.value)} style={{ width: "100%", height: 34, padding: 2, border: "1px solid #cbd5e1", borderRadius: 8 }} /></label>)}
      </div>}
    </section>
    <section style={sectionStyle}>
      <span style={labelStyle}>Simge</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {(["info", "warning", "alert", "success", "celebrate", "none"] as NoticeConfig["icon"][]).map((icon) => <button type="button" key={icon} aria-pressed={config.icon === icon} onClick={() => update("icon", icon)} style={{ padding: 9, borderRadius: 9, border: config.icon === icon ? "1px solid #6d28d9" : "1px solid #dbe3ec", background: config.icon === icon ? "#f5f3ff" : "#fff", color: config.icon === icon ? "#6d28d9" : "#475569", cursor: "pointer", fontSize: 14, fontWeight: 850 }}>{ICONS[icon] || "Yok"}</button>)}
      </div>
      <div><span style={labelStyle}>Geçiş</span><div style={{ display: "flex", gap: 8, marginTop: 7 }}><Choice selected={config.animation === "none"} title="Yok" onClick={() => update("animation", "none")} /><Choice selected={config.animation === "fade"} title="Yumuşak" onClick={() => update("animation", "fade")} /><Choice selected={config.animation === "rise"} title="Yükselme" onClick={() => update("animation", "rise")} /></div></div>
    </section>
  </div>;
}

export function NoticePreview({ config: raw }: { config: Record<string, unknown> }) {
  const config = useMemo(() => normalizeNoticeConfig(raw), [raw]);
  const theme = THEMES[config.theme];
  const background = config.theme === "custom" ? config.bgColor : theme.bg;
  const text = config.theme === "custom" ? config.textColor : theme.text;
  const muted = config.theme === "custom" ? `${config.textColor}bb` : theme.muted;
  const frame = { position: "relative" as const, width: "100%", minHeight: 320, aspectRatio: "16/9", overflow: "hidden", borderRadius: 18, color: text, background, border: `1px solid ${theme.line}`, boxShadow: "0 30px 80px rgba(15,23,42,.24)", fontFamily: "Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" };
  const icon = config.icon !== "none" && <span style={{ width: "clamp(46px,7vw,78px)", aspectRatio: "1", display: "grid", placeItems: "center", flexShrink: 0, borderRadius: "29%", border: `1px solid ${theme.line}`, background: "rgba(255,255,255,.08)", color: config.accentColor, fontSize: "clamp(23px,3.5vw,40px)", fontWeight: 850 }}>{ICONS[config.icon]}</span>;

  return <div style={frame}>
    <span style={{ position: "absolute", width: "52%", aspectRatio: "1", right: "-16%", top: "-52%", borderRadius: "50%", background: config.accentColor, opacity: .13, filter: "blur(70px)" }} />
    {config.layout === "centered" && <div style={{ position: "relative", height: "100%", minHeight: 320, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8%", textAlign: "center" }}>{icon}{config.eyebrow && <div style={{ marginTop: 18, color: config.accentColor, fontSize: 10, fontWeight: 900, letterSpacing: ".15em", textTransform: "uppercase" }}>{config.eyebrow}</div>}<h2 style={{ maxWidth: "84%", margin: "13px 0 0", fontSize: "clamp(29px,5vw,56px)", lineHeight: 1.02, letterSpacing: "-.045em" }}>{config.headline}</h2><p style={{ maxWidth: "70%", margin: "15px 0 0", color: muted, fontSize: "clamp(11px,1.5vw,17px)", lineHeight: 1.55 }}>{config.body}</p></div>}
    {config.layout === "editorial" && <div style={{ position: "relative", height: "100%", minHeight: 320, display: "grid", gridTemplateColumns: "minmax(0,1.45fr) minmax(180px,.55fr)", padding: "7%" }}><div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingRight: "8%" }}><span style={{ color: config.accentColor, fontSize: 10, fontWeight: 900, letterSpacing: ".15em", textTransform: "uppercase" }}>{config.eyebrow}</span><div><h2 style={{ margin: 0, fontSize: "clamp(31px,5.2vw,60px)", lineHeight: 1.01, letterSpacing: "-.05em" }}>{config.headline}</h2><p style={{ margin: "15px 0 0", color: muted, fontSize: "clamp(11px,1.45vw,16px)", lineHeight: 1.55 }}>{config.body}</p></div><span style={{ width: 34, height: 4, borderRadius: 99, background: config.accentColor }} /></div><div style={{ display: "grid", placeItems: "center", borderLeft: `1px solid ${theme.line}` }}>{icon}</div></div>}
    {config.layout === "banner" && <div style={{ position: "relative", height: "100%", minHeight: 320, display: "flex", alignItems: "center", gap: "5%", padding: "8%" }}>{icon}<div style={{ flex: 1 }}><div style={{ color: config.accentColor, fontSize: 10, fontWeight: 900, letterSpacing: ".15em", textTransform: "uppercase" }}>{config.eyebrow}</div><h2 style={{ margin: "10px 0 0", fontSize: "clamp(30px,5vw,58px)", lineHeight: 1.02, letterSpacing: "-.045em" }}>{config.headline}</h2><p style={{ maxWidth: "82%", margin: "14px 0 0", color: muted, fontSize: "clamp(11px,1.45vw,16px)", lineHeight: 1.5 }}>{config.body}</p></div></div>}
  </div>;
}
