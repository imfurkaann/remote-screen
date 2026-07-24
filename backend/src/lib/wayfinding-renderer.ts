type WayfindingDirection =
  | "up"
  | "up-right"
  | "right"
  | "down-right"
  | "down"
  | "down-left"
  | "left"
  | "up-left";

type WayfindingDestination = {
  id: string;
  name: string;
  details: string;
  floor: string;
  distance: string;
  direction: WayfindingDirection;
};

type WayfindingConfig = {
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
    background: "linear-gradient(145deg,#07111f 0%,#0f1f33 58%,#162942 100%)",
    surface: "rgba(255,255,255,.065)",
    text: "#f8fafc",
    muted: "#a8b6c7",
    line: "rgba(255,255,255,.12)",
    accent: "#f6c453",
    colorScheme: "dark"
  },
  sand: {
    background: "linear-gradient(145deg,#fffdf8 0%,#f5efe3 58%,#e9dfce 100%)",
    surface: "rgba(255,255,255,.68)",
    text: "#29251f",
    muted: "#746b5e",
    line: "rgba(41,37,31,.13)",
    accent: "#a85d27",
    colorScheme: "light"
  },
  emerald: {
    background: "linear-gradient(145deg,#052e2b 0%,#064e46 58%,#0f6257 100%)",
    surface: "rgba(255,255,255,.07)",
    text: "#f0fdfa",
    muted: "#b7ddd6",
    line: "rgba(255,255,255,.13)",
    accent: "#f4d58d",
    colorScheme: "dark"
  }
} as const;

const DEFAULT_DESTINATIONS: WayfindingDestination[] = [
  { id: "reception", name: "Resepsiyon", details: "Giriş katı", floor: "Lobi", distance: "1 dk", direction: "left" },
  { id: "restaurant", name: "Restoran", details: "Kahvaltı ve akşam yemeği", floor: "1. Kat", distance: "2 dk", direction: "right" },
  { id: "meeting", name: "Toplantı Salonları", details: "Balo salonu ve fuaye", floor: "2. Kat", distance: "3 dk", direction: "up-right" },
  { id: "spa", name: "Spa & Wellness", details: "Havuz ve fitness", floor: "-1. Kat", distance: "4 dk", direction: "down-left" }
];

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function validColor(value: unknown, fallback: string): string {
  const candidate = String(value ?? "");
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
}

function normalizeDestination(value: unknown, index: number): WayfindingDestination | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const name = cleanText(input.name, "", 80);
  if (!name) return null;
  const direction = typeof input.direction === "string" && input.direction in DIRECTIONS
    ? input.direction as WayfindingDirection
    : "up";
  return {
    id: cleanText(input.id, `destination-${index + 1}`, 64).replace(/[^a-zA-Z0-9_-]/g, "-"),
    name,
    details: typeof input.details === "string" ? input.details.trim().slice(0, 120) : "",
    floor: typeof input.floor === "string" ? input.floor.trim().slice(0, 40) : "",
    distance: typeof input.distance === "string" ? input.distance.trim().slice(0, 30) : "",
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
    : DEFAULT_DESTINATIONS;
  return {
    hotelName: cleanText(input.hotelName, "Grand Hotel", 80),
    currentLocation: cleanText(input.currentLocation, "Ana Lobi", 80),
    locale: input.locale === "en" ? "en" : "tr",
    layout: input.layout === "spotlight" ? "spotlight" : "directory",
    theme,
    accentColor: validColor(input.accentColor, THEMES[theme].accent),
    destinations: destinations.length ? destinations : DEFAULT_DESTINATIONS,
    showFloor: input.showFloor !== false,
    showDistance: input.showDistance !== false,
    footer: typeof input.footer === "string"
      ? input.footer.trim().slice(0, 180)
      : "Yardıma mı ihtiyacınız var? Resepsiyon ekibimiz size yardımcı olabilir."
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderWayfindingHtml(title: string, rawConfig: Record<string, unknown>): string {
  const config = normalizeWayfindingConfig(rawConfig);
  const theme = THEMES[config.theme];
  const labels = config.locale === "tr"
    ? { eyebrow: "OTEL REHBERİ", here: "BURADASINIZ", floor: "KAT", walk: "YÜRÜME" }
    : { eyebrow: "HOTEL DIRECTORY", here: "YOU ARE HERE", floor: "FLOOR", walk: "WALK" };
  const destinations = config.layout === "spotlight"
    ? config.destinations.slice(0, 1)
    : config.destinations;

  const destinationCards = destinations.map((destination) => `
    <article class="destination">
      <span class="arrow" aria-hidden="true">${DIRECTIONS[destination.direction].symbol}</span>
      <span class="destination-copy">
        <strong>${escapeHtml(destination.name)}</strong>
        ${destination.details ? `<small>${escapeHtml(destination.details)}</small>` : ""}
      </span>
      <span class="meta">
        ${config.showFloor && destination.floor ? `<span>${labels.floor} · <b>${escapeHtml(destination.floor)}</b></span>` : ""}
        ${config.showDistance && destination.distance ? `<span>${labels.walk} · <b class="accent">${escapeHtml(destination.distance)}</b></span>` : ""}
      </span>
    </article>
  `).join("");

  const spotlight = destinations[0] ?? DEFAULT_DESTINATIONS[0]!;

  return `<!doctype html>
<html lang="${config.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme:${theme.colorScheme};
      --background:${theme.background};
      --surface:${theme.surface};
      --text:${theme.text};
      --muted:${theme.muted};
      --line:${theme.line};
      --accent:${config.accentColor};
    }
    * { box-sizing:border-box; }
    html,body { width:100%; height:100%; margin:0; overflow:hidden; }
    body { background:var(--background); color:var(--text); font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; -webkit-font-smoothing:antialiased; }
    .app { position:relative; width:100%; height:100%; min-height:100vh; overflow:hidden; isolation:isolate; }
    .ambient { position:absolute; z-index:-1; width:54vmin; aspect-ratio:1; right:-19vmin; top:-28vmin; border-radius:50%; background:var(--accent); opacity:.12; filter:blur(11vmin); }
    .stage { width:100%; height:100%; min-height:100vh; display:grid; grid-template-rows:auto minmax(0,1fr) auto; padding:clamp(28px,5.5vmin,86px) clamp(32px,6vw,110px); }
    header { display:flex; align-items:flex-start; justify-content:space-between; gap:4vw; padding-bottom:3.5vmin; border-bottom:1px solid var(--line); }
    .eyebrow { color:var(--accent); font-size:clamp(10px,1vw,19px); font-weight:900; letter-spacing:.17em; }
    .hotel { margin-top:.45em; font-size:clamp(22px,2.4vw,46px); font-weight:820; letter-spacing:-.025em; }
    .location { text-align:right; }
    .location-label { color:var(--muted); font-size:clamp(9px,.85vw,16px); font-weight:850; letter-spacing:.12em; }
    .location-name { margin-top:.5em; display:flex; align-items:center; justify-content:flex-end; gap:.65em; font-size:clamp(18px,1.8vw,34px); font-weight:800; }
    .dot { width:.55em; aspect-ratio:1; border-radius:50%; background:var(--accent); box-shadow:0 0 0 .32em color-mix(in srgb,var(--accent) 17%,transparent); }
    .directory { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:2.5vmin 2.2vw; align-content:center; padding:3.5vmin 0; }
    .directory.single-column { grid-template-columns:1fr; }
    .destination { min-width:0; display:grid; grid-template-columns:clamp(64px,7vmin,112px) minmax(0,1fr) auto; align-items:center; gap:clamp(12px,2vw,34px); padding:clamp(13px,2.4vmin,34px); border:1px solid var(--line); border-radius:clamp(14px,1.4vw,26px); background:var(--surface); }
    .arrow { display:grid; place-items:center; width:clamp(58px,6.2vmin,98px); aspect-ratio:1; border:1px solid color-mix(in srgb,var(--accent) 24%,transparent); border-radius:30%; background:color-mix(in srgb,var(--accent) 8%,transparent); color:var(--accent); font-size:clamp(38px,4.2vmin,68px); line-height:1; }
    .destination-copy { min-width:0; }
    .destination-copy strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:clamp(18px,1.8vw,34px); letter-spacing:-.02em; }
    .destination-copy small { display:block; margin-top:.45em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--muted); font-size:clamp(11px,.9vw,17px); }
    .meta { display:flex; flex-direction:column; align-items:flex-end; gap:.55em; color:var(--muted); font-size:clamp(9px,.78vw,15px); font-weight:750; white-space:nowrap; }
    .meta b { color:var(--text); } .meta .accent { color:var(--accent); }
    .spotlight { display:grid; grid-template-columns:minmax(0,1fr) minmax(260px,.7fr); align-items:center; gap:6vw; padding:5vmin 2vw; }
    .instruction { color:var(--muted); font-size:clamp(11px,1vw,19px); font-weight:850; letter-spacing:.14em; text-transform:uppercase; }
    .spotlight h1 { margin:.18em 0 0; font-size:clamp(64px,8.2vw,158px); line-height:.94; letter-spacing:-.06em; }
    .spotlight p { margin:1em 0 0; color:var(--muted); font-size:clamp(16px,1.5vw,28px); }
    .pills { display:flex; gap:.7em; margin-top:1.5em; }
    .pill { padding:.65em 1em; border:1px solid var(--line); border-radius:999px; background:var(--surface); color:var(--muted); font-size:clamp(11px,.9vw,17px); font-weight:750; }
    .pill b { color:var(--text); } .pill b.accent { color:var(--accent); }
    .hero-arrow { display:grid; place-items:center; aspect-ratio:1; border:1px solid color-mix(in srgb,var(--accent) 24%,transparent); border-radius:33%; background:color-mix(in srgb,var(--accent) 7%,transparent); color:var(--accent); font-size:clamp(150px,20vw,370px); line-height:1; }
    footer { min-height:1em; padding-top:2.5vmin; border-top:1px solid var(--line); color:var(--muted); font-size:clamp(10px,.86vw,16px); text-align:center; }
    @media (max-aspect-ratio:1/1) {
      .stage { padding:clamp(24px,6vmin,64px); }
      header { gap:20px; }
      .directory { grid-template-columns:1fr; gap:1.6vmin; }
      .destination { grid-template-columns:clamp(54px,10vw,84px) minmax(0,1fr); }
      .meta { grid-column:2; flex-direction:row; align-items:center; }
      .spotlight { grid-template-columns:1fr; grid-template-rows:minmax(0,1fr) auto; text-align:center; }
      .spotlight p,.pills { justify-content:center; }
      .hero-arrow { width:min(52vw,32vh); margin:auto; }
    }
  </style>
</head>
<body>
  <main class="app" aria-label="${escapeHtml(title)}">
    <span class="ambient" aria-hidden="true"></span>
    <section class="stage">
      <header>
        <div><div class="eyebrow">${labels.eyebrow}</div><div class="hotel">${escapeHtml(config.hotelName)}</div></div>
        <div class="location"><div class="location-label">${labels.here}</div><div class="location-name"><span class="dot" aria-hidden="true"></span>${escapeHtml(config.currentLocation)}</div></div>
      </header>
      ${config.layout === "directory" ? `
        <section class="directory${destinations.length <= 3 ? " single-column" : ""}" aria-label="${labels.eyebrow}">
          ${destinationCards}
        </section>
      ` : `
        <section class="spotlight">
          <div>
            <div class="instruction">${DIRECTIONS[spotlight.direction][config.locale]}</div>
            <h1>${escapeHtml(spotlight.name)}</h1>
            ${spotlight.details ? `<p>${escapeHtml(spotlight.details)}</p>` : ""}
            <div class="pills">
              ${config.showFloor && spotlight.floor ? `<span class="pill">${labels.floor} · <b>${escapeHtml(spotlight.floor)}</b></span>` : ""}
              ${config.showDistance && spotlight.distance ? `<span class="pill">${labels.walk} · <b class="accent">${escapeHtml(spotlight.distance)}</b></span>` : ""}
            </div>
          </div>
          <div class="hero-arrow" aria-hidden="true">${DIRECTIONS[spotlight.direction].symbol}</div>
        </section>
      `}
      <footer>${escapeHtml(config.footer)}</footer>
    </section>
  </main>
</body>
</html>`;
}
