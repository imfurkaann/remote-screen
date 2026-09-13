"use client";
import { createPizzaMenuTemplate, MENU_DECORATIONS, menuDecorationSource } from "@/lib/pizza-menu-template";
import { createClientId } from "@/lib/client-uuid";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent as ReactChangeEvent, CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

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
export type RestaurantMenuTextPreset = "text" | "heading" | "subheading" | "body";
export type RestaurantMenuTextElement = {
  id: string;
  text: string;
  preset: RestaurantMenuTextPreset;
};
export type RestaurantMenuImageElement = {
  id: string;
  name: string;
  source: string;
};
export type RestaurantMenuCanvasElement = {
  x: number;
  y: number;
  width: number;
  height: number;
  fontScale: number;
  align: "left" | "center" | "right";
  zIndex: number;
  color?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  textTransform?: "none" | "uppercase" | "lowercase" | "sentence";
  listStyle?: "none" | "bullet" | "number";
  fontFamily?: "sans" | "serif";
  rotation?: number;
};

const MENU_SOLID_COLORS = [
  "#000000", "#4b4b4b", "#737373", "#a6a6a6", "#b8b8b8", "#d9d9d9", "#ffffff",
  "#ff3131", "#ff5757", "#f35db8", "#cb8ade", "#bc67dc", "#8748f5", "#5e17eb",
  "#0899b5", "#12b6d6", "#55d2d9", "#38b6ff", "#5271ff", "#0d4fbd", "#1800a8",
  "#00bf63", "#6bd34b", "#a7f45a", "#ffdc5c", "#ffbd59", "#ff8647", "#ff681f"
] as const;
const MENU_GRADIENT_COLORS = [
  "linear-gradient(90deg,#000000,#737373)", "linear-gradient(90deg,#111111,#ffffff)", "linear-gradient(90deg,#9ca3af,#ffffff)", "linear-gradient(135deg,#b8f55b,#49c63f)", "linear-gradient(90deg,#0f172a,#e2aa00)", "linear-gradient(180deg,#7134a5,#ffd44d)", "linear-gradient(135deg,#06008f,#2537d8)",
  "linear-gradient(135deg,#d7ffd9,#89b9ff)", "linear-gradient(90deg,#ff3131,#ff914d)", "linear-gradient(90deg,#ff3131,#a64df0)", "linear-gradient(90deg,#5271ff,#f35db8)", "linear-gradient(90deg,#1592ff,#8e3bc8)", "linear-gradient(90deg,#7d4dff,#39d5d0)", "linear-gradient(135deg,#64d5e7,#0069a8)",
  "linear-gradient(135deg,#7d4dff,#00a888)", "linear-gradient(90deg,#7552e9,#00c485)", "linear-gradient(90deg,#00bf63,#ffdc5c)", "linear-gradient(90deg,#ffbd59,#ffde59)", "linear-gradient(90deg,#ffcf80,#ff759d)", "linear-gradient(90deg,#fff2c2,#ef8ce8)", "linear-gradient(90deg,#48c6ef,#d95698)"
] as const;
const isMenuGradient = (color: string | undefined) => color?.startsWith("linear-gradient(") === true;
export type RestaurantMenuEditorConfig = {
  version: 2;
  snapToGrid: boolean;
  textElements: RestaurantMenuTextElement[];
  imageElements: RestaurantMenuImageElement[];
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
  theme: "charcoal" | "cream" | "terracotta" | "forest" | "paper" | "snack";
  accentColor: string;
  categories: RestaurantMenuCategory[];
  items: RestaurantMenuItem[];
  showDescriptions: boolean;
  showUnavailable: boolean;
  footer: string;
  editor: RestaurantMenuEditorConfig;
};

const EMPTY_EDITOR: RestaurantMenuEditorConfig = {
  version: 2,
  snapToGrid: true,
  textElements: [],
  imageElements: [],
  layouts: { landscape: {}, portrait: {} }
};

const THEMES = {
  snack: { name: "Snack Menu", note: "Mavi dama desenli", bg: "#f8f9ff", surface: "#f8f9ff", text: "#3861b0", muted: "#3861b0", line: "transparent", accent: "#3861b0" },
  paper: { name: "Pizza Menü", note: "Beyaz, sade ve düzenlenebilir", bg: "#ffffff", surface: "#ffffff", text: "#000000", muted: "#000000", line: "transparent", accent: "#bd3034" },
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

export const DEFAULT_RESTAURANT_MENU_CONFIG: RestaurantMenuConfig = createPizzaMenuTemplate();

const color = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(String(value ?? "")) ? String(value) : fallback;
const editable = (value: unknown, fallback: string, max: number) => typeof value === "string" ? value.slice(0, max) : fallback;
const safeId = (value: unknown, fallback: string) => editable(value, fallback, 64).replace(/[^a-zA-Z0-9_-]/g, "-") || fallback;
const normalizeUploadedSource = (value: unknown) => {
  if (typeof value === "string" && MENU_DECORATIONS[value]) return value;
  let source = editable(value, "", 4096).trim();
  if (/^https?:\/\//i.test(source)) {
    try { source = new URL(source).pathname; } catch { return ""; }
  }
  try { source = decodeURIComponent(source); } catch { /* Keep the original path if it is not encoded. */ }
  return source.startsWith("/uploads/") && !source.includes("..") && !/[?#\u0000-\u001f]/.test(source) ? source : "";
};
const bounded = (value: unknown, fallback: number, min: number, max: number) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

function normalizeCanvasLayout(value: unknown): Record<string, RestaurantMenuCanvasElement> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 80).flatMap(([key, raw]) => {
    if (!/^(restaurantName|heading|subtitle|footer|category:[a-zA-Z0-9_-]+|item:[a-zA-Z0-9_-]+|text:[a-zA-Z0-9_-]+|image:[a-zA-Z0-9_-]+)$/.test(key) || !raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const width = bounded(item.width, 24, 6, 100);
    const height = bounded(item.height, 10, 3, 92);
    return [[key, {
      x: bounded(item.x, 0, 0, 100 - width),
      y: bounded(item.y, 0, 0, 100 - height),
      width,
      height,
      fontScale: bounded(item.fontScale, 1, .55, 2.4),
      align: item.align === "center" || item.align === "right" ? item.align : "left",
      zIndex: Math.round(bounded(item.zIndex, 1, 1, 30)),
      ...((/^#[0-9a-f]{6}$/i.test(String(item.color ?? "")) || /^linear-gradient\((90deg|135deg|180deg),#[0-9a-f]{6},#[0-9a-f]{6}\)$/i.test(String(item.color ?? ""))) ? { color: String(item.color) } : {}),
      ...(item.fontWeight === "bold" || item.fontWeight === "normal" ? { fontWeight: item.fontWeight } : {}),
      ...(item.fontStyle === "italic" || item.fontStyle === "normal" ? { fontStyle: item.fontStyle } : {}),
      ...(item.textDecoration === "underline" || item.textDecoration === "line-through" || item.textDecoration === "none" ? { textDecoration: item.textDecoration } : {}),
      ...(item.textTransform === "uppercase" || item.textTransform === "lowercase" || item.textTransform === "sentence" || item.textTransform === "none" ? { textTransform: item.textTransform } : {}),
      ...(item.listStyle === "bullet" || item.listStyle === "number" || item.listStyle === "none" ? { listStyle: item.listStyle } : {}),
      ...(item.fontFamily === "serif" || item.fontFamily === "sans" ? { fontFamily: item.fontFamily } : {}),
      ...(Number.isFinite(Number(item.rotation)) ? { rotation: bounded(item.rotation, 0, 0, 359) } : {})
    } satisfies RestaurantMenuCanvasElement]];
  }));
}

function normalizeEditor(value: unknown): RestaurantMenuEditorConfig {
  const editor = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const layouts = editor.layouts && typeof editor.layouts === "object" ? editor.layouts as Record<string, unknown> : {};
  return {
    version: 2,
    snapToGrid: editor.snapToGrid !== false,
    textElements: Array.isArray(editor.textElements) ? editor.textElements.slice(0, 40).flatMap((raw, index) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      const preset: RestaurantMenuTextPreset = item.preset === "heading" || item.preset === "subheading" || item.preset === "body" ? item.preset : "text";
      return [{ id: safeId(item.id, `text-${index + 1}`), text: editable(item.text, "Metninizi yazın", 500), preset }];
    }) : [],
    imageElements: Array.isArray(editor.imageElements) ? editor.imageElements.slice(0, 40).flatMap((raw, index) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      const source = normalizeUploadedSource(item.source);
      if (!source) return [];
      return [{ id: safeId(item.id, `image-${index + 1}`), name: editable(item.name, `Görsel ${index + 1}`, 180), source }];
    }) : [],
    layouts: {
      landscape: normalizeCanvasLayout(layouts.landscape),
      portrait: normalizeCanvasLayout(layouts.portrait)
    }
  };
}

export function normalizeRestaurantMenuConfig(input: Record<string, unknown>): RestaurantMenuConfig {
  if (Object.keys(input).length === 0) return createPizzaMenuTemplate();
  const theme: RestaurantMenuConfig["theme"] = input.theme === "snack" || input.theme === "paper" || input.theme === "cream" || input.theme === "terracotta" || input.theme === "forest" ? input.theme : "charcoal";
  const categories = Array.isArray(input.categories) ? input.categories.slice(0, 6).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    return [{ id: safeId(item.id, `category-${index + 1}`), name: editable(item.name, "", 60) }];
  }) : BASE_CATEGORIES.map(item => ({ ...item }));
  const usableCategories = Array.isArray(input.categories) ? categories : BASE_CATEGORIES.map(item => ({ ...item }));
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

const TEXT_PRESETS: Record<RestaurantMenuTextPreset, { label: string; text: string; fontScale: number; width: number; height: number }> = {
  text: { label: "Metin kutusu ekle", text: "Metninizi yazın", fontScale: 1, width: 30, height: 7 },
  heading: { label: "Başlık ekle", text: "Başlığınızı yazın", fontScale: 2.2, width: 52, height: 12 },
  subheading: { label: "Alt başlık ekle", text: "Alt başlığınızı yazın", fontScale: 1.45, width: 42, height: 9 },
  body: { label: "Birkaç satır gövde metni ekle", text: "Metninizi buraya yazın. Birkaç satırlık açıklama ekleyebilirsiniz.", fontScale: .85, width: 38, height: 13 }
};

function transformMenuText(value: string, transform: RestaurantMenuCanvasElement["textTransform"]): string {
  if (transform === "uppercase") return value.toLocaleUpperCase("tr-TR");
  if (transform === "lowercase") return value.toLocaleLowerCase("tr-TR");
  if (transform === "sentence") {
    const lower = value.toLocaleLowerCase("tr-TR");
    return lower.replace(/[A-Za-zÇĞİÖŞÜçğıöşü]/, character => character.toLocaleUpperCase("tr-TR"));
  }
  return value;
}

function FormattedMenuText({ value, rect }: { value: string; rect: RestaurantMenuCanvasElement }) {
  const transformed = transformMenuText(value, rect.textTransform);
  const lines = transformed.split(/\r?\n/);
  if (rect.listStyle === "bullet" || rect.listStyle === "number") {
    return <span style={{ display: "grid", gap: ".18em" }}>{lines.map((line, index) => <span key={index} style={{ display: "grid", gridTemplateColumns: "1.4em 1fr", gap: ".25em" }}><span>{rect.listStyle === "bullet" ? "•" : `${index + 1}.`}</span><span>{line || "\u00a0"}</span></span>)}</span>;
  }
  return <>{transformed || "\u00a0"}</>;
}

type RestaurantUploadMedia = { id: string; filename: string; mime_type: string; media_url: string };
const mediaPreviewSource = (source: string) => {
  if (MENU_DECORATIONS[source]) return menuDecorationSource(source);
  const path = normalizeUploadedSource(source);
  return path ? `/api/content/media/preview?path=${encodeURIComponent(path)}` : "";
};

export function RestaurantMenuTextTools({ config: raw, onChange }: { config: Record<string, unknown>; onChange: (next: RestaurantMenuConfig) => void }) {
  const config = normalizeRestaurantMenuConfig(raw);
  const [panel, setPanel] = useState<"text" | "uploads" | null>(null);
  const [uploads, setUploads] = useState<RestaurantUploadMedia[]>([]);
  const [search, setSearch] = useState("");
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadUploads = async (query = "") => {
    setLoadingUploads(true);
    setUploadError("");
    try {
      const params = new URLSearchParams({ page: "1", limit: "100" });
      if (query.trim()) params.set("search", query.trim());
      const response = await fetch(`/api/content/media?${params}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { media?: RestaurantUploadMedia[]; message?: string };
      if (!response.ok) throw new Error(payload.message || "Görseller yüklenemedi.");
      setUploads((payload.media ?? []).flatMap(item => {
        const source = normalizeUploadedSource(item.media_url);
        return item.mime_type.startsWith("image/") && source ? [{ ...item, media_url: source }] : [];
      }));
    } catch (error) {
      setUploadError((error as Error).message);
    } finally {
      setLoadingUploads(false);
    }
  };

  useEffect(() => {
    if (panel !== "uploads") return;
    const timer = window.setTimeout(() => { void loadUploads(search); }, search.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [panel, search]);

  const addText = (preset: RestaurantMenuTextPreset) => {
    if (config.editor.textElements.length >= 40) { window.alert("En fazla 40 metin öğesi ekleyebilirsiniz."); return; }
    const definition = TEXT_PRESETS[preset];
    const id = `text-${Date.now().toString(36)}`;
    const item: RestaurantMenuTextElement = { id, text: definition.text, preset };
    const offset = (config.editor.textElements.length % 6) * 2;
    const landscape: RestaurantMenuCanvasElement = { x: Math.min(65, 28 + offset), y: Math.min(75, 28 + offset), width: definition.width, height: definition.height, fontScale: definition.fontScale, align: "center", zIndex: 20 };
    const portrait: RestaurantMenuCanvasElement = { ...landscape, x: Math.max(7, (100 - Math.min(86, definition.width * 1.5)) / 2), width: Math.min(86, definition.width * 1.5) };
    onChange({
      ...config,
      editor: {
        ...config.editor,
        textElements: [...config.editor.textElements, item],
        layouts: {
          landscape: { ...config.editor.layouts.landscape, [`text:${id}`]: landscape },
          portrait: { ...config.editor.layouts.portrait, [`text:${id}`]: portrait }
        }
      }
    });
    setPanel(null);
  };

  const addImage = (media: RestaurantUploadMedia) => {
    if (config.editor.imageElements.length >= 40) { setUploadError("En fazla 40 görsel ekleyebilirsiniz."); return; }
    const source = normalizeUploadedSource(media.media_url);
    if (!source) return;
    const id = `image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const image: RestaurantMenuImageElement = { id, name: media.filename, source };
    const offset = (config.editor.imageElements.length % 6) * 2;
    const landscape: RestaurantMenuCanvasElement = { x: 35 + offset, y: 30 + offset, width: 24, height: 24, fontScale: 1, align: "center", zIndex: 18, rotation: 0 };
    const portrait: RestaurantMenuCanvasElement = { ...landscape, x: 28 + offset, width: 44, height: 24 };
    onChange({
      ...config,
      editor: {
        ...config.editor,
        imageElements: [...config.editor.imageElements, image],
        layouts: {
          landscape: { ...config.editor.layouts.landscape, [`image:${id}`]: landscape },
          portrait: { ...config.editor.layouts.portrait, [`image:${id}`]: portrait }
        }
      }
    });
  };

  const handleUpload = async (event: ReactChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter(file => file.type.startsWith("image/"));
    event.target.value = "";
    if (!files.length) return;
    setUploading(true);
    setUploadError("");
    try {
      const added: RestaurantUploadMedia[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/content/media/upload", { method: "POST", body: form });
        const payload = await response.json().catch(() => ({})) as { media?: RestaurantUploadMedia; message?: string };
        if (!response.ok || !payload.media) throw new Error(payload.message || `${file.name} yüklenemedi.`);
        const source = normalizeUploadedSource(payload.media.media_url);
        if (!source) throw new Error(`${file.name} için geçerli görsel adresi alınamadı.`);
        added.push({ ...payload.media, media_url: source });
      }
      setUploads(current => [...added, ...current.filter(item => !added.some(upload => upload.id === item.id))]);
    } catch (error) {
      setUploadError((error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return <aside className="restaurant-editor-rail">
    <button type="button" className="restaurant-tool-tile" aria-expanded={panel === "text"} aria-controls="restaurant-text-panel" onClick={() => setPanel(value => value === "text" ? null : "text")}>
      <span className="restaurant-tool-icon">T</span>
      <span>Metin</span>
    </button>
    <button type="button" className="restaurant-tool-tile" aria-expanded={panel === "uploads"} aria-controls="restaurant-upload-panel" onClick={() => setPanel(value => value === "uploads" ? null : "uploads")}>
      <span className="restaurant-tool-icon upload" aria-hidden="true">↥</span>
      <span>Yüklemeler</span>
    </button>
    {panel === "text" && <div id="restaurant-text-panel" className="restaurant-text-panel">
      <div className="restaurant-text-panel-header"><div><strong>Metin ekle</strong><small>Tuvale yeni bir yazı alanı yerleştirin</small></div><button type="button" aria-label="Metin panelini kapat" onClick={() => setPanel(null)}>×</button></div>
      <button type="button" className="restaurant-add-text-primary" onClick={() => addText("text")}><span>T</span> Metin kutusu ekle</button>
      <div className="restaurant-text-style-title">Varsayılan metin stilleri</div>
      <button type="button" className="restaurant-text-preset heading" onClick={() => addText("heading")}>Başlık ekle</button>
      <button type="button" className="restaurant-text-preset subheading" onClick={() => addText("subheading")}>Alt başlık ekle</button>
      <button type="button" className="restaurant-text-preset body" onClick={() => addText("body")}>Birkaç satır gövde metni ekle</button>
      <p className="restaurant-text-panel-tip">Eklenen metni taşımak için sürükleyin, içeriğini değiştirmek için çift tıklayın.</p>
    </div>}
    {panel === "uploads" && <div id="restaurant-upload-panel" className="restaurant-text-panel restaurant-upload-panel">
      <div className="restaurant-text-panel-header"><div><strong>Yüklemeler</strong><small>Görsellerinizi yükleyin ve tasarımda kullanın</small></div><button type="button" aria-label="Yüklemeler panelini kapat" onClick={() => setPanel(null)}>×</button></div>
      <label className="restaurant-upload-search"><span aria-hidden="true">⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Görsellerde arayın" aria-label="Yüklenen görsellerde ara" /></label>
      <input ref={fileInputRef} hidden type="file" accept="image/*" multiple onChange={handleUpload} />
      <button type="button" className="restaurant-add-text-primary restaurant-upload-primary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>{uploading ? "Yükleniyor…" : "Dosya yükleyin"}</button>
      {uploadError && <p className="restaurant-upload-error">{uploadError}</p>}
      <div className="restaurant-upload-title"><span>Görseller</span><small>{uploads.length}</small></div>
      {loadingUploads ? <div className="restaurant-upload-empty">Görseller yükleniyor…</div> : uploads.length ? <div className="restaurant-upload-grid">
        {uploads.map(media => <button type="button" key={media.id} title={`${media.filename} — tasarıma ekle`} onClick={() => addImage(media)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaPreviewSource(media.media_url)} alt={media.filename} />
          <span>{media.filename}</span>
        </button>)}
      </div> : <div className="restaurant-upload-empty">{search ? "Aramanızla eşleşen görsel bulunamadı." : "Henüz görsel yüklenmedi."}</div>}
    </div>}
  </aside>;
}

const BADGES: Record<MenuBadge, { tr: string; en: string }> = {
  none: { tr: "", en: "" }, popular: { tr: "POPÜLER", en: "POPULAR" }, new: { tr: "YENİ", en: "NEW" }, chef: { tr: "ŞEFİN SEÇİMİ", en: "CHEF'S PICK" }, vegan: { tr: "VEGAN", en: "VEGAN" }
};

type CanvasBlock = {
  id: string;
  kind: "restaurantName" | "heading" | "subtitle" | "footer" | "category" | "item" | "customText" | "image";
  label: string;
  category?: RestaurantMenuCategory;
  item?: RestaurantMenuItem;
  textElement?: RestaurantMenuTextElement;
  imageElement?: RestaurantMenuImageElement;
  defaultLayout: RestaurantMenuCanvasElement;
};

const automaticLayout = (
  orientation: "landscape" | "portrait",
  kind: CanvasBlock["kind"],
  categoryIndex = 0,
  itemIndex = 0,
  categoryCount = 3
): RestaurantMenuCanvasElement => {
  if (kind === "customText") return { x: 30, y: 30, width: 36, height: 9, fontScale: 1, align: "center", zIndex: 20 };
  if (kind === "image") return { x: 36, y: 30, width: orientation === "portrait" ? 42 : 24, height: 24, fontScale: 1, align: "center", zIndex: 18, rotation: 0 };
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [colorPaletteOpen, setColorPaletteOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<null | { id: string; mode: "move" | "resize" | "rotate"; pointerId: number; clientX: number; clientY: number; start: RestaurantMenuCanvasElement; centerX?: number; centerY?: number; startAngle?: number }>(null);
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
    config.editor.textElements.forEach(element => {
      fixed.push({ id: `text:${element.id}`, kind: "customText", label: element.text.slice(0, 60) || "Boş metin", textElement: element, defaultLayout: automaticLayout(orientation, "customText") });
    });
    config.editor.imageElements.forEach(element => {
      fixed.push({ id: `image:${element.id}`, kind: "image", label: element.name, imageElement: element, defaultLayout: automaticLayout(orientation, "image") });
    });
    return fixed.filter(block => !["restaurantName", "heading", "subtitle", "footer"].includes(block.kind) || Boolean(config[block.kind as "heading"]));
  }, [config.editor.imageElements, config.editor.textElements, items, itemLimit, orientation, shownCategories]);
  const selectedBlock = blocks.find(block => block.id === selectedId) ?? null;
  const layoutFor = (block: CanvasBlock) => overrides[block.id] ?? block.defaultLayout;
  const selectedLayout = selectedBlock ? layoutFor(selectedBlock) : null;

  useEffect(() => {
    if (!editingId) return;
    const editor = canvasRef.current?.querySelector<HTMLElement>(`[data-canvas-id="${editingId}"] [data-text-editor="true"]`);
    if (!editor) return;
    editor.focus();
    (editor as HTMLTextAreaElement).select();
  }, [editingId]);

  useEffect(() => {
    if (!colorPaletteOpen) return;
    const closePalette = (event: PointerEvent) => {
      if (!colorPickerRef.current?.contains(event.target as Node)) setColorPaletteOpen(false);
    };
    document.addEventListener("pointerdown", closePalette);
    return () => document.removeEventListener("pointerdown", closePalette);
  }, [colorPaletteOpen]);

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
  const updateText = (id: string, text: string) => {
    if (!onChange) return;
    onChange({ ...config, editor: { ...config.editor, textElements: config.editor.textElements.map(element => element.id === id ? { ...element, text: text.slice(0, 500) } : element) } });
  };
  const removeBlock = (block: CanvasBlock) => {
    if (!onChange) return;
    const layouts = { landscape: { ...config.editor.layouts.landscape }, portrait: { ...config.editor.layouts.portrait } };
    delete layouts.landscape[block.id];
    delete layouts.portrait[block.id];
    onChange({ ...config, editor: { ...config.editor, layouts,
      textElements: config.editor.textElements.filter(element => "text:" + element.id !== block.id),
      imageElements: config.editor.imageElements.filter(element => "image:" + element.id !== block.id)
    } });
    setSelectedId(null);
    setEditingId(null);
  };
  const duplicateBlock = (block: CanvasBlock) => {
    if (!onChange || (block.kind !== "customText" && block.kind !== "image")) return;
    const isImage = block.kind === "image";
    const elements = isImage ? config.editor.imageElements : config.editor.textElements;
    if (elements.length >= 40) {
      window.alert(isImage ? "En fazla 40 görsel ekleyebilirsiniz." : "En fazla 40 metin öğesi ekleyebilirsiniz.");
      return;
    }
    const id = createClientId();
    const canvasId = `${isImage ? "image" : "text"}:${id}`;
    const copyLayout = (direction: "landscape" | "portrait") => {
      const rect = config.editor.layouts[direction][block.id] ?? automaticLayout(direction, block.kind);
      return { ...rect, x: Math.min(100 - rect.width, rect.x + 2), y: Math.min(100 - rect.height, rect.y + 2) };
    };
    onChange({ ...config, editor: {
      ...config.editor,
      textElements: block.textElement ? [...config.editor.textElements, { ...block.textElement, id }] : config.editor.textElements,
      imageElements: block.imageElement ? [...config.editor.imageElements, { ...block.imageElement, id, name: `${block.imageElement.name} (kopya)`.slice(0, 180) }] : config.editor.imageElements,
      layouts: {
        landscape: { ...config.editor.layouts.landscape, [canvasId]: copyLayout("landscape") },
        portrait: { ...config.editor.layouts.portrait, [canvasId]: copyLayout("portrait") }
      }
    } });
    setEditingId(null);
    setSelectedId(canvasId);
    requestAnimationFrame(() => canvasRef.current?.querySelector<HTMLElement>(`[data-canvas-id="${canvasId}"]`)?.focus({ preventScroll: true }));
  };
  const selectAndStart = (event: ReactPointerEvent<HTMLElement>, block: CanvasBlock, mode: "move" | "resize" | "rotate") => {
    if (!editablePreview) return;
    if (editingId === block.id && mode === "move") return;
    event.preventDefault();
    event.stopPropagation();
    if (mode === "move") event.currentTarget.focus({ preventScroll: true });
    setSelectedId(block.id);
    const start = layoutFor(block);
    if (mode === "rotate" && canvasRef.current) {
      const bounds = canvasRef.current.getBoundingClientRect();
      const centerX = bounds.left + ((start.x + start.width / 2) / 100) * bounds.width;
      const centerY = bounds.top + ((start.y + start.height / 2) / 100) * bounds.height;
      interaction.current = { id: block.id, mode, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, start, centerX, centerY, startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) };
      return;
    }
    interaction.current = { id: block.id, mode, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, start };
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = interaction.current;
    const canvas = canvasRef.current;
    if (!active || !canvas || active.pointerId !== event.pointerId) return;
    const bounds = canvas.getBoundingClientRect();
    if (Math.hypot(event.clientX - active.clientX, event.clientY - active.clientY) < 4) return;
    if (!canvas.hasPointerCapture(event.pointerId)) canvas.setPointerCapture(event.pointerId);
    if (active.mode === "rotate" && active.centerX !== undefined && active.centerY !== undefined && active.startAngle !== undefined) {
      const currentAngle = Math.atan2(event.clientY - active.centerY, event.clientX - active.centerX);
      const rawRotation = (active.start.rotation ?? 0) + (currentAngle - active.startAngle) * 180 / Math.PI;
      const rotation = Math.round((rawRotation % 360 + 360) % 360);
      updateLayout(active.id, { ...active.start, rotation });
      return;
    }
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
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>, block: CanvasBlock) => {
    if (editablePreview && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && (block.kind === "customText" || block.kind === "image")) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) duplicateBlock(block);
      return;
    }
    if (editablePreview && (event.key === "Delete" || event.key === "Backspace") && (block.kind === "customText" || block.kind === "image")) {
      event.preventDefault(); removeBlock(block); return;
    }
    if (!editablePreview || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    setSelectedId(block.id);
    const current = layoutFor(block);
    const step = event.shiftKey ? 2 : .5;
    const xDelta = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const yDelta = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    updateLayout(block.id, { ...current, x: Math.min(100 - current.width, Math.max(0, current.x + xDelta)), y: Math.min(100 - current.height, Math.max(0, current.y + yDelta)) });
  };
  const frame: CSSProperties = {
    width: "100%",
    minHeight: 320,
    aspectRatio: portrait ? ((config.theme === "paper" || config.theme === "snack") ? "210/297" : "9/16") : "16/9",
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
    ? ({ restaurantName: 2.2, heading: 8.4, subtitle: 2.25, category: 2.5, item: 2.75, footer: 1.9, customText: config.theme === "snack" ? 5.4 : config.theme === "paper" ? 2.8 : 2.3, image: 1 }[kind])
    : ({ restaurantName: 1.15, heading: 4.6, subtitle: 1.25, category: 1.35, item: 1.4, footer: 1.05, customText: config.theme === "snack" ? 2.8 : config.theme === "paper" ? 1.6 : 1.3, image: 1 }[kind]);

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
      const gradient = isMenuGradient(rect.color);
      const blockStyle: CSSProperties = {
        position: "absolute",
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.width}%`,
        height: `${rect.height}%`,
        zIndex: rect.zIndex,
        overflow: block.kind === "image" ? "visible" : "hidden",
        textAlign: rect.align,
        fontSize: `${baseFont(block.kind) * rect.fontScale}cqw`,
        color: gradient ? "transparent" : rect.color,
        backgroundImage: gradient ? rect.color : undefined,
        backgroundClip: gradient ? "text" : undefined,
        WebkitBackgroundClip: gradient ? "text" : undefined,
        fontWeight: rect.fontWeight,
        fontStyle: rect.fontStyle,
        textDecoration: rect.textDecoration,
        textTransform: block.kind === "customText" ? undefined : rect.textTransform === "sentence" ? "capitalize" : rect.textTransform,
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
        onDoubleClick={event => {
          if (block.kind !== "customText") return;
          event.preventDefault();
          event.stopPropagation();
          setSelectedId(block.id);
          setEditingId(block.id);
        }}
      >
        {block.kind === "restaurantName" && <div style={{ height: "100%", color: gradient ? "inherit" : rect.color ?? config.accentColor, fontWeight: rect.fontWeight ?? 900, letterSpacing: ".17em", textTransform: rect.textTransform ? "inherit" : "uppercase", lineHeight: 1.25 }}>{config.restaurantName}</div>}
        {block.kind === "heading" && <h2 style={{ margin: 0, fontSize: "1em", lineHeight: 1.02, letterSpacing: "-.04em", overflowWrap: "anywhere" }}>{config.heading}</h2>}
        {block.kind === "subtitle" && <p style={{ margin: 0, color: gradient ? "inherit" : rect.color ?? theme.muted, fontSize: "1em", lineHeight: 1.45, overflowWrap: "anywhere" }}>{config.subtitle}</p>}
        {block.kind === "category" && <h3 style={{ margin: 0, color: gradient ? "inherit" : rect.color ?? config.accentColor, fontWeight: rect.fontWeight, fontSize: "1em", lineHeight: 1.25, letterSpacing: ".12em", textTransform: rect.textTransform ? "inherit" : "uppercase", overflowWrap: "anywhere" }}>{block.category?.name}</h3>}
        {block.kind === "item" && block.item && <article style={{ height: "100%", opacity: block.item.available ? 1 : .45, paddingTop: ".55em", borderTop: `1px solid ${theme.line}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: ".65em", alignItems: "baseline" }}><strong style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: rect.fontWeight, fontSize: "1em" }}>{block.item.name}</strong><b style={{ color: gradient ? "inherit" : rect.color ?? config.accentColor, fontWeight: rect.fontWeight, fontSize: ".95em", whiteSpace: "nowrap" }}>{money(block.item.price)}</b></div>
          {block.item.badge !== "none" && <small style={{ display: "block", marginTop: ".45em", color: gradient ? "inherit" : rect.color ?? config.accentColor, fontSize: ".5em", fontWeight: rect.fontWeight ?? 900, letterSpacing: ".1em" }}>{BADGES[block.item.badge][config.locale]}</small>}
          {config.showDescriptions && block.item.description && <p style={{ margin: ".4em 0 0", color: gradient ? "inherit" : rect.color ?? theme.muted, fontSize: ".62em", lineHeight: 1.35, overflowWrap: "anywhere" }}>{block.item.description}</p>}
        </article>}
        {block.kind === "footer" && <div style={{ color: gradient ? "inherit" : rect.color ?? theme.muted, fontSize: "1em", lineHeight: 1.3, overflowWrap: "anywhere" }}>{config.footer}</div>}
        {block.kind === "customText" && block.textElement && (editingId === block.id ? <textarea
          data-text-editor="true"
          aria-label="Metni düzenle"
          value={block.textElement.text}
          maxLength={500}
          onChange={event => updateText(block.textElement!.id, event.target.value)}
          onBlur={() => setEditingId(null)}
          onPointerDown={event => { if (editingId === block.id) event.stopPropagation(); }}
          onKeyDown={event => {
            event.stopPropagation();
            if (event.key === "Escape") event.currentTarget.blur();
          }}
          style={{ width: "100%", height: "100%", padding: 0, border: 0, resize: "none", background: "transparent", color: gradient ? theme.text : "inherit", fontFamily: rect.fontFamily === "serif" ? "Georgia,Times New Roman,serif" : "inherit", fontSize: "inherit", fontStyle: "inherit", textDecoration: "inherit", textAlign: rect.align, lineHeight: 1.2, fontWeight: rect.fontWeight ?? (block.textElement.preset === "heading" ? 900 : block.textElement.preset === "subheading" ? 700 : 500), userSelect: "text", cursor: "text", outline: "none" }}
        /> : <div style={{ fontFamily: rect.fontFamily === "serif" ? "Georgia,Times New Roman,serif" : "inherit", whiteSpace: "pre-wrap", lineHeight: 1.2, overflowWrap: "anywhere", fontWeight: rect.fontWeight ?? (block.textElement.preset === "heading" ? 900 : block.textElement.preset === "subheading" ? 700 : 500) }}><FormattedMenuText value={block.textElement.text} rect={rect} /></div>)}
        {block.kind === "image" && block.imageElement && <div className="restaurant-canvas-image-frame" style={{ transform: `rotate(${rect.rotation ?? 0}deg)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaPreviewSource(block.imageElement.source)} alt={block.imageElement.name} draggable={false} />
        </div>}
        {selected && <span
          aria-hidden="true"
          data-testid={`resize-${block.id}`}
          onPointerDown={event => selectAndStart(event, block, "resize")}
          style={{ position: "absolute", right: 0, bottom: 0, width: 12, height: 12, borderRadius: "3px 0 0", background: "#38bdf8", border: "2px solid #fff", cursor: "nwse-resize" }}
        />}
        {selected && block.kind === "image" && <>
          <span className="restaurant-rotation-line" aria-hidden="true" />
          <button type="button" className="restaurant-rotation-handle" aria-label="Görseli döndür" title="Sürükleyerek döndür" onPointerDown={event => selectAndStart(event, block, "rotate")}>↻</button>
          <output className="restaurant-rotation-degree" aria-live="polite">{Math.round(rect.rotation ?? 0)}°</output>
        </>}
      </div>;
    })}
    {editablePreview && selectedBlock?.kind === "image" && <div className="restaurant-text-toolbar"><button type="button" aria-label="Seçili öğeyi kopyala" title="Kopyala (Ctrl+D / ⌘D)" onClick={() => duplicateBlock(selectedBlock)}>Kopyala</button><button type="button" aria-label="Seçili öğeyi sil" onClick={() => removeBlock(selectedBlock)}>Görseli sil</button></div>}
    {editablePreview && selectedBlock && selectedBlock.kind !== "image" && selectedLayout && (() => {
      const unit = baseFont(selectedBlock.kind) * 10;
      const point = Math.min(Math.floor(unit * 2.4), Math.max(Math.ceil(unit * .55), Math.round(selectedLayout.fontScale * unit)));
      const setPoint = (next: number) => patchSelected({ fontScale: Math.min(2.4, Math.max(.55, next / unit)) });
      const nextTransform = selectedLayout.textTransform === "uppercase" ? "lowercase" : selectedLayout.textTransform === "lowercase" ? "sentence" : "uppercase";
      const nextAlign = selectedLayout.align === "left" ? "center" : selectedLayout.align === "center" ? "right" : "left";
      return <div className="restaurant-text-toolbar">
        {selectedBlock.kind === "customText" && <button type="button" aria-label="Seçili öğeyi kopyala" title="Kopyala (Ctrl+D / ⌘D)" onClick={() => duplicateBlock(selectedBlock)}>Kopyala</button>}
        {selectedBlock.kind === "customText" && <button type="button" aria-label="Seçili öğeyi sil" onClick={() => removeBlock(selectedBlock)}>Sil</button>}
        <div className="restaurant-point-control">
          <button type="button" aria-label="Punto küçült" onClick={() => setPoint(point - 1)}>−</button>
          <input aria-label="Punto" type="number" min={Math.ceil(unit * .55)} max={Math.floor(unit * 2.4)} value={point} onChange={event => setPoint(Number(event.target.value) || point)} />
          <button type="button" aria-label="Punto büyüt" onClick={() => setPoint(point + 1)}>+</button>
        </div>
        <div ref={colorPickerRef} className="restaurant-color-picker">
          <button type="button" className="restaurant-color-control" aria-label="Metin rengini seç" aria-expanded={colorPaletteOpen} onClick={() => setColorPaletteOpen(value => !value)}>
            <span style={{ background: selectedLayout.color ?? theme.text }} />
            <b>A</b>
          </button>
          {colorPaletteOpen && <div className="restaurant-color-palette" role="dialog" aria-label="Metin renkleri">
            <section>
              <h4><span aria-hidden="true">◉</span> Varsayılan tek renkler</h4>
              <div className="restaurant-color-swatches">{MENU_SOLID_COLORS.map(color => <button key={color} type="button" aria-label={`${color} rengini seç`} aria-pressed={selectedLayout.color === color} className="restaurant-color-swatch" style={{ background: color }} onClick={() => { patchSelected({ color }); setColorPaletteOpen(false); }} />)}</div>
            </section>
            <section>
              <h4><span aria-hidden="true">▣</span> Varsayılan gradyanlı renkler</h4>
              <div className="restaurant-color-swatches">{MENU_GRADIENT_COLORS.map((color, index) => <button key={color} type="button" aria-label={`${index + 1}. gradyanı seç`} aria-pressed={selectedLayout.color === color} className="restaurant-color-swatch" style={{ background: color }} onClick={() => { patchSelected({ color }); setColorPaletteOpen(false); }} />)}</div>
            </section>
          </div>}
        </div>
        <button type="button" className="restaurant-format-button" aria-label="Kalın" aria-pressed={selectedLayout.fontWeight === "bold"} onClick={() => patchSelected({ fontWeight: selectedLayout.fontWeight === "bold" ? "normal" : "bold" })}><b>B</b></button>
        <button type="button" className="restaurant-format-button" aria-label="İtalik" aria-pressed={selectedLayout.fontStyle === "italic"} onClick={() => patchSelected({ fontStyle: selectedLayout.fontStyle === "italic" ? "normal" : "italic" })}><i>I</i></button>
        <button type="button" className="restaurant-format-button underline" aria-label="Altı çizili" aria-pressed={selectedLayout.textDecoration === "underline"} onClick={() => patchSelected({ textDecoration: selectedLayout.textDecoration === "underline" ? "none" : "underline" })}>U</button>
        <button type="button" className="restaurant-format-button strike" aria-label="Üstü çizili" aria-pressed={selectedLayout.textDecoration === "line-through"} onClick={() => patchSelected({ textDecoration: selectedLayout.textDecoration === "line-through" ? "none" : "line-through" })}>S</button>
        <span className="restaurant-toolbar-divider" />
        <button type="button" className="restaurant-format-button case" aria-label="Büyük küçük harf biçimini değiştir" title="Sırayla: büyük harf, küçük harf, yalnızca ilk harf büyük" onClick={() => patchSelected({ textTransform: nextTransform })}>aA</button>
        <button type="button" className="restaurant-format-button" aria-label="Metin hizasını değiştir" title="Sol, orta ve sağ hizalama arasında geçiş yapar" onClick={() => patchSelected({ align: nextAlign })}>{selectedLayout.align === "left" ? "☰" : selectedLayout.align === "center" ? "≡" : "☷"}</button>
        <button type="button" className="restaurant-format-button list" aria-label="Madde işaretli liste" aria-pressed={selectedLayout.listStyle === "bullet"} disabled={selectedBlock.kind !== "customText"} onClick={() => patchSelected({ listStyle: selectedLayout.listStyle === "bullet" ? "none" : "bullet" })}>•<span>☰</span></button>
        <button type="button" className="restaurant-format-button list number" aria-label="Numaralı liste" aria-pressed={selectedLayout.listStyle === "number"} disabled={selectedBlock.kind !== "customText"} onClick={() => patchSelected({ listStyle: selectedLayout.listStyle === "number" ? "none" : "number" })}>1.<span>☰</span></button>
      </div>;
    })()}
  </div>;
}
