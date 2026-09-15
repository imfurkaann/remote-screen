import { normalizeEventsConfig, EVENTS_STYLES, eventStatus } from "./events-design.js";
export { normalizeEventsConfig } from "./events-design.js";
type ServiceItem = { id: string; name: string; description: string; hours: string; contact: string; icon: "restaurant" | "spa" | "wifi" | "fitness" | "pool" | "concierge" | "shuttle" | "other" };
type GuideConfig = { hotelName: string; heading: string; welcome: string; locale: "tr" | "en"; theme: "navy" | "cream" | "forest"; accentColor: string; layout: "grid" | "featured"; services: ServiceItem[]; showContact: boolean; footer: string };

const GUIDE_THEMES = {
  navy: { bg: "linear-gradient(145deg,#071522,#10283c 58%,#183952)", surface: "rgba(255,255,255,.065)", text: "#f8fafc", muted: "#a8bdcc", line: "rgba(255,255,255,.12)", accent: "#d7b46a", scheme: "dark" },
  cream: { bg: "linear-gradient(145deg,#fffdf7,#f5efe2 58%,#e8dcc7)", surface: "rgba(255,255,255,.72)", text: "#28231c", muted: "#766b5d", line: "rgba(40,35,28,.12)", accent: "#9a5b2b", scheme: "light" },
  forest: { bg: "linear-gradient(145deg,#092b25,#12483d 58%,#1b5f50)", surface: "rgba(255,255,255,.07)", text: "#f0fdf9", muted: "#b8ddd4", line: "rgba(255,255,255,.13)", accent: "#e7c778", scheme: "dark" }
} as const;
const ARROWS = { left: "←", right: "→", up: "↑" } as const;
const ICONS: Record<ServiceItem["icon"], string> = { restaurant: "🍽", spa: "✦", wifi: "⌁", fitness: "◆", pool: "≈", concierge: "i", shuttle: "↗", other: "•" };
const DEFAULT_SERVICES: ServiceItem[] = [
  { id: "breakfast", name: "Kahvaltı", description: "Açık büfe restoran", hours: "07:00 – 10:30", contact: "Dahili 201", icon: "restaurant" },
  { id: "spa", name: "Spa & Wellness", description: "Masaj, sauna ve bakım", hours: "09:00 – 22:00", contact: "Dahili 305", icon: "spa" },
  { id: "wifi", name: "Misafir Wi-Fi", description: "Ağ: GrandHotel_Guest", hours: "7/24", contact: "Resepsiyon", icon: "wifi" },
  { id: "concierge", name: "Concierge", description: "Transfer ve şehir önerileri", hours: "08:00 – 23:00", contact: "Dahili 0", icon: "concierge" }
];
const clean = (value: unknown, fallback: string, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
const safeTime = (value: unknown, fallback: string) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
const safeColor = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(value ?? "")) ? String(value) : fallback;
const escapeHtml = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function normalizeHotelGuideConfig(input: Record<string, unknown>): GuideConfig {
  const theme: GuideConfig["theme"] = input.theme === "cream" || input.theme === "forest" ? input.theme : "navy";
  const services = Array.isArray(input.services) ? input.services.slice(0, 8).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return []; const item = raw as Record<string, unknown>; const name = clean(item.name, "", 80); if (!name) return [];
    const icon = typeof item.icon === "string" && item.icon in ICONS ? item.icon as ServiceItem["icon"] : "other";
    return [{ id: clean(item.id, `service-${index + 1}`, 64).replace(/[^a-zA-Z0-9_-]/g, "-"), name, description: typeof item.description === "string" ? item.description.trim().slice(0, 140) : "", hours: typeof item.hours === "string" ? item.hours.trim().slice(0, 50) : "", contact: typeof item.contact === "string" ? item.contact.trim().slice(0, 50) : "", icon } as ServiceItem];
  }) : DEFAULT_SERVICES;
  return { hotelName: clean(input.hotelName, "Grand Hotel", 80), heading: clean(input.heading, "Otel Rehberi", 100), welcome: typeof input.welcome === "string" ? input.welcome.trim().slice(0, 220) : "Konaklamanız boyunca ihtiyaç duyabileceğiniz tüm hizmetler.", locale: input.locale === "en" ? "en" : "tr", theme, accentColor: safeColor(input.accentColor, GUIDE_THEMES[theme].accent), layout: input.layout === "featured" ? "featured" : "grid", services: services.length ? services : DEFAULT_SERVICES, showContact: input.showContact !== false, footer: typeof input.footer === "string" ? input.footer.trim().slice(0, 180) : "Acil ihtiyaçlarınız için resepsiyona günün her saati ulaşabilirsiniz." };
}

const baseCss = (theme: { bg: string; surface: string; text: string; muted: string; line: string; scheme: string }, accent: string) => `
  :root{color-scheme:${theme.scheme};--bg:${theme.bg};--surface:${theme.surface};--text:${theme.text};--muted:${theme.muted};--line:${theme.line};--accent:${accent}}
  *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}body{background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
  .stage{width:100%;height:100%;min-height:100vh;display:grid;grid-template-rows:auto minmax(0,1fr) auto;padding:clamp(28px,5vmin,84px) clamp(32px,6vw,108px)}
  header{display:flex;justify-content:space-between;gap:4vw;padding-bottom:3vmin;border-bottom:1px solid var(--line)}.brand{color:var(--accent);font-size:clamp(10px,.9vw,17px);font-weight:900;letter-spacing:.16em}.heading{margin:.18em 0 0;font-size:clamp(28px,3.5vw,66px);letter-spacing:-.04em}.footer{padding-top:2.4vmin;border-top:1px solid var(--line);color:var(--muted);font-size:clamp(10px,.82vw,16px);text-align:center}
`;

export function renderEventsHtml(title: string, raw: Record<string, unknown>): string {
  const config=normalizeEventsConfig(raw),pages=Math.max(1,Math.ceil(config.events.length/4));
  const words=config.locale==="tr"?{live:"ŞİMDİ",next:"YAKLAŞAN",done:"TAMAMLANDI"}:{live:"NOW",next:"UPCOMING",done:"FINISHED"};
  const rows=config.events.map((e,i)=>`<article class="meeting" data-start="${e.start}" data-end="${e.end}" data-page="${Math.floor(i/4)}"${i>=4?" hidden":""}><div class="meeting-time">${e.start}<span class="meeting-end">${e.end}</span></div><div class="meeting-copy"><div class="meeting-title">${escapeHtml(e.title)}</div>${config.showHost?`<div class="meeting-host">${escapeHtml(e.host)}</div>`:""}</div><div class="meeting-room">${escapeHtml(e.room)}<span class="meeting-status" data-status>${words.next}</span></div>${config.showDirection?`<span class="meeting-arrow">${ARROWS[e.direction]}</span>`:""}</article>`).join("");
  return `<!doctype html><html lang="${config.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#fff}${EVENTS_STYLES}</style></head><body><main class="elegant-events" data-layout="${config.layout}" data-directions="${config.showDirection}"><header class="events-header"><div><div class="events-brand">${escapeHtml(config.hotelName)}</div><h1 class="events-heading">${escapeHtml(config.heading)}</h1></div><time class="events-date" id="date"></time></header><section class="events-list">${rows||`<p class="events-empty">${config.locale==="tr"?"Planlanan toplantı yok":"No meetings scheduled"}</p>`}</section><footer class="events-footer"><span class="events-footer-text">${escapeHtml(config.footer)}</span><span class="events-pages" id="pages"${pages===1?" hidden":""}>1 / ${pages}</span></footer></main><script>
    var words=${JSON.stringify(words)},locale="${config.locale==="tr"?"tr-TR":"en-GB"}",zone=${JSON.stringify(config.timezone)},page=0,pages=${pages};
    var statusFor=${eventStatus.toString()};
    function update(){
      var now=new Date(),options={hour:"2-digit",minute:"2-digit",hourCycle:"h23"},dateOptions={weekday:"long",day:"numeric",month:"long"};
      if(zone!=="local"){options.timeZone=zone;dateOptions.timeZone=zone}
      var parts=new Intl.DateTimeFormat("en-GB",options).formatToParts(now),hour=0,minute=0;
      parts.forEach(function(p){if(p.type==="hour")hour=Number(p.value);if(p.type==="minute")minute=Number(p.value)});
      document.getElementById("date").textContent=new Intl.DateTimeFormat(locale,dateOptions).format(now);
      document.querySelector(".elegant-events").classList.toggle("portrait",innerHeight>innerWidth);
      document.querySelectorAll(".meeting").forEach(function(row){var state=statusFor(row.dataset.start,row.dataset.end,hour*60+minute);row.dataset.state=state;row.querySelector("[data-status]").textContent=words[state];row.hidden=Number(row.dataset.page)!==page});
      document.getElementById("pages").textContent=(page+1)+" / "+pages;
    }
    update();window.__remoteScreenTick=update;setInterval(update,30000);
    if(pages>1)setInterval(function(){page=(page+1)%pages;update()},12000);
    window.addEventListener("resize",update);
  </script></body></html>`;
}

export function renderHotelGuideHtml(title: string, raw: Record<string, unknown>): string {
  const config = normalizeHotelGuideConfig(raw); const theme = GUIDE_THEMES[config.theme]; const words = config.locale === "tr" ? { hours: "SAATLER", contact: "İLETİŞİM" } : { hours: "HOURS", contact: "CONTACT" };
  const shown = config.layout === "featured" ? config.services.slice(0, 6) : config.services.slice(0, 8);
  const cards = shown.map((service, index) => `<article class="service${index === 0 && config.layout === "featured" ? " primary" : ""}"><span class="icon">${ICONS[service.icon]}</span><span class="copy"><strong>${escapeHtml(service.name)}</strong>${service.description ? `<small>${escapeHtml(service.description)}</small>` : ""}<span class="meta">${service.hours ? `${words.hours} · <b>${escapeHtml(service.hours)}</b>` : ""}${config.showContact && service.contact ? `<em>${words.contact} · <b>${escapeHtml(service.contact)}</b></em>` : ""}</span></span></article>`).join("");
  return `<!doctype html><html lang="${config.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>${escapeHtml(title)}</title><style>${baseCss(theme, config.accentColor)}
    .welcome{max-width:48%;margin:0;align-self:end;color:var(--muted);font-size:clamp(12px,1.05vw,20px);line-height:1.5;text-align:right}.services{display:grid;grid-template-columns:${config.layout === "featured" ? "repeat(2,1fr)" : "repeat(4,1fr)"};gap:clamp(8px,1.2vw,20px);align-content:center;padding:3vmin 0}.service{min-width:0;display:grid;grid-template-columns:clamp(42px,4vw,68px) minmax(0,1fr);gap:clamp(10px,1.2vw,20px);padding:clamp(14px,2vmin,30px);border:1px solid var(--line);border-radius:clamp(14px,1.3vw,24px);background:var(--surface)}.service.primary{border-color:color-mix(in srgb,var(--accent) 42%,transparent);background:color-mix(in srgb,var(--accent) 8%,var(--surface))}.icon{display:grid;place-items:center;width:clamp(40px,3.7vw,64px);aspect-ratio:1;border:1px solid color-mix(in srgb,var(--accent) 25%,transparent);border-radius:30%;color:var(--accent);font-size:clamp(22px,2vw,36px)}.copy{min-width:0}.copy>strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(16px,1.45vw,28px)}.copy>small{display:block;margin-top:.45em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:clamp(9px,.76vw,14px)}.meta{display:block;margin-top:1.2em;color:var(--muted);font-size:clamp(8px,.66vw,12px)}.meta b{color:var(--text)}.meta em{display:block;margin-top:.42em;font-style:normal}.meta em b{color:var(--accent)}@media(max-aspect-ratio:1/1){header{display:block}.welcome{max-width:100%;margin-top:1em;text-align:left}.services{grid-template-columns:repeat(2,1fr)}.stage{padding:5vmin}.service{grid-template-columns:40px 1fr}}
  </style></head><body><main class="stage"><header><div><div class="brand">${escapeHtml(config.hotelName)}</div><h1 class="heading">${escapeHtml(config.heading)}</h1></div><p class="welcome">${escapeHtml(config.welcome)}</p></header><section class="services">${cards}</section><footer class="footer">${escapeHtml(config.footer)}</footer></main></body></html>`;
}
