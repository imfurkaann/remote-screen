"use client";
import { useState } from "react";
import { DEFAULT_WEATHER_CONFIG, WEATHER_TEMPLATES, WEATHER_STYLES, WEATHER_ICONS, normalizeWeatherConfig, type WeatherConfig } from "../../lib/weather-design";
export { DEFAULT_WEATHER_CONFIG, WEATHER_TEMPLATES, normalizeWeatherConfig, type WeatherConfig };

export function WeatherSettings({ config: raw, onChange }: { config: Record<string, unknown>; onChange: (next: WeatherConfig) => void }) {
  const config = normalizeWeatherConfig(raw);
  const update = (patch: Partial<WeatherConfig>) => onChange({ ...config, ...patch });
  return <div className="clock-settings">
    <h3>Weather settings</h3>
    <label>Display type<select value={config.layout} onChange={e => update({ layout:e.target.value as WeatherConfig["layout"] })}>{WEATHER_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label>City or location<input maxLength={120} value={config.city} placeholder="e.g. London" onChange={e => update({ city:e.target.value })} /></label>
    <label>Temperature unit<select value={config.units} onChange={e => update({ units:e.target.value as WeatherConfig["units"] })}><option value="metric">Celsius (°C · km/h)</option><option value="imperial">Fahrenheit (°F · mph)</option></select></label>
    <label>Weather language<select value={config.locale} onChange={e => update({ locale:e.target.value as WeatherConfig["locale"] })}><option value="en">English</option><option value="tr">Turkish</option></select></label>
    <label>Heading<input maxLength={80} value={config.heading} onChange={e => update({ heading:e.target.value })} /></label>
    <label>Caption<textarea maxLength={140} value={config.caption} onChange={e => update({ caption:e.target.value })} /></label>
    {config.layout !== "minimal" && <>
      <label className="clock-toggle">Show forecast<input type="checkbox" checked={config.showForecast} onChange={e => update({ showForecast:e.target.checked })} /></label>
      {config.showForecast && <label>Forecast length<select value={config.forecastDays} onChange={e => update({ forecastDays:Number(e.target.value) as 3 | 5 })}><option value={3}>3 days</option><option value={5}>5 days</option></select></label>}
      <label className="clock-toggle">Show details<input type="checkbox" checked={config.showDetails} onChange={e => update({ showDetails:e.target.checked })} /></label>
    </>}
    <p style={{fontSize:11, lineHeight:1.5, color:"#64748b"}}>Design colors are fixed. Preview values are examples; published screens load live weather for your location.</p>
  </div>;
}
export function WeatherTools(props: { config: Record<string, unknown>; onChange: (next: WeatherConfig) => void }) {
  const [open,setOpen] = useState(false);
  return <aside className="restaurant-editor-rail weather-editor-rail">
    <button type="button" className="restaurant-tool-tile" aria-label="Weather settings" aria-expanded={open} onClick={() => setOpen(!open)}><span className="restaurant-tool-icon">☀</span>Weather</button>
    {open && <div className="restaurant-text-panel clock-options-panel"><button type="button" className="clock-panel-close" aria-label="Close weather settings" onClick={() => setOpen(false)}>×</button><WeatherSettings {...props}/></div>}
  </aside>;
}
export function WeatherPreview({ config:raw, onChange, orientation="landscape" }: { config:Record<string,unknown>; onChange?:(next:WeatherConfig)=>void; orientation?:"landscape"|"portrait" }) {
  const config=normalizeWeatherConfig(raw);
  const [editing,setEditing]=useState<"heading"|"caption"|"city"|null>(null);
  const editable=(key:"heading"|"caption"|"city") => !onChange ? config[key] : editing===key
    ? <input className="editable-weather" autoFocus aria-label={"Edit "+key} maxLength={key==="heading"?80:key==="city"?120:140} value={config[key]} onChange={e=>onChange({...config,[key]:e.target.value})} onBlur={()=>setEditing(null)} onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape"){e.preventDefault();setEditing(null);}}}/>
    : <button type="button" className="editable-weather" aria-label={"Edit "+key} onClick={()=>setEditing(key)}>{config[key]||"Add "+key}</button>;
  const imperial=config.units==="imperial";
  const temp=(c:number)=>imperial?Math.round(c*9/5+32):c;
  const tr=config.locale==="tr";
  const labels=tr?["Hissedilen","Nem","Rüzgâr"]:["Feels like","Humidity","Wind"];
  const days=tr?["Bugün","Yarın","Çar","Per","Cum"]:["Today","Tomorrow","Wed","Thu","Fri"];
  return <><style>{WEATHER_STYLES}</style><div className={"elegant-weather "+orientation} data-testid="weather-canvas" data-layout={config.layout} data-details={config.showDetails} data-forecast={config.showForecast}>
    <div className="weather-heading">{editable("heading")}</div>
    <header className="header"><div><div className="location">{editable("city")}</div><div className="condition">{tr?"Parçalı bulutlu":"Partly cloudy"}</div></div><div className="weather-icon" aria-hidden="true" dangerouslySetInnerHTML={{__html:WEATHER_ICONS["◒"]!}} /></header>
    <section className="main"><div className="temperature"><span className="temperature-value">{temp(22)}</span><span className="temperature-unit">°{imperial?"F":"C"}</span></div>
      <div className="details">{[temp(21)+"°","64%",imperial?"7 mph":"12 km/h"].map((value,i)=><div className="detail" key={i}><span className="detail-label">{labels[i]}</span><span className="detail-value">{value}</span></div>)}</div>
    </section>
    <section className="forecast" style={{gridTemplateColumns:`repeat(${config.forecastDays},minmax(0,1fr))`}}>{[24,22,20,21,23].slice(0,config.forecastDays).map((high,i)=><article className="forecast-day" key={i}><div className="forecast-name">{days[i]}</div><div className="forecast-icon" dangerouslySetInnerHTML={{__html:WEATHER_ICONS[["☀","☁","☂","☁","☀"][i]!]!}} /><div className="forecast-temp">{temp(high)}°<span className="forecast-low">{temp(high-6)}°</span></div></article>)}</section>
    <div className="weather-caption">{editable("caption")}</div>
  </div></>;
}
