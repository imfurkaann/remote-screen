import { encodeQrMatrix } from "./qr-code.js";

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
  midnight: { bg: "linear-gradient(145deg,#09090b 0%,#18181b 55%,#27272a 100%)", text: "#fafafa", muted: "#a1a1aa", line: "rgba(255,255,255,.1)", accent: "#fbbf24" },
  paper: { bg: "linear-gradient(145deg,#fff 0%,#f5f5f4 100%)", text: "#1c1917", muted: "#78716c", line: "rgba(28,25,23,.11)", accent: "#0f766e" },
  emerald: { bg: "linear-gradient(145deg,#022c22 0%,#065f46 52%,#047857 100%)", text: "#ecfdf5", muted: "#a7f3d0", line: "rgba(255,255,255,.14)", accent: "#6ee7b7" },
  ocean: { bg: "linear-gradient(145deg,#071a24 0%,#0c4a6e 50%,#075985 100%)", text: "#f0f9ff", muted: "#bae6fd", line: "rgba(255,255,255,.14)", accent: "#67e8f9" }
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

function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

export function normalizeQrConfig(input: Record<string, unknown> = {}): QrConfig {
  let foregroundColor = validColor(input.foregroundColor, DEFAULT_QR_CONFIG.foregroundColor);
  let backgroundColor = validColor(input.backgroundColor, DEFAULT_QR_CONFIG.backgroundColor);
  if (contrast(foregroundColor, backgroundColor) < 4.5 || luminance(foregroundColor) > luminance(backgroundColor)) {
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

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

export function renderQrHtml(title: string, rawConfig: Record<string, unknown> = {}): string {
  const config = normalizeQrConfig(rawConfig);
  const matrix = encodeQrMatrix(buildQrPayload(config));
  const theme = THEMES[config.theme];
  const typeLabel = config.contentType === "wifi" ? "WI‑FI" : config.contentType === "text" ? "BİLGİ" : "HIZLI ERİŞİM";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>${title}</title>
  <style>
    *{box-sizing:border-box}
    html,body{width:100%;height:100%;margin:0;overflow:hidden}
    body{position:relative;background:${theme.bg};color:${theme.text};font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body:before{content:"";position:absolute;width:60vmin;height:60vmin;right:-22vmin;top:-38vmin;border-radius:50%;background:${theme.accent};opacity:.13;filter:blur(10vmin)}
    .qr-app{position:relative;z-index:1;width:100%;height:100%}
    .eyebrow{color:${theme.accent};font-size:clamp(11px,1.3vmin,19px);font-weight:900;letter-spacing:.16em}
    h1{margin:0;font-size:clamp(42px,7vmin,100px);font-weight:790;line-height:1;letter-spacing:-.052em}
    p{margin:0;color:${theme.muted};font-size:clamp(15px,2.05vmin,29px);line-height:1.55}
    .qr-frame{display:grid;place-items:center;padding:clamp(13px,2vmin,30px);border:1px solid ${config.showFrame ? theme.line : "transparent"};border-radius:clamp(16px,2.4vmin,34px);background:${config.showFrame ? "rgba(255,255,255,.08)" : "transparent"};box-shadow:${config.showFrame ? "0 35px 80px rgba(0,0,0,.22)" : "none"}}
    canvas{display:block;width:min(38vmin,34vw);height:auto;aspect-ratio:1;image-rendering:pixelated;border-radius:clamp(6px,.7vmin,12px)}
    .split{display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,.72fr);align-items:center;padding:7vmin}
    .split-copy{padding-right:10%}.split h1{margin-top:2.2vmin}.split p{max-width:86%;margin-top:2.5vmin}.split-code{height:100%;display:grid;place-items:center;border-left:1px solid ${theme.line}}
    .card{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2vmin;padding:6vmin;text-align:center}
    .card h1{font-size:clamp(30px,4.2vmin,60px)}.card p{max-width:65%;font-size:clamp(13px,1.65vmin,24px)}.card canvas{width:min(37vmin,29vw)}
    .minimal{display:grid;place-items:center;padding:5vmin}.minimal canvas{width:min(70vmin,53vw)}.minimal .qr-frame{padding:clamp(15px,2.5vmin,38px)}
    .minimal-label{position:absolute;left:5vmin;bottom:4vmin;color:${theme.muted};font-size:clamp(11px,1.35vmin,20px);font-weight:750}
    @media (orientation:portrait){
      .split{grid-template-columns:1fr;grid-template-rows:minmax(0,.7fr) minmax(360px,1.3fr);padding:8vmin 6vmin}
      .split-copy{padding:0 0 7%}.split h1{font-size:clamp(42px,10vw,100px)}.split p{max-width:95%}.split-code{border-left:0;border-top:1px solid ${theme.line}}
      canvas,.split canvas{width:min(53vmin,62vw)}.card canvas{width:min(48vmin,58vw)}.card p{max-width:86%}.minimal canvas{width:min(72vmin,78vw)}
    }
  </style>
</head>
<body>
  <main class="qr-app ${config.layout}">
    ${config.layout === "split" ? `
      <section class="split-copy"><div class="eyebrow">${typeLabel}</div><h1>${escapeHtml(config.title)}</h1>${config.description ? `<p>${escapeHtml(config.description)}</p>` : ""}</section>
      <section class="split-code"><div class="qr-frame"><canvas id="qr" aria-label="${escapeHtml(config.title)}"></canvas></div></section>
    ` : config.layout === "card" ? `
      <div class="eyebrow">${typeLabel}</div><h1>${escapeHtml(config.title)}</h1><div class="qr-frame"><canvas id="qr" aria-label="${escapeHtml(config.title)}"></canvas></div>${config.description ? `<p>${escapeHtml(config.description)}</p>` : ""}
    ` : `
      <div class="qr-frame"><canvas id="qr" aria-label="${escapeHtml(config.title)}"></canvas></div><div class="minimal-label">${escapeHtml(config.title)}</div>
    `}
  </main>
  <script>
    (function(){
      "use strict";
      var rows=${safeJson(matrix.rows)},quiet=4,scale=10,size=rows.length+quiet*2;
      var canvas=document.getElementById("qr"),context=canvas.getContext("2d",{alpha:false});
      canvas.width=size*scale;canvas.height=size*scale;context.imageSmoothingEnabled=false;
      context.fillStyle=${safeJson(config.backgroundColor)};context.fillRect(0,0,canvas.width,canvas.height);
      context.fillStyle=${safeJson(config.foregroundColor)};
      for(var y=0;y<rows.length;y+=1){for(var x=0;x<rows[y].length;x+=1){if(rows[y].charAt(x)==="1")context.fillRect((x+quiet)*scale,(y+quiet)*scale,scale,scale)}}
    })();
  </script>
</body>
</html>`;
}
