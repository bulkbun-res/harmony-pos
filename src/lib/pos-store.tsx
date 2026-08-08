import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { syncOrderFn, syncInventoryLogFn } from "./sync.functions";
import type {
  Group,
  Ingredient,
  Item,
  Order,
  PosState,
  StockMove,
  StockMoveReason,
} from "./pos-types";

const STORAGE_KEY = "bulkbun-pos-v1";

const uid = () => Math.random().toString(36).slice(2, 10);

const g = (id: string, name: string, color: Group["color"], order: number): Group => ({
  id,
  name,
  color,
  order,
});

const mk = (
  groupId: string,
  name: string,
  price: number,
  order: number,
  color: Item["color"],
  w = 1,
  h = 1,
): Item => ({
  id: `${groupId}-${order}`,
  groupId,
  name,
  price,
  available: true,
  w,
  h,
  shape: "square",
  color,
  order,
  modifiers: [],
});

const extras = [
  { id: "ex-cheese", name: "جبنة زيادة", price: 15 },
  { id: "ex-protein", name: "دبل بروتين", price: 45 },
  { id: "ex-sauce", name: "صوص حار", price: 5 },
];

const ing = (
  id: string,
  name: string,
  unit: Ingredient["unit"],
  par: number,
  stock = par,
): Ingredient => ({ id, name, unit, par, stock, lowAt: Math.round(par * 0.1 * 100) / 100 });

export const defaultState = (): PosState => {
  const groups: Group[] = [
    g("sandwiches-large", "ساندويتشات كبيرة (Bulk Bun)", "leaf", 0),
    g("sandwiches-mini", "ساندويتشات ميني (Mini Bun)", "amber", 1),
    g("pasta", "مكرونة (Pasta)", "tomato", 2),
    g("salads", "سلطات (Salads)", "lime", 3),
    g("drinks-hot", "مشروبات ساخنة", "onion", 4),
    g("drinks-cold", "عصائر طبيعية ومشروبات", "cheese", 5),
  ];

  const items: Item[] = [
    // 1. Sandwiches - Large (Bulk Bun)
    {
      id: "sl-honey-mustard",
      groupId: "sandwiches-large",
      name: "فراخ هاني ماسترد",
      price: 170,
      available: true,
      w: 2,
      h: 1,
      shape: "square",
      color: "leaf",
      order: 0,
      modifiers: [],
      desc: "200 جرام صدور فراخ جريل مع صوص هاني ماسترد | 700 سعرة | 68 جرام بروتين",
      image: "local:sandwiches-0",
    },
    {
      id: "sl-tandoori",
      groupId: "sandwiches-large",
      name: "فراخ تندوري",
      price: 165,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "leaf",
      order: 1,
      modifiers: [],
      desc: "200 جرام صدور فراخ جريل متبلة على الطريقة الهندية | 600 سعرة | 68 جرام بروتين",
      image: "local:sandwiches-1",
    },
    {
      id: "sl-fajita",
      groupId: "sandwiches-large",
      name: "فاهيتا فراخ",
      price: 165,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "leaf",
      order: 2,
      modifiers: [],
      desc: "200 جرام فراخ فاهيتا بالفلفل والألوان | 600 سعرة | 68 جرام بروتين",
      image: "local:sandwiches-5",
    },
    {
      id: "sl-roast-beef",
      groupId: "sandwiches-large",
      name: "روست بيف",
      price: 190,
      available: true,
      w: 2,
      h: 1,
      shape: "square",
      color: "tomato",
      order: 3,
      modifiers: [],
      desc: "100 جرام روست بيف مدخن عالي الجودة | 700 سعرة | 36 جرام بروتين",
      image: "local:sandwiches-2",
    },
    {
      id: "sl-hotdog",
      groupId: "sandwiches-large",
      name: "هوت دوج",
      price: 150,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "tomato",
      order: 4,
      modifiers: [],
      desc: "150 جرام هوت دوج مشوي متبل | 800 سعرة | 30 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sl-salami",
      groupId: "sandwiches-large",
      name: "سلامي",
      price: 140,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "tomato",
      order: 5,
      modifiers: [],
      desc: "100 جرام سلامي بيف مدخن | 650 سعرة | 26 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sl-classic-tuna",
      groupId: "sandwiches-large",
      name: "تونة كلاسيك",
      price: 120,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "lime",
      order: 6,
      modifiers: [],
      desc: "100 جرام تونة مصفاة بزيت الزيتون | 500 سعرة | 34 جرام بروتين",
      image: "local:sandwiches-3",
    },
    {
      id: "sl-bulk-tuna",
      groupId: "sandwiches-large",
      name: "تونة بولك بن",
      price: 150,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "lime",
      order: 7,
      modifiers: [],
      desc: "100 جرام تونة بخلطة البصل والفلفل الخاصة | 560 سعرة | 39 جرام بروتين",
      image: "local:sandwiches-3",
    },
    {
      id: "sl-tuna-salad",
      groupId: "sandwiches-large",
      name: "سندوتش سلطة تونة",
      price: 140,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "lime",
      order: 8,
      modifiers: [],
      desc: "100 جرام سلطة تونة غنية بالخضار والذرة | 600 سعرة | 42 جرام بروتين",
      image: "local:sandwiches-3",
    },
    {
      id: "sl-salmon",
      groupId: "sandwiches-large",
      name: "سلمون مدخن",
      price: 220,
      available: true,
      w: 2,
      h: 1,
      shape: "square",
      color: "tomato",
      order: 9,
      modifiers: [],
      desc: "100 جرام سلمون مدخن فاخر مع الكابري والشبت | 500 سعرة | 33 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sl-mashed-egg",
      groupId: "sandwiches-large",
      name: "بيض مهروس",
      price: 60,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "cheese",
      order: 10,
      modifiers: [],
      desc: "2 بيضة مسلوقة مع 100 جرام بطاطس مهروسة متبلة | 500 سعرة | 23 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sl-pastrami-egg",
      groupId: "sandwiches-large",
      name: "بيض بالبسطرمة",
      price: 115,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "cheese",
      order: 11,
      modifiers: [],
      desc: "2 بيضة مقلية مع 50 جرام بسطرمة فاخرة | 525 سعرة | 35 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sl-romi-cheese",
      groupId: "sandwiches-large",
      name: "جبنة رومي",
      price: 50,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "slate",
      order: 12,
      modifiers: [],
      desc: "شرائح جبنة رومي قليلة الدهون والملح | 450 سعرة | 20 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sl-flamank",
      groupId: "sandwiches-large",
      name: "جبنة فلمنك",
      price: 80,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "slate",
      order: 13,
      modifiers: [],
      desc: "جبنة فلمنك ممتازة ومغذية | 450 سعرة | 24 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sl-turkish",
      groupId: "sandwiches-large",
      name: "جبنة تركي",
      price: 80,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "slate",
      order: 14,
      modifiers: [],
      desc: "جبنة بيضاء إسطنبولي حادقة خفيفة | 450 سعرة | 24 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sl-feta",
      groupId: "sandwiches-large",
      name: "جبنة فيتا",
      price: 50,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "slate",
      order: 15,
      modifiers: [],
      desc: "جبنة فيتا كريمية قليلة الدسم مع شرائح الخيار | 450 سعرة | 20 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sl-cottage",
      groupId: "sandwiches-large",
      name: "جبنة قريش",
      price: 50,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "slate",
      order: 16,
      modifiers: [],
      desc: "جبنة قريش ريكوتا غنية بالكالسيوم مع حبة البركة | 320 سعرة | 24 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sl-healthy-potato",
      groupId: "sandwiches-large",
      name: "بطاطس صحية",
      price: 50,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "slate",
      order: 17,
      modifiers: [],
      desc: "بطاطس بيوريه مهروسة متبلة بالأعشاب | 550 سعرة | 10 جرام بروتين",
      image: "local:generic-sandwich",
    },

    // 2. Sandwiches - Mini (Mini Bun)
    {
      id: "sm-honey-mustard",
      groupId: "sandwiches-mini",
      name: "ميني هاني ماسترد",
      price: 85,
      available: true,
      w: 2,
      h: 1,
      shape: "square",
      color: "amber",
      order: 0,
      modifiers: [],
      desc: "100 جرام صدور فراخ جريل مع صوص هاني ماسترد | 350 سعرة | 34 جرام بروتين",
      image: "local:sandwiches-0",
    },
    {
      id: "sm-tandoori",
      groupId: "sandwiches-mini",
      name: "ميني تندوري",
      price: 85,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "amber",
      order: 1,
      modifiers: [],
      desc: "100 جرام صدور فراخ جريل متبلة على الطريقة الهندية | 300 سعرة | 34 جرام بروتين",
      image: "local:sandwiches-1",
    },
    {
      id: "sm-fajita",
      groupId: "sandwiches-mini",
      name: "ميني فاهيتا",
      price: 85,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "amber",
      order: 2,
      modifiers: [],
      desc: "100 جرام فراخ فاهيتا بالفلفل والألوان | 300 سعرة | 34 جرام بروتين",
      image: "local:sandwiches-5",
    },
    {
      id: "sm-roast-beef",
      groupId: "sandwiches-mini",
      name: "ميني روست بيف",
      price: 95,
      available: true,
      w: 2,
      h: 1,
      shape: "square",
      color: "tomato",
      order: 3,
      modifiers: [],
      desc: "50 جرام روست بيف مدخن عالي الجودة | 350 سعرة | 18 جرام بروتين",
      image: "local:sandwiches-2",
    },
    {
      id: "sm-hotdog",
      groupId: "sandwiches-mini",
      name: "ميني هوت دوج",
      price: 75,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "tomato",
      order: 4,
      modifiers: [],
      desc: "75 جرام هوت دوج مشوي متبل | 400 سعرة | 15 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sm-salami",
      groupId: "sandwiches-mini",
      name: "ميني سلامي",
      price: 70,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "tomato",
      order: 5,
      modifiers: [],
      desc: "50 جرام سلامي بيف مدخن | 325 سعرة | 13 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sm-classic-tuna",
      groupId: "sandwiches-mini",
      name: "ميني تونة كلاسيك",
      price: 60,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "lime",
      order: 6,
      modifiers: [],
      desc: "50 جرام تونة مصفاة بزيت الزيتون | 250 سعرة | 17 جرام بروتين",
      image: "local:sandwiches-3",
    },
    {
      id: "sm-bulk-tuna",
      groupId: "sandwiches-mini",
      name: "ميني تونة بولك",
      price: 75,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "lime",
      order: 7,
      modifiers: [],
      desc: "50 جرام تونة بخلطة البصل والفلفل الخاصة | 280 سعرة | 19.5 جرام بروتين",
      image: "local:sandwiches-3",
    },
    {
      id: "sm-tuna-salad",
      groupId: "sandwiches-mini",
      name: "ميني سلطة تونة",
      price: 70,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "lime",
      order: 8,
      modifiers: [],
      desc: "50 جرام سلطة تونة غنية بالخضار والذرة | 300 سعرة | 21 جرام بروتين",
      image: "local:sandwiches-3",
    },
    {
      id: "sm-salmon",
      groupId: "sandwiches-mini",
      name: "ميني سلمون مدخن",
      price: 110,
      available: true,
      w: 2,
      h: 1,
      shape: "square",
      color: "tomato",
      order: 9,
      modifiers: [],
      desc: "50 جرام سلمون مدخن فاخر مع الكابري والشبت | 250 سعرة | 16.5 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sm-mashed-egg",
      groupId: "sandwiches-mini",
      name: "ميني بيض مهروس",
      price: 30,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "cheese",
      order: 10,
      modifiers: [],
      desc: "1 بيضة مسلوقة مع 50 جرام بطاطس مهروسة متبلة | 250 سعرة | 11.5 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sm-pastrami-egg",
      groupId: "sandwiches-mini",
      name: "ميني بيض بسطرمة",
      price: 60,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "cheese",
      order: 11,
      modifiers: [],
      desc: "1 بيضة مقلية مع 25 جرام بسطرمة فاخرة | 262.5 سعرة | 17.5 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sm-romi-cheese",
      groupId: "sandwiches-mini",
      name: "ميني جبنة رومي",
      price: 25,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "slate",
      order: 12,
      modifiers: [],
      desc: "شرائح جبنة رومي قليلة الدهون والملح | 225 سعرة | 10 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sm-flamank",
      groupId: "sandwiches-mini",
      name: "ميني جبنة فلمنك",
      price: 40,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "slate",
      order: 13,
      modifiers: [],
      desc: "جبنة فلمنك ممتازة ومغذية | 225 سعرة | 12 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sm-turkish",
      groupId: "sandwiches-mini",
      name: "ميني جبنة تركي",
      price: 40,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "slate",
      order: 14,
      modifiers: [],
      desc: "جبنة بيضاء إسطنبولي حادقة خفيفة | 225 سعرة | 12 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sm-feta",
      groupId: "sandwiches-mini",
      name: "ميني جبنة فيتا",
      price: 25,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "slate",
      order: 15,
      modifiers: [],
      desc: "جبنة فيتا كريمية قليلة الدسم مع شرائح الخيار | 225 سعرة | 10 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sm-cottage",
      groupId: "sandwiches-mini",
      name: "ميني جبنة قريش",
      price: 25,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "slate",
      order: 16,
      modifiers: [],
      desc: "جبنة قريش ريكوتا غنية بالكالسيوم مع حبة البركة | 160 سعرة | 12 جرام بروتين",
      image: "local:generic-sandwich",
    },
    {
      id: "sm-healthy-potato",
      groupId: "sandwiches-mini",
      name: "ميني بطاطس صحية",
      price: 25,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "slate",
      order: 17,
      modifiers: [],
      desc: "بطاطس بيوريه مهروسة متبلة بالأعشاب | 275 سعرة | 5 جرام بروتين",
      image: "local:generic-sandwich",
    },

    // 3. Pasta (One Size)
    {
      id: "pa-chicken",
      groupId: "pasta",
      name: "مكرونة فراخ",
      price: 120,
      available: true,
      w: 2,
      h: 1,
      shape: "square",
      color: "tomato",
      order: 0,
      modifiers: [],
      desc: "150 جرام دجاج جريل، اختيارك من الصوص والشكل | 610 سعرة | 50 جرام بروتين",
      image: "local:generic-meal",
    },
    {
      id: "pa-beef",
      groupId: "pasta",
      name: "مكرونة لحمة مفرومة",
      price: 125,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "tomato",
      order: 1,
      modifiers: [],
      desc: "100 جرام لحم مفروم، اختيارك من الصوص والشكل | 545 سعرة | 32 جرام بروتين",
      image: "local:generic-meal",
    },
    {
      id: "pa-sausage",
      groupId: "pasta",
      name: "مكرونة سجق",
      price: 100,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "tomato",
      order: 2,
      modifiers: [],
      desc: "100 جرام سجق، اختيارك من الصوص والشكل | 650 سعرة | 20 جرام بروتين",
      image: "local:generic-meal",
    },

    // 4. Salads (One Size)
    {
      id: "sa-tuna",
      groupId: "salads",
      name: "سلطة تونة صحية",
      price: 135,
      available: true,
      w: 2,
      h: 1,
      shape: "square",
      color: "lime",
      order: 0,
      modifiers: [],
      desc: "100 جرام تونة قطع مع طماطم وخيار وبصل وزيت زيتون | 420 سعرة | 35 جرام بروتين",
      image: "local:salads-2",
    },
    {
      id: "sa-caesar",
      groupId: "salads",
      name: "سلطة سيزر بالدجاج",
      price: 150,
      available: true,
      w: 2,
      h: 1,
      shape: "square",
      color: "lime",
      order: 1,
      modifiers: [],
      desc: "150 جرام صدور دجاج جريل، خس كابوتشا، كروتوني محمص، صوص سيزر | 600 سعرة | 55 جرام بروتين",
      image: "local:salads-1",
    },

    // 5. Hot Drinks (مشروبات ساخنة)
    {
      id: "dh-tea",
      groupId: "drinks-hot",
      name: "شاي",
      price: 35,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "onion",
      order: 0,
      modifiers: [],
      desc: "شاي فتلة أسود فاخر (سادة أو بالنعناع)",
      image: "local:generic-drink",
    },
    {
      id: "dh-coffee",
      groupId: "drinks-hot",
      name: "قهوة تركي",
      price: 40,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "onion",
      order: 1,
      modifiers: [],
      desc: "قهوة تركي طازجة (بن فاتح أو وسط - محوج أو سادة)",
      image: "local:generic-drink",
    },
    {
      id: "dh-espresso-s",
      groupId: "drinks-hot",
      name: "إسبريسو سنغل",
      price: 50,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "onion",
      order: 2,
      modifiers: [],
      desc: "Single shot espresso",
      image: "local:generic-drink",
    },
    {
      id: "dh-espresso-d",
      groupId: "drinks-hot",
      name: "إسبريسو دبل",
      price: 70,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "onion",
      order: 3,
      modifiers: [],
      desc: "Double shot espresso",
      image: "local:generic-drink",
    },
    {
      id: "dh-cappuccino",
      groupId: "drinks-hot",
      name: "كابتشينو",
      price: 90,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "onion",
      order: 4,
      modifiers: [],
      desc: "إسبريسو مع فوم حليب كثيف دافي",
      image: "local:generic-drink",
    },
    {
      id: "dh-american",
      groupId: "drinks-hot",
      name: "أمريكان كوفي",
      price: 80,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "onion",
      order: 5,
      modifiers: [],
      desc: "قهوة أمريكية مصفاة كلاسيكية دافية",
      image: "local:generic-drink",
    },
    {
      id: "dh-latte",
      groupId: "drinks-hot",
      name: "لاتيه",
      price: 90,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "onion",
      order: 6,
      modifiers: [],
      desc: "إسبريسو مع حليب ساخن مفوم",
      image: "local:generic-drink",
    },
    {
      id: "dh-flatwhite",
      groupId: "drinks-hot",
      name: "فلات وايت",
      price: 90,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "onion",
      order: 7,
      modifiers: [],
      desc: "Double shot ristretto with silky microfoam",
      image: "local:generic-drink",
    },
    {
      id: "dh-macchiato",
      groupId: "drinks-hot",
      name: "ميكاتو",
      price: 75,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "onion",
      order: 8,
      modifiers: [],
      desc: "إسبريسو مع بقعة صغيرة من الحليب المفوم",
      image: "local:generic-drink",
    },
    {
      id: "dh-herbs",
      groupId: "drinks-hot",
      name: "أعشاب طبيعية",
      price: 35,
      available: true,
      w: 1,
      h: 1,
      shape: "circle",
      color: "onion",
      order: 9,
      modifiers: [],
      desc: "اختر من: نعناع / زنجبيل / قرفة / تيليو / شاي أخضر",
      image: "local:generic-drink",
    },
    {
      id: "dh-celery",
      groupId: "drinks-hot",
      name: "كرفس وبقدونس",
      price: 40,
      available: true,
      w: 1,
      h: 1,
      shape: "circle",
      color: "onion",
      order: 10,
      modifiers: [],
      desc: "مشروب كرفس وبقدونس صحي مسلوق ودافي ومصفى",
      image: "local:generic-drink",
    },

    // 6. Cold Drinks & Juices (عصائر ومشروبات)
    {
      id: "dc-banana",
      groupId: "drinks-cold",
      name: "موز باللبن",
      price: 60,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "cheese",
      order: 0,
      modifiers: [],
      desc: "موز فريش مضروب باللبن والعسل الطبيعي بدون سكر",
      image: "local:drinks-banana",
    },
    {
      id: "dc-mango",
      groupId: "drinks-cold",
      name: "عصير مانجو",
      price: 70,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "cheese",
      order: 1,
      modifiers: [],
      desc: "عصير مانجو طبيعي 100% بارد ومنعش",
      image: "local:drinks-mango",
    },
    {
      id: "dc-guava",
      groupId: "drinks-cold",
      name: "عصير جوافة",
      price: 70,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "cheese",
      order: 2,
      modifiers: [],
      desc: "عصير جوافة طبيعي منعش وخفيف",
      image: "local:drinks-guava",
    },
    {
      id: "dc-strawberry",
      groupId: "drinks-cold",
      name: "عصير فراولة",
      price: 70,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "cheese",
      order: 3,
      modifiers: [],
      desc: "عصير فراولة طبيعي مثلج وطازج",
      image: "local:drinks-strawberry",
    },
    {
      id: "dc-orange",
      groupId: "drinks-cold",
      name: "عصير برتقال فريش",
      price: 70,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "cheese",
      order: 4,
      modifiers: [],
      desc: "برتقال طبيعي معصور على البارد بدون سكر أو مواد حافظة",
      image: "local:drinks-1",
    },
    {
      id: "dc-affogato",
      groupId: "drinks-cold",
      name: "أفوجاتو مثلج",
      price: 110,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "cheese",
      order: 5,
      modifiers: [],
      desc: "بولات آيس كريم فانيليا غنية يصب عليها إسبريسو ساخن فريش",
      image: "local:drinks-3",
    },
    {
      id: "dc-vcola",
      groupId: "drinks-cold",
      name: "في كولا",
      price: 30,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "cheese",
      order: 6,
      modifiers: [],
      desc: "مشروب غازي كولا منعش",
      image: "local:drinks-2",
    },
    {
      id: "dc-redbull",
      groupId: "drinks-cold",
      name: "ريد بول",
      price: 75,
      available: true,
      w: 1,
      h: 1,
      shape: "square",
      color: "cheese",
      order: 7,
      modifiers: [],
      desc: "Red Bull Energy Drink",
      image: "local:drinks-2",
    },
    {
      id: "dc-water",
      groupId: "drinks-cold",
      name: "مياه معدنية",
      price: 15,
      available: true,
      w: 1,
      h: 1,
      shape: "circle",
      color: "cheese",
      order: 8,
      modifiers: [],
      desc: "زجاجة مياه معدنية طبيعية باردة",
      image: "local:drinks-0",
    },
    {
      id: "dc-suntop",
      groupId: "drinks-cold",
      name: "صن توب",
      price: 30,
      available: true,
      w: 1,
      h: 1,
      shape: "circle",
      color: "cheese",
      order: 9,
      modifiers: [],
      desc: "عصير صن توب للأطفال (جميع النكهات)",
      image: "local:drinks-1",
    },
  ];

  // ربط خيارات الخبز لكل السندوتشات
  const breadModifiers = [
    { id: "br-wheat", name: "خبز قمح كامل (Whole Wheat)", price: 0 },
    { id: "br-brown", name: "خبز سن (Brown Bread)", price: 0 },
    { id: "br-french", name: "خبز فرنسي (French)", price: 0 },
    { id: "br-tortilla", name: "خبز تورتيلا (Tortilla)", price: 0 },
  ];

  // ربط خيارات المكرونة
  const pastaModifiers = [
    { id: "pa-penne", name: "مكرونة بنة (Penne)", price: 0 },
    { id: "pa-spagh", name: "مكرونة اسباجيتي (Spaghetti)", price: 0 },
    { id: "so-red", name: "صوص أحمر (Red Sauce)", price: 0 },
    { id: "so-white", name: "صوص أبيض (White Sauce)", price: 0 },
  ];

  for (const item of items) {
    if (item.groupId === "sandwiches-large" || item.groupId === "sandwiches-mini") {
      item.modifiers = breadModifiers;
    } else if (item.groupId === "pasta") {
      item.modifiers = pastaModifiers;
    } else if (item.groupId === "drinks-hot") {
      item.image = "local:generic-hot-drink";
    }
  }

  const ingredients: Ingredient[] = [
    ing("ing-bread", "عيش سندوتش", "pcs", 200),
    ing("ing-chicken", "صدور دجاج", "g", 20000),
    ing("ing-beef", "لحم بيف", "g", 12000),
    ing("ing-tuna", "تونة", "g", 6000),
    ing("ing-onion", "بصل", "g", 8000),
    ing("ing-garlic", "ثوم", "g", 2000),
    ing("ing-tomato", "طماطم", "g", 8000),
    ing("ing-lettuce", "خس", "g", 6000),
    ing("ing-cheese", "جبنة", "g", 5000),
    ing("ing-sauce", "صوص", "ml", 4000),
    ing("ing-potato", "بطاطس", "g", 10000),
  ];

  const recipe = (id: string, lines: [string, number][]) => {
    const it = items.find((x) => x.id === id);
    if (it) it.recipe = lines.map(([ingredientId, qty]) => ({ ingredientId, qty }));
  };
  recipe("sl-honey-mustard", [
    ["ing-bread", 1],
    ["ing-chicken", 200],
    ["ing-onion", 20],
    ["ing-lettuce", 20],
    ["ing-tomato", 25],
    ["ing-sauce", 20],
  ]);
  recipe("sm-honey-mustard", [
    ["ing-bread", 1],
    ["ing-chicken", 100],
    ["ing-onion", 10],
    ["ing-lettuce", 10],
    ["ing-tomato", 15],
    ["ing-sauce", 10],
  ]);
  recipe("sl-roast-beef", [
    ["ing-bread", 1],
    ["ing-beef", 100],
    ["ing-sauce", 20],
  ]);
  recipe("sl-classic-tuna", [
    ["ing-bread", 1],
    ["ing-tuna", 100],
    ["ing-lettuce", 20],
  ]);
  recipe("pa-chicken", [
    ["ing-chicken", 150],
    ["ing-sauce", 150],
  ]);

  return {
    groups,
    items,
    taxRate: 0.14,
    serviceRate: 0.12,
    orders: [],
    nextOrderNo: 1001,
    ingredients,
    stockMoves: [],
    shiftStartedAt: Date.now(),
    activeShift: null,
    version: 7,
  };
};

interface Ctx {
  state: PosState;
  ready: boolean;
  update: (fn: (s: PosState) => PosState) => void;
  addGroup: (name: string, color: Group["color"]) => void;
  updateGroup: (id: string, patch: Partial<Group>) => void;
  removeGroup: (id: string) => void;
  addItem: (item: Omit<Item, "id" | "order">) => void;
  updateItem: (id: string, patch: Partial<Item>) => void;
  removeItem: (id: string) => void;
  reorderItem: (groupId: string, from: string, to: string) => void;
  /** يحفظ فاتورة جديدة أو يحدّث فاتورة موجودة (استرجاع + زيادة أصناف) */
  saveOrder: (order: Omit<Order, "orderNo"> & { orderNo?: number | undefined }) => Order;
  cancelOrder: (id: string) => void;
  addIngredient: (data: Omit<Ingredient, "id">) => void;
  updateIngredient: (id: string, patch: Partial<Ingredient>) => void;
  removeIngredient: (id: string) => void;
  /** إضافة/خصم كمية من المخزن مع تسجيل الحركة */
  stockMove: (ingredientId: string, qty: number, reason: StockMoveReason, note?: string) => void;
  startShift: () => void;
  setActiveShift: (shift: any) => void;
  deleteOrder: (id: string) => void;
  resetAll: () => void;
}

/** استهلاك المخزن لسطور الفاتورة */
const usageOf = (s: PosState, lines: any[]) => {
  const map: Record<string, number> = {};
  for (const l of lines) {
    const item = s.items.find((i) => i.id === l.itemId);
    
    // Find all "بدون" (without) modifiers in this line
    const excludedIngredients = new Set<string>();
    if (l.modifiers) {
      for (const m of l.modifiers) {
        if (m.name.startsWith("بدون ")) {
          const ingName = m.name.substring(5).trim();
          const ing = s.ingredients.find(
            (x) => x.name.trim() === ingName || ingName.includes(x.name.trim()) || x.name.trim().includes(ingName)
          );
          if (ing) {
            excludedIngredients.add(ing.id);
          }
        }
      }
    }

    for (const r of item?.recipe ?? []) {
      if (excludedIngredients.has(r.ingredientId)) {
        continue;
      }
      map[r.ingredientId] = (map[r.ingredientId] ?? 0) + r.qty * l.qty;
    }
  }
  return map;
};

/** الفرق بين استهلاك قديم وجديد (سالب = خصم من المخزن) */
const usageDelta = (
  s: PosState,
  before: { itemId: string; qty: number }[],
  after: { itemId: string; qty: number }[],
) => {
  const a = usageOf(s, before);
  const b = usageOf(s, after);
  const out: Record<string, number> = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const diff = (a[id] ?? 0) - (b[id] ?? 0);
    if (Math.abs(diff) > 1e-9) out[id] = diff;
  }
  return out;
};

const applyStock = (
  s: PosState,
  delta: Record<string, number>,
  reason: StockMoveReason,
  note?: string,
  orderNo?: number,
): PosState => {
  const entries = Object.entries(delta).filter(([, q]) => q !== 0);
  if (!entries.length) return s;
  const at = Date.now();
  const moves: StockMove[] = entries.map(([ingredientId, qty]) => ({
    id: uid(),
    ingredientId,
    qty,
    reason,
    at,
    ...(note ? { note } : {}),
    ...(orderNo ? { orderNo } : {}),
  }));
  return {
    ...s,
    ingredients: s.ingredients.map((i) =>
      delta[i.id] ? { ...i, stock: Math.round((i.stock + (delta[i.id] ?? 0)) * 1000) / 1000 } : i,
    ),
    stockMoves: [...moves, ...s.stockMoves].slice(0, 2000),
  };
};

const PosContext = createContext<Ctx | null>(null);

export function PosProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PosState>(defaultState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PosState>;
        // Migration reset: if version is older than 7 or contains old groups, force new default menu
        if (
          !parsed.version ||
          parsed.version < 7 ||
          (parsed.groups && parsed.groups.some((g) => g.id === "sandwiches" || g.id === "meals"))
        ) {
          console.log("Old version or English version detected, resetting to new Arabic menu...");
          localStorage.removeItem(STORAGE_KEY);
          // Keep the default state initialized from defaultState()
        } else {
          setState((s) => ({
            ...s,
            ...parsed,
            orders: parsed.orders ?? [],
            nextOrderNo: parsed.nextOrderNo ?? 1001,
            ingredients: parsed.ingredients ?? s.ingredients,
            stockMoves: parsed.stockMoves ?? [],
            shiftStartedAt: parsed.shiftStartedAt ?? Date.now(),
          }));
        }
      }
    } catch {
      /* ignore */
    }
    setReady(true);

    // Fetch the latest menu snapshot from Cloudflare D1 database to sync sizes, sorting, and pricing across devices
    const syncMenu = () => {
      import("@/lib/online.functions").then(({ getPublicMenu }) => {
        getPublicMenu()
          .then((res) => {
            if (res?.menu?.items?.length) {
              setState((s) => {
                // Merge ingredients catalog to preserve local stock levels
                const mergedIngredients = [
                  ...s.ingredients.map((localIng) => {
                    const dbIng = res.menu.ingredients?.find((x) => x.id === localIng.id);
                    if (!dbIng) return localIng;
                    return {
                      ...localIng,
                      name: dbIng.name,
                      unit: dbIng.unit as any,
                      par: dbIng.par,
                      lowAt: dbIng.lowAt,
                    };
                  }),
                  ...(res.menu.ingredients ?? [])
                    .filter((dbIng) => !s.ingredients.some((x) => x.id === dbIng.id))
                    .map((dbIng) => ({
                      ...dbIng,
                      unit: dbIng.unit as any,
                      stock: dbIng.stock ?? 0,
                    })),
                ];

                return {
                  ...s,
                  groups: res.menu.groups,
                  ingredients: mergedIngredients,
                  taxRate: res.menu.taxRate ?? s.taxRate,
                  serviceRate: res.menu.serviceRate ?? s.serviceRate,
                  items: res.menu.items.map((dbItem) => {
                    const defaultItem = s.items.find((i) => i.id === dbItem.id);
                    return {
                      ...dbItem,
                      w: dbItem.w ?? defaultItem?.w ?? 1,
                      h: dbItem.h ?? defaultItem?.h ?? 1,
                      shape: dbItem.shape ?? defaultItem?.shape ?? "square",
                      color: dbItem.color ?? defaultItem?.color ?? "leaf",
                      modifiers: dbItem.modifiers ?? defaultItem?.modifiers ?? [],
                      recipe: dbItem.recipe ?? defaultItem?.recipe ?? [],
                    };
                  }),
                };
              });
            }
          })
          .catch(console.error);
      });
    };

    syncMenu();
    // Poll every 30 seconds for menu, price, tax, service, and modifier updates
    const interval = setInterval(syncMenu, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, ready]);

  const update = useCallback((fn: (s: PosState) => PosState) => setState(fn), []);

  const value = useMemo<Ctx>(
    () => ({
      state,
      ready,
      update,
      addGroup: (name, color) =>
        setState((s) => ({
          ...s,
          groups: [...s.groups, { id: uid(), name, color, order: s.groups.length }],
        })),
      updateGroup: (id, patch) =>
        setState((s) => ({
          ...s,
          groups: s.groups.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      removeGroup: (id) =>
        setState((s) => ({
          ...s,
          groups: s.groups.filter((x) => x.id !== id),
          items: s.items.filter((x) => x.groupId !== id),
        })),
      addItem: (item) =>
        setState((s) => ({
          ...s,
          items: [
            ...s.items,
            {
              ...item,
              id: uid(),
              order: s.items.filter((x) => x.groupId === item.groupId).length,
            },
          ],
        })),
      updateItem: (id, patch) =>
        setState((s) => ({
          ...s,
          items: s.items.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      removeItem: (id) => setState((s) => ({ ...s, items: s.items.filter((x) => x.id !== id) })),
      reorderItem: (groupId, from, to) =>
        setState((s) => {
          if (from === to) return s;
          const inGroup = s.items
            .filter((x) => x.groupId === groupId)
            .sort((a, b) => a.order - b.order);
          const fromIdx = inGroup.findIndex((x) => x.id === from);
          const toIdx = inGroup.findIndex((x) => x.id === to);
          if (fromIdx < 0 || toIdx < 0) return s;
          const next = [...inGroup];
          const [moved] = next.splice(fromIdx, 1);
          if (!moved) return s;
          next.splice(toIdx, 0, moved);
          const orderMap = new Map(next.map((x, i) => [x.id, i]));
          return {
            ...s,
            items: s.items.map((x) =>
              orderMap.has(x.id) ? { ...x, order: orderMap.get(x.id)! } : x,
            ),
          };
        }),
      addIngredient: (data) =>
        setState((s) => ({ ...s, ingredients: [...s.ingredients, { ...data, id: uid() }] })),
      updateIngredient: (id, patch) =>
        setState((s) => ({
          ...s,
          ingredients: s.ingredients.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      removeIngredient: (id) =>
        setState((s) => ({
          ...s,
          ingredients: s.ingredients.filter((x) => x.id !== id),
          items: s.items.map((i) =>
            i.recipe?.some((r) => r.ingredientId === id)
              ? { ...i, recipe: i.recipe.filter((r) => r.ingredientId !== id) }
              : i,
          ),
        })),
      stockMove: (ingredientId, qty, reason, note) => {
        setState((s) => applyStock(s, { [ingredientId]: qty }, reason, note));
        void syncInventoryLogFn({
          data: {
            id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10),
            ingredientId,
            qty,
            reason,
            notes: note ?? "",
            createdAt: Date.now(),
          },
        }).catch(console.error);
      },
      startShift: () => setState((s) => ({ ...s, shiftStartedAt: Date.now() })),
      setActiveShift: (shift) => setState((s) => ({ ...s, activeShift: shift })),
      saveOrder: (order) => {
        let saved: Order = { ...order, orderNo: order.orderNo ?? 0 } as Order;
        setState((s) => {
          const exists = s.orders.some((o) => o.id === order.id);
          const prev = s.orders.find((o) => o.id === order.id);
          const delta = usageDelta(s, prev?.lines ?? [], order.lines);
          if (exists) {
            saved = {
              ...(s.orders.find((o) => o.id === order.id) as Order),
              ...order,
              updatedAt: Date.now(),
            } as Order;
            const next = {
              ...s,
              orders: s.orders.map((o) => (o.id === order.id ? saved : o)),
            };
            return applyStock(next, delta, "sale", undefined, saved.orderNo);
          }
          const orderNo = order.orderNo ?? s.nextOrderNo;
          saved = { ...order, orderNo, shiftId: order.shiftId || s.activeShift?.id || undefined, updatedAt: Date.now() } as Order;
          const next = {
            ...s,
            orders: [saved, ...s.orders],
            nextOrderNo: Math.max(s.nextOrderNo, orderNo) + 1,
          };
          return applyStock(next, delta, "sale", undefined, orderNo);
        });

        // مزامنة الفاتورة مع الخادم
        void syncOrderFn({
          data: {
            id: saved.id,
            orderNo: saved.orderNo,
            subtotal: saved.subtotal,
            discount: saved.discount,
            service: saved.service,
            tax: saved.tax,
            total: saved.total,
            paymentMethod: saved.payments[0]?.method ?? "cash",
            status: saved.status,
            shiftId: saved.shiftId || null,
            createdAt: saved.createdAt,
            updatedAt: saved.updatedAt,
            lines: saved.lines.map((l) => ({
              id: l.lineId,
              itemId: l.itemId,
              name: l.name,
              unitPrice: l.unitPrice,
              qty: l.qty,
            })),
          },
        }).catch(console.error);

        return saved;
      },
      cancelOrder: (id) => {
        let cancelledOrder: Order | undefined;
        setState((s) => {
          const order = s.orders.find((o) => o.id === id);
          const next = {
            ...s,
            orders: s.orders.map((o) =>
              o.id === id ? { ...o, status: "cancelled" as const, updatedAt: Date.now() } : o,
            ),
          };
          cancelledOrder = next.orders.find((o) => o.id === id);
          if (!order || order.status === "cancelled") return next;
          const back = usageDelta(s, order.lines, []);
          return applyStock(next, back, "void", "إلغاء فاتورة", order.orderNo);
        });

        if (cancelledOrder) {
          void syncOrderFn({
            data: {
              id: cancelledOrder.id,
              orderNo: cancelledOrder.orderNo,
              subtotal: cancelledOrder.subtotal,
              discount: cancelledOrder.discount,
              service: cancelledOrder.service,
              tax: cancelledOrder.tax,
              total: cancelledOrder.total,
              paymentMethod: cancelledOrder.payments[0]?.method ?? "cash",
              status: cancelledOrder.status,
              shiftId: cancelledOrder.shiftId || null,
              createdAt: cancelledOrder.createdAt,
              updatedAt: cancelledOrder.updatedAt,
              lines: cancelledOrder.lines.map((l) => ({
                id: l.lineId,
                itemId: l.itemId,
                name: l.name,
                unitPrice: l.unitPrice,
                qty: l.qty,
              })),
            },
          }).catch(console.error);
        }
      },
      deleteOrder: (id) =>
        setState((s) => {
          const order = s.orders.find((o) => o.id === id);
          const next = { ...s, orders: s.orders.filter((o) => o.id !== id) };
          // لو الفاتورة كانت مدفوعة (اتخصمت من المخزن) يرجع رصيدها للمخزن قبل الحذف
          if (!order || order.status === "cancelled") return next;
          const back = usageDelta(s, order.lines, []);
          return applyStock(next, back, "void", "حذف فاتورة", order.orderNo);
        }),
      resetAll: () => setState(defaultState()),
    }),
    [state, ready, update],
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos must be used inside PosProvider");
  return ctx;
}
