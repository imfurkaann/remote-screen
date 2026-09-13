"use client";

import { useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

export type MenuBadge = "none" | "popular" | "new" | "chef" | "vegan";
export type RestaurantMenuItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: string;
  badge: MenuBadge;
  available: boolean;
};
export type RestaurantMenuCategory = { id: string; name: string };
export type RestaurantMenuCanvasElement = {
  x: number;
  y: number;
  width: number;
  height: number;
  fontScale: number;
  align: "left" | "center" | "right";
  zIndex: number;
};
export type RestaurantMenuEditorConfig = {
  version: 1;
  snapToGrid: boolean;
  layouts: {
    landscape: Record<string, RestaurantMenuCanvasElement>;
    portrait: Record<string, RestaurantMenuCanvasElement>;
  };
};
export type RestaurantMenuConfig = {
  restaurantName: string;
  heading: string;
  subtitle: string;
  locale: "tr" | "en";
  currency: "₺" | "$" | "€" | "£";
  currencyPosition: "before" | "after";
  layout: "board" | "columns" | "editorial";
  theme: "charcoal" | "cream" | "terracotta" | "forest";
  accentColor: string;
  categories: RestaurantMenuCategory[];
  items: RestaurantMenuItem[];
  showDescriptions: boolean;
  showUnavailable: boolean;
  footer: string;
  editor: RestaurantMenuEditorConfig;
};

const EMPTY_EDITOR: RestaurantMenuEditorConfig = {
  version: 1,
  snapToGrid: true,
  layouts: { landscape: {}, portrait: {} }
};

const THEMES = {
  charcoal: { name: "Antrasit", note: "Modern ve güçlü", bg: "linear-gradient(145deg,#111315,#1d2225 58%,#272e31)", surface: "rgba(255,255,255,.055)", text: "#f7f5ef", muted: "#b8b5ad", line: "rgba(255,255,255,.11)", accent: "#f3c969" },
  cream: { name: "Krem", note: "Sade ve premium", bg: "linear-gradient(145deg,#fffdf7,#f4ecdd 62%,#eadbc4)", surface: "rgba(255,255,255,.7)", text: "#29231d", muted: "#786d62", line: "rgba(41,35,29,.12)", accent: "#9a5b2b" },
  terracotta: { name: "Terakota", note: "Sıcak ve iştah açıcı", bg: "linear-gradient(145deg,#3b1712,#752d22 55%,#a94734)", surface: "rgba(255,255,255,.065)", text: "#fff8f2", muted: "#f4c7ba", line: "rgba(255,255,255,.13)", accent: "#ffd08a" },
  forest: { name: "Orman", note: "Doğal ve seçkin", bg: "linear-gradient(145deg,#0b241d,#164537 58%,#23634f)", surface: "rgba(255,255,255,.06)", text: "#f2fbf6", muted: "#b7d8ca", line: "rgba(255,255,255,.13)", accent: "#e8ce7d" }
} as const;

const BASE_CATEGORIES: RestaurantMenuCategory[] = [
  { id: "starters", name: "Başlangıçlar" },
  { id: "mains", name: "Ana Yemekler" },
  { id: "drinks", name: "İçecekler" }
];

const BASE_ITEMS: RestaurantMenuItem[] = [
  { id: "soup", categoryId: "starters", name: "Günün Çorbası", description: "Mevsim ürünleri ve taze otlar", price: "140", badge: "chef", available: true },
  { id: "bruschetta", categoryId: "starters", name: "Domatesli Bruschetta", description: "Ekşi maya, fesleğen ve zeytinyağı", price: "210", badge: "vegan", available: true },
  { id: "beef", categoryId: "mains", name: "Dana Bonfile", description: "Patates püresi, ızgara sebze ve demi-glace", price: "620", badge: "popular", available: true },
  { id: "pasta", categoryId: "mains", name: "Trüflü Makarna", description: "Taze makarna, parmesan ve trüf kreması", price: "390", badge: "new", available: true },
  { id: "lemonade", categoryId: "drinks", name: "Ev Yapımı Limonata", description: "Taze nane ile", price: "120", badge: "none", available: true },
  { id: "coffee", categoryId: "drinks", name: "Filtre Kahve", description: "Günün çekirdeği", price: "110", badge: "none", available: true }
];

export const DEFAULT_RESTAURANT_MENU_CONFIG: RestaurantMenuConfig = {
  restaurantName: "Masa & Ateş",
  heading: "Günün Menüsü",
  subtitle: "Mevsiminde, taze ve özenle hazırlanmış lezzetler.",
  locale: "tr",
  currency: "₺",
  currencyPosition: "after",
  layout: "columns",
  theme: "charcoal",
  accentColor: THEMES.charcoal.accent,
  categories: BASE_CATEGORIES,
  items: BASE_ITEMS,
  showDescriptions: true,
  showUnavailable: false,
  footer: "Alerjen bilgisi için ekibimize danışabilirsiniz. Fiyatlara KDV dahildir.",
  editor: EMPTY_EDITOR
};

const color = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(value ?? "")) ? String(value) : fallback;
const editable = (value: unknown, fallback: string, max: number) => typeof value === "string" ? value.slice(0, max) : fallback;
const safeId = (value: unknown, fallback: string) => editable(value, fallback, 64).replace(/[^a-zA-Z0-9_-]/g, "-") || fallback;
const bounded = (value: unknown, fallback: number, min: number, max: number) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

function normalizeCanvasLayout(value: unknown): Record<string, RestaurantMenuCanvasElement> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 80).flatMap(([key, raw]) => {
    if (!/^(restaurantName|heading|subtitle|footer|category:[a-zA-Z0-9_-]+|item:[a-zA-Z0-9_-]+)$/.test(key) || !raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const width = bounded(item.width, 24, 6, 96);
    const height = bounded(item.height, 10, 3, 92);
    return [[key, {
      x: bounded(item.x, 0, 0, 100 - width),
      y: bounded(item.y, 0, 0, 100 - height),
      width,
      height,
      fontScale: bounded(item.fontScale, 1, .55, 2.4),
      align: item.align === "center" || item.align === "right" ? item.align : "left",
      zIndex: Math.round(bounded(item.zIndex, 1, 1, 30))
    } satisfies RestaurantMenuCanvasElement]];
  }));
}

function normalizeEditor(value: unknown): RestaurantMenuEditorConfig {
  const editor = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const layouts = editor.layouts && typeof editor.layouts === "object" ? editor.layouts as Record<string, unknown> : {};
  return {
    version: 1,
    snapToGrid: editor.snapToGrid !== false,
    layouts: {
      landscape: normalizeCanvasLayout(layouts.landscape),
      portrait: normalizeCanvasLayout(layouts.portrait)
    }
  };
}

export function normalizeRestaurantMenuConfig(input: Record<string, unknown>): RestaurantMenuConfig {
  const theme: RestaurantMenuConfig["theme"] = input.theme === "cream" || input.theme === "terracotta" || input.theme === "forest" ? input.theme : "charcoal";
  const categories = Array.isArray(input.categories) ? input.categories.slice(0, 6).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    return [{ id: safeId(item.id, `category-${index + 1}`), name: editable(item.name, "", 60) }];
  }) : BASE_CATEGORIES.map(item => ({ ...item }));
  const usableCategories = categories.length ? categories : BASE_CATEGORIES.map(item => ({ ...item }));
  const fallbackCategory = usableCategories[0]?.id ?? "menu";
  const categoryIds = new Set(usableCategories.map(item => item.id));
  const items = Array.isArray(input.items) ? input.items.slice(0, 24).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const requestedCategory = editable(item.categoryId, fallbackCategory, 64);
    const badge: MenuBadge = item.badge === "popular" || item.badge === "new" || item.badge === "chef" || item.badge === "vegan" ? item.badge : "none";
    return [{
      id: safeId(item.id, `item-${index + 1}`),
      categoryId: categoryIds.has(requestedCategory) ? requestedCategory : fallbackCategory,
      name: editable(item.name, "", 90),
      description: editable(item.description, "", 180),
      price: editable(item.price, "", 24),
      badge,
      available: item.available !== false
    }];
  }) : BASE_ITEMS.map(item => ({ ...item }));
  return {
    restaurantName: editable(input.restaurantName, DEFAULT_RESTAURANT_MENU_CONFIG.restaurantName, 80),
    heading: editable(input.heading, DEFAULT_RESTAURANT_MENU_CONFIG.heading, 100),
    subtitle: editable(input.subtitle, DEFAULT_RESTAURANT_MENU_CONFIG.subtitle, 220),
    locale: input.locale === "en" ? "en" : "tr",
    currency: input.currency === "$" || input.currency === "€" || input.currency === "£" ? input.currency : "₺",
    currencyPosition: input.currencyPosition === "before" ? "before" : "after",
    layout: input.layout === "board" || input.layout === "editorial" ? input.layout : "columns",
    theme,
    accentColor: color(input.accentColor, THEMES[theme].accent),
    categories: usableCategories,
    items,
    showDescriptions: input.showDescriptions !== false,
    showUnavailable: input.showUnavailable === true,
    footer: editable(input.footer, DEFAULT_RESTAURANT_MENU_CONFIG.footer, 220),
    editor: normalizeEditor(input.editor)
  };
}

const section = { display: "flex", flexDirection: "column" as const, gap: 11, padding: 16, border: "1px solid #e2e8f0", borderRadius: 14, background: "#fff" };
const input = { width: "100%", padding: "10px 11px", borderRadius: 10, border: "1px solid #cbd5e1", color: "#0f172a", background: "#fff" };
const label = { fontSize: 12, fontWeight: 750, color: "#334155" };

function Choice({ selected, title, note, onClick }: { selected: boolean; title: string; note?: string; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} style={{ flex: 1, minWidth: 0, padding: "10px 11px", borderRadius: 10, border: selected ? "1px solid #9a5b2b" : "1px solid #dbe3ec", background: selected ? "#fff7ed" : "#fff", color: selected ? "#7c2d12" : "#334155", textAlign: "left" }}><strong style={{ display: "block", fontSize: 12 }}>{title}</strong>{note && <small style={{ display: "block", marginTop: 2, color: selected ? "#9a5b2b" : "#94a3b8", fontSize: 9 }}>{note}</small>}</button>;
}

const PRESETS: Record<"restaurant" | "cafe" | "breakfast", Pick<RestaurantMenuConfig, "heading" | "subtitle" | "categories" | "items">> = {
  restaurant: { heading: "Günün Menüsü", subtitle: "Mevsiminde, taze ve özenle hazırlanmış lezzetler.", categories: BASE_CATEGORIES, items: BASE_ITEMS },
  cafe: {
    heading: "Kahve & Tatlı", subtitle: "Günün her anına eşlik eden taze tatlar.",
    categories: [{ id: "coffee", name: "Kahveler" }, { id: "cold", name: "Soğuk İçecekler" }, { id: "dessert", name: "Tatlılar" }],
    items: [
      { id: "latte", categoryId: "coffee", name: "Cafe Latte", description: "Çift espresso ve ipeksi süt", price: "145", badge: "popular", available: true },
      { id: "filter", categoryId: "coffee", name: "Filtre Kahve", description: "Günün çekirdeği", price: "120", badge: "none", available: true },
      { id: "coldbrew", categoryId: "cold", name: "Cold Brew", description: "18 saat soğuk demleme", price: "165", badge: "new", available: true },
      { id: "cheesecake", categoryId: "dessert", name: "San Sebastian", description: "Akışkan dokulu fırın cheesecake", price: "220", badge: "chef", available: true }
    ]
  },
  breakfast: {
    heading: "Kahvaltı Menüsü", subtitle: "Güne taze, yerel ve doyurucu bir başlangıç.",
    categories: [{ id: "plates", name: "Kahvaltılar" }, { id: "eggs", name: "Yumurtalar" }, { id: "drinks", name: "İçecekler" }],
    items: [
      { id: "spread", categoryId: "plates", name: "Serpme Kahvaltı", description: "İki kişilik zengin kahvaltı seçkisi", price: "790", badge: "popular", available: true },
      { id: "healthy", categoryId: "plates", name: "Fit Tabak", description: "Avokado, lor, yumurta ve yeşillik", price: "320", badge: "new", available: true },
      { id: "menemen", categoryId: "eggs", name: "Menemen", description: "Domates, biber ve çiftlik yumurtası", price: "240", badge: "chef", available: true },
      { id: "tea", categoryId: "drinks", name: "Sınırsız Çay", description: "Kahvaltı boyunca", price: "90", badge: "none", available: true }
    ]
  }
};

export function RestaurantMenuSettings({ config: raw, onChange }: { config: Record<string, unknown>; onChange: (next: RestaurantMenuConfig) => void }) {
  const config = normalizeRestaurantMenuConfig(raw);
  const set = <K extends keyof RestaurantMenuConfig>(key: K, value: RestaurantMenuConfig[K]) => onChange({ ...config, [key]: value });
  const applyPreset = (key: keyof typeof PRESETS) => {
    const preset = PRESETS[key];
    onChange({ ...config, ...preset, categories: preset.categories.map(item => ({ ...item })), items: preset.items.map(item => ({ ...item })), editor: EMPTY_EDITOR });
  };
  const patchCategory = (index: number, name: string) => set("categories", config.categories.map((item, itemIndex) => itemIndex === index ? { ...item, name } : item));
  const removeCategory = (index: number) => {
    if (config.categories.length <= 1) return;
    const removed = config.categories[index];
    const next = config.categories.filter((_, itemIndex) => itemIndex !== index);
    const fallback = next[0]!.id;
    onChange({ ...config, categories: next, items: config.items.map(item => item.categoryId === removed?.id ? { ...item, categoryId: fallback } : item) });
  };
  const addCategory = () => config.categories.length < 6 && set("categories", [...config.categories, { id: `category-${Date.now().toString(36)}`, name: config.locale === "tr" ? "Yeni Kategori" : "New Category" }]);
  const patchItem = (index: number, patch: Partial<RestaurantMenuItem>) => set("items", config.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const addItem = () => config.items.length < 24 && set("items", [...config.items, { id: `item-${Date.now().toString(36)}`, categoryId: config.categories[0]!.id, name: config.locale === "tr" ? "Yeni ürün" : "New item", description: "", price: "", badge: "none", available: true }]);
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div><strong style={{ color: "#0f172a" }}>Restoran Menüsü</strong><p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 11, lineHeight: 1.5 }}>Fiyatları ve ürünleri saniyeler içinde güncellenebilen profesyonel dijital menü oluşturun.</p></div>
    <section style={section}>
      <span style={label}>Hızlı şablon</span><div style={{ display: "flex", gap: 8 }}><Choice selected={false} title="Restoran" onClick={() => applyPreset("restaurant")} /><Choice selected={false} title="Kafe" onClick={() => applyPreset("cafe")} /><Choice selected={false} title="Kahvaltı" onClick={() => applyPreset("breakfast")} /></div>
      <small style={{ color: "#94a3b8", lineHeight: 1.45 }}>Şablon seçimi mevcut kategori ve ürün listesini değiştirir.</small>
    </section>
    <section style={section}>
      <label style={label}>İşletme adı<input maxLength={80} value={config.restaurantName} onChange={event => set("restaurantName", event.target.value)} style={{ ...input, display: "block", marginTop: 6 }} /></label>
      <label style={label}>Menü başlığı<input maxLength={100} value={config.heading} onChange={event => set("heading", event.target.value)} style={{ ...input, display: "block", marginTop: 6 }} /></label>
      <label style={label}>Kısa açıklama<textarea maxLength={220} rows={2} value={config.subtitle} onChange={event => set("subtitle", event.target.value)} style={{ ...input, display: "block", marginTop: 6, resize: "vertical" }} /></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><select aria-label="Dil" value={config.locale} onChange={event => set("locale", event.target.value as RestaurantMenuConfig["locale"])} style={input}><option value="tr">Türkçe</option><option value="en">English</option></select><select aria-label="Para birimi" value={config.currency} onChange={event => { const currency = event.target.value as RestaurantMenuConfig["currency"]; onChange({ ...config, currency, currencyPosition: currency === "$" || currency === "£" ? "before" : "after" }); }} style={input}>{["₺", "$", "€", "£"].map(value => <option key={value}>{value}</option>)}</select></div>
    </section>
    <section style={section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={label}>Kategoriler ({config.categories.length}/6)</span><button type="button" onClick={addCategory} disabled={config.categories.length >= 6} style={{ padding: "7px 10px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#334155" }}>+ Ekle</button></div>
      {config.categories.map((category, index) => <div key={category.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 7 }}><input aria-label={`Kategori ${index + 1}`} maxLength={60} value={category.name} onChange={event => patchCategory(index, event.target.value)} style={input} /><button type="button" aria-label={`Kategori ${index + 1} sil`} disabled={config.categories.length <= 1} onClick={() => removeCategory(index)} className="studio-delete-button">Sil</button></div>)}
    </section>
    <section style={section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={label}>Ürünler ({config.items.length}/24)</span><button type="button" onClick={addItem} disabled={config.items.length >= 24} style={{ padding: "7px 10px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#334155" }}>+ Ürün ekle</button></div>
      {config.items.map((item, index) => <div key={item.id} style={{ display: "grid", gap: 8, padding: 11, border: "1px solid #e2e8f0", borderRadius: 11, background: "#f8fafc" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: 11, color: "#475569" }}>Ürün {index + 1}</b><button type="button" disabled={config.items.length <= 1} onClick={() => set("items", config.items.filter((_, itemIndex) => itemIndex !== index))} className="studio-delete-button">Sil</button></div>
        <div className="studio-field-grid"><input aria-label="Ürün adı" maxLength={90} value={item.name} onChange={event => patchItem(index, { name: event.target.value })} placeholder="Ürün adı" style={input} /><input aria-label="Fiyat" maxLength={24} value={item.price} onChange={event => patchItem(index, { price: event.target.value })} placeholder="0,00" inputMode="decimal" style={input} /></div>
        <input aria-label="Ürün açıklaması" maxLength={180} value={item.description} onChange={event => patchItem(index, { description: event.target.value })} placeholder="Kısa ürün açıklaması" style={input} />
        <div className="studio-field-grid"><select aria-label="Kategori" value={item.categoryId} onChange={event => patchItem(index, { categoryId: event.target.value })} style={input}>{config.categories.map(category => <option key={category.id} value={category.id}>{category.name || "Adsız kategori"}</option>)}</select><select aria-label="Ürün etiketi" value={item.badge} onChange={event => patchItem(index, { badge: event.target.value as MenuBadge })} style={input}><option value="none">Etiketsiz</option><option value="popular">Popüler</option><option value="new">Yeni</option><option value="chef">Şefin seçimi</option><option value="vegan">Vegan</option></select></div>
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#475569" }}>Satışta<input type="checkbox" checked={item.available} onChange={event => patchItem(index, { available: event.target.checked })} /></label>
      </div>)}
    </section>
    <section style={section}>
      <span style={label}>Yerleşim</span><div style={{ display: "flex", gap: 8 }}><Choice selected={config.layout === "columns"} title="Sütunlar" note="Klasik menü" onClick={() => set("layout", "columns")} /><Choice selected={config.layout === "board"} title="Pano" note="Ürün kartları" onClick={() => set("layout", "board")} /><Choice selected={config.layout === "editorial"} title="Editoryal" note="Premium görünüm" onClick={() => set("layout", "editorial")} /></div>
      <span style={label}>Tema</span><div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>{(Object.keys(THEMES) as RestaurantMenuConfig["theme"][]).map(key => <button type="button" key={key} aria-pressed={config.theme === key} onClick={() => onChange({ ...config, theme: key, accentColor: THEMES[key].accent })} style={{ padding: 9, textAlign: "left", border: config.theme === key ? "1px solid #9a5b2b" : "1px solid #dbe3ec", background: config.theme === key ? "#fff7ed" : "#fff" }}><span style={{ display: "block", height: 27, borderRadius: 7, background: THEMES[key].bg }} /><b style={{ display: "block", marginTop: 6, fontSize: 10, color: "#334155" }}>{THEMES[key].name}</b><small style={{ color: "#94a3b8", fontSize: 8 }}>{THEMES[key].note}</small></button>)}</div>
      <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#475569" }}>Açıklamaları göster<input type="checkbox" checked={config.showDescriptions} onChange={event => set("showDescriptions", event.target.checked)} /></label>
      <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#475569" }}>Tükenen ürünleri göster<input type="checkbox" checked={config.showUnavailable} onChange={event => set("showUnavailable", event.target.checked)} /></label>
      <label style={label}>Alt bilgi<textarea maxLength={220} rows={2} value={config.footer} onChange={event => set("footer", event.target.value)} style={{ ...input, display: "block", marginTop: 6, resize: "vertical" }} /></label>
    </section>
    <section style={section}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><span style={label}>Serbest yerleşim</span><span style={{ padding: "4px 7px", borderRadius: 999, background: "#ecfdf5", color: "#047857", fontSize: 9, fontWeight: 800 }}>CANVA TİPİ</span></div>
      <p style={{ margin: 0, color: "#64748b", fontSize: 10, lineHeight: 1.55 }}>Önizlemede bir metin bloğunu seçin, sürükleyerek taşıyın; sağ alt tutamacından boyutlandırın. Yatay ve dikey düzenler ayrı kaydedilir.</p>
      <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#475569" }}>Akıllı ızgaraya hizala<input type="checkbox" checked={config.editor.snapToGrid} onChange={event => set("editor", { ...config.editor, snapToGrid: event.target.checked })} /></label>
      <button type="button" onClick={() => set("editor", { ...EMPTY_EDITOR, snapToGrid: config.editor.snapToGrid, layouts: { landscape: {}, portrait: {} } })} style={{ minHeight: 40, border: "1px solid #cbd5e1", borderRadius: 10, background: "#f8fafc", color: "#334155", fontSize: 11, fontWeight: 750 }}>Tüm yerleşimi otomatik düzene döndür</button>
    </section>
  </div>;
}

const BADGES: Record<MenuBadge, { tr: string; en: string }> = {
  none: { tr: "", en: "" }, popular: { tr: "POPÜLER", en: "POPULAR" }, new: { tr: "YENİ", en: "NEW" }, chef: { tr: "ŞEFİN SEÇİMİ", en: "CHEF'S PICK" }, vegan: { tr: "VEGAN", en: "VEGAN" }
};

type CanvasBlock = {
  id: string;
  kind: "restaurantName" | "heading" | "subtitle" | "footer" | "category" | "item";
  label: string;
  category?: RestaurantMenuCategory;
  item?: RestaurantMenuItem;
  defaultLayout: RestaurantMenuCanvasElement;
};

const automaticLayout = (
  orientation: "landscape" | "portrait",
  kind: CanvasBlock["kind"],
  categoryIndex = 0,
  itemIndex = 0,
  categoryCount = 3
): RestaurantMenuCanvasElement => {
  if (kind === "restaurantName") return orientation === "portrait"
    ? { x: 7, y: 5, width: 86, height: 4, fontScale: 1, align: "left", zIndex: 2 }
    : { x: 6, y: 7, width: 43, height: 5, fontScale: 1, align: "left", zIndex: 2 };
  if (kind === "heading") return orientation === "portrait"
    ? { x: 7, y: 10, width: 86, height: 9, fontScale: 1, align: "left", zIndex: 2 }
    : { x: 6, y: 13, width: 48, height: 12, fontScale: 1, align: "left", zIndex: 2 };
  if (kind === "subtitle") return orientation === "portrait"
    ? { x: 7, y: 20, width: 86, height: 7, fontScale: 1, align: "left", zIndex: 2 }
    : { x: 57, y: 14, width: 37, height: 9, fontScale: 1, align: "right", zIndex: 2 };
  if (kind === "footer") return { x: orientation === "portrait" ? 7 : 6, y: 92, width: orientation === "portrait" ? 86 : 88, height: 4, fontScale: 1, align: "center", zIndex: 2 };
  if (orientation === "portrait") {
    const column = categoryIndex % 2;
    const row = Math.floor(categoryIndex / 2);
    const baseY = 31 + row * 29;
    if (kind === "category") return { x: 7 + column * 45, y: baseY, width: 41, height: 4, fontScale: 1, align: "left", zIndex: 2 };
    return { x: 7 + column * 45, y: baseY + 5 + itemIndex * 10.5, width: 41, height: 9.5, fontScale: 1, align: "left", zIndex: 2 };
  }
  const gap = 4;
  const width = (88 - gap * Math.max(0, categoryCount - 1)) / Math.max(1, categoryCount);
  const x = 6 + categoryIndex * (width + gap);
  if (kind === "category") return { x, y: 34, width, height: 5, fontScale: 1, align: "left", zIndex: 2 };
  return { x, y: 42 + itemIndex * 16, width, height: 14, fontScale: 1, align: "left", zIndex: 2 };
};

export function RestaurantMenuPreview({
  config: raw,
  orientation = "landscape",
  onChange
}: {
  config: Record<string, unknown>;
  orientation?: "landscape" | "portrait";
  onChange?: (next: RestaurantMenuConfig) => void;
}) {
  const config = useMemo(() => normalizeRestaurantMenuConfig(raw), [raw]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<null | { id: string; mode: "move" | "resize"; pointerId: number; clientX: number; clientY: number; start: RestaurantMenuCanvasElement }>(null);
  const theme = THEMES[config.theme];
  const editablePreview = Boolean(onChange);
  const items = config.items.filter(item => item.available || config.showUnavailable);
  const categoryLimit = orientation === "portrait" ? 4 : 3;
  const itemLimit = orientation === "portrait" ? 2 : 3;
  const shownCategories = config.categories.filter(category => items.some(item => item.categoryId === category.id)).slice(0, categoryLimit);
  const money = (value: string) => config.currencyPosition === "before" ? `${config.currency}${value}` : `${value} ${config.currency}`;
  const portrait = orientation === "portrait";
  const overrides = config.editor.layouts[orientation];
  const blocks = useMemo<CanvasBlock[]>(() => {
    const fixed: CanvasBlock[] = [
      { id: "restaurantName", kind: "restaurantName", label: "İşletme adı", defaultLayout: automaticLayout(orientation, "restaurantName") },
      { id: "heading", kind: "heading", label: "Menü başlığı", defaultLayout: automaticLayout(orientation, "heading") },
      { id: "subtitle", kind: "subtitle", label: "Kısa açıklama", defaultLayout: automaticLayout(orientation, "subtitle") }
    ];
    shownCategories.forEach((category, categoryIndex) => {
      fixed.push({ id: `category:${category.id}`, kind: "category", label: `${category.name} başlığı`, category, defaultLayout: automaticLayout(orientation, "category", categoryIndex, 0, shownCategories.length) });
      items.filter(item => item.categoryId === category.id).slice(0, itemLimit).forEach((item, itemIndex) => {
        fixed.push({ id: `item:${item.id}`, kind: "item", label: item.name, item, defaultLayout: automaticLayout(orientation, "item", categoryIndex, itemIndex, shownCategories.length) });
      });
    });
    fixed.push({ id: "footer", kind: "footer", label: "Alt bilgi", defaultLayout: automaticLayout(orientation, "footer") });
    return fixed;
  }, [items, itemLimit, orientation, shownCategories]);
  const selectedBlock = blocks.find(block => block.id === selectedId) ?? null;
  const layoutFor = (block: CanvasBlock) => overrides[block.id] ?? block.defaultLayout;
  const selectedLayout = selectedBlock ? layoutFor(selectedBlock) : null;

  const updateLayout = (id: string, next: RestaurantMenuCanvasElement) => {
    if (!onChange) return;
    onChange({
      ...config,
      editor: {
        ...config.editor,
        layouts: {
          ...config.editor.layouts,
          [orientation]: { ...overrides, [id]: next }
        }
      }
    });
  };
  const patchSelected = (patch: Partial<RestaurantMenuCanvasElement>) => {
    if (!selectedBlock || !selectedLayout) return;
    updateLayout(selectedBlock.id, { ...selectedLayout, ...patch });
  };
  const selectAndStart = (event: ReactPointerEvent<HTMLElement>, block: CanvasBlock, mode: "move" | "resize") => {
    if (!editablePreview) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(block.id);
    canvasRef.current?.setPointerCapture(event.pointerId);
    interaction.current = { id: block.id, mode, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, start: layoutFor(block) };
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = interaction.current;
    const canvas = canvasRef.current;
    if (!active || !canvas || active.pointerId !== event.pointerId) return;
    const bounds = canvas.getBoundingClientRect();
    const dx = (event.clientX - active.clientX) / bounds.width * 100;
    const dy = (event.clientY - active.clientY) / bounds.height * 100;
    const snap = (value: number) => config.editor.snapToGrid ? Math.round(value * 2) / 2 : Math.round(value * 10) / 10;
    const next = active.mode === "move"
      ? { ...active.start, x: snap(Math.min(100 - active.start.width, Math.max(0, active.start.x + dx))), y: snap(Math.min(100 - active.start.height, Math.max(0, active.start.y + dy))) }
      : { ...active.start, width: snap(Math.min(100 - active.start.x, Math.max(6, active.start.width + dx))), height: snap(Math.min(100 - active.start.y, Math.max(3, active.start.height + dy))) };
    updateLayout(active.id, next);
  };
  const finishInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (interaction.current?.pointerId === event.pointerId) interaction.current = null;
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>, block: CanvasBlock) => {
    if (!editablePreview || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    setSelectedId(block.id);
    const current = layoutFor(block);
    const step = event.shiftKey ? 2 : .5;
    const xDelta = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const yDelta = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    updateLayout(block.id, { ...current, x: Math.min(100 - current.width, Math.max(0, current.x + xDelta)), y: Math.min(100 - current.height, Math.max(0, current.y + yDelta)) });
  };
  const resetSelected = () => {
    if (!onChange || !selectedBlock) return;
    const nextOverrides = { ...overrides };
    delete nextOverrides[selectedBlock.id];
    onChange({ ...config, editor: { ...config.editor, layouts: { ...config.editor.layouts, [orientation]: nextOverrides } } });
  };
  const frame: CSSProperties = {
    width: "100%",
    minHeight: 320,
    aspectRatio: portrait ? "9/16" : "16/9",
    overflow: "hidden",
    position: "relative",
    containerType: "inline-size",
    touchAction: editablePreview ? "none" : "auto",
    userSelect: editablePreview ? "none" : "auto",
    borderRadius: 18,
    color: theme.text,
    background: theme.bg,
    border: `1px solid ${theme.line}`,
    boxShadow: "0 30px 80px rgba(15,23,42,.24)",
    fontFamily: "Inter,system-ui,sans-serif",
    backgroundImage: editablePreview && config.editor.snapToGrid ? `linear-gradient(${theme.line} 1px,transparent 1px),linear-gradient(90deg,${theme.line} 1px,transparent 1px),${theme.bg}` : undefined,
    backgroundSize: editablePreview && config.editor.snapToGrid ? "5% 5%,5% 5%,auto" : undefined
  };
  const baseFont = (kind: CanvasBlock["kind"]) => portrait
    ? ({ restaurantName: 2.2, heading: 8.4, subtitle: 2.25, category: 2.5, item: 2.75, footer: 1.9 }[kind])
    : ({ restaurantName: 1.15, heading: 4.6, subtitle: 1.25, category: 1.35, item: 1.4, footer: 1.05 }[kind]);

  return <div
    ref={canvasRef}
    className="restaurant-menu-canvas"
    data-testid="restaurant-menu-canvas"
    style={frame}
    onPointerMove={handlePointerMove}
    onPointerUp={finishInteraction}
    onPointerCancel={finishInteraction}
    onPointerDown={event => { if (event.target === event.currentTarget) setSelectedId(null); }}
  >
    <div aria-hidden="true" style={{ position: "absolute", left: "6%", right: "6%", top: portrait ? "28%" : "28%", borderTop: `1px solid ${theme.line}` }} />
    <div aria-hidden="true" style={{ position: "absolute", left: "6%", right: "6%", top: "90%", borderTop: `1px solid ${theme.line}` }} />
    {blocks.map(block => {
      const rect = layoutFor(block);
      const selected = editablePreview && selectedId === block.id;
      const blockStyle: CSSProperties = {
        position: "absolute",
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.width}%`,
        height: `${rect.height}%`,
        zIndex: rect.zIndex,
        overflow: "hidden",
        textAlign: rect.align,
        fontSize: `${baseFont(block.kind) * rect.fontScale}cqw`,
        cursor: editablePreview ? "move" : "default",
        outline: selected ? "2px solid #38bdf8" : editablePreview ? "1px dashed transparent" : "none",
        outlineOffset: selected ? 2 : 0,
        borderRadius: 4
      };
      return <div
        key={block.id}
        data-canvas-id={block.id}
        role={editablePreview ? "button" : undefined}
        tabIndex={editablePreview ? 0 : undefined}
        aria-label={editablePreview ? `${block.label} metin bloğu` : undefined}
        aria-pressed={editablePreview ? selected : undefined}
        title={editablePreview ? `${block.label} — sürükleyin veya ok tuşlarıyla taşıyın` : undefined}
        style={blockStyle}
        onPointerDown={event => selectAndStart(event, block, "move")}
        onKeyDown={event => handleKeyDown(event, block)}
      >
        {block.kind === "restaurantName" && <div style={{ height: "100%", color: config.accentColor, fontWeight: 900, letterSpacing: ".17em", textTransform: "uppercase", lineHeight: 1.25 }}>{config.restaurantName}</div>}
        {block.kind === "heading" && <h2 style={{ margin: 0, fontSize: "1em", lineHeight: 1.02, letterSpacing: "-.04em", overflowWrap: "anywhere" }}>{config.heading}</h2>}
        {block.kind === "subtitle" && <p style={{ margin: 0, color: theme.muted, fontSize: "1em", lineHeight: 1.45, overflowWrap: "anywhere" }}>{config.subtitle}</p>}
        {block.kind === "category" && <h3 style={{ margin: 0, color: config.accentColor, fontSize: "1em", lineHeight: 1.25, letterSpacing: ".12em", textTransform: "uppercase", overflowWrap: "anywhere" }}>{block.category?.name}</h3>}
        {block.kind === "item" && block.item && <article style={{ height: "100%", opacity: block.item.available ? 1 : .45, paddingTop: ".55em", borderTop: `1px solid ${theme.line}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: ".65em", alignItems: "baseline" }}><strong style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "1em" }}>{block.item.name}</strong><b style={{ color: config.accentColor, fontSize: ".95em", whiteSpace: "nowrap" }}>{money(block.item.price)}</b></div>
          {block.item.badge !== "none" && <small style={{ display: "block", marginTop: ".45em", color: config.accentColor, fontSize: ".5em", fontWeight: 900, letterSpacing: ".1em" }}>{BADGES[block.item.badge][config.locale]}</small>}
          {config.showDescriptions && block.item.description && <p style={{ margin: ".4em 0 0", color: theme.muted, fontSize: ".62em", lineHeight: 1.35, overflowWrap: "anywhere" }}>{block.item.description}</p>}
        </article>}
        {block.kind === "footer" && <div style={{ color: theme.muted, fontSize: "1em", lineHeight: 1.3, overflowWrap: "anywhere" }}>{config.footer}</div>}
        {selected && <span
          aria-hidden="true"
          data-testid={`resize-${block.id}`}
          onPointerDown={event => selectAndStart(event, block, "resize")}
          style={{ position: "absolute", right: 0, bottom: 0, width: 12, height: 12, borderRadius: "3px 0 0", background: "#38bdf8", border: "2px solid #fff", cursor: "nwse-resize" }}
        />}
      </div>;
    })}
    {editablePreview && <div style={{ position: "absolute", zIndex: 50, left: 8, right: 8, bottom: 8, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 8px", border: "1px solid rgba(255,255,255,.22)", borderRadius: 10, background: "rgba(15,23,42,.88)", color: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,.25)", backdropFilter: "blur(10px)" }}>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 9, fontWeight: 750 }}>{selectedBlock ? selectedBlock.label : "Bir metin bloğu seçin ve sürükleyin"}</span>
      {selectedBlock && selectedLayout && <div style={{ display: "flex", flexShrink: 0, gap: 4 }}>
        <button type="button" aria-label="Yazıyı küçült" onClick={() => patchSelected({ fontScale: Math.max(.55, selectedLayout.fontScale - .1) })} className="menu-canvas-tool">A−</button>
        <button type="button" aria-label="Yazıyı büyüt" onClick={() => patchSelected({ fontScale: Math.min(2.4, selectedLayout.fontScale + .1) })} className="menu-canvas-tool">A+</button>
        <button type="button" aria-label="Metin hizasını değiştir" onClick={() => patchSelected({ align: selectedLayout.align === "left" ? "center" : selectedLayout.align === "center" ? "right" : "left" })} className="menu-canvas-tool">{selectedLayout.align === "left" ? "☰" : selectedLayout.align === "center" ? "≡" : "☷"}</button>
        <button type="button" aria-label="Öne getir" onClick={() => patchSelected({ zIndex: Math.min(30, selectedLayout.zIndex + 1) })} className="menu-canvas-tool">Öne</button>
        <button type="button" aria-label="Seçili bloğu otomatik konuma döndür" onClick={resetSelected} className="menu-canvas-tool">Sıfırla</button>
      </div>}
    </div>}
  </div>;
}
