import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
    g("sandwiches", "ساندويتشات", "leaf", 0),
    g("meals", "وجبات", "amber", 1),
    g("salads", "سلطات", "lime", 2),
    g("sides", "إضافات جانبية", "cheese", 3),
    g("drinks", "مشروبات", "onion", 4),
  ];

  const items: Item[] = [
    mk("sandwiches", "تشيكن جريل", 95, 0, "leaf", 2, 1),
    mk("sandwiches", "تشيكن سيزر", 105, 1, "leaf"),
    mk("sandwiches", "بيف ستيك", 135, 2, "tomato"),
    mk("sandwiches", "تونة صحية", 85, 3, "lime"),
    mk("sandwiches", "شاورما فراخ", 90, 4, "amber"),
    mk("sandwiches", "فاهيتا", 110, 5, "tomato"),
    mk("meals", "وجبة تشيكن جريل", 155, 0, "amber", 2, 1),
    mk("meals", "وجبة بيف", 195, 1, "tomato"),
    mk("meals", "وجبة تونة", 140, 2, "lime"),
    mk("salads", "سيزر سلطة", 75, 0, "lime"),
    mk("salads", "سلطة يونانية", 70, 1, "leaf"),
    mk("salads", "كول سلو", 35, 2, "cheese"),
    mk("sides", "بطاطس ودجز", 45, 0, "cheese"),
    mk("sides", "صوص إضافي", 10, 1, "slate"),
    mk("sides", "خبز إضافي", 12, 2, "slate"),
    mk("drinks", "مياه معدنية", 15, 0, "slate"),
    mk("drinks", "عصير برتقال", 40, 1, "amber"),
    mk("drinks", "بيبسي", 25, 2, "onion"),
    mk("drinks", "لاتيه بارد", 55, 3, "onion"),
  ];

  items[0]!.modifiers = extras;
  items[6]!.modifiers = extras;

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
  recipe("sandwiches-0", [
    ["ing-bread", 1],
    ["ing-chicken", 150],
    ["ing-onion", 20],
    ["ing-lettuce", 20],
    ["ing-tomato", 25],
    ["ing-sauce", 20],
  ]);
  recipe("sandwiches-2", [
    ["ing-bread", 1],
    ["ing-beef", 160],
    ["ing-onion", 20],
    ["ing-sauce", 20],
  ]);
  recipe("sandwiches-3", [
    ["ing-bread", 1],
    ["ing-tuna", 120],
    ["ing-lettuce", 20],
  ]);
  recipe("meals-0", [
    ["ing-bread", 1],
    ["ing-chicken", 180],
    ["ing-potato", 150],
    ["ing-sauce", 25],
  ]);
  recipe("sides-0", [["ing-potato", 200]]);

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
  stockMove: (
    ingredientId: string,
    qty: number,
    reason: StockMoveReason,
    note?: string,
  ) => void;
  startShift: () => void;
  deleteOrder: (id: string) => void;
  resetAll: () => void;
}

/** استهلاك المخزن لسطور الفاتورة */
const usageOf = (s: PosState, lines: { itemId: string; qty: number }[]) => {
  const map: Record<string, number> = {};
  for (const l of lines) {
    const item = s.items.find((i) => i.id === l.itemId);
    for (const r of item?.recipe ?? []) {
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
      delta[i.id]
        ? { ...i, stock: Math.round((i.stock + (delta[i.id] ?? 0)) * 1000) / 1000 }
        : i,
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
    } catch {
      /* ignore */
    }
    setReady(true);
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
      removeItem: (id) =>
        setState((s) => ({ ...s, items: s.items.filter((x) => x.id !== id) })),
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
      stockMove: (ingredientId, qty, reason, note) =>
        setState((s) => applyStock(s, { [ingredientId]: qty }, reason, note)),
      startShift: () => setState((s) => ({ ...s, shiftStartedAt: Date.now() })),
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
          saved = { ...order, orderNo, updatedAt: Date.now() } as Order;
          const next = {
            ...s,
            orders: [saved, ...s.orders],
            nextOrderNo: Math.max(s.nextOrderNo, orderNo) + 1,
          };
          return applyStock(next, delta, "sale", undefined, orderNo);
        });
        return saved;
      },
      cancelOrder: (id) =>
        setState((s) => {
          const order = s.orders.find((o) => o.id === id);
          const next = {
            ...s,
            orders: s.orders.map((o) =>
              o.id === id ? { ...o, status: "cancelled" as const, updatedAt: Date.now() } : o,
            ),
          };
          if (!order || order.status === "cancelled") return next;
          const back = usageDelta(s, order.lines, []);
          return applyStock(next, back, "void", "إلغاء فاتورة", order.orderNo);
        }),
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
