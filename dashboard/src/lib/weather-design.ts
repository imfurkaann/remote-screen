export type WeatherConfig = {
  city: string; units: "metric" | "imperial"; locale: "tr" | "en";
  layout: "overview" | "minimal" | "split"; theme: "paper";
  heading: string; caption: string; forecastDays: 3 | 5;
  showForecast: boolean; showDetails: boolean;
};
export const DEFAULT_WEATHER_CONFIG: WeatherConfig = {
  city: "Istanbul", units: "metric", locale: "en", layout: "overview", theme: "paper",
  heading: "LOCAL WEATHER", caption: "A fresh perspective on your day.",
  forecastDays: 5, showForecast: true, showDetails: true
};
export const WEATHER_TEMPLATES = [
  { id: "overview" as const, name: "Executive Forecast", description: "Current conditions and a refined daily outlook." },
  { id: "minimal" as const, name: "Essential Weather", description: "A generous temperature display. Quiet simplicity." },
  { id: "split" as const, name: "Signature Weather", description: "A balanced composition in white and warm ivory." }
];
export function normalizeWeatherConfig(input: Record<string, unknown> = {}): WeatherConfig {
  return {
    city: typeof input.city === "string" ? input.city.slice(0,120) : DEFAULT_WEATHER_CONFIG.city,
    units: input.units === "imperial" ? "imperial" : "metric",
    locale: input.locale === "tr" ? "tr" : "en",
    layout: input.layout === "minimal" || input.layout === "split" ? input.layout : "overview",
    theme: "paper",
    heading: typeof input.heading === "string" ? input.heading.slice(0,80) : DEFAULT_WEATHER_CONFIG.heading,
    caption: typeof input.caption === "string" ? input.caption.slice(0,140) : DEFAULT_WEATHER_CONFIG.caption,
    forecastDays: input.forecastDays === 3 ? 3 : 5,
    showForecast: input.showForecast !== false, showDetails: input.showDetails !== false
  };
}
export const WEATHER_STYLES = `
.elegant-weather .weather-icon svg,.elegant-weather .forecast-icon svg { width:1em; height:1em; vertical-align:middle; }
.elegant-weather { box-sizing:border-box; container-type:inline-size; position:relative; width:100%; height:100%; aspect-ratio:16/9; display:flex; flex-direction:column; padding:4% 6%; overflow:hidden; background:#fff; color:#273331; border:1px solid #e6e2dc; font-family:Georgia,"Times New Roman",serif; }
.elegant-weather * { box-sizing:border-box; }
.elegant-weather .weather-heading { color:#8f7753; font:500 1.3cqw/1.4 Arial,sans-serif; letter-spacing:.26em; min-height:1.8em; overflow-wrap:anywhere; }
.elegant-weather .header { display:flex; justify-content:space-between; align-items:center; gap:3%; margin-top:2cqw; }
.elegant-weather .location { font:normal 3.4cqw/1.2 Georgia,serif; overflow-wrap:anywhere; }
.elegant-weather .condition { color:#807c73; font:400 1.5cqw/1.5 Arial,sans-serif; margin-top:.6cqw; }
.elegant-weather .weather-icon { color:#9b8159; font:6cqw/1 Georgia,serif; }
.elegant-weather .main { flex:1; min-height:0; display:flex; align-items:center; justify-content:space-between; gap:5%; }
.elegant-weather .temperature { display:flex; align-items:flex-start; white-space:nowrap; font-family:"Helvetica Neue",Arial,sans-serif; font-variant-numeric:tabular-nums; }
.elegant-weather .temperature-value { font-size:19cqw; font-weight:300; line-height:1; letter-spacing:-.07em; }
.elegant-weather .temperature-unit { color:#9b8159; font-size:3.5cqw; margin:2cqw 0 0 1cqw; }
.elegant-weather .details { width:35%; display:grid; gap:1.1cqw; font:1.4cqw/1.5 Arial,sans-serif; }
.elegant-weather .detail { display:flex; justify-content:space-between; gap:1cqw; padding-bottom:.6cqw; border-bottom:1px solid #e6e2dc; }
.elegant-weather .detail-label { color:#807c73; }
.elegant-weather .detail-value { font-weight:500; }
.elegant-weather .forecast { display:grid; border-top:1px solid #e6e2dc; padding-top:1.7cqw; }
.elegant-weather .forecast-day { text-align:center; border-left:1px solid #e6e2dc; font:1.35cqw/1.5 Arial,sans-serif; }
.elegant-weather .forecast-day:first-child { border-left:0; }
.elegant-weather .forecast-name,.elegant-weather .forecast-low { color:#807c73; }
.elegant-weather .forecast-icon { color:#9b8159; font:2.7cqw/1.4 Georgia,serif; }
.elegant-weather .forecast-low { margin-left:.5em; }
.elegant-weather .weather-caption { color:#807c73; font:italic 1.5cqw/1.4 Georgia,serif; margin-top:2cqw; min-height:1.5em; overflow-wrap:anywhere; }
.elegant-weather .editable-weather { font:inherit; letter-spacing:inherit; color:inherit; text-align:inherit; border:1px dashed transparent; border-radius:3px; padding:0; background:transparent; max-width:100%; cursor:text; }
.elegant-weather .editable-weather:hover { border-color:#c4b293; }
.elegant-weather input.editable-weather { width:100%; outline:1px solid #9b8159; }
.elegant-weather[data-layout="minimal"] { text-align:center; }
.elegant-weather[data-layout="minimal"] .header { flex-direction:column; gap:1cqw; }
.elegant-weather[data-layout="minimal"] .main { justify-content:center; }
.elegant-weather[data-layout="minimal"] .temperature-value { font-size:24cqw; }
.elegant-weather[data-layout="minimal"] .details,.elegant-weather[data-layout="minimal"] .forecast { display:none; }
.elegant-weather[data-layout="split"] { background:linear-gradient(90deg,#fff 64%,#f7f5f0 64%); }
.elegant-weather[data-layout="split"] .details { width:29%; }
.elegant-weather[data-details="false"] .details,.elegant-weather[data-forecast="false"] .forecast { display:none; }
.elegant-weather.portrait { aspect-ratio:9/16; padding:9% 7%; }
.elegant-weather.portrait .weather-heading { font-size:2.5cqw; }
.elegant-weather.portrait .header { margin-top:5cqw; }
.elegant-weather.portrait .location { font-size:6cqw; }
.elegant-weather.portrait .condition { font-size:3cqw; }
.elegant-weather.portrait .weather-icon { font-size:11cqw; }
.elegant-weather.portrait .main { flex-direction:column; justify-content:center; gap:8cqw; }
.elegant-weather.portrait .temperature-value { font-size:38cqw; }
.elegant-weather.portrait .temperature-unit { font-size:7cqw; margin-top:4cqw; }
.elegant-weather.portrait .details { width:100%; font-size:3cqw; gap:2cqw; }
.elegant-weather.portrait .forecast { padding-top:4cqw; }
.elegant-weather.portrait .forecast-day { font-size:2.5cqw; }
.elegant-weather.portrait .forecast-icon { font-size:5cqw; }
.elegant-weather.portrait .weather-caption { font-size:3cqw; margin-top:5cqw; }
.elegant-weather.portrait[data-layout="split"] { background:linear-gradient(#fff 64%,#f7f5f0 64%); }
`;

const iconPaths: Record<string,string> = {
  "☀": '<circle cx="24" cy="24" r="9"/><path d="M24 3v6m0 30v6M3 24h6m30 0h6M9 9l4 4m22 22 4 4M9 39l4-4m22-22 4-4"/>',
  "☁": '<path d="M12 36a9 9 0 1 1 1-18 12 12 0 0 1 23 4 7 7 0 1 1 1 14Z"/>',
  "◒": '<path d="M27 7V3m12 9 3-3M17 10l-3-3m26 15h5"/><path d="M19 16a9 9 0 0 1 17 6"/><path d="M10 38a8 8 0 1 1 2-16 10 10 0 0 1 19 3 7 7 0 1 1 3 13Z"/>',
  "☂": '<path d="M11 30a8 8 0 1 1 2-16 11 11 0 0 1 21 4 6 6 0 1 1 2 12Z"/><path d="m15 35-3 7m13-7-3 7m13-7-3 7"/>',
  "✣": '<path d="M24 4v40M7 14l34 20M7 34l34-20M19 7l5 5 5-5m-10 34 5-5 5 5M7 20l7-2-2-7m29 17-7 2 2 7M12 37l2-7-7-2m29-17-2 7 7 2"/>',
  "≋": '<path d="M7 16h34M4 24h40M9 32h30"/>',
  "ϟ": '<path d="m27 3-16 24h12l-2 18 16-25H25Z"/>'
};
export const WEATHER_ICONS: Record<string,string> = Object.fromEntries(Object.entries(iconPaths).map(([key,paths]) => [key, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>']));
