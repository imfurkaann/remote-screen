type EventItem = { id: string; title: string; host: string; room: string; start: string; end: string; direction: "left" | "right" | "up" };
type EventsConfig = { hotelName: string; heading: string; locale: "tr" | "en"; theme: "midnight" | "paper" | "burgundy"; accentColor: string; events: EventItem[]; showHost: boolean; showDirection: boolean; footer: string };
type ServiceItem = { id: string; name: string; description: string; hours: string; contact: string; icon: "restaurant" | "spa" | "wifi" | "fitness" | "pool" | "concierge" | "shuttle" | "other" };
type GuideConfig = { hotelName: string; heading: string; welcome: string; locale: "tr" | "en"; theme: "navy" | "cream" | "forest"; accentColor: string; layout: "grid" | "featured"; services: ServiceItem[]; showContact: boolean; footer: string };

const EVENT_THEMES = {
  midnight: { bg: "linear-gradient(145deg,#080d18,#111c2e 58%,#1b2a42)", surface: "rgba(255,255,255,.06)", text: "#f8fafc", muted: "#9cabc0", line: "rgba(255,255,255,.12)", accent: "#60a5fa", scheme: "dark" },
  paper: { bg: "linear-gradient(145deg,#ffffff,#f3f5f8 58%,#e8edf3)", surface: "rgba(255,255,255,.76)", text: "#172033", muted: "#687387", line: "rgba(23,32,51,.12)", accent: "#2563eb", scheme: "light" },
  burgundy: { bg: "linear-gradient(145deg,#2a0b15,#541528 58%,#751f35)", surface: "rgba(255,255,255,.07)", text: "#fff7f8", muted: "#e8bcc7", line: "rgba(255,255,255,.13)", accent: "#f4c56b", scheme: "dark" }
} as const;
const GUIDE_THEMES = {
  navy: { bg: "linear-gradient(145deg,#071522,#10283c 58%,#183952)", surface: "rgba(255,255,255,.065)", text: "#f8fafc", muted: "#a8bdcc", line: "rgba(255,255,255,.12)", accent: "#d7b46a", scheme: "dark" },
  cream: { bg: "linear-gradient(145deg,#fffdf7,#f5efe2 58%,#e8dcc7)", surface: "rgba(255,255,255,.72)", text: "#28231c", muted: "#766b5d", line: "rgba(40,35,28,.12)", accent: "#9a5b2b", scheme: "light" },
  forest: { bg: "linear-gradient(145deg,#092b25,#12483d 58%,#1b5f50)", surface: "rgba(255,255,255,.07)", text: "#f0fdf9", muted: "#b8ddd4", line: "rgba(255,255,255,.13)", accent: "#e7c778", scheme: "dark" }
} as const;
const ARROWS = { left: "←", right: "→", up: "↑" } as const;
const ICONS: Record<ServiceItem["icon"], string> = { restaurant: "🍽", spa: "✦", wifi: "⌁", fitness: "◆", pool: "≈", concierge: "i", shuttle: "↗", other: "•" };
const DEFAULT_EVENTS: EventItem[] = [
  { id: "morning", title: "Yönetim Toplantısı", host: "Atlas Holding", room: "Lale Salonu", start: "09:30", end: "11:00", direction: "right" },
  { id: "conference", title: "Turizm Konferansı", host: "Sektör Buluşmaları", room: "Balo Salonu", start: "11:30", end: "14:00", direction: "up" },
  { id: "workshop", title: "Dijital Dönüşüm Atölyesi", host: "Nova Teknoloji", room: "Orkide Salonu", start: "15:00", end: "17:30", direction: "left" }
];
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

export function normalizeEventsConfig(input: Record<string, unknown>): EventsConfig {
  const theme: EventsConfig["theme"] = input.theme === "paper" || input.theme === "burgundy" ? input.theme : "midnight";
  const events = Array.isArray(input.events) ? input.events.slice(0, 10).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return []; const item = raw as Record<string, unknown>; const title = clean(item.title, "", 100); if (!title) return [];
    return [{ id: clean(item.id, `event-${index + 1}`, 64).replace(/[^a-zA-Z0-9_-]/g, "-"), title, host: typeof item.host === "string" ? item.host.trim().slice(0, 80) : "", room: clean(item.room, "-", 60), start: safeTime(item.start, "09:00"), end: safeTime(item.end, "10:00"), direction: item.direction === "left" || item.direction === "up" ? item.direction : "right" } as EventItem];
  }) : DEFAULT_EVENTS;
  return { hotelName: clean(input.hotelName, "Grand Hotel", 80), heading: clean(input.heading, "Bugünün Etkinlikleri", 100), locale: input.locale === "en" ? "en" : "tr", theme, accentColor: safeColor(input.accentColor, EVENT_THEMES[theme].accent), events: events.length ? events : DEFAULT_EVENTS, showHost: input.showHost !== false, showDirection: input.showDirection !== false, footer: typeof input.footer === "string" ? input.footer.trim().slice(0, 180) : "Salon değişiklikleri için resepsiyon ekibimize danışabilirsiniz." };
}
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
  const config = normalizeEventsConfig(raw); const theme = EVENT_THEMES[config.theme];
  const words = config.locale === "tr" ? { live: "ŞİMDİ", next: "YAKLAŞAN", done: "TAMAMLANDI", room: "SALON" } : { live: "NOW", next: "UPCOMING", done: "FINISHED", room: "ROOM" };
  const rows = config.events.slice(0, 8).map(event => `<article class="event" data-start="${event.start}" data-end="${event.end}"><b class="time">${event.start}</b><span class="copy"><strong>${escapeHtml(event.title)}</strong>${config.showHost && event.host ? `<small>${escapeHtml(event.host)}</small>` : ""}</span><span class="room"><small>${words.room}</small><b>${escapeHtml(event.room)}</b><em data-status>${words.next}</em></span>${config.showDirection ? `<span class="arrow">${ARROWS[event.direction]}</span>` : ""}</article>`).join("");
  return `<!doctype html><html lang="${config.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>${escapeHtml(title)}</title><style>${baseCss(theme, config.accentColor)}
    .date{align-self:end;color:var(--muted);font-size:clamp(12px,1vw,19px);font-weight:800}.events{display:grid;align-content:center;gap:clamp(7px,1.1vmin,16px);padding:3vmin 0}.event{display:grid;grid-template-columns:clamp(76px,7vw,130px) minmax(0,1fr) auto ${config.showDirection ? "clamp(48px,4vw,76px)" : ""};align-items:center;gap:clamp(13px,2vw,34px);padding:clamp(12px,1.7vmin,25px) clamp(15px,1.8vw,32px);border:1px solid var(--line);border-radius:clamp(13px,1.2vw,22px);background:var(--surface)}.event[data-state=live]{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 9%,var(--surface))}.event[data-state=done]{opacity:.5}.time{font-size:clamp(18px,1.8vw,34px)}.copy{min-width:0}.copy strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(17px,1.55vw,29px)}.copy small{display:block;margin-top:.35em;color:var(--muted);font-size:clamp(10px,.82vw,15px)}.room{text-align:right}.room small{display:block;color:var(--muted);font-size:clamp(8px,.65vw,12px)}.room b{display:block;font-size:clamp(12px,1vw,19px)}.room em{display:block;margin-top:.25em;color:var(--muted);font-size:clamp(8px,.62vw,12px);font-style:normal;font-weight:900}.event[data-state=live] .time,.event[data-state=live] .room em,.arrow{color:var(--accent)}.arrow{font-size:clamp(32px,3vw,58px);text-align:right}@media(max-aspect-ratio:1/1){.event{grid-template-columns:65px minmax(0,1fr) auto}.arrow{display:none}.copy small{display:none}.stage{padding:5vmin}.events{gap:1.2vmin}}
  </style></head><body><main class="stage"><header><div><div class="brand">${escapeHtml(config.hotelName)}</div><h1 class="heading">${escapeHtml(config.heading)}</h1></div><time class="date" id="date"></time></header><section class="events">${rows}</section><footer class="footer">${escapeHtml(config.footer)}</footer></main><script>
  const words=${JSON.stringify(words)};const locale="${config.locale === "tr" ? "tr-TR" : "en-GB"}";
  function minutes(value){const parts=value.split(":").map(Number);return parts[0]*60+parts[1]}
  function update(){const now=new Date();const current=now.getHours()*60+now.getMinutes();document.getElementById("date").textContent=new Intl.DateTimeFormat(locale,{weekday:"long",day:"numeric",month:"long"}).format(now);document.querySelectorAll(".event").forEach(row=>{const state=current>=minutes(row.dataset.start)&&current<minutes(row.dataset.end)?"live":current<minutes(row.dataset.start)?"next":"done";row.dataset.state=state;row.querySelector("[data-status]").textContent=words[state]})}update();window.__remoteScreenTick=update;setInterval(update,30000);
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
