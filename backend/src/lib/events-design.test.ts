import assert from "node:assert/strict";
import test from "node:test";
import {normalizeEventsConfig,eventStatus} from "./events-design.js";
import {renderEventsHtml} from "./hotel-renderers.js";
test("event designs preserve content and lock their visual identity",()=>{
  const c=normalizeEventsConfig({heading:"Welcome",layout:"cards",theme:"burgundy",accentColor:"#ff0000",timezone:"Asia/Tokyo"});
  assert.equal(c.heading,"Welcome");assert.equal(c.layout,"cards");assert.equal(c.theme,"paper");assert.equal(c.accentColor,"#9b8159");assert.equal(c.timezone,"Asia/Tokyo");
  assert.equal(normalizeEventsConfig({timezone:"invalid/zone"}).timezone,"local");
});
test("event ids remain unique and empty schedules stay empty",()=>{
  const c=normalizeEventsConfig({events:[{id:"same",title:"One"},{id:"same",title:"Two"}]});
  assert.equal(new Set(c.events.map(e=>e.id)).size,2);
  assert.deepEqual(normalizeEventsConfig(c),c);
  assert.equal(normalizeEventsConfig({events:[]}).events.length,0);
  assert.match(renderEventsHtml("Events",{events:[]}),/No meetings scheduled/);
});
test("event status observes boundaries and overnight meetings",()=>{
  assert.equal(eventStatus("09:00","10:00",540),"live");
  assert.equal(eventStatus("09:00","10:00",600),"done");
  assert.equal(eventStatus("09:00","10:00",500),"next");
  assert.equal(eventStatus("23:00","01:00",30),"live");
  assert.equal(eventStatus("23:00","01:00",1410),"live");
  assert.equal(eventStatus("23:00","01:00",600),"next");
});
test("event text is escaped and no accepted meetings are discarded",()=>{
  const html=renderEventsHtml("Events",{events:Array.from({length:10},(_,i)=>({title:"Meeting "+i,host:"<script>x</script>",room:"A & B"}))});
  assert.equal((html.match(/class="meeting"/g)||[]).length,10);
  assert.doesNotMatch(html,/<script>x/);
  assert.match(html,/A &amp; B/);
});
