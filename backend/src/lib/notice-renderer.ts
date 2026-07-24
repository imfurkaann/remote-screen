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

const THEMES = {
  midnight: { bg: "linear-gradient(145deg,#09090b 0%,#18181b 55%,#27272a 100%)", solid: "#18181b", text: "#fafafa", muted: "#a1a1aa", line: "rgba(255,255,255,.1)", accent: "#fbbf24" },
  paper: { bg: "linear-gradient(145deg,#fff 0%,#f5f5f4 100%)", solid: "#ffffff", text: "#1c1917", muted: "#78716c", line: "rgba(28,25,23,.11)", accent: "#b91c1c" },
  violet: { bg: "linear-gradient(145deg,#1e1b4b 0%,#312e81 50%,#5b21b6 100%)", solid: "#312e81", text: "#faf5ff", muted: "#ddd6fe", line: "rgba(255,255,255,.13)", accent: "#c4b5fd" },
  alert: { bg: "linear-gradient(145deg,#450a0a 0%,#991b1b 55%,#dc2626 100%)", solid: "#991b1b", text: "#fff7ed", muted: "#fecaca", line: "rgba(255,255,255,.14)", accent: "#fde68a" },
  custom: { bg: "#312e81", solid: "#312e81", text: "#ffffff", muted: "rgba(255,255,255,.74)", line: "rgba(255,255,255,.13)", accent: "#c4b5fd" }
} as const;

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

function validColor(value: unknown, fallback: string): string {
  const color = String(value ?? "");
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

export function normalizeNoticeConfig(input: Record<string, unknown> = {}): NoticeConfig {
  const legacyBg = validColor(input.bgColor, DEFAULT_NOTICE_CONFIG.bgColor);
  const oldTheme = String(input.theme ?? "");
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
    headline: typeof input.headline === "string" && input.headline.trim() ? input.headline.trim().slice(0, 140) : DEFAULT_NOTICE_CONFIG.headline,
    body: typeof input.body === "string" && input.body.trim() ? input.body.trim().slice(0, 800) : DEFAULT_NOTICE_CONFIG.body,
    layout: input.layout === "centered" || input.layout === "banner" ? input.layout : "editorial",
    theme,
    icon,
    animation: input.animation === "none" || input.animation === "fade" ? input.animation : "rise",
    accentColor: validColor(input.accentColor, themeData.accent),
    bgColor: validColor(input.bgColor, themeData.solid),
    textColor: validColor(input.textColor, input.theme === undefined && input.bgColor === undefined ? DEFAULT_NOTICE_CONFIG.textColor : themeData.text)
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function renderNoticeHtml(title: string, rawConfig: Record<string, unknown> = {}): string {
  const config = normalizeNoticeConfig(rawConfig);
  const theme = THEMES[config.theme];
  const background = config.theme === "custom" ? config.bgColor : theme.bg;
  const textColor = config.theme === "custom" ? config.textColor : theme.text;
  const mutedColor = config.theme === "custom" ? `${config.textColor}bb` : theme.muted;
  const icons: Record<NoticeConfig["icon"], string> = { info: "i", warning: "!", alert: "!", success: "✓", celebrate: "✦", none: "" };
  const animation = config.animation === "fade" ? "fadeIn" : config.animation === "rise" ? "riseIn" : "none";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>${title}</title>
  <style>
    *{box-sizing:border-box}
    html,body{width:100%;height:100%;margin:0;overflow:hidden}
    body{position:relative;background:${background};color:${textColor};font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body:before,body:after{content:"";position:absolute;border-radius:50%;pointer-events:none;filter:blur(10vmin)}
    body:before{width:58vmin;height:58vmin;right:-20vmin;top:-36vmin;background:${config.accentColor};opacity:.14}
    body:after{width:42vmin;height:42vmin;left:-18vmin;bottom:-28vmin;background:#fff;opacity:.055}
    .notice{position:relative;z-index:1;width:100%;height:100%;animation:${animation} .65s cubic-bezier(.16,1,.3,1) both}
    .icon{width:clamp(72px,10vmin,145px);aspect-ratio:1;display:grid;place-items:center;flex-shrink:0;border:1px solid ${theme.line};border-radius:29%;background:rgba(255,255,255,.075);color:${config.accentColor};font-size:clamp(35px,5vmin,72px);font-weight:850;box-shadow:0 25px 65px rgba(0,0,0,.16)}
    .eyebrow{color:${config.accentColor};font-size:clamp(11px,1.35vmin,19px);font-weight:900;letter-spacing:.16em;text-transform:uppercase}
    h1{margin:0;font-size:clamp(45px,8vmin,115px);font-weight:790;line-height:.98;letter-spacing:-.055em}
    p{margin:0;color:${mutedColor};font-size:clamp(16px,2.25vmin,32px);line-height:1.55}
    .centered{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8vmin;text-align:center}
    .centered .eyebrow{margin-top:2.6vmin}.centered h1{max-width:85%;margin-top:2vmin}.centered p{max-width:72%;margin-top:2.2vmin}
    .editorial{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.55fr);padding:7vmin}
    .editorial-main{display:flex;flex-direction:column;justify-content:space-between;padding-right:8%}.editorial-copy h1{margin-top:2vmin}.editorial-copy p{max-width:86%;margin-top:2.5vmin}
    .accent-line{width:5vmin;height:.55vmin;min-height:4px;border-radius:99px;background:${config.accentColor}}
    .editorial-side{display:grid;place-items:center;border-left:1px solid ${theme.line}}
    .banner{display:flex;align-items:center;gap:6vmin;padding:8vmin}.banner-copy{flex:1}.banner h1{margin-top:1.8vmin}.banner p{max-width:82%;margin-top:2.3vmin}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes riseIn{from{opacity:0;transform:translateY(2vmin)}to{opacity:1;transform:none}}
    @media (orientation:portrait){
      .centered{padding:9vmin 7vmin}.centered h1{max-width:95%;font-size:clamp(45px,12vw,115px)}.centered p{max-width:88%}
      .editorial{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) minmax(180px,.38fr);padding:8vmin 7vmin}
      .editorial-main{padding:0 0 8%}.editorial-side{border-left:0;border-top:1px solid ${theme.line}}
      .banner{flex-direction:column;align-items:flex-start;justify-content:center;padding:8vmin}.banner h1{font-size:clamp(44px,11vw,108px)}.banner p{max-width:94%}
    }
  </style>
</head>
<body>
  <main class="notice ${config.layout}">
    ${config.layout === "centered" ? `
      ${config.icon !== "none" ? `<div class="icon">${icons[config.icon]}</div>` : ""}
      ${config.eyebrow ? `<div class="eyebrow">${escapeHtml(config.eyebrow)}</div>` : ""}
      <h1>${escapeHtml(config.headline)}</h1><p>${escapeHtml(config.body)}</p>
    ` : config.layout === "editorial" ? `
      <section class="editorial-main">
        ${config.eyebrow ? `<div class="eyebrow">${escapeHtml(config.eyebrow)}</div>` : "<span></span>"}
        <div class="editorial-copy"><h1>${escapeHtml(config.headline)}</h1><p>${escapeHtml(config.body)}</p></div>
        <span class="accent-line"></span>
      </section>
      <aside class="editorial-side">${config.icon !== "none" ? `<div class="icon">${icons[config.icon]}</div>` : ""}</aside>
    ` : `
      ${config.icon !== "none" ? `<div class="icon">${icons[config.icon]}</div>` : ""}
      <section class="banner-copy">${config.eyebrow ? `<div class="eyebrow">${escapeHtml(config.eyebrow)}</div>` : ""}<h1>${escapeHtml(config.headline)}</h1><p>${escapeHtml(config.body)}</p></section>
    `}
  </main>
</body>
</html>`;
}
