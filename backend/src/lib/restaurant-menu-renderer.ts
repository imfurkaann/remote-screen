type MenuBadge = "none" | "popular" | "new" | "chef" | "vegan";
type MenuCategory = { id: string; name: string };
type MenuItem = { id: string; categoryId: string; name: string; description: string; price: string; badge: MenuBadge; available: boolean };
type CanvasElement = { x: number; y: number; width: number; height: number; fontScale: number; align: "left" | "center" | "right"; zIndex: number };
type EditorConfig = { version: 1; snapToGrid: boolean; layouts: { landscape: Record<string, CanvasElement>; portrait: Record<string, CanvasElement> } };
export type RestaurantMenuConfig = {
  restaurantName: string; heading: string; subtitle: string; locale: "tr" | "en";
  currency: "₺" | "$" | "€" | "£"; currencyPosition: "before" | "after";
  layout: "board" | "columns" | "editorial"; theme: "charcoal" | "cream" | "terracotta" | "forest";
  accentColor: string; categories: MenuCategory[]; items: MenuItem[];
  showDescriptions: boolean; showUnavailable: boolean; footer: string; editor: EditorConfig;
};

const THEMES = {
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
const escapeHtml = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const bounded = (value: unknown, fallback: number, min: number, max: number) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const normalizeLayout = (value: unknown): Record<string, CanvasElement> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 80).flatMap(([key, raw]) => {
    if (!/^(restaurantName|heading|subtitle|footer|category:[a-zA-Z0-9_-]+|item:[a-zA-Z0-9_-]+)$/.test(key) || !raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const width = bounded(item.width, 24, 6, 96); const height = bounded(item.height, 10, 3, 92);
    return [[key, { x: bounded(item.x, 0, 0, 100 - width), y: bounded(item.y, 0, 0, 100 - height), width, height, fontScale: bounded(item.fontScale, 1, .55, 2.4), align: item.align === "center" || item.align === "right" ? item.align : "left", zIndex: Math.round(bounded(item.zIndex, 1, 1, 30)) } satisfies CanvasElement]];
  }));
};
const normalizeEditor = (value: unknown): EditorConfig => {
  const editor = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const layouts = editor.layouts && typeof editor.layouts === "object" ? editor.layouts as Record<string, unknown> : {};
  return { version: 1, snapToGrid: editor.snapToGrid !== false, layouts: { landscape: normalizeLayout(layouts.landscape), portrait: normalizeLayout(layouts.portrait) } };
};

export function normalizeRestaurantMenuConfig(input: Record<string, unknown> = {}): RestaurantMenuConfig {
  const theme: RestaurantMenuConfig["theme"] = input.theme === "cream" || input.theme === "terracotta" || input.theme === "forest" ? input.theme : "charcoal";
  const categories = Array.isArray(input.categories) ? input.categories.slice(0, 6).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>; const name = clean(item.name, "", 60); if (!name) return [];
    return [{ id: safeId(item.id, `category-${index + 1}`), name }];
  }) : DEFAULT_CATEGORIES;
  const usableCategories = categories.length ? categories : DEFAULT_CATEGORIES;
  const categoryIds = new Set(usableCategories.map(item => item.id));
  const firstCategory = usableCategories[0]!.id;
  const items = Array.isArray(input.items) ? input.items.slice(0, 24).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>; const name = clean(item.name, "", 90); if (!name) return [];
    const requestedCategory = optional(item.categoryId, 64);
    const badge: MenuBadge = item.badge === "popular" || item.badge === "new" || item.badge === "chef" || item.badge === "vegan" ? item.badge : "none";
    return [{ id: safeId(item.id, `item-${index + 1}`), categoryId: categoryIds.has(requestedCategory) ? requestedCategory : firstCategory, name, description: optional(item.description, 180), price: optional(item.price, 24), badge, available: item.available !== false }];
  }) : DEFAULT_ITEMS;
  return {
    restaurantName: clean(input.restaurantName, "Masa & Ateş", 80), heading: clean(input.heading, "Günün Menüsü", 100),
    subtitle: optional(input.subtitle, 220), locale: input.locale === "en" ? "en" : "tr",
    currency: input.currency === "$" || input.currency === "€" || input.currency === "£" ? input.currency : "₺",
    currencyPosition: input.currencyPosition === "before" ? "before" : "after",
    layout: input.layout === "board" || input.layout === "editorial" ? input.layout : "columns", theme,
    accentColor: safeColor(input.accentColor, THEMES[theme].accent), categories: usableCategories, items: items.length ? items : DEFAULT_ITEMS,
    showDescriptions: input.showDescriptions !== false, showUnavailable: input.showUnavailable === true,
    footer: typeof input.footer === "string" ? input.footer.trim().slice(0, 220) : "Alerjen bilgisi için ekibimize danışabilirsiniz. Fiyatlara KDV dahildir.",
    editor: normalizeEditor(input.editor)
  };
}

const automaticCanvasLayout = (orientation: "landscape" | "portrait", kind: "restaurantName" | "heading" | "subtitle" | "footer" | "category" | "item", categoryIndex = 0, itemIndex = 0, categoryCount = 3): CanvasElement => {
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
const canvasVariables = (landscape: CanvasElement, portrait: CanvasElement) => [
  `--lx:${landscape.x}%`, `--ly:${landscape.y}%`, `--lw:${landscape.width}%`, `--lh:${landscape.height}%`, `--lfs:${landscape.fontScale}`, `--la:${landscape.align}`, `--lz:${landscape.zIndex}`,
  `--px:${portrait.x}%`, `--py:${portrait.y}%`, `--pw:${portrait.width}%`, `--ph:${portrait.height}%`, `--pfs:${portrait.fontScale}`, `--pa:${portrait.align}`, `--pz:${portrait.zIndex}`
].join(";");

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
  return `<!doctype html><html lang="${config.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><title>${escapeHtml(title)}</title><style>
    :root{color-scheme:${theme.scheme};--bg:${theme.bg};--surface:${theme.surface};--text:${theme.text};--muted:${theme.muted};--line:${theme.line};--accent:${config.accentColor}}
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}body{background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}.stage{position:relative;width:100%;height:100%;min-height:100vh;overflow:hidden;container-type:size}.stage:before,.stage:after{content:"";position:absolute;left:6%;right:6%;border-top:1px solid var(--line)}.stage:before{top:28%}.stage:after{top:90%}
    .block{position:absolute;left:var(--lx);top:var(--ly);width:var(--lw);height:var(--lh);z-index:var(--lz);overflow:hidden;text-align:var(--la);font-size:calc(var(--base)*var(--lfs));overflow-wrap:anywhere}.brand{--base:1.15cqw;color:var(--accent);font-weight:900;line-height:1.25;letter-spacing:.17em;text-transform:uppercase}.heading{--base:4.6cqw;margin:0;line-height:1.02;letter-spacing:-.04em}.subtitle{--base:1.25cqw;margin:0;color:var(--muted);line-height:1.45}.category{--base:1.35cqw;margin:0;color:var(--accent);line-height:1.25;letter-spacing:.12em;text-transform:uppercase}.item{--base:1.4cqw;padding-top:.55em;border-top:1px solid var(--line)}.item-line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.65em;align-items:baseline}.item-line strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:1em}.item-line b{color:var(--accent);font-size:.95em;white-space:nowrap}.badge{display:block;margin-top:.45em;color:var(--accent);font-size:.5em;font-weight:900;letter-spacing:.1em}.item p{margin:.4em 0 0;color:var(--muted);font-size:.62em;line-height:1.35}.footer{--base:1.05cqw;color:var(--muted);line-height:1.3}.unavailable{opacity:.42}.portrait-only{display:none}body[data-layout=board] .item{padding:.65em;border:1px solid var(--line);border-radius:.65em;background:var(--surface)}body[data-layout=editorial] .item-line strong{letter-spacing:-.02em}
    @media(max-aspect-ratio:1/1){.stage:before{top:28%}.block{left:var(--px);top:var(--py);width:var(--pw);height:var(--ph);z-index:var(--pz);text-align:var(--pa);font-size:calc(var(--portrait-base,var(--base))*var(--pfs))}.brand{--portrait-base:2.2cqw}.heading{--portrait-base:8.4cqw}.subtitle{--portrait-base:2.25cqw}.category{--portrait-base:2.5cqw}.item{--portrait-base:2.75cqw}.footer{--portrait-base:1.9cqw}.portrait-only{display:block}.landscape-only{display:none}}
    @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  </style></head><body data-layout="${config.layout}"><main class="stage"><div class="block brand" style="${vars("restaurantName", "restaurantName")}">${escapeHtml(config.restaurantName)}</div><h1 class="block heading" style="${vars("heading", "heading")}">${escapeHtml(config.heading)}</h1><p class="block subtitle" style="${vars("subtitle", "subtitle")}">${escapeHtml(config.subtitle)}</p>${categoryHtml}<footer class="block footer" style="${vars("footer", "footer")}">${escapeHtml(config.footer)}</footer></main></body></html>`;
}
