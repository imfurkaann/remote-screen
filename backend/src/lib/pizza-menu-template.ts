// Keep this portable template identical in the dashboard and backend.
export const MENU_DECORATIONS: Record<string, string> = {
  "builtin:snack-checker": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 740 82" preserveAspectRatio="none"><defs><pattern id="c" width="60" height="60" patternUnits="userSpaceOnUse"><path fill="#3861b0" d="M0 0h30v30H0zM30 30h30v30H30z"/></pattern></defs><path fill="#f8f9ff" d="M0 0h740v82H0z"/><path fill="url(#c)" d="M0 0h740v82H0z"/><path stroke="#3861b0" stroke-width="2" d="M0 81h740"/></svg>',
  "builtin:snack-line": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 40"><path d="M0 20h1000" stroke="#3861b0" stroke-width="3"/></svg>',
  "builtin:snack-pill": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 510 65"><rect x="1" y="1" width="508" height="63" rx="32" fill="none" stroke="#3861b0" stroke-width="1.8"/></svg>',
  "builtin:snack-stars": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 120"><path fill="#494098" d="M24 1Q25 23 40 26Q25 28 24 52Q21 30 6 26Q22 23 24 1Z"/><path fill="none" stroke="#494098" stroke-width="2" d="M72 35Q68 53 39 57Q68 62 72 88M43 80Q42 91 35 94Q42 96 43 109Q45 97 52 94Q45 91 43 80Z"/></svg>',
  "builtin:snack-cherries": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 120"><g fill="none" stroke="#3861b0" stroke-width="1.5"><path d="M27 48Q40 21 82 20Q57 36 72 81"/><ellipse cx="23" cy="62" rx="18" ry="22" transform="rotate(24 23 62)"/><ellipse cx="72" cy="97" rx="19" ry="19"/><path fill="#d5dff2" d="M78 20Q97 9 109 20Q94 34 78 20Z"/><path d="M80 21l25-1"/></g></svg>',
  "builtin:snack-cookie": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 130"><defs><pattern id="d" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#3861b0"/></pattern></defs><path d="M0 0H148Q133 67 86 103Q26 148 0 119Z" fill="#f8f9ff" stroke="#3861b0" stroke-width="2"/><path d="M95 0h53Q130 75 76 110L43 124Q106 60 95 0Z" fill="url(#d)"/><g stroke="#3861b0" stroke-width="3"><path d="M15 36l-3 12M45 10l-3 12M37 62l-4 13M14 94l-3 11M64 91l-4 10M70 31l3 10"/></g><g fill="#3861b0"><circle cx="74" cy="0" r="19"/><circle cx="122" cy="4" r="23"/><circle cx="32" cy="-7" r="15"/></g></svg>',
  "builtin:snack-orange": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 150"><defs><pattern id="p" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#3861b0"/></pattern></defs><circle cx="132" cy="132" r="125" fill="#f8f9ff" stroke="#3861b0" stroke-width="2"/><g fill="url(#p)" stroke="#3861b0" stroke-width="2"><path d="M119 115L114 20Q72 24 51 53Z"/><path d="M112 124L43 63Q18 91 18 122Z"/><path d="M109 135L18 136Q21 168 43 192Z"/><path d="M128 112L125 18Q171 20 197 53Z"/></g></svg>',

  "builtin:olives": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><g fill="#909773"><path d="M72 9C107-5 121 35 99 49C65 70 56 30 72 9Z"/><path d="M10 43C31 30 51 51 40 73C25 99-3 71 10 43Z"/></g><ellipse cx="83" cy="90" rx="23" ry="24" fill="#909773"/></svg>',
  "builtin:citrus": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100"><g fill="#f29c70" stroke="#fff" stroke-width="4"><path d="M60 4L114 0Q118 31 97 54Z"/><path d="M60 4L96 56Q81 78 61 78Z"/><path d="M60 4L57 78Q34 77 22 57Z"/><path d="M60 4L19 55Q1 37 7 12Z"/></g></svg>',
  "builtin:mint": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110"><path fill="#9fcaca" d="M3 75Q31 10 94 18Q91 73 30 108Q34 75 68 43Q33 71 3 75Z"/></svg>',
  "builtin:leaves": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 150"><g fill="#909773"><path d="M78 68Q24 29 29 4Q61 14 78 68Z"/><path d="M78 68Q29 79 4 57Q43 36 78 68Z"/><path d="M78 68Q54 106 4 116Q23 81 78 68Z"/><path d="M78 68Q89 123 65 149Q48 119 78 68Z"/></g></svg>'
};
export const menuDecorationSource = (source: string) => MENU_DECORATIONS[source]
  ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(MENU_DECORATIONS[source]!)
  : source;

export function createPizzaMenuTemplate() {
  const textElements: { id: string; text: string; preset: "text" | "heading" | "subheading" | "body" }[] = [];
  const portrait: Record<string, any> = {};
  const landscape: Record<string, any> = {};
  const add = (id: string, text: string, x: number, y: number, width: number, height: number, style: Record<string, unknown> = {}) => {
    textElements.push({ id, text, preset: id === "title" ? "heading" : "text" });
    portrait["text:" + id] = { x, y, width, height, fontScale: 1, align: "left", zIndex: 3, fontWeight: "normal", ...style };
  };
  add("title", "PİZZA MENÜ", 22, 9, 56, 6, { fontScale: 2.2, align: "center", fontWeight: "bold", fontFamily: "serif" });
  add("subtitle", "Bir Dilim Pizza", 22, 14.6, 56, 4, { fontScale: 1.22, align: "center" });
  add("pizza-category", "PİZZA ÇEŞİTLERİ", 17, 22.3, 68, 4, { fontScale: 1.22, fontWeight: "bold", color: "#bd3034" });
  const rows = [
    ["margherita", "Margherita", "450₺", "Domates sos, mozzarella, fesleğen", "Alerjen: Gluten, süt  Kalori: 900 kcal", 28],
    ["pepperoni", "Pepperoni", "620₺", "Domates sos, mozzarella, pepperoni", "Alerjen: Gluten, süt  Kalori: 1100 kcal", 36.5],
    ["prosciutto", "Prosciutto", "650₺", "Mozzarella, prosciutto, roka", "Alerjen: Gluten, süt  Kalori: 1050 kcal", 45],
    ["vegetariana", "Vegetariana", "700₺", "Sebzeler, mozzarella", "Alerjen: Gluten, süt  Kalori: 900 kcal", 53.5],
    ["iced-tea", "Ev Yapımı Soğuk Çay", "150₺", "Şeftali, Limon, Elma", "Kalori: 75 kcal", 69],
    ["lemonade", "Limonata", "180₺", "Limon, Portakal, Su", "Kalori: 90 kcal", 77.5]
  ] as const;
  for (const [id, name, price, description, details, y] of rows) {
    add(id + "-name", name, 18.5, y, 49, 3.2, { fontWeight: "bold" });
    add(id + "-price", price, 68, y, 8, 3.2, { fontWeight: "bold", align: "right" });
    add(id + "-description", description, 19.7, y + 2.3, 62, 3.2);
    add(id + "-details", details, 19.7, y + 5.1, 62, 3.2);
  }
  add("drinks-category", "İÇECEKLER", 17, 64, 68, 4, { fontScale: 1.22, fontWeight: "bold", color: "#bd3034" });
  const imageElements = [
    { id: "olives", name: "Zeytin süslemesi", source: "builtin:olives" },
    { id: "citrus", name: "Portakal süslemesi", source: "builtin:citrus" },
    { id: "mint", name: "Turkuaz yaprak", source: "builtin:mint" },
    { id: "leaves", name: "Zeytin yaprakları", source: "builtin:leaves" }
  ];
  for (const [id, x, y, width, height] of [
    ["olives",18,3,16,12], ["citrus",62,0,14,7], ["mint",0,88,12,9], ["leaves",93,81,7,14]
  ] as const) portrait["image:" + id] = { x,y,width,height,fontScale:1,align:"center",zIndex:1 };
  // A second composition makes the same editable content readable on horizontal displays.
  for (const [id, rect] of Object.entries(portrait)) {
    landscape[id] = { ...rect };
    if (id.startsWith("text:")) {
      if (id === "text:title" || id === "text:subtitle") landscape[id] = { ...rect, y: id === "text:title" ? 5 : 14, height: 8 };
      else {
        const drink = /iced-tea|lemonade|drinks-category/.test(id);
        landscape[id] = { ...rect, x: drink ? 54 + (rect.x - 17) * .63 : 8 + (rect.x - 17) * .63, y: drink ? 27 + (rect.y - 64) * 2 : 27 + (rect.y - 22.3) * 1.7, width: rect.width * .63, height: rect.height * 1.7 };
      }
    }
  }
  return {
    restaurantName: "", heading: "", subtitle: "", locale: "tr" as const, currency: "₺" as const,
    currencyPosition: "after" as const, layout: "editorial" as const, theme: "paper" as const,
    accentColor: "#bd3034", categories: [], items: [], showDescriptions: true, showUnavailable: false, footer: "",
    editor: { version: 2 as const, snapToGrid: false, textElements, imageElements, layouts: { landscape, portrait } }
  };
}
export function createSnackMenuTemplate() {
  const textElements: { id: string; text: string; preset: "text" | "heading" }[] = [];
  const imageElements: { id: string; name: string; source: string }[] = [];
  const portrait: Record<string, any> = {};
  const landscape: Record<string, any> = {};
  const text = (id: string, value: string, x: number, y: number, width: number, height: number, style: Record<string, unknown> = {}) => {
    textElements.push({ id, text: value, preset: "text" });
    portrait["text:" + id] = { x,y,width,height,fontScale:1,align:"left",zIndex:3,fontWeight:"normal",...style };
  };
  const image = (id: string, name: string, source: string, x: number, y: number, width: number, height: number) => {
    imageElements.push({id,name,source});
    portrait["image:" + id] = { x,y,width,height,fontScale:1,align:"center",zIndex:1 };
  };
  text("snack-title","Snack Menu",10,12.5,82,18,{fontFamily:"serif",fontStyle:"italic",fontScale:2.4,align:"center"});
  const rows = [["mini-pizza","Mini Pizza","$6"],["donut","Donut","$4"],["cookies","Cookies","$4"],["pretzel","Pretzel","$5"],["brownies","Brownies","$5"],["nachos","Nachos","$5"]] as const;
  rows.forEach(([id,name,price],i)=>{
    const y=32.4+i*8.65;
    text(id+"-name",name,16.5,y,54,5.5);
    text(id+"-price",price,74,y,9.5,5.5,{align:"right",fontWeight:"bold"});
    image(id+"-line",name+" ayırıcı çizgi","builtin:snack-line",16.5,y+3,67,3);
  });
  text("snack-footer","GRAB YOUR FAVORITE SNACK NOW!",17.5,84.7,65,4,{fontScale:.67,align:"center"});
  image("snack-pill","Alt yazı çerçevesi","builtin:snack-pill",15.5,83.1,69,6.5);
  image("snack-top","Üst dama deseni","builtin:snack-checker",0,0,100,8);
  image("snack-bottom","Alt dama deseni","builtin:snack-checker",0,92.2,100,7.8);
  image("snack-cookie","Kurabiye çizimi","builtin:snack-cookie",0,0,20,12);
  image("snack-orange","Portakal çizimi","builtin:snack-orange",84,87,16,13);
  image("snack-cherries","Kiraz çizimi","builtin:snack-cherries",84,10,13,10);
  image("snack-stars-right","Sağ yıldızlar","builtin:snack-stars",91,27.5,9,11);
  image("snack-stars-left","Sol yıldızlar","builtin:snack-stars",0,61,9,11);
  for(const [id,rect] of Object.entries(portrait)) landscape[id]={...rect};
  landscape["text:snack-title"]={...portrait["text:snack-title"],x:20,y:10,width:60,height:22};
  landscape["image:snack-pill"]={...portrait["image:snack-pill"],x:28,y:81,width:44,height:10};
  landscape["text:snack-footer"]={...portrait["text:snack-footer"],x:29,y:83.3,width:42,height:7};
  rows.forEach(([id],i)=>{
    const column=i<3?0:1, row=i%3;
    for(const suffix of ["name","price"]) {
      const key="text:"+id+"-"+suffix;
      landscape[key]={...portrait[key],x:column*46+(suffix==="name"?9:42),y:37+row*14,width:suffix==="name"?32:6,height:8};
    }
    landscape["image:"+id+"-line"]={...portrait["image:"+id+"-line"],x:9+column*46,y:43+row*14,width:39,height:3};
  });
  return {restaurantName:"",heading:"",subtitle:"",locale:"en" as const,currency:"$" as const,currencyPosition:"before" as const,
    layout:"editorial" as const,theme:"snack" as const,accentColor:"#3861b0",categories:[],items:[],showDescriptions:true,showUnavailable:false,footer:"",
    editor:{version:2 as const,snapToGrid:false,textElements,imageElements,layouts:{landscape,portrait}}};
}
