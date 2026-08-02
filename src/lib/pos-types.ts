export type TileShape = "square" | "circle";

export type TileColor =
  | "leaf"
  | "lime"
  | "amber"
  | "tomato"
  | "cheese"
  | "onion"
  | "slate";

export interface Group {
  id: string;
  name: string;
  color: TileColor;
  order: number;
}

export interface Modifier {
  id: string;
  name: string;
  price: number;
}

export type StockUnit = "g" | "kg" | "ml" | "l" | "pcs";

export const STOCK_UNITS: { id: StockUnit; label: string }[] = [
  { id: "g", label: "جرام" },
  { id: "kg", label: "كيلو" },
  { id: "ml", label: "مللي" },
  { id: "l", label: "لتر" },
  { id: "pcs", label: "قطعة" },
];

/** مكوّن في المخزن (بصل، ثوم، صدور دجاج ...) */
export interface Ingredient {
  id: string;
  name: string;
  unit: StockUnit;
  /** الرصيد الحالي بوحدة المكوّن */
  stock: number;
  /** الكمية المرجعية (المخزن ممتلئ) — تُستخدم لحساب النسبة */
  par: number;
  /** حد التنبيه (افتراضي 10% من الكمية المرجعية) */
  lowAt: number;
}

export type StockMoveReason = "receive" | "sale" | "waste" | "adjust" | "void";

export interface StockMove {
  id: string;
  ingredientId: string;
  /** موجب = دخول، سالب = خروج */
  qty: number;
  reason: StockMoveReason;
  at: number;
  note?: string;
  orderNo?: number;
}

/** استهلاك الصنف من المخزن لكل وحدة مبيعة */
export interface RecipeLine {
  ingredientId: string;
  qty: number;
}

export interface Item {
  id: string;
  groupId: string;
  name: string;
  price: number;
  available: boolean;
  /** grid columns the tile spans (1-3) */
  w: number;
  /** grid rows the tile spans (1-2) */
  h: number;
  shape: TileShape;
  color: TileColor;
  order: number;
  modifiers: Modifier[];
  /** مكوّنات الصنف والاستهلاك لكل سندوتش/وحدة */
  recipe?: RecipeLine[];
  /** رابط صورة الصنف (تظهر في منيو العملاء) */
  image?: string;
  /** وصف مختصر يظهر في منيو العملاء */
  desc?: string;
}

export interface CartLine {
  lineId: string;
  itemId: string;
  name: string;
  unitPrice: number;
  qty: number;
  modifiers: Modifier[];
}

export type PaymentMethod = "cash" | "vodafone" | "instapay" | "visa";

export type OrderStatus = "paid" | "cancelled";

export interface OrderPayment {
  method: PaymentMethod;
  amount: number;
  at: number;
}

export interface Order {
  id: string;
  orderNo: number;
  createdAt: number;
  updatedAt: number;
  status: OrderStatus;
  lines: CartLine[];
  discount: number;
  subtotal: number;
  service: number;
  tax: number;
  total: number;
  payments: OrderPayment[];
  note?: string;
}

export interface PosState {
  groups: Group[];
  items: Item[];
  taxRate: number;
  serviceRate: number;
  orders: Order[];
  nextOrderNo: number;
  ingredients: Ingredient[];
  stockMoves: StockMove[];
  /** بداية الوردية الحالية */
  shiftStartedAt: number;
}

export const STOCK_REASONS: Record<StockMoveReason, string> = {
  receive: "استلام",
  sale: "بيع",
  waste: "هالك",
  adjust: "جرد/تعديل",
  void: "إلغاء فاتورة",
};

export const TILE_COLORS: Record<TileColor, { label: string; css: string }> = {
  leaf: { label: "أخضر", css: "var(--tile-leaf)" },
  lime: { label: "ليموني", css: "var(--tile-lime)" },
  amber: { label: "برتقالي", css: "var(--tile-amber)" },
  tomato: { label: "أحمر", css: "var(--tile-tomato)" },
  cheese: { label: "أصفر", css: "var(--tile-cheese)" },
  onion: { label: "بنفسجي", css: "var(--tile-onion)" },
  slate: { label: "رمادي", css: "var(--tile-slate)" },
};

export const PAYMENT_METHODS: {
  id: PaymentMethod;
  label: string;
}[] = [
  { id: "cash", label: "كاش" },
  { id: "vodafone", label: "فودافون كاش" },
  { id: "instapay", label: "انستا باي" },
  { id: "visa", label: "فيزا / كارت" },
];

export const EGP = (n: number) =>
  `${n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
