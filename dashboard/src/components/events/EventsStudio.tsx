"use client";
import { useEffect,useState } from "react";
import { DEFAULT_EVENTS_CONFIG, EVENTS_TEMPLATES, EVENTS_STYLES, normalizeEventsConfig, eventStatus, type EventsConfig,type HotelEvent } from "../../lib/events-design";
export { DEFAULT_EVENTS_CONFIG, EVENTS_TEMPLATES, normalizeEventsConfig, type EventsConfig,type HotelEvent };
const arrows={left:"←",right:"→",up:"↑"};
function Editable({value,label,max=100,type="text",onChange}:{value:string;label:string;max?:number;type?:string;onChange?: ((v:string)=>void)|undefined}){
  const [editing,setEditing]=useState(false);
  if(!onChange)return <>{value}</>;
  return editing?<input className="events-edit" aria-label={label} autoFocus type={type} maxLength={max} value={value} onChange={e=>onChange(e.target.value)} onBlur={()=>setEditing(false)} onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape"){e.preventDefault();setEditing(false)}}}/>:<button type="button" className="events-edit" aria-label={label} onClick={()=>setEditing(true)}>{value||"Add text"}</button>;
}
export function EventsSettings({config:raw,onChange}:{config:Record<string,unknown>;onChange:(next:EventsConfig)=>void}){
  const c=normalizeEventsConfig(raw);
  const set=(patch:Partial<EventsConfig>)=>onChange({...c,...patch});
  const patch=(index:number,value:Partial<HotelEvent>)=>set({events:c.events.map((e,i)=>i===index?{...e,...value}:e)});
  return <div className="clock-settings"><h3>Events & meetings</h3>
    <label>Display type<select value={c.layout} onChange={e=>set({layout:e.target.value as EventsConfig["layout"]})}>{EVENTS_TEMPLATES.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label>Venue or organization<input maxLength={80} value={c.hotelName} onChange={e=>set({hotelName:e.target.value})}/></label>
    <label>Heading<input maxLength={100} value={c.heading} onChange={e=>set({heading:e.target.value})}/></label>
    <label>Time zone<select value={c.timezone} onChange={e=>set({timezone:e.target.value})}>{Array.from(new Set(["local",c.timezone,...Intl.supportedValuesOf("timeZone")])).map(z=><option key={z} value={z}>{z==="local"?"Device local time":z.replaceAll("_"," ")}</option>)}</select></label>
    <label>Display language<select value={c.locale} onChange={e=>set({locale:e.target.value as "tr"|"en"})}><option value="en">English</option><option value="tr">Turkish</option></select></label>
    <label className="clock-toggle">Show organizer<input type="checkbox" checked={c.showHost} onChange={e=>set({showHost:e.target.checked})}/></label>
    <label className="clock-toggle">Show directions<input type="checkbox" checked={c.showDirection} onChange={e=>set({showDirection:e.target.checked})}/></label>
    <label>Footer<textarea maxLength={180} value={c.footer} onChange={e=>set({footer:e.target.value})}/></label>
    <button type="button" disabled={c.events.length>=10} onClick={()=>set({events:[...c.events,{id:"event-"+Date.now(),title:"New Meeting",host:"",room:"",start:"09:00",end:"10:00",direction:"right"}]})}>Add meeting ({c.events.length}/10)</button>
    {c.events.map((e,i)=><details key={e.id} style={{border:"1px solid #e6e2dc",padding:10,borderRadius:6}}>
      <summary style={{cursor:"pointer",fontSize:12}}>{i+1}. {e.title||"Untitled meeting"}</summary>
      <div className="clock-settings" style={{marginTop:12}}>
        <label>Meeting title<input maxLength={100} value={e.title} onChange={v=>patch(i,{title:v.target.value})}/></label>
        <label>Organizer<input maxLength={80} value={e.host} onChange={v=>patch(i,{host:v.target.value})}/></label>
        <label>Room<input maxLength={60} value={e.room} onChange={v=>patch(i,{room:v.target.value})}/></label>
        <label>Start time<input type="time" value={e.start} onChange={v=>patch(i,{start:v.target.value})}/></label>
        <label>End time<input type="time" value={e.end} onChange={v=>patch(i,{end:v.target.value})}/></label>
        <label>Direction<select value={e.direction} onChange={v=>patch(i,{direction:v.target.value as HotelEvent["direction"]})}><option value="left">← Left</option><option value="right">→ Right</option><option value="up">↑ Ahead</option></select></label>
        <button type="button" onClick={()=>set({events:c.events.filter((_,n)=>n!==i)})}>Remove meeting</button>
      </div>
    </details>)}
    <p style={{fontSize:11,color:"#807c73",lineHeight:1.5}}>Daily schedule. Status follows the selected time zone. Up to 10 meetings; published screens rotate pages every 12 seconds. Design colors are fixed.</p>
  </div>;
}
export function EventsTools(props:{config:Record<string,unknown>;onChange:(next:EventsConfig)=>void}){
  const [open,setOpen]=useState(false);
  return <aside className="restaurant-editor-rail events-editor-rail"><button type="button" className="restaurant-tool-tile" aria-label="Event settings" aria-expanded={open} onClick={()=>setOpen(!open)}><span className="restaurant-tool-icon">▤</span>Events</button>{open&&<div className="restaurant-text-panel clock-options-panel"><button type="button" className="clock-panel-close" aria-label="Close event settings" onClick={()=>setOpen(false)}>×</button><EventsSettings {...props}/></div>}</aside>;
}
export function EventsPreview({config:raw,onChange,orientation="landscape"}:{config:Record<string,unknown>;onChange?:(next:EventsConfig)=>void;orientation?:"landscape"|"portrait"}){
  const c=normalizeEventsConfig(raw);
  const [now,setNow]=useState<Date|null>(null),[page,setPage]=useState(0);
  useEffect(()=>{setNow(new Date());const timer=setInterval(()=>setNow(new Date()),30000);return()=>clearInterval(timer)},[]);
  const date=now??new Date("2026-01-01T08:00:00Z"),timeZone=c.timezone==="local"?undefined:c.timezone;
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  const current=Number(parts.find(p=>p.type==="hour")?.value)*60+Number(parts.find(p=>p.type==="minute")?.value);
  const pages=Math.max(1,Math.ceil(c.events.length/4)),index=Math.min(page,pages-1);
  const words=c.locale==="tr"?{live:"ŞİMDİ",next:"YAKLAŞAN",done:"TAMAMLANDI"}:{live:"NOW",next:"UPCOMING",done:"FINISHED"};
  const edit=(key:"hotelName"|"heading"|"footer",label:string,max:number)=><Editable value={c[key]} label={label} max={max} onChange={onChange?v=>onChange({...c,[key]:v}):undefined}/>;
  return <><style>{EVENTS_STYLES}</style><div className={"elegant-events "+orientation} data-testid="events-canvas" data-layout={c.layout} data-directions={c.showDirection}>
    <header className="events-header"><div><div className="events-brand">{edit("hotelName","Edit venue",80)}</div><h2 className="events-heading">{edit("heading","Edit heading",100)}</h2></div><time className="events-date">{new Intl.DateTimeFormat(c.locale==="tr"?"tr-TR":"en-GB",{timeZone,weekday:"long",day:"numeric",month:"long"}).format(date)}</time></header>
    <section className="events-list">{c.events.slice(index*4,index*4+4).map((e,i)=>{
      const state=eventStatus(e.start,e.end,current),n=index*4+i;
      const field=(key:"title"|"host"|"room"|"start"|"end",max:number)=><Editable value={e[key]} label={"Edit "+key+" "+(n+1)} max={max} type={key==="start"||key==="end"?"time":"text"} onChange={onChange?v=>onChange({...c,events:c.events.map((x,j)=>j===n?{...x,[key]:v}:x)}):undefined}/>;
      return <article className="meeting" data-state={state} key={e.id}><div className="meeting-time">{field("start",5)}<span className="meeting-end">{field("end",5)}</span></div><div className="meeting-copy"><div className="meeting-title">{field("title",100)}</div>{c.showHost&&<div className="meeting-host">{field("host",80)}</div>}</div><div className="meeting-room">{field("room",60)}<span className="meeting-status">{words[state]}</span></div>{c.showDirection&&<span className="meeting-arrow">{arrows[e.direction]}</span>}</article>;
    })}{!c.events.length&&<p className="events-empty">{c.locale==="tr"?"Planlanan toplantı yok":"No meetings scheduled"}</p>}</section>
    <footer className="events-footer"><span className="events-footer-text">{edit("footer","Edit footer",180)}</span>{pages>1&&<span className="events-pages">{onChange&&<button type="button" className="events-edit" aria-label="Previous meetings" onClick={()=>setPage((index+pages-1)%pages)}>← </button>}{index+1} / {pages}{onChange&&<button type="button" className="events-edit" aria-label="Next meetings" onClick={()=>setPage((index+1)%pages)}> →</button>}</span>}</footer>
  </div></>;
}
