import {test,expect} from "@playwright/test";
import {renderEventsHtml} from "../../backend/src/lib/hotel-renderers";
import {DEFAULT_EVENTS_CONFIG} from "../../backend/src/lib/events-design";
test.use({channel:"chrome",viewport:{width:1600,height:1000}});
test("events modal, inline editing, settings and saved configuration",async({page})=>{
  const encode=(v:object)=>Buffer.from(JSON.stringify(v)).toString("base64url");
  await page.context().addCookies([{name:"dashboard_session",value:"test",url:"http://localhost:3000"},{name:"dashboard_access_token",value:encode({alg:"none"})+"."+encode({role:"operator",exp:Math.floor(Date.now()/1000)+3600})+".test",url:"http://localhost:3000"}]);
  await page.goto("http://localhost:3000/apps");
  await page.getByRole("button",{name:/Open Event.*details/}).click();
  await expect(page.getByRole("radiogroup",{name:"Events templates"}).getByRole("radio")).toHaveCount(3);
  await page.screenshot({path:"test-results/events-collection.png",animations:"disabled"});
  await page.getByRole("radio",{name:"Meeting Collection"}).click();
  await page.getByRole("button",{name:"Start with Selected Template"}).click();
  await expect(page.getByTestId("events-canvas")).toHaveAttribute("data-layout","cards");
  for(const [label,value] of [["Edit heading","Today at Head Office"],["Edit title 1","Board Meeting"],["Edit room 1","London Room"],["Edit host 1","Executive Team"]]){
    await page.getByRole("button",{name:label,exact:true}).click();
    await page.getByRole("textbox",{name:label,exact:true}).fill(value);
    await page.getByRole("textbox",{name:label,exact:true}).press("Enter");
  }
  await page.getByRole("button",{name:"Event settings",exact:true}).click();
  await page.getByRole("button",{name:"Close event settings"}).click();
  for(const [label,value] of [["Edit start 1","10:00"],["Edit end 1","12:00"]]){
    await page.getByRole("button",{name:label,exact:true}).click();
    await page.getByLabel(label,{exact:true}).fill(value);
    await page.getByLabel(label,{exact:true}).press("Enter");
  }
  await page.getByRole("button",{name:"Event settings",exact:true}).click();
  await page.getByRole("combobox",{name:"Time zone",exact:true}).selectOption("Europe/London");
  await page.getByRole("button",{name:/Add meeting/}).click();
  await expect(page.locator('input[type="color"]')).toHaveCount(0);
  await page.getByRole("button",{name:"Close event settings"}).click();
  await expect(page.locator(".meeting")).toHaveCount(4);
  await page.screenshot({path:"test-results/events-editor.png",animations:"disabled"});
  await page.getByRole("button",{name:"9:16",exact:true}).click();
  await page.screenshot({path:"test-results/events-portrait.png",animations:"disabled"});
  const canvas=await page.getByTestId("events-canvas").boundingBox();
  expect(canvas!.height/canvas!.width).toBeCloseTo(16/9,1);
  const sidebar=await page.locator(".dashboard-sidebar").boundingBox(),rail=await page.locator(".events-editor-rail").boundingBox();
  expect(Math.abs(rail!.x-sidebar!.x-sidebar!.width)).toBeLessThan(2);
  let saved:any;
  await page.route("**/api/apps/create-app",async route=>{saved=route.request().postDataJSON();await route.fulfill({status:201,json:{success:true}})});
  await page.getByRole("button",{name:"Save and Close"}).click();
  await expect(page).toHaveURL("http://localhost:3000/apps");
  expect(saved.config).toMatchObject({layout:"cards",theme:"paper",timezone:"Europe/London",heading:"Today at Head Office"});
  expect(saved.config.events[0]).toMatchObject({title:"Board Meeting",room:"London Room",host:"Executive Team",start:"10:00",end:"12:00"});
  await page.route("**/api/content/media",route=>route.fulfill({json:{media:[{id:"event-test",filename:saved.name,storage_path:"app://events",app_config:saved.config}]}}));
  await page.goto("http://localhost:3000/apps/configure?id=event-test");
  await expect(page.getByRole("button",{name:"Edit title 1",exact:true})).toHaveText("Board Meeting");
});
for(const layout of ["agenda","cards","split"]){
  for(const portrait of [false,true]){
    test("published events "+layout+" "+(portrait?"portrait":"landscape"),async({page})=>{
      const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
      await page.setViewportSize(portrait?{width:900,height:1600}:{width:1600,height:900});
      await page.clock.install({time:new Date("2026-09-15T10:00:00Z")});
      await page.setContent(renderEventsHtml("Events",{...DEFAULT_EVENTS_CONFIG,layout,timezone:"UTC",theme:"burgundy"}));
      await expect(page.locator(".meeting").first()).toHaveAttribute("data-state","live");
      const footer=await page.locator(".events-footer").boundingBox();
      expect(footer!.y+footer!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      if(layout==="split") await expect(page.locator(".elegant-events")).toHaveCSS("background-image",/rgb\(255, 255, 255\)/);
      else await expect(page.locator(".elegant-events")).toHaveCSS("background-color","rgb(255, 255, 255)");
      await page.screenshot({path:"test-results/events-output-"+layout+"-"+(portrait?"portrait":"landscape")+".png"});
      expect(errors).toEqual([]);
    });
  }
}
test("all ten meetings rotate and status updates",async({page})=>{
  await page.clock.install({time:new Date("2026-09-15T10:59:59Z")});
  await page.setContent(renderEventsHtml("Events",{timezone:"UTC",events:Array.from({length:10},(_,i)=>({...DEFAULT_EVENTS_CONFIG.events[0],id:"e"+i,title:"Meeting "+(i+1)}))}));
  await expect(page.locator(".meeting:visible")).toHaveCount(4);
  await page.clock.fastForward(12000);
  await expect(page.locator(".meeting:visible").first()).toContainText("Meeting 5");
  await page.clock.fastForward(12000);
  await expect(page.locator(".meeting:visible")).toHaveCount(2);
  await expect(page.locator(".meeting:visible").last()).toContainText("Meeting 10");
  await expect(page.locator(".meeting").first()).toHaveAttribute("data-state","done");
});
