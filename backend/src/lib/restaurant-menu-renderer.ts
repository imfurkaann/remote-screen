import { createPizzaMenuTemplate, MENU_DECORATIONS, menuDecorationSource } from "./pizza-menu-template.js";
type MenuBadge = "none" | "popular" | "new" | "chef" | "vegan";
type MenuCategory = { id: string; name: string };
type MenuItem = { id: string; categoryId: string; name: string; description: string; price: string; badge: MenuBadge; available: boolean };
type CanvasElement = {
  x: number; y: number; width: number; height: number; fontScale: number;
  align: "left" | "center" | "right"; zIndex: number;
  color?: string; fontWeight?: "normal" | "bold"; fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  textTransform?: "none" | "uppercase" | "lowercase" | "sentence";
  listStyle?: "none" | "bullet" | "number";
  fontFamily?: "sans" | "serif";
  rotation?: number;
};
type TextPreset = "text" | "heading" | "subheading" | "body";
type TextElement = { id: string; text: string; preset: TextPreset };
type ImageElement = { id: string; name: string; source: string };
type EditorConfig = { version: 2; snapToGrid: boolean; textElements: TextElement[]; imageElements: ImageElement[]; layouts: { landscape: Record<string, CanvasElement>; portrait: Record<string, CanvasElement> } };
export type RestaurantMenuConfig = {
  restaurantName: string; heading: string; subtitle: string; locale: "tr" | "en";
  currency: "₺" | "$" | "€" | "£"; currencyPosition: "before" | "after";
  layout: "board" | "columns" | "editorial"; theme: "charcoal" | "cream" | "terracotta" | "forest" | "paper" | "snack";
  accentColor: string; categories: MenuCategory[]; items: MenuItem[];
  showDescriptions: boolean; showUnavailable: boolean; footer: string; editor: EditorConfig;
};

const THEMES = {
  snack: { scheme: "light", bg: "#f8f9ff", surface: "#f8f9ff", text: "#3861b0", muted: "#3861b0", line: "transparent", accent: "#3861b0" },
  paper: { scheme: "light", bg: "#ffffff", surface: "#ffffff", text: "#000000", muted: "#000000", line: "transparent", accent: "#bd3034" },
  charcoal: { bg: "linear-gradient(145deg,#111315,#1d2225 58%,#272e31)", surface: "rgba(255,255,255,.055)", text: "#f7f5ef", muted: "#b8b5ad", line: "rgba(255,255,255,.11)", accent: "#f3c969", scheme: "dark" },
  cream: { bg: "linear-gradient(145deg,#fffdf7,#f4ecdd 62%,#eadbc4)", surface: "rgba(255,255,255,.7)", text: "#29231d", muted: "#786d62", line: "rgba(41,35,29,.12)", accent: "#9a5b2b", scheme: "light" },
  terracotta: { bg: "linear-gradient(145deg,#3b1712,#752d22 55%,#a94734)", surface: "rgba(255,255,255,.065)", text: "#fff8f2", muted: "#f4c7ba", line: "rgba(255,255,255,.13)", accent: "#ffd08a", scheme: "dark" },
  forest: { bg: "linear-gradient(145deg,#0b241d,#164537 58%,#23634f)", surface: "rgba(255,255,255,.06)", text: "#f2fbf6", muted: "#b7d8ca", line: "rgba(255,255,255,.13)", accent: "#e8ce7d", scheme: "dark" }
} as const;

const DEFAULT_CATEGORIES: MenuCategory[] = [
  { id: "starters", name: "Başlangıçlar" }, { id: "mains", name: "Ana Yemekler" }, { id: "drinks", name: "İçecekler" }
];
const DEFAULT_ITEMS: MenuItem[] = [
  { id: "soup", categoryId: "starters", name: "Günün Çorbası", description: "Mevsim ürünleri ve taze otlar", price: "140", badge: "chef", available: true },
  { id: "bruschetta", categoryId: "starters", name: "Domatesli Bruschetta", description: "Ekşi maya, fesleğen ve zeytinyağı", price: "210", badge: "vegan", available: true },
  { id: "beef", categoryId: "mains", name: "Dana Bonfile", description: "Patates püresi, ızgara sebze ve demi-glace", price: "620", badge: "popular", available: true },
  { id: "pasta", categoryId: "mains", name: "Trüflü Makarna", description: "Taze makarna, parmesan ve trüf kreması", price: "390", badge: "new", available: true },
  { id: "lemonade", categoryId: "drinks", name: "Ev Yapımı Limonata", description: "Taze nane ile", price: "120", badge: "none", available: true },
  { id: "coffee", categoryId: "drinks", name: "Filtre Kahve", description: "Günün çekirdeği", price: "110", badge: "none", available: true }
];

const clean = (value: unknown, fallback: string, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
const optional = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const safeId = (value: unknown, fallback: string) => clean(value, fallback, 64).replace(/[^a-zA-Z0-9_-]/g, "-");
const safeColor = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(value ?? "")) ? String(value) : fallback;
const safeCanvasColor = (value: unknown) => {
  const color = String(value ?? "");
  return /^#[0-9a-f]{6}$/i.test(color) || /^linear-gradient\((90deg|135deg|180deg),#[0-9a-f]{6},#[0-9a-f]{6}\)$/i.test(color) ? color : "";
};
const safeImageSource = (value: unknown) => {
  if (typeof value === "string" && MENU_DECORATIONS[value]) return value;
  let source = typeof value === "string" ? value.trim().slice(0, 4096) : "";
  if (/^https?:\/\//i.test(source)) {
    try { source = new URL(source).pathname; } catch { return ""; }
  }
  try { source = decodeURIComponent(source); } catch { /* Keep the original path if it is not encoded. */ }
  return source.startsWith("/uploads/") && !source.includes("..") && !/[?#\u0000-\u001f]/.test(source) ? source : "";
};
const escapeHtml = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const bounded = (value: unknown, fallback: number, min: number, max: number) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const normalizeLayout = (value: unknown): Record<string, CanvasElement> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 80).flatMap(([key, raw]) => {
    if (!/^(restaurantName|heading|subtitle|footer|category:[a-zA-Z0-9_-]+|item:[a-zA-Z0-9_-]+|text:[a-zA-Z0-9_-]+|image:[a-zA-Z0-9_-]+)$/.test(key) || !raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const width = bounded(item.width, 24, 6, 100); const height = bounded(item.height, 10, 3, 92);
    return [[key, {
      x: bounded(item.x, 0, 0, 100 - width), y: bounded(item.y, 0, 0, 100 - height), width, height,
      fontScale: bounded(item.fontScale, 1, .55, 2.4),
      align: item.align === "center" || item.align === "right" ? item.align : "left",
      zIndex: Math.round(bounded(item.zIndex, 1, 1, 30)),
      ...(safeCanvasColor(item.color) ? { color: safeCanvasColor(item.color) } : {}),
      ...(item.fontWeight === "bold" || item.fontWeight === "normal" ? { fontWeight: item.fontWeight } : {}),
      ...(item.fontStyle === "italic" || item.fontStyle === "normal" ? { fontStyle: item.fontStyle } : {}),
      ...(item.textDecoration === "underline" || item.textDecoration === "line-through" || item.textDecoration === "none" ? { textDecoration: item.textDecoration } : {}),
      ...(item.textTransform === "uppercase" || item.textTransform === "lowercase" || item.textTransform === "sentence" || item.textTransform === "none" ? { textTransform: item.textTransform } : {}),
      ...(item.listStyle === "bullet" || item.listStyle === "number" || item.listStyle === "none" ? { listStyle: item.listStyle } : {}),
      ...(item.fontFamily === "serif" || item.fontFamily === "sans" ? { fontFamily: item.fontFamily } : {}),
      ...(Number.isFinite(Number(item.rotation)) ? { rotation: bounded(item.rotation, 0, 0, 359) } : {})
    } satisfies CanvasElement]];
  }));
};
const normalizeEditor = (value: unknown): EditorConfig => {
  const editor = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const layouts = editor.layouts && typeof editor.layouts === "object" ? editor.layouts as Record<string, unknown> : {};
  const textElements = Array.isArray(editor.textElements) ? editor.textElements.slice(0, 40).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const preset: TextPreset = item.preset === "heading" || item.preset === "subheading" || item.preset === "body" ? item.preset : "text";
    return [{ id: safeId(item.id, `text-${index + 1}`), text: typeof item.text === "string" ? item.text.slice(0, 500) : "Metninizi yazın", preset }];
  }) : [];
  const imageElements = Array.isArray(editor.imageElements) ? editor.imageElements.slice(0, 40).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const source = safeImageSource(item.source);
    if (!source) return [];
    return [{ id: safeId(item.id, `image-${index + 1}`), name: clean(item.name, `Görsel ${index + 1}`, 180), source }];
  }) : [];
  return { version: 2, snapToGrid: editor.snapToGrid !== false, textElements, imageElements, layouts: { landscape: normalizeLayout(layouts.landscape), portrait: normalizeLayout(layouts.portrait) } };
};

export function normalizeRestaurantMenuConfig(input: Record<string, unknown> = {}): RestaurantMenuConfig {
  if (Object.keys(input).length === 0) return createPizzaMenuTemplate();
  const theme: RestaurantMenuConfig["theme"] = input.theme === "snack" || input.theme === "paper" || input.theme === "cream" || input.theme === "terracotta" || input.theme === "forest" ? input.theme : "charcoal";
  const categories = Array.isArray(input.categories) ? input.categories.slice(0, 6).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>; const name = clean(item.name, "", 60); if (!name) return [];
    return [{ id: safeId(item.id, `category-${index + 1}`), name }];
  }) : DEFAULT_CATEGORIES;
  const usableCategories = Array.isArray(input.categories) ? categories : DEFAULT_CATEGORIES;
  const categoryIds = new Set(usableCategories.map(item => item.id));
  const firstCategory = usableCategories[0]?.id ?? "menu";
  const items = Array.isArray(input.items) ? input.items.slice(0, 24).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>; const name = clean(item.name, "", 90); if (!name) return [];
    const requestedCategory = optional(item.categoryId, 64);
    const badge: MenuBadge = item.badge === "popular" || item.badge === "new" || item.badge === "chef" || item.badge === "vegan" ? item.badge : "none";
    return [{ id: safeId(item.id, `item-${index + 1}`), categoryId: categoryIds.has(requestedCategory) ? requestedCategory : firstCategory, name, description: optional(item.description, 180), price: optional(item.price, 24), badge, available: item.available !== false }];
  }) : DEFAULT_ITEMS;
  return {
    restaurantName: typeof input.restaurantName === "string" ? optional(input.restaurantName, 80) : "Masa & Ateş", heading: typeof input.heading === "string" ? optional(input.heading, 100) : "Günün Menüsü",
    subtitle: optional(input.subtitle, 220), locale: input.locale === "en" ? "en" : "tr",
    currency: input.currency === "$" || input.currency === "€" || input.currency === "£" ? input.currency : "₺",
    currencyPosition: input.currencyPosition === "before" ? "before" : "after",
    layout: input.layout === "board" || input.layout === "editorial" ? input.layout : "columns", theme,
    accentColor: safeColor(input.accentColor, THEMES[theme].accent), categories: usableCategories, items,
    showDescriptions: input.showDescriptions !== false, showUnavailable: input.showUnavailable === true,
    footer: typeof input.footer === "string" ? input.footer.trim().slice(0, 220) : "Alerjen bilgisi için ekibimize danışabilirsiniz. Fiyatlara KDV dahildir.",
    editor: normalizeEditor(input.editor)
  };
}

const automaticCanvasLayout = (orientation: "landscape" | "portrait", kind: "restaurantName" | "heading" | "subtitle" | "footer" | "category" | "item" | "customText" | "image", categoryIndex = 0, itemIndex = 0, categoryCount = 3): CanvasElement => {
  if (kind === "customText") return { x: 30, y: 30, width: 36, height: 9, fontScale: 1, align: "center", zIndex: 20 };
  if (kind === "image") return { x: 36, y: 30, width: orientation === "portrait" ? 42 : 24, height: 24, fontScale: 1, align: "center", zIndex: 18, rotation: 0 };
  if (kind === "restaurantName") return orientation === "portrait" ? { x: 7, y: 5, width: 86, height: 4, fontScale: 1, align: "left", zIndex: 2 } : { x: 6, y: 7, width: 43, height: 5, fontScale: 1, align: "left", zIndex: 2 };
  if (kind === "heading") return orientation === "portrait" ? { x: 7, y: 10, width: 86, height: 9, fontScale: 1, align: "left", zIndex: 2 } : { x: 6, y: 13, width: 48, height: 12, fontScale: 1, align: "left", zIndex: 2 };
  if (kind === "subtitle") return orientation === "portrait" ? { x: 7, y: 20, width: 86, height: 7, fontScale: 1, align: "left", zIndex: 2 } : { x: 57, y: 14, width: 37, height: 9, fontScale: 1, align: "right", zIndex: 2 };
  if (kind === "footer") return { x: orientation === "portrait" ? 7 : 6, y: 92, width: orientation === "portrait" ? 86 : 88, height: 4, fontScale: 1, align: "center", zIndex: 2 };
  if (orientation === "portrait") {
    const column = categoryIndex % 2; const row = Math.floor(categoryIndex / 2); const baseY = 31 + row * 29;
    return kind === "category"
      ? { x: 7 + column * 45, y: baseY, width: 41, height: 4, fontScale: 1, align: "left", zIndex: 2 }
      : { x: 7 + column * 45, y: baseY + 5 + itemIndex * 10.5, width: 41, height: 9.5, fontScale: 1, align: "left", zIndex: 2 };
  }
  const gap = 4; const width = (88 - gap * Math.max(0, categoryCount - 1)) / Math.max(1, categoryCount); const x = 6 + categoryIndex * (width + gap);
  return kind === "category" ? { x, y: 34, width, height: 5, fontScale: 1, align: "left", zIndex: 2 } : { x, y: 42 + itemIndex * 16, width, height: 14, fontScale: 1, align: "left", zIndex: 2 };
};

const mergeCanvasLayout = (base: CanvasElement, override: CanvasElement | undefined): CanvasElement => override ? { ...base, ...override } : base;
const canvasVariables = (landscape: CanvasElement, portrait: CanvasElement) => {
  const values = [
    `--lx:${landscape.x}%`, `--ly:${landscape.y}%`, `--lw:${landscape.width}%`, `--lh:${landscape.height}%`, `--lfs:${landscape.fontScale}`, `--la:${landscape.align}`, `--lz:${landscape.zIndex}`,
    `--px:${portrait.x}%`, `--py:${portrait.y}%`, `--pw:${portrait.width}%`, `--ph:${portrait.height}%`, `--pfs:${portrait.fontScale}`, `--pa:${portrait.align}`, `--pz:${portrait.zIndex}`
  ];
  if (landscape.color?.startsWith("linear-gradient(")) values.push("--lc:transparent", `--lbg:${landscape.color}`);
  else if (landscape.color) values.push(`--lc:${landscape.color}`);
  if (landscape.fontFamily) values.push(`--lff:${landscape.fontFamily === "serif" ? "Georgia,Times New Roman,serif" : "Arial,sans-serif"}`);
  if (portrait.fontFamily) values.push(`--pff:${portrait.fontFamily === "serif" ? "Georgia,Times New Roman,serif" : "Arial,sans-serif"}`);
  if (landscape.fontWeight) values.push(`--lfw:${landscape.fontWeight}`);
  if (landscape.fontStyle) values.push(`--lfi:${landscape.fontStyle}`);
  if (landscape.textDecoration) values.push(`--ltd:${landscape.textDecoration}`);
  if (landscape.textTransform) values.push(`--ltt:${landscape.textTransform === "sentence" ? "capitalize" : landscape.textTransform}`);
  if (landscape.rotation !== undefined) values.push(`--lr:${landscape.rotation}deg`);
  if (portrait.color?.startsWith("linear-gradient(")) values.push("--pc:transparent", `--pbg:${portrait.color}`);
  else if (portrait.color) values.push(`--pc:${portrait.color}`);
  if (portrait.fontWeight) values.push(`--pfw:${portrait.fontWeight}`);
  if (portrait.fontStyle) values.push(`--pfi:${portrait.fontStyle}`);
  if (portrait.textDecoration) values.push(`--ptd:${portrait.textDecoration}`);
  if (portrait.textTransform) values.push(`--ptt:${portrait.textTransform === "sentence" ? "capitalize" : portrait.textTransform}`);
  if (portrait.rotation !== undefined) values.push(`--pr:${portrait.rotation}deg`);
  return values.join(";");
};

const transformMenuText = (value: string, transform: CanvasElement["textTransform"]) => {
  if (transform === "uppercase") return value.toLocaleUpperCase("tr-TR");
  if (transform === "lowercase") return value.toLocaleLowerCase("tr-TR");
  if (transform === "sentence") {
    const lower = value.toLocaleLowerCase("tr-TR");
    return lower.replace(/[A-Za-zÇĞİÖŞÜçğıöşü]/, character => character.toLocaleUpperCase("tr-TR"));
  }
  return value;
};
const customTextContent = (value: string, layout: CanvasElement) => {
  const lines = transformMenuText(value, layout.textTransform).split(/\r?\n/);
  if (layout.listStyle === "bullet" || layout.listStyle === "number") {
    return lines.map((line, index) => `<span class="custom-line"><span>${layout.listStyle === "bullet" ? "•" : `${index + 1}.`}</span><span>${escapeHtml(line) || "&nbsp;"}</span></span>`).join("");
  }
  return escapeHtml(lines.join("\n")) || "&nbsp;";
};

export function renderRestaurantMenuHtml(title: string, raw: Record<string, unknown> = {}): string {
  const config = normalizeRestaurantMenuConfig(raw); const theme = THEMES[config.theme];
  const badges: Record<MenuBadge, string> = config.locale === "tr" ? { none: "", popular: "POPÜLER", new: "YENİ", chef: "ŞEFİN SEÇİMİ", vegan: "VEGAN" } : { none: "", popular: "POPULAR", new: "NEW", chef: "CHEF'S PICK", vegan: "VEGAN" };
  const price = (value: string) => config.currencyPosition === "before" ? `${config.currency}${value}` : `${value} ${config.currency}`;
  const visibleItems = config.items.filter(item => item.available || config.showUnavailable);
  const visibleCategories = config.categories.filter(category => visibleItems.some(item => item.categoryId === category.id)).slice(0, 4);
  const landscapeCategoryCount = Math.max(1, Math.min(3, visibleCategories.length));
  const vars = (id: string, kind: Parameters<typeof automaticCanvasLayout>[1], categoryIndex = 0, itemIndex = 0) => canvasVariables(
    mergeCanvasLayout(automaticCanvasLayout("landscape", kind, categoryIndex, itemIndex, landscapeCategoryCount), config.editor.layouts.landscape[id]),
    mergeCanvasLayout(automaticCanvasLayout("portrait", kind, categoryIndex, itemIndex, visibleCategories.length), config.editor.layouts.portrait[id])
  );
  const categoryHtml = visibleCategories.map((category, categoryIndex) => {
    const visibility = categoryIndex === 3 ? " portrait-only" : "";
    const heading = `<h2 class="block category${visibility}" style="${vars(`category:${category.id}`, "category", categoryIndex)}">${escapeHtml(category.name)}</h2>`;
    const itemHtml = visibleItems.filter(item => item.categoryId === category.id).slice(0, 3).map((item, itemIndex) => `<article class="block item${visibility}${itemIndex === 2 ? " landscape-only" : ""}${item.available ? "" : " unavailable"}" style="${vars(`item:${item.id}`, "item", categoryIndex, itemIndex)}"><div class="item-line"><strong>${escapeHtml(item.name)}</strong><b>${escapeHtml(price(item.price))}</b></div>${item.badge !== "none" ? `<span class="badge">${escapeHtml(badges[item.badge])}</span>` : ""}${config.showDescriptions && item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}</article>`).join("");
    return heading + itemHtml;
  }).join("");
  const customTextHtml = config.editor.textElements.map(element => {
    const id = `text:${element.id}`;
    const landscape = mergeCanvasLayout(automaticCanvasLayout("landscape", "customText"), config.editor.layouts.landscape[id]);
    const portrait = mergeCanvasLayout(automaticCanvasLayout("portrait", "customText"), config.editor.layouts.portrait[id]);
    return `<div class="block custom-text custom-text-${element.preset}" style="${canvasVariables(landscape, portrait)}"><span class="landscape-content">${customTextContent(element.text, landscape)}</span><span class="portrait-content">${customTextContent(element.text, portrait)}</span></div>`;
  }).join("");
  const customImageHtml = config.editor.imageElements.map(element => {
    const id = `image:${element.id}`;
    const landscape = mergeCanvasLayout(automaticCanvasLayout("landscape", "image"), config.editor.layouts.landscape[id]);
    const portrait = mergeCanvasLayout(automaticCanvasLayout("portrait", "image"), config.editor.layouts.portrait[id]);
    return `<div class="block custom-image" style="${canvasVariables(landscape, portrait)}"><img class="landscape-image" src="${escapeHtml(menuDecorationSource(element.source))}" alt="${escapeHtml(element.name)}"><img class="portrait-image" src="${escapeHtml(menuDecorationSource(element.source))}" alt="${escapeHtml(element.name)}"></div>`;
  }).join("");
  return `<!doctype html><html lang="${config.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><title>${escapeHtml(title)}</title><style>
    :root{color-scheme:${theme.scheme};--bg:${theme.bg};--surface:${theme.surface};--text:${theme.text};--muted:${theme.muted};--line:${theme.line};--accent:${config.accentColor}}
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}body{background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}.stage{position:relative;width:100%;height:100%;min-height:100vh;overflow:hidden;container-type:size}.stage:before,.stage:after{content:"";position:absolute;left:6%;right:6%;border-top:1px solid var(--line)}.stage:before{top:28%}.stage:after{top:90%}
    .block{position:absolute;left:var(--lx);top:var(--ly);width:var(--lw);height:var(--lh);z-index:var(--lz);overflow:hidden;text-align:var(--la);font-size:calc(var(--base)*var(--lfs));overflow-wrap:anywhere;color:var(--lc,inherit);background-image:var(--lbg,none);background-clip:text;-webkit-background-clip:text;font-weight:var(--lfw,inherit);font-style:var(--lfi,normal);text-decoration:var(--ltd,none);text-transform:var(--ltt,none);font-family:var(--lff,inherit)}.brand{--base:1.15cqw;color:var(--lc,var(--accent));font-weight:var(--lfw,900);line-height:1.25;letter-spacing:.17em;text-transform:var(--ltt,uppercase)}.heading{--base:4.6cqw;margin:0;line-height:1.02;letter-spacing:-.04em}.subtitle{--base:1.25cqw;margin:0;color:var(--lc,var(--muted));line-height:1.45}.category{--base:1.35cqw;margin:0;color:var(--lc,var(--accent));line-height:1.25;letter-spacing:.12em;text-transform:var(--ltt,uppercase)}.item{--base:1.4cqw;padding-top:.55em;border-top:1px solid var(--line)}.item-line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.65em;align-items:baseline}.item-line strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:1em}.item-line b{color:var(--lc,var(--accent));font-size:.95em;white-space:nowrap}.badge{display:block;margin-top:.45em;color:var(--lc,var(--accent));font-size:.5em;font-weight:900;letter-spacing:.1em}.item p{margin:.4em 0 0;color:var(--lc,var(--muted));font-size:.62em;line-height:1.35}.footer{--base:1.05cqw;color:var(--lc,var(--muted));line-height:1.3}.custom-text{--base:1.3cqw;line-height:1.2;white-space:pre-wrap;text-transform:none}.custom-text-heading{font-weight:var(--lfw,900)}.custom-text-subheading{font-weight:var(--lfw,700)}.custom-text-body{font-weight:var(--lfw,500)}.custom-line{display:grid;grid-template-columns:1.4em 1fr;gap:.25em}.portrait-content{display:none}.custom-image{overflow:visible;background:none}.custom-image img{display:block;width:100%;height:100%;object-fit:contain;transform:rotate(var(--lr,0deg));transform-origin:center}.custom-image .portrait-image{display:none}.unavailable{opacity:.42}.portrait-only{display:none}body[data-layout=board] .item{padding:.65em;border:1px solid var(--line);border-radius:.65em;background-color:var(--surface)}body[data-layout=editorial] .item-line strong{letter-spacing:-.02em}
    @media(max-aspect-ratio:1/1){.stage:before{top:28%}.block{left:var(--px);top:var(--py);width:var(--pw);height:var(--ph);z-index:var(--pz);text-align:var(--pa);font-size:calc(var(--portrait-base,var(--base))*var(--pfs));color:var(--pc,var(--lc,inherit));background-image:var(--pbg,var(--lbg,none));font-weight:var(--pfw,var(--lfw,inherit));font-style:var(--pfi,var(--lfi,normal));text-decoration:var(--ptd,var(--ltd,none));text-transform:var(--ptt,var(--ltt,none));font-family:var(--pff,var(--lff,inherit))}.brand{--portrait-base:2.2cqw;color:var(--pc,var(--lc,var(--accent)));font-weight:var(--pfw,var(--lfw,900));text-transform:var(--ptt,var(--ltt,uppercase))}.heading{--portrait-base:8.4cqw}.subtitle{--portrait-base:2.25cqw;color:var(--pc,var(--lc,var(--muted)))}.category{--portrait-base:2.5cqw;color:var(--pc,var(--lc,var(--accent)));text-transform:var(--ptt,var(--ltt,uppercase))}.item{--portrait-base:2.75cqw}.item-line b,.badge{color:var(--pc,var(--lc,var(--accent)))}.item p{color:var(--pc,var(--lc,var(--muted)))}.footer{--portrait-base:1.9cqw;color:var(--pc,var(--lc,var(--muted)))}.custom-text{--portrait-base:2.3cqw;text-transform:none}.landscape-content{display:none}.portrait-content{display:inline}.custom-image .landscape-image{display:none}.custom-image .portrait-image{display:block;transform:rotate(var(--pr,var(--lr,0deg)))}.portrait-only{display:block}.landscape-only{display:none}}
    body[data-theme=snack] .custom-text{--base:2.8cqw;--portrait-base:5.4cqw}
    body[data-theme=paper] .custom-text{--base:1.6cqw;--portrait-base:2.8cqw}
    @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  </style></head><body data-theme="${config.theme}" data-layout="${config.layout}"><main class="stage"><div class="block brand" style="${vars("restaurantName", "restaurantName")}">${escapeHtml(config.restaurantName)}</div><h1 class="block heading" style="${vars("heading", "heading")}">${escapeHtml(config.heading)}</h1><p class="block subtitle" style="${vars("subtitle", "subtitle")}">${escapeHtml(config.subtitle)}</p>${categoryHtml}<footer class="block footer" style="${vars("footer", "footer")}">${escapeHtml(config.footer)}</footer>${customTextHtml}${customImageHtml}</main></body></html>`;
}
