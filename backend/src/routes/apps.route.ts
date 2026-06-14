import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { Logger } from "../lib/logger.js";
import { requireRoles, requireUserAuth } from "../middlewares/auth.js";
import { MediaModel } from "../models/media.model.js";
import { contentRepository } from "../repositories/content.repository.js";

const logger = new Logger("AppsRoute");

type AppsRouterDeps = {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
};

export function buildAppsRouter(deps: AppsRouterDeps): Router {
  const router = Router();

  // 1. PUBLIC RENDERING ENDPOINT
  // Serves standalone interactive HTML pages for each widget type
  router.get("/render/:id", async (req, res) => {
    try {
      const mediaId = req.params.id;
      const media = await MediaModel.findById(mediaId).lean();
      
      if (!media || media.mimeType !== "text/html") {
        res.status(404).send("<html><body><h1>App Widget Not Found</h1></body></html>");
        return;
      }

      const config = (media as any).appConfig || {};
      const appType = (media.storagePath || "").replace("app://", "").split("?")[0];
      const title = media.filename;

      let htmlContent = "";

      switch (appType) {
        case "clock":
          htmlContent = renderClockHtml(title, config);
          break;
        case "weather":
          htmlContent = renderWeatherHtml(title, config);
          break;
        case "rss":
          htmlContent = renderRssHtml(title, config);
          break;
        case "notice":
          htmlContent = renderNoticeHtml(title, config);
          break;
        case "qrcode":
          htmlContent = renderQrHtml(title, config);
          break;
        default:
          htmlContent = `<html><body><h1>Unknown App Type: ${appType}</h1></body></html>`;
      }

      res.setHeader("Content-Type", "text/html");
      res.send(htmlContent);
    } catch (err) {
      logger.error("Failed to render app", err instanceof Error ? err : new Error(String(err)));
      res.status(500).send("<html><body><h1>Internal Server Error Rendering App</h1></body></html>");
    }
  });

  // 2. PUBLIC RSS PROXY ENDPOINT
  // Fetches XML feeds and returns clean JSON to bypass CORS blocks in WebViews
  router.get("/rss-proxy", async (req, res) => {
    try {
      const feedUrl = req.query.url;
      if (!feedUrl || typeof feedUrl !== "string") {
        res.status(400).json({ error: "Missing url parameter" });
        return;
      }

      const response = await fetch(feedUrl);
      if (!response.ok) {
        res.status(500).json({ error: `Failed to fetch feed: HTTP ${response.status}` });
        return;
      }

      const text = await response.text();
      // Simple parser for standard RSS XML format
      const items: any[] = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;

      while ((match = itemRegex.exec(text)) !== null) {
        const itemContent = match[1] || "";
        const titleMatch = itemContent.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || itemContent.match(/<title>([\s\S]*?)<\/title>/);
        const descMatch = itemContent.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || itemContent.match(/<description>([\s\S]*?)<\/description>/);
        const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);

        const titleVal = titleMatch && titleMatch[1] ? cleanXml(titleMatch[1]) : "No Title";
        const descVal = descMatch && descMatch[1] ? cleanXml(descMatch[1]) : "";
        const linkVal = linkMatch && linkMatch[1] ? linkMatch[1].trim() : "";

        items.push({
          title: titleVal,
          description: descVal,
          link: linkVal
        });
        if (items.length >= 25) break; // Limit to 25 items for size optimization
      }

      res.json({ items });
    } catch (err) {
      res.status(500).json({ error: "RSS Proxy failed to parse feed" });
    }
  });

  // 3. AUTHENTICATED ENDPOINTS FOR MANAGING INSTANCES
  router.use(requireUserAuth(deps.jwtSecret, { issuer: deps.jwtIssuer, audience: deps.jwtAudience }));
  router.use(requireRoles(["tenant_owner", "tenant_admin", "operator"]));

  // Create App Instance
  router.post("/create-app", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const { name, appType, config } = req.body;

      if (!tenantId || !name || !appType || !config) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "name, appType, and config are required" });
        return;
      }

      const media = new MediaModel({
        tenantId,
        ownerUserId: req.auth!.userId,
        filename: name,
        mimeType: "text/html",
        sizeBytes: 0,
        checksumSha256: "temp",
        storagePath: "temp",
        publicUrl: "temp",
        status: "ready",
        appConfig: config
      });

      const appId = String(media._id);
      const checksumSha256 = createHash("sha256").update(appId).digest("hex");
      const publicUrl = `/api/v1/apps/render/${appId}`;
      const storagePath = `app://${appType}?id=${appId}`;

      media.checksumSha256 = checksumSha256;
      media.publicUrl = publicUrl;
      media.storagePath = storagePath;

      await media.save();

      try {
        await contentRepository.upsertMedia({
          tenantId,
          externalId: String(media._id),
          filename: media.filename,
          mimeType: media.mimeType,
          sizeBytes: media.sizeBytes,
          checksumSha256: media.checksumSha256,
          storagePath: media.storagePath,
          publicUrl: media.publicUrl,
          status: media.status,
          ownerUserId: req.auth!.userId
        });
      } catch (err) {
        logger.error("Failed to sync app to postgres shadow write", err instanceof Error ? err : new Error(String(err)));
      }

      res.status(201).json({ success: true, app: media });
    } catch (err) {
      logger.error("Failed to create app instance", err instanceof Error ? err : new Error(String(err)));
      res.status(500).json({ code: "APP_CREATE_FAILED", message: "Failed to save app instance" });
    }
  });

  // Update App Instance
  router.put("/update-app/:id", async (req, res) => {
    try {
      const tenantId = req.auth?.tenantId;
      const appId = req.params.id;
      const { name, config } = req.body;

      if (!tenantId || !appId || !name || !config) {
        res.status(400).json({ code: "VALIDATION_ERROR", message: "name and config are required" });
        return;
      }

      const filter = req.auth?.role === "tenant_owner"
        ? { _id: appId, tenantId }
        : { _id: appId, tenantId, ownerUserId: req.auth?.userId };

      const updated = await MediaModel.findOneAndUpdate(
        filter,
        {
          $set: {
            filename: name,
            appConfig: config
          }
        },
        { new: true }
      ).lean();

      if (!updated) {
        res.status(404).json({ code: "APP_NOT_FOUND", message: "App instance not found" });
        return;
      }

      try {
        await contentRepository.upsertMedia({
          tenantId,
          externalId: String(updated._id),
          filename: updated.filename,
          mimeType: updated.mimeType,
          sizeBytes: updated.sizeBytes,
          checksumSha256: updated.checksumSha256,
          storagePath: updated.storagePath,
          publicUrl: updated.publicUrl,
          status: updated.status,
          ownerUserId: (updated as any).ownerUserId
        });
      } catch (err) {
        logger.error("Failed to sync app update to postgres shadow write", err instanceof Error ? err : new Error(String(err)));
      }

      res.json({ success: true, app: updated });
    } catch (err) {
      logger.error("Failed to update app instance", err instanceof Error ? err : new Error(String(err)));
      res.status(500).json({ code: "APP_UPDATE_FAILED", message: "Failed to update app instance" });
    }
  });

  return router;
}

// -------------------------------------------------------------
// APP RENDER TEMPLATES (DYNAMIC STANDALONE HTML/CSS/JS)
// -------------------------------------------------------------

function cleanXml(str: string): string {
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function renderClockHtml(title: string, config: any): string {
  const theme = config.theme || "glassmorphism";
  const format = config.format || "24h";
  const showSeconds = config.showSeconds !== false;
  const timezone = config.timezone || "local";
  const layout = config.layout || "hybrid";

  const isDigital = layout === "digital";
  const isAnalog = layout === "analog";
  const isHybrid = layout === "hybrid";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title}</title>
  <style>
    * {
      box-sizing: border-box;
    }
    :root {
      --bg-color: ${theme === "light" ? "#f8fafc" : "#0f172a"};
      --card-bg: ${theme === "light" ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.6)"};
      --text-color: ${theme === "light" ? "#0f172a" : "#f8fafc"};
      --muted-color: ${theme === "light" ? "#64748b" : "#94a3b8"};
      --border-color: ${theme === "light" ? "rgba(226,232,240,0.8)" : "rgba(51,65,85,0.45)"};
      --primary-color: #10b981;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
    }
    body {
      background-color: var(--bg-color);
      color: var(--text-color);
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    
    /* Digital Layout */
    .digital-container {
      text-align: center;
      padding: clamp(24px, 5vw, 48px);
      border-radius: clamp(16px, 3.5vw, 32px);
      background: ${theme === "glassmorphism" ? "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)" : "var(--card-bg)"};
      border: 1px solid var(--border-color);
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.3);
      backdrop-filter: ${theme === "glassmorphism" ? "blur(12px)" : "none"};
      width: clamp(280px, 85vw, 650px);
    }
    .digital-container .time {
      font-size: clamp(38px, 11vw, 92px);
      font-weight: 900;
      letter-spacing: -2px;
      margin: 12px 0;
      color: var(--text-color);
      text-shadow: 0 0 30px rgba(16, 185, 129, 0.15);
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    .digital-container .date {
      font-size: clamp(12px, 3.2vw, 22px);
      color: var(--primary-color);
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .digital-container .timezone {
      font-size: clamp(10px, 2.2vw, 15px);
      color: var(--muted-color);
      margin-top: 14px;
      font-weight: 500;
    }

    /* Analog / Hybrid Circle */
    .clock-circle {
      position: relative;
      width: clamp(260px, 80vw, 460px);
      height: clamp(260px, 80vw, 460px);
      border-radius: 50%;
      border: 4px solid var(--border-color);
      background: ${theme === "glassmorphism" ? "radial-gradient(circle, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%)" : "var(--card-bg)"};
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35), inset 0 0 30px rgba(255,255,255,0.05);
      backdrop-filter: ${theme === "glassmorphism" ? "blur(12px)" : "none"};
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ticks {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
      pointer-events: none;
    }
    .tick {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
    }
    .tick::before {
      content: '';
      position: absolute;
      top: 10px;
      left: 50%;
      width: 2px;
      height: 12px;
      background-color: var(--muted-color);
      transform: translateX(-50%);
      border-radius: 1px;
    }
    .tick.hour-3::before, .tick.hour-6::before, .tick.hour-9::before, .tick.hour-12::before {
      width: 4px;
      height: 18px;
      background-color: var(--primary-color);
      box-shadow: 0 0 8px var(--primary-color);
    }
    .center-display {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      pointer-events: none;
      z-index: 1;
      padding: 24px;
    }
    .hybrid-date {
      font-size: clamp(10px, 2.5vw, 15px);
      font-weight: 700;
      text-transform: uppercase;
      color: var(--primary-color);
      letter-spacing: 1px;
    }
    .hybrid-time {
      font-size: clamp(22px, 6.2vw, 42px);
      font-weight: 800;
      margin: 8px 0;
      letter-spacing: -1px;
      color: var(--text-color);
      text-shadow: 0 0 20px rgba(16, 185, 129, 0.25);
      font-variant-numeric: tabular-nums;
    }
    .hybrid-timezone {
      font-size: clamp(9px, 2vw, 13px);
      color: var(--muted-color);
      font-weight: 500;
    }
    .hand {
      position: absolute;
      bottom: 50%;
      left: 50%;
      transform-origin: 50% 100%;
      border-radius: 4px;
      transition: transform 0.2s cubic-bezier(0.4, 2.08, 0.55, 0.44);
    }
    .hour-hand {
      width: clamp(4px, 1.2vw, 7px);
      height: 25%;
      background-color: var(--text-color);
      z-index: 3;
    }
    .minute-hand {
      width: clamp(3px, 0.8vw, 5px);
      height: 35%;
      background-color: var(--text-color);
      opacity: 0.95;
      z-index: 2;
    }
    .second-hand {
      width: clamp(1.5px, 0.4vw, 2.5px);
      height: 42%;
      background-color: var(--primary-color);
      z-index: 4;
      transition: transform 0.1s linear;
    }
    .center-dot {
      position: absolute;
      width: clamp(10px, 2.5vw, 15px);
      height: clamp(10px, 2.5vw, 15px);
      background-color: var(--primary-color);
      border-radius: 50%;
      z-index: 5;
      box-shadow: 0 0 10px var(--primary-color);
    }
  </style>
</head>
<body>
  ${isDigital ? `
  <div class="digital-container">
    <div class="date" id="date">-- -- ----</div>
    <div class="time" id="time">00:00:00</div>
    <div class="timezone" id="tz">${timezone === "local" ? "Local Time" : timezone}</div>
  </div>
  ` : `
  <div class="clock-circle">
    <div class="ticks">
      <div class="tick hour-12" style="transform: rotate(0deg)"></div>
      <div class="tick" style="transform: rotate(30deg)"></div>
      <div class="tick" style="transform: rotate(60deg)"></div>
      <div class="tick hour-3" style="transform: rotate(90deg)"></div>
      <div class="tick" style="transform: rotate(120deg)"></div>
      <div class="tick" style="transform: rotate(150deg)"></div>
      <div class="tick hour-6" style="transform: rotate(180deg)"></div>
      <div class="tick" style="transform: rotate(210deg)"></div>
      <div class="tick" style="transform: rotate(240deg)"></div>
      <div class="tick hour-9" style="transform: rotate(270deg)"></div>
      <div class="tick" style="transform: rotate(300deg)"></div>
      <div class="tick" style="transform: rotate(330deg)"></div>
    </div>
    
    <div class="center-display">
      <div class="hybrid-date" id="date">-- -- ----</div>
      ${isHybrid ? `<div class="hybrid-time" id="time">00:00:00</div>` : ""}
      <div class="hybrid-timezone" id="tz">${timezone === "local" ? "Local Time" : timezone}</div>
    </div>
    
    <div class="hand hour-hand" id="hour-hand"></div>
    <div class="hand minute-hand" id="minute-hand"></div>
    ${showSeconds ? `<div class="hand second-hand" id="second-hand"></div>` : ""}
    <div class="center-dot"></div>
  </div>
  `}

  <script>
    function updateClock() {
      const now = new Date();
      
      let tzDate = now;
      const timezone = "${timezone}";
      if (timezone !== "local") {
        try {
          tzDate = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
        } catch(e) {}
      }
      
      const hours = tzDate.getHours();
      const minutes = tzDate.getMinutes();
      const seconds = tzDate.getSeconds();
      
      const hrRot = ((hours % 12) * 30) + (minutes * 0.5);
      const minRot = (minutes * 6) + (seconds * 0.1);
      const secRot = seconds * 6;
      
      const hrHand = document.getElementById("hour-hand");
      const minHand = document.getElementById("minute-hand");
      const secHand = document.getElementById("second-hand");
      
      if (hrHand) hrHand.style.transform = "translateX(-50%) rotate(" + hrRot + "deg)";
      if (minHand) minHand.style.transform = "translateX(-50%) rotate(" + minRot + "deg)";
      if (secHand) secHand.style.transform = "translateX(-50%) rotate(" + secRot + "deg)";
      
      const options = {
        timeZone: "${timezone === "local" ? "" : timezone}",
        hour: "numeric",
        minute: "numeric",
        second: ${showSeconds ? '"numeric"' : "undefined"},
        hour12: ${format === "12h" ? "true" : "false"}
      };
      
      const dateOptions = {
        timeZone: "${timezone === "local" ? "" : timezone}",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      };

      try {
        const formatter = new Intl.DateTimeFormat("en-US", options);
        const timeElems = document.querySelectorAll("#time");
        timeElems.forEach(el => el.innerText = formatter.format(now));

        const dateDom = new Intl.DateTimeFormat("en-US", dateOptions);
        const dateElems = document.querySelectorAll("#date");
        dateElems.forEach(el => el.innerText = dateDom.format(now));
      } catch (e) {
        const timeElems = document.querySelectorAll("#time");
        timeElems.forEach(el => el.innerText = now.toLocaleTimeString());
        
        const dateElems = document.querySelectorAll("#date");
        dateElems.forEach(el => el.innerText = now.toLocaleDateString());
      }
    }
    
    updateClock();
    setInterval(updateClock, 1000);
  </script>
</body>
</html>`;
}

function renderWeatherHtml(title: string, config: any): string {
  const city = config.city || "London";
  const units = config.units || "metric";
  const theme = config.theme || "glassmorphism";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title}</title>
  <style>
    * {
      box-sizing: border-box;
    }
    :root {
      --bg-color: ${theme === "light" ? "#f1f5f9" : "#0f172a"};
      --card-bg: ${theme === "light" ? "rgba(255,255,255,0.9)" : "rgba(30,41,59,0.7)"};
      --text-color: ${theme === "light" ? "#0f172a" : "#f8fafc"};
      --muted-color: ${theme === "light" ? "#64748b" : "#94a3b8"};
      --border-color: ${theme === "light" ? "rgba(226,232,240,0.8)" : "rgba(51,65,85,0.5)"};
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
    }
    body {
      background: var(--bg-color);
      color: var(--text-color);
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .widget {
      background: ${theme === "glassmorphism" ? "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)" : "var(--card-bg)"};
      border: 1px solid var(--border-color);
      backdrop-filter: ${theme === "glassmorphism" ? "blur(16px)" : "none"};
      border-radius: clamp(16px, 3vw, 32px);
      padding: clamp(20px, 4vw, 40px);
      width: clamp(280px, 85vw, 650px);
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15);
      text-align: center;
    }
    .city {
      font-size: clamp(16px, 4.5vw, 32px);
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .temp-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: clamp(10px, 3vw, 30px);
      margin: clamp(12px, 3vw, 30px) 0;
    }
    .icon {
      font-size: clamp(38px, 11vw, 80px);
    }
    .temp {
      font-size: clamp(42px, 13vw, 90px);
      font-weight: 800;
    }
    .condition {
      font-size: clamp(13px, 3.5vw, 22px);
      color: #10b981;
      font-weight: 700;
      margin-bottom: clamp(16px, 4vw, 30px);
    }
    .forecast-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: clamp(8px, 2vw, 20px);
      border-top: 1px solid var(--border-color);
      padding-top: clamp(12px, 3vw, 24px);
    }
    .forecast-day {
      display: flex;
      flex-direction: column;
      align-items: center;
      font-size: clamp(11px, 2.2vw, 16px);
    }
    .day-name {
      color: var(--muted-color);
      font-weight: 600;
      margin-bottom: 6px;
    }
    .day-temp {
      font-weight: 700;
      margin-top: 6px;
    }
  </style>
</head>
<body>
  <div class="widget">
    <div class="city" id="city-name">${city}</div>
    <div class="temp-row">
      <span class="icon" id="weather-icon">🌤️</span>
      <span class="temp" id="temp">--°</span>
    </div>
    <div class="condition" id="condition">Loading Weather...</div>
    
    <div class="forecast-grid" id="forecast">
      <div class="forecast-day">
        <span class="day-name">Mon</span>
        <span>☀️</span>
        <span class="day-temp">--°</span>
      </div>
      <div class="forecast-day">
        <span class="day-name">Tue</span>
        <span>☁️</span>
        <span class="day-temp">--°</span>
      </div>
      <div class="forecast-day">
        <span class="day-name">Wed</span>
        <span>🌧️</span>
        <span class="day-temp">--°</span>
      </div>
    </div>
  </div>

  <script>
    const weatherCodes = {
      0: { text: "Clear Sky", icon: "☀️" },
      1: { text: "Mainly Clear", icon: "🌤️" },
      2: { text: "Partly Cloudy", icon: "⛅" },
      3: { text: "Overcast", icon: "☁️" },
      45: { text: "Foggy", icon: "🌫️" },
      48: { text: "Rime Fog", icon: "🌫️" },
      51: { text: "Light Drizzle", icon: "🌦️" },
      61: { text: "Light Rain", icon: "🌧️" },
      63: { text: "Moderate Rain", icon: "🌧️" },
      80: { text: "Rain Showers", icon: "🌦️" },
      95: { text: "Thunderstorm", icon: "⛈️" }
    };

    async function fetchWeather() {
      try {
        // 1. Geocode city name to lat/lon using public open-meteo geocoding
        const geoRes = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent("${city}") + "&count=1&language=en&format=json");
        const geoData = await geoRes.json();
        
        if (!geoData.results || geoData.results.length === 0) {
          document.getElementById("condition").innerText = "City Not Found";
          return;
        }
        
        const loc = geoData.results[0];
        document.getElementById("city-name").innerText = loc.name + ", " + (loc.country_code || "").toUpperCase();

        // 2. Fetch forecast
        const weatherRes = await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + loc.latitude + "&longitude=" + loc.longitude + "&current_weather=true&daily=weathercode,temperature_2m_max&timezone=auto");
        const weatherData = await weatherRes.json();
        
        const cur = weatherData.current_weather;
        const tempVal = Math.round(cur.temperature);
        
        // Handle metric/imperial conversion
        const displayTemp = "${units}" === "imperial" ? Math.round((tempVal * 9/5) + 32) + "°F" : tempVal + "°C";
        document.getElementById("temp").innerText = displayTemp;
        
        const codeInfo = weatherCodes[cur.weathercode] || { text: "Cloudy", icon: "☁️" };
        document.getElementById("weather-icon").innerText = codeInfo.icon;
        document.getElementById("condition").innerText = codeInfo.text;

        // Render 3-Day Forecast
        const daily = weatherData.daily;
        let forecastHtml = "";
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        
        for (let i = 1; i <= 3; i++) {
          const dateObj = new Date(daily.time[i]);
          const dayName = days[dateObj.getDay()];
          const forecastCode = weatherCodes[daily.weathercode[i]] || { text: "Cloudy", icon: "☁️" };
          const fMaxTemp = Math.round(daily.temperature_2m_max[i]);
          const displayFMax = "${units}" === "imperial" ? Math.round((fMaxTemp * 9/5) + 32) + "°" : fMaxTemp + "°";

          forecastHtml += '<div class="forecast-day">' +
            '<span class="day-name">' + dayName + '</span>' +
            '<span style="font-size: 18px;">' + forecastCode.icon + '</span>' +
            '<span class="day-temp">' + displayFMax + '</span>' +
            '</div>';
        }
        
        document.getElementById("forecast").innerHTML = forecastHtml;

      } catch (err) {
        document.getElementById("condition").innerText = "Weather Unavailable";
      }
    }

    fetchWeather();
    setInterval(fetchWeather, 600000); // refresh every 10 mins
  </script>
</body>
</html>`;
}

function renderRssHtml(title: string, config: any): string {
  const rssUrl = config.rssUrl || "";
  const speed = config.speed || "medium";
  const layout = config.layout || "ticker";

  // Calculate marquee animation speeds
  let animationSec = 25;
  if (speed === "slow") animationSec = 35;
  if (speed === "fast") animationSec = 15;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title}</title>
  <style>
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
    }
    body {
      background-color: #0f172a;
      color: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
      overflow: hidden;
    }
    
    /* Layout 1: News Ticker marquee bar at bottom */
    .ticker-wrapper {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: clamp(50px, 8vw, 80px);
      background-color: #1e293b;
      border-top: 3px solid #10b981;
      display: flex;
      align-items: center;
      overflow: hidden;
      box-sizing: border-box;
    }
    .ticker-label {
      background-color: #10b981;
      color: #000000;
      font-weight: bold;
      text-transform: uppercase;
      font-size: clamp(11px, 2vw, 16px);
      padding: 0 clamp(10px, 3vw, 30px);
      height: 100%;
      display: flex;
      align-items: center;
      z-index: 10;
      letter-spacing: 0.5px;
    }
    .ticker-content {
      display: inline-flex;
      white-space: nowrap;
      animation: marquee ${animationSec}s linear infinite;
    }
    .ticker-item {
      display: inline-flex;
      align-items: center;
      padding-right: clamp(24px, 6vw, 64px);
      font-size: clamp(14px, 2.5vw, 24px);
      font-weight: 600;
    }
    .ticker-item::after {
      content: "✦";
      color: #10b981;
      margin-left: clamp(12px, 3vw, 32px);
    }
    
    @keyframes marquee {
      0% { transform: translateX(100vw); }
      100% { transform: translateX(-100%); }
    }
 
    /* Layout 2: Card Display */
    .card-wrapper {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      box-sizing: border-box;
    }
    .news-card {
      background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: clamp(16px, 3vw, 32px);
      padding: clamp(20px, 4vw, 40px);
      width: clamp(280px, 85vw, 750px);
      text-align: left;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3);
      animation: cardFade 0.8s ease-out;
    }
    .card-source {
      font-size: clamp(11px, 2vw, 16px);
      font-weight: bold;
      color: #10b981;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .card-title {
      font-size: clamp(16px, 4.5vw, 28px);
      font-weight: 800;
      margin: clamp(10px, 2.5vw, 20px) 0;
      line-height: 1.3;
    }
    .card-desc {
      font-size: clamp(12px, 3.2vw, 18px);
      color: #94a3b8;
      line-height: 1.6;
    }
    @keyframes cardFade {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <div id="content-area">Loading RSS Feed...</div>

  <script>
    async function loadFeed() {
      if (!"${rssUrl}") {
        document.getElementById("content-area").innerHTML = '<div style="padding: 20px;">No RSS URL configured</div>';
        return;
      }

      try {
        const res = await fetch("/api/v1/apps/rss-proxy?url=" + encodeURIComponent("${rssUrl}"));
        const data = await res.json();
        
        if (!data.items || data.items.length === 0) {
          document.getElementById("content-area").innerHTML = '<div style="padding: 20px;">Empty News Feed</div>';
          return;
        }

        if ("${layout}" === "ticker") {
          let tickerItems = "";
          data.items.forEach(item => {
            tickerItems += '<div class="ticker-item">' + item.title + '</div>';
          });
          
          document.getElementById("content-area").innerHTML = 
            '<div class="ticker-wrapper">' +
            '  <div class="ticker-label">NEWS UPDATE</div>' +
            '  <div class="ticker-content">' + tickerItems + '</div>' +
            '</div>';
        } else {
          // Cards view - display first item and cycle every 8 seconds
          let currentIndex = 0;
          
          function showCard() {
            const item = data.items[currentIndex];
            document.getElementById("content-area").innerHTML = 
              '<div class="card-wrapper">' +
              '  <div class="news-card">' +
              '    <div class="card-source">${title}</div>' +
              '    <div class="card-title">' + item.title + '</div>' +
              '    <div class="card-desc">' + item.description + '</div>' +
              '  </div>' +
              '</div>';
            currentIndex = (currentIndex + 1) % data.items.length;
          }
          
          showCard();
          setInterval(showCard, 8000);
        }
      } catch (err) {
        document.getElementById("content-area").innerHTML = '<div style="padding: 20px;">Failed to load feed</div>';
      }
    }

    loadFeed();
  </script>
</body>
</html>`;
}

function renderNoticeHtml(title: string, config: any): string {
  const headline = config.headline || "Notice";
  const body = config.body || "No message body specified.";
  const icon = config.icon || "info";
  const bgColor = config.bgColor || "#4c1d95";
  const textColor = config.textColor || "#ffffff";

  const icons: Record<string, string> = {
    info: "ℹ️",
    warning: "⚠️",
    alert: "🚨",
    checkmark: "✅",
    none: ""
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title}</title>
  <style>
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
    }
    body {
      background-color: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
      overflow: hidden;
    }
    .card {
      width: clamp(280px, 85vw, 750px);
      padding: clamp(24px, 5vw, 48px);
      border-radius: clamp(18px, 3.5vw, 36px);
      background-color: ${bgColor};
      color: ${textColor};
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255,255,255,0.06);
      animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .icon {
      font-size: clamp(40px, 11vw, 80px);
      margin-bottom: clamp(16px, 3vw, 24px);
    }
    .title {
      font-size: clamp(20px, 6vw, 40px);
      font-weight: 800;
      margin: 0 0 clamp(12px, 3vw, 20px) 0;
      letter-spacing: -0.5px;
    }
    .message {
      font-size: clamp(13px, 3.8vw, 24px);
      line-height: 1.6;
      margin: 0;
      opacity: 0.9;
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <div class="card">
    ${icon !== "none" ? `<div class="icon">${icons[icon] || "ℹ️"}</div>` : ""}
    <h1 class="title">${headline}</h1>
    <p class="message">${body}</p>
  </div>
</body>
</html>`;
}

function renderQrHtml(title: string, config: any): string {
  const url = config.url || "https://screencloud.com";
  const qrTitle = config.title || "Scan the QR Code";
  const description = config.description || "Point your phone's camera at the screen.";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title}</title>
  <style>
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
    }
    body {
      background-color: #0f172a;
      color: #ffffff;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .container {
      text-align: center;
      padding: clamp(20px, 4vw, 40px);
      background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: clamp(16px, 3vw, 32px);
      width: clamp(280px, 85vw, 650px);
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3);
    }
    .header {
      font-size: clamp(16px, 4.5vw, 30px);
      font-weight: 800;
      margin-bottom: clamp(16px, 3.5vw, 32px);
      letter-spacing: -0.5px;
    }
    .qr-box {
      background-color: #ffffff;
      padding: clamp(12px, 3vw, 24px);
      border-radius: clamp(10px, 2vw, 20px);
      display: inline-block;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
      margin-bottom: clamp(16px, 3.5vw, 32px);
    }
    .desc {
      font-size: clamp(12px, 3.2vw, 18px);
      color: #94a3b8;
      line-height: 1.5;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">${qrTitle}</div>
    <div class="qr-box">
      <div id="qrcode"></div>
    </div>
    <div class="desc">${description}</div>
  </div>

  <!-- Load QRCode library from public cdnjs -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <script>
    const qrSize = Math.min(300, Math.max(150, Math.round(Math.min(window.innerWidth * 0.45, window.innerHeight * 0.45))));
    new QRCode(document.getElementById("qrcode"), {
      text: "${url}",
      width: qrSize,
      height: qrSize,
      colorDark : "#000000",
      colorLight : "#ffffff",
      correctLevel : QRCode.CorrectLevel.H
    });
  </script>
</body>
</html>`;
}
