export type WeatherConfig = {
  city: string;
  units: "metric" | "imperial";
  locale: "tr" | "en";
  layout: "overview" | "minimal";
  theme: "sky" | "midnight" | "paper" | "sunset";
  forecastDays: 3 | 5;
  showForecast: boolean;
  showDetails: boolean;
};

export const DEFAULT_WEATHER_CONFIG: WeatherConfig = {
  city: "İstanbul",
  units: "metric",
  locale: "tr",
  layout: "overview",
  theme: "sky",
  forecastDays: 5,
  showForecast: true,
  showDetails: true
};

export function normalizeWeatherConfig(input: Record<string, unknown> = {}): WeatherConfig {
  const oldTheme = String(input.theme ?? "");
  const theme: WeatherConfig["theme"] =
    oldTheme === "midnight" || oldTheme === "dark"
      ? "midnight"
      : oldTheme === "paper" || oldTheme === "light"
        ? "paper"
        : oldTheme === "sunset" || oldTheme === "warm"
          ? "sunset"
          : "sky";
  const city = typeof input.city === "string" ? input.city.trim().slice(0, 120) : "";

  return {
    city: city || DEFAULT_WEATHER_CONFIG.city,
    units: input.units === "imperial" ? "imperial" : "metric",
    locale: input.locale === "en" ? "en" : "tr",
    layout: input.layout === "minimal" ? "minimal" : "overview",
    theme,
    forecastDays: input.forecastDays === 3 ? 3 : 5,
    showForecast: input.showForecast !== false,
    showDetails: input.showDetails !== false
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function renderWeatherHtml(title: string, rawConfig: Record<string, unknown> = {}): string {
  const config = normalizeWeatherConfig(rawConfig);
  const configJson = safeJson(config);

  return `<!doctype html>
<html lang="${config.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>${title}</title>
  <style>
    *{box-sizing:border-box}
    :root{color-scheme:dark;--bg:linear-gradient(145deg,#075985 0%,#0284c7 45%,#38bdf8 100%);--surface:rgba(255,255,255,.13);--text:#f8fafc;--muted:#dbeafe;--line:rgba(255,255,255,.2);--accent:#fde68a;--shadow:rgba(2,6,23,.26)}
    body[data-theme="midnight"]{--bg:linear-gradient(145deg,#020617 0%,#0f172a 48%,#172554 100%);--surface:rgba(255,255,255,.055);--text:#f8fafc;--muted:#a5b4fc;--line:rgba(255,255,255,.11);--accent:#67e8f9;--shadow:rgba(2,6,23,.5)}
    body[data-theme="paper"]{color-scheme:light;--bg:linear-gradient(145deg,#fff 0%,#eff6ff 55%,#e0f2fe 100%);--surface:rgba(255,255,255,.72);--text:#0f172a;--muted:#64748b;--line:rgba(15,23,42,.1);--accent:#0369a1;--shadow:rgba(71,85,105,.2)}
    body[data-theme="sunset"]{--bg:linear-gradient(145deg,#431407 0%,#9a3412 48%,#f97316 100%);--surface:rgba(255,255,255,.11);--text:#fff7ed;--muted:#fed7aa;--line:rgba(255,255,255,.18);--accent:#fef3c7;--shadow:rgba(67,20,7,.38)}
    html,body{width:100%;height:100%;margin:0;overflow:hidden}
    body{position:relative;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body:before,body:after{content:"";position:absolute;border-radius:50%;pointer-events:none;filter:blur(9vmin)}
    body:before{width:56vmin;height:56vmin;right:-17vmin;top:-28vmin;background:var(--accent);opacity:.16}
    body:after{width:43vmin;height:43vmin;left:-14vmin;bottom:-25vmin;background:#fff;opacity:.07}
    .weather{position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:column;padding:40px;padding:clamp(24px,5.5vmin,78px)}
    .header{display:flex;align-items:flex-start;justify-content:space-between;gap:3vmin}
    .location{font-size:36px;font-size:clamp(23px,3.8vmin,58px);font-weight:780;line-height:1.05;letter-spacing:-.035em}
    .condition{margin-top:.8vmin;color:var(--muted);font-size:18px;font-size:clamp(13px,1.8vmin,26px);font-weight:650}
    .weather-icon{width:80px;height:80px;width:clamp(58px,8vmin,112px);height:clamp(58px,8vmin,112px);aspect-ratio:1;display:grid;place-items:center;border:1px solid var(--line);border-radius:28%;background:var(--surface);color:var(--accent);font-size:48px;font-size:clamp(33px,5vmin,72px);box-shadow:0 24px 60px var(--shadow)}
    .main{flex:1;min-height:0;display:flex;align-items:center;justify-content:space-between;gap:7vmin}
    .temperature{display:flex;align-items:flex-start;white-space:nowrap;font-variant-numeric:tabular-nums}
    .temperature-value{font-size:160px;font-size:clamp(96px,20vmin,285px);font-weight:710;line-height:.78;letter-spacing:-.08em}
    .temperature-unit{margin:1vmin 0 0 1.4vmin;color:var(--accent);font-size:36px;font-size:clamp(25px,4.2vmin,61px);font-weight:800}
    .details{width:350px;width:min(35vw,500px);display:grid;gap:1.1vmin}
    .detail{display:flex;justify-content:space-between;gap:2vmin;padding:12px 18px;padding:clamp(9px,1.35vmin,19px) clamp(12px,1.7vmin,25px);border:1px solid var(--line);border-radius:12px;border-radius:clamp(10px,1.4vmin,21px);background:var(--surface);font-size:16px;font-size:clamp(13px,1.6vmin,23px)}
    .detail-label{color:var(--muted)} .detail-value{font-weight:800}
    .forecast{display:grid;border-top:1px solid var(--line);padding-top:20px;padding-top:clamp(14px,2.7vmin,38px)}
    .forecast-day{text-align:center;border-left:1px solid var(--line);font-size:16px;font-size:clamp(12px,1.55vmin,22px)}
    .forecast-day:first-child{border-left:0}
    .forecast-name{color:var(--muted);font-weight:700}
    .forecast-icon{margin:.6vmin 0;color:var(--text);font-size:28px;font-size:clamp(22px,3vmin,44px)}
    .forecast-day:first-child .forecast-icon{color:var(--accent)}
    .forecast-temp{font-weight:850}.forecast-low{color:var(--muted);font-weight:600;margin-left:.5em}
    .footer{position:absolute;right:20px;right:clamp(14px,2.5vmin,38px);bottom:12px;bottom:clamp(10px,1.5vmin,22px);display:flex;align-items:center;gap:.7vmin;color:var(--muted);font-size:12px;font-size:clamp(9px,1.05vmin,15px);font-weight:650}
    .status-dot{width:.6em;height:.6em;border-radius:50%;background:#86efac;box-shadow:0 0 0 .25em rgba(134,239,172,.12)}
    .footer[data-state="cached"] .status-dot{background:#fde68a}.footer[data-state="error"] .status-dot{background:#fca5a5}
    .loading{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:8vmin;background:var(--bg);text-align:center;transition:opacity .25s ease}
    .loading[hidden]{display:none}.loading-title{font-size:32px;font-size:clamp(22px,4vmin,58px);font-weight:800}.loading-note{margin-top:1vmin;color:var(--muted);font-size:16px;font-size:clamp(12px,1.8vmin,25px)}
    body[data-layout="minimal"] .main{justify-content:center}
    body[data-layout="minimal"] .header{position:absolute;left:clamp(24px,5.5vmin,78px);top:clamp(24px,5.5vmin,78px);right:clamp(24px,5.5vmin,78px)}
    body[data-layout="minimal"] .details,body[data-layout="minimal"] .forecast{display:none}
    body[data-details="false"] .details{display:none}
    body[data-forecast="false"] .forecast{display:none}
    @media (orientation:portrait){
      .weather{padding:8vmin 6vmin}
      .main{flex-direction:column;justify-content:center;gap:5vmin}
      .details{width:100%;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.5vmin}
      .detail{flex-direction:column;align-items:center;text-align:center;gap:.5vmin}
      .temperature-value{font-size:clamp(100px,30vw,310px)}
      .forecast{padding-top:4vmin}
      body[data-layout="minimal"] .header{left:6vmin;top:8vmin;right:6vmin}
    }
    @media (max-width:520px){
      .details{grid-template-columns:1fr}.detail{display:none}.detail:first-child{display:flex}
      .forecast-day:nth-child(n+4){display:none}.forecast{grid-template-columns:repeat(3,1fr)!important}
    }
  </style>
</head>
<body data-theme="${config.theme}" data-layout="${config.layout}" data-details="${config.showDetails}" data-forecast="${config.showForecast}">
  <main class="weather" aria-live="polite">
    <header class="header">
      <div><div class="location" id="location">${escapeHtml(config.city)}</div><div class="condition" id="condition">—</div></div>
      <div class="weather-icon" id="current-icon" aria-hidden="true">◌</div>
    </header>
    <section class="main">
      <div class="temperature"><span class="temperature-value" id="temperature">--</span><span class="temperature-unit" id="temperature-unit">°${config.units === "imperial" ? "F" : "C"}</span></div>
      <div class="details">
        <div class="detail"><span class="detail-label" id="feels-label"></span><span class="detail-value" id="feels">--</span></div>
        <div class="detail"><span class="detail-label" id="humidity-label"></span><span class="detail-value" id="humidity">--</span></div>
        <div class="detail"><span class="detail-label" id="wind-label"></span><span class="detail-value" id="wind">--</span></div>
      </div>
    </section>
    <section class="forecast" id="forecast"></section>
  </main>
  <div class="footer" id="footer" data-state="loading"><span class="status-dot"></span><span id="status"></span><span aria-hidden="true">·</span><span>Open-Meteo</span></div>
  <div class="loading" id="loading"><div><div class="loading-title" id="loading-title"></div><div class="loading-note" id="loading-note"></div></div></div>
  <script>
    (function(){
      "use strict";
      var config=${configJson};
      var copy={
        tr:{loading:"Hava durumu yükleniyor",wait:"Güncel veriler alınıyor…",notFound:"Konum bulunamadı",unavailable:"Hava durumu şu anda alınamıyor",retry:"Bağlantı yeniden denenecek",feels:"Hissedilen",humidity:"Nem",wind:"Rüzgâr",updated:"Güncellendi",cached:"Önbellek",today:"Bugün",conditions:["Açık","Çoğunlukla açık","Parçalı bulutlu","Kapalı","Sisli","Çisenti","Yağmurlu","Karlı","Sağanak","Gök gürültülü"]},
        en:{loading:"Loading weather",wait:"Getting the latest conditions…",notFound:"Location not found",unavailable:"Weather is currently unavailable",retry:"The connection will be retried",feels:"Feels like",humidity:"Humidity",wind:"Wind",updated:"Updated",cached:"Cached",today:"Today",conditions:["Clear","Mostly clear","Partly cloudy","Overcast","Foggy","Drizzle","Rain","Snow","Showers","Thunderstorm"]}
      }[config.locale];
      var nodes={location:document.getElementById("location"),condition:document.getElementById("condition"),icon:document.getElementById("current-icon"),temperature:document.getElementById("temperature"),feels:document.getElementById("feels"),humidity:document.getElementById("humidity"),wind:document.getElementById("wind"),forecast:document.getElementById("forecast"),footer:document.getElementById("footer"),status:document.getElementById("status"),loading:document.getElementById("loading"),loadingTitle:document.getElementById("loading-title"),loadingNote:document.getElementById("loading-note")};
      document.getElementById("feels-label").textContent=copy.feels;
      document.getElementById("humidity-label").textContent=copy.humidity;
      document.getElementById("wind-label").textContent=copy.wind;
      nodes.loadingTitle.textContent=copy.loading;
      nodes.loadingNote.textContent=copy.wait;
      nodes.status.textContent=copy.loading;
      var cacheKey="remote-screen:weather:v2:"+config.city.toLocaleLowerCase()+":"+config.units;
      var busy=false;
      var lastSuccess=0;
      var retryTimer=0;

      function weatherInfo(code){
        code=Number(code);
        if(code===0)return{label:copy.conditions[0],icon:"☀"};
        if(code===1)return{label:copy.conditions[1],icon:"☀"};
        if(code===2)return{label:copy.conditions[2],icon:"◒"};
        if(code===3)return{label:copy.conditions[3],icon:"☁"};
        if(code===45||code===48)return{label:copy.conditions[4],icon:"≋"};
        if(code>=51&&code<=57)return{label:copy.conditions[5],icon:"☂"};
        if((code>=61&&code<=67))return{label:copy.conditions[6],icon:"☂"};
        if((code>=71&&code<=77)||(code>=85&&code<=86))return{label:copy.conditions[7],icon:"✣"};
        if(code>=80&&code<=82)return{label:copy.conditions[8],icon:"☂"};
        if(code>=95)return{label:copy.conditions[9],icon:"ϟ"};
        return{label:copy.conditions[3],icon:"☁"};
      }
      function formatDay(value,index){
        if(index===0)return copy.today;
        return new Intl.DateTimeFormat(config.locale==="tr"?"tr-TR":"en-US",{weekday:"short",timeZone:"UTC"}).format(new Date(value+"T12:00:00Z"));
      }
      function setStatus(state,time){
        nodes.footer.dataset.state=state;
        var stamp=new Intl.DateTimeFormat(config.locale==="tr"?"tr-TR":"en-US",{hour:"2-digit",minute:"2-digit"}).format(new Date(time));
        nodes.status.textContent=(state==="cached"?copy.cached:copy.updated)+" "+stamp;
      }
      function render(payload,state){
        var loc=payload.location;
        var data=payload.weather;
        var current=data.current||{};
        var daily=data.daily||{};
        var info=weatherInfo(current.weather_code);
        nodes.location.textContent=loc.name+(loc.admin1&&loc.admin1!==loc.name?", "+loc.admin1:"")+(loc.country_code?", "+String(loc.country_code).toUpperCase():"");
        nodes.condition.textContent=info.label;
        nodes.icon.textContent=info.icon;
        nodes.temperature.textContent=String(Math.round(Number(current.temperature_2m)));
        nodes.feels.textContent=Math.round(Number(current.apparent_temperature))+"°";
        nodes.humidity.textContent="%"+Math.round(Number(current.relative_humidity_2m));
        nodes.wind.textContent=Math.round(Number(current.wind_speed_10m))+" "+(config.units==="imperial"?"mph":"km/sa");
        nodes.forecast.textContent="";
        var count=Math.min(config.forecastDays,Array.isArray(daily.time)?daily.time.length:0);
        nodes.forecast.style.gridTemplateColumns="repeat("+count+",minmax(0,1fr))";
        for(var index=0;index<count;index+=1){
          var item=document.createElement("article");item.className="forecast-day";
          var name=document.createElement("div");name.className="forecast-name";name.textContent=formatDay(daily.time[index],index);
          var icon=document.createElement("div");icon.className="forecast-icon";icon.textContent=weatherInfo(daily.weather_code[index]).icon;
          var temp=document.createElement("div");temp.className="forecast-temp";temp.textContent=Math.round(Number(daily.temperature_2m_max[index]))+"°";
          var low=document.createElement("span");low.className="forecast-low";low.textContent=Math.round(Number(daily.temperature_2m_min[index]))+"°";
          temp.appendChild(low);item.appendChild(name);item.appendChild(icon);item.appendChild(temp);nodes.forecast.appendChild(item);
        }
        nodes.loading.hidden=true;
        lastSuccess=Number(payload.savedAt)||Date.now();
        setStatus(state,lastSuccess);
      }
      function readCache(){
        try{var value=localStorage.getItem(cacheKey);return value?JSON.parse(value):null}catch(error){return null}
      }
      function writeCache(value){
        try{localStorage.setItem(cacheKey,JSON.stringify(value))}catch(error){}
      }
      async function requestJson(url,signal){
        var response=await fetch(url,{signal:signal,cache:"no-store"});
        if(!response.ok)throw new Error("HTTP "+response.status);
        return response.json();
      }
      async function refresh(){
        if(busy)return;
        busy=true;
        var controller=typeof AbortController==="function"?new AbortController():{signal:undefined,abort:function(){}};
        var timeout=setTimeout(function(){controller.abort()},12000);
        try{
          var geoUrl="https://geocoding-api.open-meteo.com/v1/search?name="+encodeURIComponent(config.city)+"&count=1&language="+config.locale+"&format=json";
          var geo=await requestJson(geoUrl,controller.signal);
          if(!geo.results||!geo.results.length){throw new Error("LOCATION_NOT_FOUND")}
          var loc=geo.results[0];
          var unitArgs=config.units==="imperial"?"&temperature_unit=fahrenheit&wind_speed_unit=mph":"&temperature_unit=celsius&wind_speed_unit=kmh";
          var weatherUrl="https://api.open-meteo.com/v1/forecast?latitude="+encodeURIComponent(loc.latitude)+"&longitude="+encodeURIComponent(loc.longitude)+"&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5"+unitArgs;
          var weather=await requestJson(weatherUrl,controller.signal);
          if(!weather.current||!weather.daily)throw new Error("INVALID_WEATHER");
          var payload={location:{name:loc.name,admin1:loc.admin1,country_code:loc.country_code},weather:weather,savedAt:Date.now()};
          writeCache(payload);render(payload,"live");
          clearTimeout(retryTimer);
        }catch(error){
          var cached=readCache();
          if(cached&&cached.weather){render(cached,"cached")}
          else{
            nodes.loading.hidden=false;
            nodes.loadingTitle.textContent=error&&error.message==="LOCATION_NOT_FOUND"?copy.notFound:copy.unavailable;
            nodes.loadingNote.textContent=copy.retry;
            nodes.footer.dataset.state="error";
            nodes.status.textContent=copy.unavailable;
          }
          clearTimeout(retryTimer);
          retryTimer=setTimeout(refresh,60000);
        }finally{
          clearTimeout(timeout);busy=false;
        }
      }
      var cached=readCache();
      if(cached&&cached.weather)render(cached,"cached");
      refresh();
      setInterval(refresh,900000);
      window.__remoteScreenTick=function(){if(!busy&&Date.now()-lastSuccess>900000)refresh()};
      window.addEventListener("online",refresh);
      document.addEventListener("visibilitychange",function(){if(!document.hidden&&Date.now()-lastSuccess>900000)refresh()});
    })();
  </script>
</body>
</html>`;
}
