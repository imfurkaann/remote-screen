import { expect, test } from "@playwright/test";
import { renderWeatherHtml } from "../../backend/src/lib/weather-renderer";
test.use({ channel:"chrome", viewport:{ width:1600, height:1000 } });

test("published weather keeps cached conditions when offline",async({page})=>{
  const html=renderWeatherHtml("Weather",{city:"London",layout:"split"});
  await page.route("http://weather.test/",route=>route.fulfill({contentType:"text/html",body:html}));
  await page.route("https://geocoding-api.open-meteo.com/**",route=>route.fulfill({json:{results:[{name:"London",latitude:51.5,longitude:-0.1}]}}));
  await page.route("https://api.open-meteo.com/**",route=>route.fulfill({json:{current:{temperature_2m:22,apparent_temperature:21,relative_humidity_2m:64,wind_speed_10m:12,weather_code:2},daily:{time:[],weather_code:[],temperature_2m_max:[],temperature_2m_min:[]}}}));
  await page.goto("http://weather.test/");
  await expect(page.locator("#footer")).toHaveAttribute("data-state","live");
  await page.route("https://geocoding-api.open-meteo.com/**",route=>route.abort());
  await page.reload();
  await expect(page.locator("#temperature")).toHaveText("22");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#footer")).toHaveAttribute("data-state","cached");
});

test("weather templates, inline editing, settings, save and reload", async ({ page }) => {
  const encode=(v:object)=>Buffer.from(JSON.stringify(v)).toString("base64url");
  await page.context().addCookies([
    { name:"dashboard_session", value:"test", url:"http://localhost:3000" },
    { name:"dashboard_access_token", value:encode({alg:"none"})+"."+encode({role:"operator",exp:Math.floor(Date.now()/1000)+3600})+".test", url:"http://localhost:3000" }
  ]);
  await page.goto("http://localhost:3000/apps");
  await page.getByRole("button",{name:"Open Weather details"}).click();
  await expect(page.getByRole("radiogroup",{name:"Weather templates"}).getByRole("radio")).toHaveCount(3);
  await expect(page.getByTestId("weather-canvas")).toHaveCount(3);
  await page.screenshot({path:"test-results/weather-collection.png",animations:"disabled"});
  await page.getByRole("radio",{name:"Signature Weather"}).click();
  await page.getByRole("button",{name:"Start with Selected Template"}).click();
  await expect(page.getByTestId("weather-canvas")).toHaveAttribute("data-layout","split");
  for (const [key,value] of [["heading","HEAD OFFICE"],["caption","Welcome to London"],["city","London"]]) {
    await page.getByRole("button",{name:"Edit "+key,exact:true}).click();
    await page.getByRole("textbox",{name:"Edit "+key,exact:true}).fill(value);
    await page.getByRole("textbox",{name:"Edit "+key,exact:true}).press("Enter");
  }
  await page.getByRole("button",{name:"Weather settings",exact:true}).click();
  await page.getByRole("combobox",{name:"Temperature unit"}).selectOption("imperial");
  await page.getByRole("combobox",{name:"Forecast length"}).selectOption("3");
  await expect(page.locator('input[type="color"]')).toHaveCount(0);
  await page.getByRole("button",{name:"Close weather settings"}).click();
  await expect(page.locator(".temperature-unit")).toHaveText("°F");
  await expect(page.locator(".forecast-day")).toHaveCount(3);
  const sidebar=await page.locator(".dashboard-sidebar").boundingBox();
  const rail=await page.locator(".weather-editor-rail").boundingBox();
  expect(Math.abs(rail!.x-sidebar!.x-sidebar!.width)).toBeLessThan(2);
  await page.screenshot({path:"test-results/weather-editor.png",animations:"disabled"});
  await page.getByRole("button",{name:"9:16",exact:true}).click();
  await page.screenshot({path:"test-results/weather-portrait.png",animations:"disabled"});
  const box=await page.getByTestId("weather-canvas").boundingBox();
  expect(box!.height/box!.width).toBeCloseTo(16/9,1);
  let saved:any;
  await page.route("**/api/apps/create-app",async route=>{saved=route.request().postDataJSON();await route.fulfill({status:201,json:{success:true}})});
  await page.getByRole("button",{name:"Save and Close"}).click();
  await expect(page).toHaveURL("http://localhost:3000/apps");
  expect(saved.config).toMatchObject({city:"London",heading:"HEAD OFFICE",caption:"Welcome to London",theme:"paper",layout:"split",units:"imperial",forecastDays:3});
  await page.route("**/api/content/media",route=>route.fulfill({json:{media:[{id:"weather-test",filename:saved.name,storage_path:"app://weather",app_config:saved.config}]}}));
  await page.goto("http://localhost:3000/apps/configure?id=weather-test");
  await expect(page.getByRole("button",{name:"Edit heading"})).toHaveText("HEAD OFFICE");
  await expect(page.getByRole("button",{name:"Edit city"})).toHaveText("London");
});

for(const layout of ["overview","minimal","split"]) {
  for(const portrait of [false,true]) {
    test("published weather "+layout+" "+(portrait?"portrait":"landscape"),async({page})=>{
      await page.setViewportSize(portrait?{width:900,height:1600}:{width:1600,height:900});
      await page.route("https://geocoding-api.open-meteo.com/**",route=>route.fulfill({json:{results:[{name:"London",latitude:51.5,longitude:-0.1,country_code:"GB"}]}}));
      await page.route("https://api.open-meteo.com/**",route=>route.fulfill({json:{
        current:{temperature_2m:22,apparent_temperature:21,relative_humidity_2m:64,wind_speed_10m:12,weather_code:2},
        daily:{time:["2026-09-15","2026-09-16","2026-09-17","2026-09-18","2026-09-19"],weather_code:[0,3,61,3,0],temperature_2m_max:[24,22,20,21,23],temperature_2m_min:[18,16,14,15,17]}
      }}));
      await page.setContent(renderWeatherHtml("Weather",{city:"London",heading:"LOCAL WEATHER",caption:"A fresh perspective on your day.",layout,theme:"sunset"}));
      await expect(page.locator("#loading")).toBeHidden();
      await expect(page.locator("#temperature")).toHaveText("22");
      await expect(page.locator("#temperature")).toHaveCSS("font-family", '"Helvetica Neue", Arial, sans-serif');
      await expect(page.locator("#wind")).toHaveText("12 km/h");
      await expect(page.locator(".elegant-weather")).toHaveAttribute("data-theme","paper");
      await expect(page.locator("#footer")).toHaveAttribute("data-state","live");
      const caption=await page.locator(".weather-caption").boundingBox();
      expect(caption!.y+caption!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      await page.screenshot({path:"test-results/weather-output-"+layout+"-"+(portrait?"portrait":"landscape")+".png"});
    });
  }
}
