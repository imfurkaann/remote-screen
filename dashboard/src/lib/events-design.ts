export type HotelEvent = { id:string; title:string; host:string; room:string; start:string; end:string; direction:"left"|"right"|"up" };
export type EventsConfig = {
  hotelName:string; heading:string; locale:"tr"|"en"; theme:"paper"; accentColor:string;
  layout:"agenda"|"cards"|"split"; timezone:string; events:HotelEvent[]; showHost:boolean; showDirection:boolean; footer:string;
};
export const EVENTS_TEMPLATES = [
  {id:"agenda" as const,name:"Executive Agenda",description:"A clear, elegant schedule for every meeting."},
  {id:"cards" as const,name:"Meeting Collection",description:"Individual meeting cards with generous spacing."},
  {id:"split" as const,name:"Signature Schedule",description:"A warm ivory introduction beside your daily agenda."}
];
export const DEFAULT_EVENTS_CONFIG:EventsConfig = {
  hotelName:"WELCOME",heading:"Meetings & Events",locale:"en",theme:"paper",accentColor:"#9b8159",
  layout:"agenda",timezone:"local",showHost:true,showDirection:true,footer:"Our team is here to help you find your meeting.",
  events:[
    {id:"morning",title:"Leadership Meeting",host:"Atlas Group",room:"Maple Room",start:"09:30",end:"11:00",direction:"right"},
    {id:"conference",title:"Annual Conference",host:"Industry Forum",room:"Grand Ballroom",start:"11:30",end:"14:00",direction:"up"},
    {id:"workshop",title:"Design Workshop",host:"Nova Studio",room:"Oak Room",start:"15:00",end:"17:30",direction:"left"}
  ]
};
const text=(v:unknown,f:string,n:number)=>typeof v==="string"?v.slice(0,n):f;
const time=(v:unknown,f:string)=>typeof v==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v)?v:f;
export function normalizeEventsConfig(input:Record<string,unknown>={}):EventsConfig {
  let timezone=typeof input.timezone==="string"?input.timezone:"local";
  try{if(timezone!=="local")new Intl.DateTimeFormat("en",{timeZone:timezone}).format()}catch{timezone="local"}
  const ids=new Set<string>();
  const events=Array.isArray(input.events)?input.events.slice(0,10).flatMap((v,index)=>{
    if(!v||typeof v!=="object")return [];
    const e=v as Record<string,unknown>;
    let id=text(e.id,"event-"+index,64).replace(/[^a-zA-Z0-9_-]/g,"-")||"event-"+index;
    while(ids.has(id))id+="-"+index;ids.add(id);
    return [{id,title:text(e.title,"",100),host:text(e.host,"",80),room:text(e.room,"",60),start:time(e.start,"09:00"),end:time(e.end,"10:00"),direction:e.direction==="left"||e.direction==="up"?e.direction:"right"} as HotelEvent];
  }):DEFAULT_EVENTS_CONFIG.events;
  return {
    hotelName:text(input.hotelName,DEFAULT_EVENTS_CONFIG.hotelName,80),heading:text(input.heading,DEFAULT_EVENTS_CONFIG.heading,100),
    locale:input.locale==="tr"?"tr":"en",theme:"paper",accentColor:"#9b8159",
    layout:input.layout==="cards"||input.layout==="split"?input.layout:"agenda",timezone,events,
    showHost:input.showHost!==false,showDirection:input.showDirection!==false,footer:text(input.footer,DEFAULT_EVENTS_CONFIG.footer,180)
  };
}
export function eventStatus(start:string,end:string,current:number):"live"|"next"|"done" {
  const s=start.split(":").map(Number),e=end.split(":").map(Number);
  const from=s[0]!*60+s[1]!,to=e[0]!*60+e[1]!;
  if(to<from)return current>=from||current<to?"live":"next";
  return current>=from&&current<to?"live":current<from?"next":"done";
}
export const EVENTS_STYLES=`
.elegant-events{box-sizing:border-box;container-type:inline-size;position:relative;width:100%;height:100%;aspect-ratio:16/9;padding:4% 6%;display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;background:#fff;color:#273331;border:1px solid #e6e2dc;font-family:Georgia,serif}
.elegant-events *{box-sizing:border-box}
.elegant-events .events-header{display:flex;justify-content:space-between;align-items:end;gap:4%;border-bottom:1px solid #e6e2dc;padding-bottom:2cqw}
.elegant-events .events-brand{font:500 1.2cqw/1.5 Arial,sans-serif;color:#8f7753;letter-spacing:.24em;overflow-wrap:anywhere}
.elegant-events .events-heading{margin:.4cqw 0 0;font:normal 3.5cqw/1.2 Georgia,serif;overflow-wrap:anywhere}
.elegant-events .events-date{font:1.2cqw/1.5 Arial,sans-serif;color:#807c73;max-width:25%;text-align:right}
.elegant-events .events-list{display:grid;align-content:center;gap:1.3cqw;min-height:0;padding:2cqw 0}
.elegant-events .meeting{display:grid;grid-template-columns:15% minmax(0,1fr) 20% 5%;align-items:center;gap:2%;padding:1.7cqw 0;border-bottom:1px solid #e6e2dc}
.elegant-events .meeting[data-state=live]{background:#f7f5f0;box-shadow:-.3cqw 0 #9b8159}
.elegant-events .meeting-time{font:normal 2.1cqw/1.2 Arial,sans-serif;white-space:nowrap}
.elegant-events .meeting-end{display:block;font:1.1cqw/1.5 Arial,sans-serif;color:#807c73;margin-top:.4em}
.elegant-events .meeting-title{font:normal 2cqw/1.2 Georgia,serif;overflow-wrap:anywhere}
.elegant-events .meeting-host{font:1.1cqw/1.5 Arial,sans-serif;color:#807c73;margin-top:.4em;overflow-wrap:anywhere}
.elegant-events .meeting-room{font:1.35cqw/1.4 Arial,sans-serif;text-align:right;overflow-wrap:anywhere}
.elegant-events .meeting-status{display:block;font:500 .85cqw/1.5 Arial,sans-serif;letter-spacing:.1em;color:#8f7753;margin-top:.6em}
.elegant-events .meeting-arrow{font:2.8cqw/1 Arial,sans-serif;color:#9b8159;text-align:right}
.elegant-events .events-footer{display:flex;justify-content:space-between;gap:2%;border-top:1px solid #e6e2dc;padding-top:1.6cqw;color:#807c73;font:italic 1.2cqw/1.5 Georgia,serif}
.elegant-events .events-footer-text{overflow-wrap:anywhere;min-width:0}
.elegant-events .events-pages{white-space:nowrap;font:1cqw/1.5 Arial,sans-serif}
.elegant-events .events-edit{font:inherit;letter-spacing:inherit;color:inherit;text-align:inherit;background:transparent;border:1px dashed transparent;padding:0;max-width:100%;cursor:text;border-radius:2px}
.elegant-events .events-edit:hover{border-color:#9b8159}
.elegant-events input.events-edit{width:100%;outline:1px solid #9b8159}
.elegant-events[data-directions=false] .meeting{grid-template-columns:15% minmax(0,1fr) 20%}
.elegant-events[data-layout=cards] .events-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:1.5cqw}
.elegant-events[data-layout=cards] .meeting{grid-template-columns:minmax(0,1fr) auto;border:1px solid #e6e2dc;padding:1.7cqw;gap:1cqw;position:relative}
.elegant-events[data-layout=cards] .meeting-copy{grid-column:1/-1;grid-row:2}
.elegant-events[data-layout=cards] .meeting-time{font-size:1.6cqw}
.elegant-events[data-layout=cards] .meeting-end{display:inline;margin-left:.5em}
.elegant-events[data-layout=cards] .meeting-title{font-size:1.8cqw}
.elegant-events[data-layout=cards] .meeting-room{grid-column:2;grid-row:1}
.elegant-events[data-layout=cards] .meeting-arrow{position:absolute;right:1.5cqw;bottom:1.5cqw;font-size:2cqw}
.elegant-events[data-layout=cards] .meeting-host{padding-right:2cqw}
.elegant-events[data-layout=split]{grid-template-columns:28% minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;gap:0 6%;background:linear-gradient(90deg,#f7f5f0 31%,#fff 31%)}
.elegant-events[data-layout=split] .events-header{flex-direction:column;justify-content:center;align-items:start;border:0;padding:0}
.elegant-events[data-layout=split] .events-heading{font-size:3.2cqw;margin-top:1.4cqw}
.elegant-events[data-layout=split] .events-date{max-width:100%;text-align:left;margin-top:2cqw}
.elegant-events[data-layout=split] .events-footer{grid-column:1/-1}
.elegant-events[data-layout=split] .meeting-title{font-size:1.6cqw}
.elegant-events[data-layout=split] .meeting-time{font-size:1.6cqw}
.elegant-events .events-empty{color:#807c73;font:2cqw/1.5 Georgia,serif}
.elegant-events [hidden]{display:none!important}
.elegant-events.portrait{aspect-ratio:9/16;padding:8% 7%}
.elegant-events.portrait .events-header{display:block;padding-bottom:5cqw}
.elegant-events.portrait .events-brand{font-size:2.4cqw}
.elegant-events.portrait .events-heading{font-size:6cqw}
.elegant-events.portrait .events-date{font-size:2.5cqw;max-width:100%;text-align:left;margin-top:2cqw}
.elegant-events.portrait .events-list{gap:3cqw;padding:4cqw 0}
.elegant-events.portrait .meeting{grid-template-columns:18% minmax(0,1fr) 23% 5%;padding:5cqw 0}
.elegant-events.portrait[data-directions=false] .meeting{grid-template-columns:18% minmax(0,1fr) 23%}
.elegant-events.portrait .meeting-time{font-size:3.7cqw}
.elegant-events.portrait .meeting-end,.elegant-events.portrait .meeting-host{font-size:2.3cqw}
.elegant-events.portrait .meeting-title{font-size:3.8cqw}
.elegant-events.portrait .meeting-room{font-size:2.6cqw}
.elegant-events.portrait .meeting-status{font-size:1.8cqw}
.elegant-events.portrait .meeting-arrow{font-size:4.5cqw}
.elegant-events.portrait .events-footer{font-size:2.5cqw;padding-top:4cqw}
.elegant-events.portrait .events-pages{font-size:2cqw}
.elegant-events.portrait[data-layout=cards] .events-list{grid-template-columns:1fr}
.elegant-events.portrait[data-layout=cards] .meeting{grid-template-columns:minmax(0,1fr) auto;padding:3cqw;gap:2cqw}
.elegant-events.portrait[data-layout=cards] .meeting-arrow{font-size:4cqw;right:3cqw;bottom:3cqw}
.elegant-events.portrait[data-layout=split]{display:grid;grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr) auto;background:linear-gradient(#f7f5f0 25%,#fff 25%)}
.elegant-events.portrait[data-layout=split] .events-footer{grid-column:auto}
`;

