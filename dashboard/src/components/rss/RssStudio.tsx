"use client";

import { useMemo } from "react";

export type RssConfig = {
  rssUrl: string;
  sourceLabel: string;
  locale: "tr" | "en";
  layout: "ticker" | "cards" | "split";
  theme: "midnight" | "paper" | "signal" | "ocean";
  speed: "slow" | "medium" | "fast";
  maxItems: 5 | 10 | 20;
  showDescription: boolean;
  showTimestamp: boolean;
};

export const DEFAULT_RSS_CONFIG: RssConfig = {
  rssUrl: "https://feeds.bbci.co.uk/news/rss.xml",
  sourceLabel: "Gündem",
  locale: "tr",
  layout: "split",
  theme: "midnight",
  speed: "medium",
  maxItems: 10,
  showDescription: true,
  showTimestamp: true
};

const THEMES = {
  midnight: { name: "Gece", note: "Derin ve sakin", bg: "linear-gradient(145deg,#09090b 0%,#18181b 55%,#27272a 100%)", surface: "rgba(255,255,255,.055)", text: "#fafafa", muted: "#a1a1aa", line: "rgba(255,255,255,.1)", accent: "#fbbf24" },
  paper: { name: "Editoryal", note: "Açık ve net", bg: "linear-gradient(145deg,#fff 0%,#f5f5f4 100%)", surface: "rgba(255,255,255,.76)", text: "#1c1917", muted: "#78716c", line: "rgba(28,25,23,.11)", accent: "#b91c1c" },
  signal: { name: "Sinyal", note: "Canlı ve güçlü", bg: "linear-gradient(145deg,#180707 0%,#3f0b0b 48%,#7f1d1d 100%)", surface: "rgba(255,255,255,.07)", text: "#fff7ed", muted: "#fecaca", line: "rgba(255,255,255,.13)", accent: "#fb7185" },
  ocean: { name: "Okyanus", note: "Modern ve ferah", bg: "linear-gradient(145deg,#071a24 0%,#0c4a6e 50%,#075985 100%)", surface: "rgba(255,255,255,.075)", text: "#f0f9ff", muted: "#bae6fd", line: "rgba(255,255,255,.14)", accent: "#67e8f9" }
} as const;

export function normalizeRssConfig(input: Record<string, unknown>): RssConfig {
  const rawUrl = typeof input.rssUrl === "string" ? input.rssUrl.slice(0, 2048) : DEFAULT_RSS_CONFIG.rssUrl;
  const rawLabel = typeof input.sourceLabel === "string" ? input.sourceLabel.slice(0, 50) : DEFAULT_RSS_CONFIG.sourceLabel;
  const oldTheme = String(input.theme ?? "");
  const theme: RssConfig["theme"] =
    oldTheme === "paper" || oldTheme === "light"
      ? "paper"
      : oldTheme === "signal" || oldTheme === "red"
        ? "signal"
        : oldTheme === "ocean" || oldTheme === "blue"
          ? "ocean"
          : "midnight";

  return {
    rssUrl: rawUrl,
    sourceLabel: rawLabel,
    locale: input.locale === "en" ? "en" : "tr",
    layout: input.layout === "ticker" || input.layout === "cards" ? input.layout : "split",
    theme,
    speed: input.speed === "slow" || input.speed === "fast" ? input.speed : "medium",
    maxItems: input.maxItems === 5 || input.maxItems === 20 ? input.maxItems : 10,
    showDescription: input.showDescription !== false,
    showTimestamp: input.showTimestamp !== false
  };
}

const sectionStyle = { display: "flex", flexDirection: "column" as const, gap: 12, padding: 16, border: "1px solid #e2e8f0", borderRadius: 14, background: "#fff" };
const labelStyle = { fontSize: 12, fontWeight: 750, color: "#334155", letterSpacing: ".01em" };

function Choice({ selected, title, note, onClick }: { selected: boolean; title: string; note?: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} style={{ flex: 1, minWidth: 0, padding: "11px 12px", borderRadius: 10, border: selected ? "1px solid #b45309" : "1px solid #dbe3ec", background: selected ? "#fffbeb" : "#fff", color: selected ? "#92400e" : "#334155", cursor: "pointer", textAlign: "left", boxShadow: selected ? "0 0 0 2px rgba(180,83,9,.08)" : "none" }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{title}</span>
      {note && <span style={{ display: "block", marginTop: 3, fontSize: 10, color: selected ? "#b45309" : "#94a3b8" }}>{note}</span>}
    </button>
  );
}

function Toggle({ label, note, checked, onChange }: { label: string; note: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, cursor: "pointer" }}>
      <span><span style={{ display: "block", fontSize: 13, fontWeight: 750, color: "#334155" }}>{label}</span><span style={{ display: "block", marginTop: 2, fontSize: 10, lineHeight: 1.4, color: "#94a3b8" }}>{note}</span></span>
      <span style={{ position: "relative", width: 40, height: 22, flexShrink: 0, borderRadius: 999, background: checked ? "#b45309" : "#cbd5e1" }}>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} />
        <span style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(15,23,42,.28)", transition: "left 160ms ease" }} />
      </span>
    </label>
  );
}

export function RssSettings({ config: raw, onChange }: { config: Record<string, unknown>; onChange: (next: RssConfig) => void }) {
  const config = normalizeRssConfig(raw);
  const update = <K extends keyof RssConfig>(key: K, value: RssConfig[K]) => onChange({ ...config, [key]: value });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ padding: "0 2px 4px" }}>
        <div style={{ fontSize: 15, fontWeight: 850, color: "#0f172a" }}>Modern RSS Akışı</div>
        <p style={{ margin: "5px 0 0", fontSize: 11, lineHeight: 1.5, color: "#64748b" }}>Haberleri kayan bant, kart veya bölünmüş editoryal görünümde yayınlayın.</p>
      </div>
      <section style={sectionStyle}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>RSS kaynak adresi</span>
          <input type="url" required maxLength={2048} placeholder="https://example.com/feed.xml" value={config.rssUrl} onChange={(event) => update("rssUrl", event.target.value)} style={{ width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1", color: "#0f172a", background: "#fff" }} />
          <span style={{ fontSize: 10, lineHeight: 1.4, color: "#94a3b8" }}>Güvenli bir HTTPS RSS veya Atom adresi kullanın.</span>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={labelStyle}>Ekran etiketi</span>
          <input type="text" maxLength={50} placeholder="Gündem, Duyurular, Şirket Haberleri" value={config.sourceLabel} onChange={(event) => update("sourceLabel", event.target.value)} style={{ width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1", color: "#0f172a", background: "#fff" }} />
        </label>
      </section>
      <section style={sectionStyle}>
        <span style={labelStyle}>Görünüm</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Choice selected={config.layout === "ticker"} title="Bant" note="Kesintisiz akış" onClick={() => update("layout", "ticker")} />
          <Choice selected={config.layout === "cards"} title="Kartlar" note="Tek haber odağı" onClick={() => update("layout", "cards")} />
          <Choice selected={config.layout === "split"} title="Bölünmüş" note="Özet ve liste" onClick={() => update("layout", "split")} />
        </div>
      </section>
      <section style={sectionStyle}>
        <span style={labelStyle}>Tema</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
          {(Object.keys(THEMES) as RssConfig["theme"][]).map((key) => {
            const item = THEMES[key];
            const selected = config.theme === key;
            return (
              <button type="button" key={key} aria-pressed={selected} onClick={() => update("theme", key)} style={{ display: "flex", alignItems: "center", gap: 9, padding: 9, borderRadius: 10, border: selected ? "1px solid #b45309" : "1px solid #dbe3ec", background: selected ? "#fffbeb" : "#fff", cursor: "pointer", textAlign: "left" }}>
                <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: item.bg, border: `1px solid ${item.line}` }} />
                <span><span style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#334155" }}>{item.name}</span><span style={{ display: "block", marginTop: 1, fontSize: 9, color: "#94a3b8" }}>{item.note}</span></span>
              </button>
            );
          })}
        </div>
      </section>
      <section style={sectionStyle}>
        <div>
          <span style={labelStyle}>{config.layout === "ticker" ? "Akış hızı" : "Kart geçiş süresi"}</span>
          <div style={{ display: "flex", gap: 8, marginTop: 7 }}>
            <Choice selected={config.speed === "slow"} title="Yavaş" onClick={() => update("speed", "slow")} />
            <Choice selected={config.speed === "medium"} title="Normal" onClick={() => update("speed", "medium")} />
            <Choice selected={config.speed === "fast"} title="Hızlı" onClick={() => update("speed", "fast")} />
          </div>
        </div>
        <div>
          <span style={labelStyle}>İçerik sayısı</span>
          <div style={{ display: "flex", gap: 8, marginTop: 7 }}>
            <Choice selected={config.maxItems === 5} title="5" onClick={() => update("maxItems", 5)} />
            <Choice selected={config.maxItems === 10} title="10" onClick={() => update("maxItems", 10)} />
            <Choice selected={config.maxItems === 20} title="20" onClick={() => update("maxItems", 20)} />
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
        <Toggle label="Haber özetini göster" note="Kart ve bölünmüş görünümde açıklamayı ekler" checked={config.showDescription} onChange={(checked) => update("showDescription", checked)} />
        <div style={{ height: 1, background: "#eef2f7" }} />
        <Toggle label="Yayın zamanını göster" note="Kaynak tarafından verilen tarih ve saati görüntüler" checked={config.showTimestamp} onChange={(checked) => update("showTimestamp", checked)} />
      </section>
    </div>
  );
}

const SAMPLE_TITLES = [
  "Yeni nesil enerji yatırımları için kapsamlı program açıklandı",
  "Kent içi ulaşımda akıllı sistemlerin kullanım alanı genişliyor",
  "Teknoloji ekipleri sürdürülebilir büyüme için yeni yol haritasını paylaştı"
];

export function RssPreview({ config: raw }: { config: Record<string, unknown> }) {
  const config = useMemo(() => normalizeRssConfig(raw), [raw]);
  const theme = THEMES[config.theme];
  const summary = config.locale === "tr" ? "Program, enerji verimliliğini artıracak projeleri ve önümüzdeki dönemin uygulama takvimini kapsıyor." : "The program covers energy-efficiency projects and the implementation roadmap for the coming period.";
  const time = config.locale === "tr" ? "12 dakika önce" : "12 minutes ago";
  const label = config.sourceLabel || (config.locale === "tr" ? "Gündem" : "News");
  const frame = { position: "relative" as const, width: "100%", minHeight: 320, aspectRatio: "16/9", overflow: "hidden", borderRadius: 18, color: theme.text, background: theme.bg, border: `1px solid ${theme.line}`, boxShadow: "0 30px 80px rgba(15,23,42,.24)", fontFamily: "Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" };

  if (config.layout === "ticker") {
    return (
      <div style={frame}>
        <div style={{ height: "100%", minHeight: 320, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "7%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: theme.muted, fontSize: 11, fontWeight: 750, letterSpacing: ".12em", textTransform: "uppercase" }}><span>{label}</span><span>CANLI AKIŞ</span></div>
          <div style={{ maxWidth: "74%", fontSize: "clamp(24px,4vw,45px)", lineHeight: 1.08, fontWeight: 790, letterSpacing: "-.035em" }}>Gündemi ekranda, sade ve kesintisiz biçimde takip edin.</div>
        </div>
        <div style={{ position: "absolute", inset: "auto 0 0", height: "24%", display: "flex", alignItems: "center", overflow: "hidden", borderTop: `1px solid ${theme.line}`, background: theme.surface }}>
          <div style={{ alignSelf: "stretch", display: "grid", placeItems: "center", padding: "0 3.5%", background: theme.accent, color: config.theme === "paper" ? "#fff" : "#18181b", fontSize: 12, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>{label}</div>
          <div style={{ paddingLeft: "4%", whiteSpace: "nowrap", fontSize: "clamp(15px,2.3vw,26px)", fontWeight: 700 }}>{SAMPLE_TITLES.join("    •    ")}</div>
        </div>
      </div>
    );
  }

  if (config.layout === "cards") {
    return (
      <div style={frame}>
        <div style={{ height: "100%", minHeight: 320, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "7%" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ color: theme.accent, fontSize: 11, fontWeight: 900, letterSpacing: ".13em", textTransform: "uppercase" }}>{label}</span><span style={{ color: theme.muted, fontSize: 10 }}>01 / 10</span></div>
          <div><div style={{ maxWidth: "86%", fontSize: "clamp(28px,5vw,56px)", lineHeight: 1.04, fontWeight: 790, letterSpacing: "-.045em" }}>{SAMPLE_TITLES[0]}</div>{config.showDescription && <p style={{ maxWidth: "72%", margin: "18px 0 0", color: theme.muted, fontSize: "clamp(11px,1.5vw,17px)", lineHeight: 1.55 }}>{summary}</p>}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: theme.muted, fontSize: 10 }}><span>{config.showTimestamp ? time : ""}</span><span style={{ width: "27%", height: 3, borderRadius: 999, background: theme.line }}><span style={{ display: "block", width: "42%", height: "100%", borderRadius: 999, background: theme.accent }} /></span></div>
        </div>
      </div>
    );
  }

  return (
    <div style={frame}>
      <div style={{ height: "100%", minHeight: 320, display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(190px,.65fr)", padding: "6%" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingRight: "8%" }}>
          <span style={{ color: theme.accent, fontSize: 11, fontWeight: 900, letterSpacing: ".13em", textTransform: "uppercase" }}>{label}</span>
          <div><div style={{ fontSize: "clamp(25px,4.2vw,48px)", lineHeight: 1.06, fontWeight: 790, letterSpacing: "-.04em" }}>{SAMPLE_TITLES[0]}</div>{config.showDescription && <p style={{ margin: "14px 0 0", color: theme.muted, fontSize: "clamp(10px,1.35vw,15px)", lineHeight: 1.5 }}>{summary}</p>}</div>
          <span style={{ color: theme.muted, fontSize: 10 }}>{config.showTimestamp ? time : ""}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 0, paddingLeft: "12%", borderLeft: `1px solid ${theme.line}` }}>
          {SAMPLE_TITLES.slice(1).map((title, index) => <div key={title} style={{ padding: "15px 0", borderTop: index ? `1px solid ${theme.line}` : "none", color: index ? theme.muted : theme.text, fontSize: "clamp(10px,1.25vw,14px)", lineHeight: 1.35, fontWeight: 700 }}>{String(index + 2).padStart(2, "0")}<span style={{ display: "block", marginTop: 6 }}>{title}</span></div>)}
        </div>
      </div>
    </div>
  );
}
