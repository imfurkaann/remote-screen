import { normalizeWeatherConfig, WEATHER_STYLES, WEATHER_ICONS, DEFAULT_WEATHER_CONFIG } from "./weather-design.js";
export { normalizeWeatherConfig, DEFAULT_WEATHER_CONFIG, type WeatherConfig } from "./weather-design.js";

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
  config.city = config.city.trim() || DEFAULT_WEATHER_CONFIG.city;
  const configJson = safeJson(config);

  return `<!doctype html>
<html lang="${config.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>${title}</title>
  <style>
    html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#fff}
    ${WEATHER_STYLES}
    .footer{position:absolute;bottom:1%;right:2%;color:#807c73;font:clamp(9px,1vw,14px) Arial,sans-serif}
    .loading{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:8%;background:#fff;text-align:center;color:#273331}
    .loading[hidden]{display:none}.loading-title{font:clamp(22px,4vw,58px) Georgia,serif}.loading-note{margin-top:1em;font:clamp(12px,1.8vw,25px) Arial,sans-serif;color:#807c73}
  </style>
</head>
<body data-theme="${config.theme}" data-layout="${config.layout}" data-details="${config.showDetails}" data-forecast="${config.showForecast}">
  <main class="elegant-weather" data-theme="paper" data-layout="${config.layout}" data-details="${config.showDetails}" data-forecast="${config.showForecast}" aria-live="polite">
    <div class="weather-heading">${escapeHtml(config.heading)}</div>
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
    <div class="weather-caption">${escapeHtml(config.caption)}</div>
  </main>
  <div class="footer" id="footer" data-state="loading"><span class="status-dot"></span><span id="status"></span><span aria-hidden="true">·</span><span>Open-Meteo</span></div>
  <div class="loading" id="loading"><div><div class="loading-title" id="loading-title"></div><div class="loading-note" id="loading-note"></div></div></div>
  <script>
    (function(){
      "use strict";
      var config=${configJson};
      var icons=${safeJson(WEATHER_ICONS)};
      function resize(){document.querySelector(".elegant-weather").classList.toggle("portrait",window.innerHeight>window.innerWidth)}
      resize();window.addEventListener("resize",resize);
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
        nodes.icon.innerHTML=icons[info.icon];
        nodes.temperature.textContent=String(Math.round(Number(current.temperature_2m)));
        nodes.feels.textContent=Math.round(Number(current.apparent_temperature))+"°";
        nodes.humidity.textContent=Math.round(Number(current.relative_humidity_2m))+"%";
        nodes.wind.textContent=Math.round(Number(current.wind_speed_10m))+" "+(config.units==="imperial"?"mph":"km/h");
        nodes.forecast.textContent="";
        var count=Math.min(config.forecastDays,Array.isArray(daily.time)?daily.time.length:0);
        nodes.forecast.style.gridTemplateColumns="repeat("+count+",minmax(0,1fr))";
        for(var index=0;index<count;index+=1){
          var item=document.createElement("article");item.className="forecast-day";
          var name=document.createElement("div");name.className="forecast-name";name.textContent=formatDay(daily.time[index],index);
          var icon=document.createElement("div");icon.className="forecast-icon";icon.innerHTML=icons[weatherInfo(daily.weather_code[index]).icon];
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
