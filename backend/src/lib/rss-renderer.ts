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

export type RssItem = {
  title: string;
  description: string;
  link: string;
  publishedAt: string;
};

export type ParsedRssFeed = {
  feedTitle: string;
  items: RssItem[];
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

export function normalizeRssConfig(input: Record<string, unknown> = {}): RssConfig {
  const rawUrl = typeof input.rssUrl === "string" ? input.rssUrl.trim().slice(0, 2048) : "";
  const rawLabel = typeof input.sourceLabel === "string" ? input.sourceLabel.trim().slice(0, 50) : "";
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
    rssUrl: rawUrl || DEFAULT_RSS_CONFIG.rssUrl,
    sourceLabel: rawLabel || DEFAULT_RSS_CONFIG.sourceLabel,
    locale: input.locale === "en" ? "en" : "tr",
    layout: input.layout === "ticker" || input.layout === "cards" ? input.layout : "split",
    theme,
    speed: input.speed === "slow" || input.speed === "fast" ? input.speed : "medium",
    maxItems: input.maxItems === 5 || input.maxItems === 20 ? input.maxItems : 10,
    showDescription: input.showDescription !== false,
    showTimestamp: input.showTimestamp !== false
  };
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
    const numeric = code[1]?.toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
    return Number.isFinite(numeric) && numeric > 0 && numeric <= 0x10ffff ? String.fromCodePoint(numeric) : "";
  });
}

function cleanText(value: string, maxLength: number): string {
  return decodeEntities(
    value
      .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, "$1")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function extractTag(block: string, names: string[]): string {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = block.match(new RegExp(`<(?:[\\w-]+:)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${escaped}>`, "i"));
    if (match?.[1]) return match[1];
  }
  return "";
}

function safePublishedAt(value: string): string {
  const date = new Date(cleanText(value, 100));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function safeLink(value: string): string {
  try {
    const url = new URL(cleanText(value, 2048));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function parseRssXml(xml: string, limit = 25): ParsedRssFeed {
  const boundedLimit = Math.max(1, Math.min(25, Math.trunc(limit)));
  const items: RssItem[] = [];
  const blocks = [...xml.matchAll(/<(?:[\w-]+:)?item\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?item>/gi)];
  const entries = blocks.length > 0 ? blocks : [...xml.matchAll(/<(?:[\w-]+:)?entry\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?entry>/gi)];

  for (const match of entries.slice(0, boundedLimit)) {
    const block = match[1] ?? "";
    const atomLink = block.match(/<(?:[\w-]+:)?link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\/?>/i)?.[1] ?? "";
    const title = cleanText(extractTag(block, ["title"]), 240);
    if (!title) continue;
    items.push({
      title,
      description: cleanText(extractTag(block, ["description", "summary", "encoded", "content"]), 700),
      link: safeLink(extractTag(block, ["link"]) || atomLink),
      publishedAt: safePublishedAt(extractTag(block, ["pubDate", "published", "updated", "date"]))
    });
  }

  const firstEntryIndex = Math.min(
    ...[xml.search(/<(?:[\w-]+:)?item\b/i), xml.search(/<(?:[\w-]+:)?entry\b/i)].filter((index) => index >= 0),
    xml.length
  );
  const header = xml.slice(0, firstEntryIndex);
  return {
    feedTitle: cleanText(extractTag(header, ["title"]), 120),
    items
  };
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function renderRssHtml(title: string, rawConfig: Record<string, unknown> = {}): string {
  const config = normalizeRssConfig(rawConfig);
  const configJson = safeJson(config);
  const tickerSeconds = config.speed === "slow" ? 85 : config.speed === "fast" ? 38 : 58;
  const cardSeconds = config.speed === "slow" ? 15 : config.speed === "fast" ? 6 : 10;

  return `<!doctype html>
<html lang="${config.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>${title}</title>
  <style>
    *{box-sizing:border-box}
    :root{color-scheme:dark;--bg:linear-gradient(145deg,#09090b 0%,#18181b 55%,#27272a 100%);--surface:rgba(255,255,255,.055);--text:#fafafa;--muted:#a1a1aa;--line:rgba(255,255,255,.1);--accent:#fbbf24;--accentText:#18181b}
    body[data-theme="paper"]{color-scheme:light;--bg:linear-gradient(145deg,#fff 0%,#f5f5f4 100%);--surface:rgba(255,255,255,.76);--text:#1c1917;--muted:#78716c;--line:rgba(28,25,23,.11);--accent:#b91c1c;--accentText:#fff}
    body[data-theme="signal"]{--bg:linear-gradient(145deg,#180707 0%,#3f0b0b 48%,#7f1d1d 100%);--surface:rgba(255,255,255,.07);--text:#fff7ed;--muted:#fecaca;--line:rgba(255,255,255,.13);--accent:#fb7185;--accentText:#270606}
    body[data-theme="ocean"]{--bg:linear-gradient(145deg,#071a24 0%,#0c4a6e 50%,#075985 100%);--surface:rgba(255,255,255,.075);--text:#f0f9ff;--muted:#bae6fd;--line:rgba(255,255,255,.14);--accent:#67e8f9;--accentText:#083344}
    html,body,#content{width:100%;height:100%;margin:0;overflow:hidden}
    body{position:relative;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body:before{content:"";position:absolute;width:60vmin;height:60vmin;right:-24vmin;top:-34vmin;border-radius:50%;background:var(--accent);opacity:.09;filter:blur(10vmin)}
    button{font:inherit}
    .shell{position:relative;z-index:1;width:100%;height:100%;padding:clamp(25px,5.5vmin,78px)}
    .eyebrow{color:var(--accent);font-size:clamp(11px,1.35vmin,19px);font-weight:900;letter-spacing:.14em;text-transform:uppercase}
    .muted{color:var(--muted)}
    .status{position:absolute;right:clamp(14px,2.5vmin,38px);bottom:clamp(9px,1.5vmin,22px);z-index:8;display:flex;align-items:center;gap:.65vmin;color:var(--muted);font-size:clamp(9px,1.05vmin,15px);font-weight:650}
    .status-dot{width:.6em;height:.6em;border-radius:50%;background:#86efac}.status[data-state="cached"] .status-dot{background:#fde68a}.status[data-state="error"] .status-dot{background:#fca5a5}
    .loading{position:absolute;inset:0;z-index:10;display:grid;place-items:center;padding:8vmin;background:var(--bg);text-align:center}
    .loading[hidden]{display:none}.loading-title{font-size:clamp(22px,4vmin,58px);font-weight:800}.loading-note{margin-top:1vmin;color:var(--muted);font-size:clamp(12px,1.8vmin,25px)}
    .ticker-layout{display:flex;flex-direction:column;justify-content:space-between}
    .ticker-top{display:flex;justify-content:space-between;color:var(--muted);font-size:clamp(10px,1.25vmin,18px);font-weight:800;letter-spacing:.13em;text-transform:uppercase}
    .ticker-message{max-width:75%;margin-bottom:14vh;font-size:clamp(33px,6vmin,86px);font-weight:790;line-height:1.05;letter-spacing:-.045em}
    .ticker-bar{position:absolute;inset:auto 0 0;height:clamp(82px,20vh,190px);display:flex;align-items:center;overflow:hidden;border-top:1px solid var(--line);background:var(--surface);backdrop-filter:blur(14px)}
    .ticker-label{align-self:stretch;z-index:2;display:grid;place-items:center;flex-shrink:0;padding:0 clamp(18px,3.7vw,70px);background:var(--accent);color:var(--accentText);font-size:clamp(12px,1.6vw,26px);font-weight:950;letter-spacing:.1em;text-transform:uppercase}
    .ticker-window{overflow:hidden;min-width:0}.ticker-track{display:flex;width:max-content;white-space:nowrap;will-change:transform;animation:ticker ${tickerSeconds}s linear infinite}
    .ticker-item{display:inline-flex;align-items:center;padding-left:clamp(34px,5vw,90px);font-size:clamp(20px,3vw,46px);font-weight:720}
    .ticker-item:after{content:"";width:.32em;height:.32em;margin-left:clamp(34px,5vw,90px);border-radius:50%;background:var(--accent)}
    @keyframes ticker{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}
    .card-layout{display:flex;flex-direction:column;justify-content:space-between}
    .card-head,.card-foot{display:flex;align-items:center;justify-content:space-between;gap:3vmin}
    .counter{color:var(--muted);font-size:clamp(10px,1.3vmin,18px);font-variant-numeric:tabular-nums}
    .story{animation:storyIn .55s ease both}.story-title{max-width:88%;font-size:clamp(42px,7.3vmin,104px);font-weight:790;line-height:1.01;letter-spacing:-.052em}
    .story-desc{max-width:74%;margin:2.6vmin 0 0;color:var(--muted);font-size:clamp(15px,2.15vmin,31px);line-height:1.52}
    .progress{width:min(28vw,420px);height:4px;border-radius:999px;background:var(--line);overflow:hidden}.progress span{display:block;width:100%;height:100%;background:var(--accent);transform-origin:left;animation:progress ${cardSeconds}s linear}
    @keyframes progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}@keyframes storyIn{from{opacity:0;transform:translateY(1.5vmin)}to{opacity:1;transform:none}}
    .split-layout{display:grid;grid-template-columns:minmax(0,1.42fr) minmax(300px,.58fr)}
    .lead{display:flex;flex-direction:column;justify-content:space-between;padding-right:8%}
    .lead-title{font-size:clamp(36px,6vmin,86px);font-weight:790;line-height:1.03;letter-spacing:-.05em}
    .lead-desc{margin:2.2vmin 0 0;color:var(--muted);font-size:clamp(14px,1.85vmin,27px);line-height:1.5}
    .lead-time{color:var(--muted);font-size:clamp(10px,1.25vmin,18px)}
    .rail{display:flex;flex-direction:column;justify-content:center;padding-left:12%;border-left:1px solid var(--line)}
    .rail-item{padding:2.4vmin 0;border-top:1px solid var(--line);color:var(--muted);font-size:clamp(13px,1.65vmin,24px);font-weight:700;line-height:1.35}
    .rail-item:first-child{border-top:0}.rail-index{display:block;margin-bottom:.7vmin;color:var(--accent);font-size:.68em;letter-spacing:.1em}
    @media (orientation:portrait){
      .shell{padding:8vmin 6vmin}.ticker-message{max-width:94%;margin-bottom:16vh}
      .ticker-bar{height:16vh}.story-title{max-width:100%;font-size:clamp(42px,10vw,104px)}.story-desc{max-width:94%}
      .split-layout{grid-template-columns:1fr;grid-template-rows:minmax(0,1.25fr) minmax(220px,.75fr)}
      .lead{padding:0 0 7%}.rail{display:grid;grid-template-columns:repeat(2,1fr);gap:4vmin;padding:7% 0 0;border-left:0;border-top:1px solid var(--line)}
      .rail-item{padding:0;border:0}.lead-title{font-size:clamp(38px,9vw,90px)}
    }
  </style>
</head>
<body data-theme="${config.theme}">
  <main id="content" aria-live="polite"></main>
  <div class="status" id="status" data-state="loading"><span class="status-dot"></span><span id="status-text"></span></div>
  <div class="loading" id="loading"><div><div class="loading-title" id="loading-title"></div><div class="loading-note" id="loading-note"></div></div></div>
  <script>
    (function(){
      "use strict";
      var config=${configJson};
      var copy={
        tr:{loading:"RSS akışı yükleniyor",wait:"Güncel içerikler hazırlanıyor…",empty:"Akışta gösterilecek içerik bulunamadı",unavailable:"RSS akışına şu anda ulaşılamıyor",retry:"Bağlantı yeniden denenecek",live:"Canlı akış",headline:"Gündemi ekranda, sade ve kesintisiz biçimde takip edin.",updated:"Güncellendi",cached:"Önbellek",ago:"önce"},
        en:{loading:"Loading RSS feed",wait:"Preparing the latest stories…",empty:"There are no stories to display",unavailable:"The RSS feed is currently unavailable",retry:"The connection will be retried",live:"Live feed",headline:"Follow the latest stories in a clear, uninterrupted format.",updated:"Updated",cached:"Cached",ago:"ago"}
      }[config.locale];
      var content=document.getElementById("content"),status=document.getElementById("status"),statusText=document.getElementById("status-text"),loading=document.getElementById("loading"),loadingTitle=document.getElementById("loading-title"),loadingNote=document.getElementById("loading-note");
      loadingTitle.textContent=copy.loading;loadingNote.textContent=copy.wait;statusText.textContent=copy.loading;
      var cacheKey="remote-screen:rss:v3:"+config.rssUrl;
      var items=[],currentIndex=0,busy=false,rotateTimer=0,retryTimer=0,lastSuccess=0;
      var rotationMs=${cardSeconds * 1000};
      function el(tag,className,text){var node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
      function formatTime(value){
        if(!config.showTimestamp||!value)return"";
        var time=new Date(value).getTime();if(!Number.isFinite(time))return"";
        var minutes=Math.max(1,Math.round((Date.now()-time)/60000));
        if(minutes<60)return minutes+" "+(config.locale==="tr"?"dk":"min")+" "+copy.ago;
        var hours=Math.round(minutes/60);if(hours<24)return hours+" "+(config.locale==="tr"?"sa":"hr")+" "+copy.ago;
        return new Intl.DateTimeFormat(config.locale==="tr"?"tr-TR":"en-US",{day:"numeric",month:"short"}).format(new Date(time));
      }
      function setStatus(state,time){
        status.dataset.state=state;
        var stamp=new Intl.DateTimeFormat(config.locale==="tr"?"tr-TR":"en-US",{hour:"2-digit",minute:"2-digit"}).format(new Date(time));
        statusText.textContent=(state==="cached"?copy.cached:copy.updated)+" "+stamp;
      }
      function renderTicker(){
        content.replaceChildren();content.className="shell ticker-layout";
        var top=el("div","ticker-top");top.append(el("span","",config.sourceLabel),el("span","",copy.live));content.append(top,el("div","ticker-message",copy.headline));
        var bar=el("div","ticker-bar"),label=el("div","ticker-label",config.sourceLabel),windowNode=el("div","ticker-window"),track=el("div","ticker-track");
        for(var repeat=0;repeat<2;repeat+=1){items.forEach(function(item){track.append(el("div","ticker-item",item.title))})}
        windowNode.append(track);bar.append(label,windowNode);content.append(bar);
      }
      function renderCard(){
        clearTimeout(rotateTimer);content.replaceChildren();content.className="shell card-layout";
        var item=items[currentIndex%items.length],head=el("div","card-head"),foot=el("div","card-foot"),story=el("article","story");
        head.append(el("span","eyebrow",config.sourceLabel),el("span","counter",String(currentIndex%items.length+1).padStart(2,"0")+" / "+String(items.length).padStart(2,"0")));
        story.append(el("div","story-title",item.title));
        if(config.showDescription&&item.description)story.append(el("p","story-desc",item.description));
        var progress=el("span","progress");progress.append(el("span",""));
        foot.append(el("span","muted",formatTime(item.publishedAt)),progress);content.append(head,story,foot);
        rotateTimer=setTimeout(function(){currentIndex=(currentIndex+1)%items.length;renderCard()},rotationMs);
      }
      function renderSplit(){
        clearTimeout(rotateTimer);content.replaceChildren();content.className="shell split-layout";
        var item=items[currentIndex%items.length],lead=el("section","lead"),top=el("div"),story=el("div"),rail=el("aside","rail");
        top.append(el("span","eyebrow",config.sourceLabel));story.append(el("div","lead-title",item.title));
        if(config.showDescription&&item.description)story.append(el("p","lead-desc",item.description));
        lead.append(top,story,el("span","lead-time",formatTime(item.publishedAt)));
        for(var offset=1;offset<Math.min(items.length,4);offset+=1){var next=items[(currentIndex+offset)%items.length],row=el("div","rail-item");row.append(el("span","rail-index",String(offset+1).padStart(2,"0")),document.createTextNode(next.title));rail.append(row)}
        content.append(lead,rail);
        rotateTimer=setTimeout(function(){currentIndex=(currentIndex+1)%items.length;renderSplit()},rotationMs);
      }
      function render(payload,state){
        items=(Array.isArray(payload.items)?payload.items:[]).slice(0,config.maxItems);
        if(!items.length)throw new Error("EMPTY");
        currentIndex=currentIndex%items.length;
        if(config.layout==="ticker")renderTicker();else if(config.layout==="cards")renderCard();else renderSplit();
        loading.hidden=true;lastSuccess=Number(payload.savedAt)||Date.now();setStatus(state,lastSuccess);
      }
      function readCache(){try{var value=localStorage.getItem(cacheKey);return value?JSON.parse(value):null}catch(error){return null}}
      function writeCache(value){try{localStorage.setItem(cacheKey,JSON.stringify(value))}catch(error){}}
      async function refresh(){
        if(busy)return;busy=true;
        var controller=new AbortController(),timeout=setTimeout(function(){controller.abort()},10000);
        try{
          var response=await fetch("/api/v1/apps/rss-proxy?url="+encodeURIComponent(config.rssUrl),{signal:controller.signal,cache:"no-store"});
          if(!response.ok)throw new Error("HTTP "+response.status);
          var data=await response.json();if(!Array.isArray(data.items)||!data.items.length)throw new Error("EMPTY");
          var payload={items:data.items,feedTitle:data.feedTitle||"",savedAt:Date.now()};writeCache(payload);render(payload,data.stale?"cached":"live");clearTimeout(retryTimer);
        }catch(error){
          var cached=readCache();
          if(cached&&Array.isArray(cached.items)&&cached.items.length)render(cached,"cached");
          else{loading.hidden=false;loadingTitle.textContent=error&&error.message==="EMPTY"?copy.empty:copy.unavailable;loadingNote.textContent=copy.retry;status.dataset.state="error";statusText.textContent=copy.unavailable}
          clearTimeout(retryTimer);retryTimer=setTimeout(refresh,60000);
        }finally{clearTimeout(timeout);busy=false}
      }
      var cached=readCache();if(cached&&Array.isArray(cached.items)&&cached.items.length){try{render(cached,"cached")}catch(error){}}
      refresh();
      setInterval(refresh,600000+Math.floor(Math.random()*120000));
      window.addEventListener("online",refresh);
      document.addEventListener("visibilitychange",function(){if(!document.hidden&&Date.now()-lastSuccess>600000)refresh()});
    })();
  </script>
</body>
</html>`;
}
