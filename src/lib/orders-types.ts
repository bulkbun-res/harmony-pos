/**
 * أنواع منظومة القنوات الثلاث — مشتركة بين السيرفر والواجهة.
 *
 * counter  = تيك أواي / كاشير
 * table    = ترابيزات (فاتورة تفتح وتتقفل)
 * talabat  = طلبات (زيادة 20% مدفونة في سعر السطر)
 */

export type Channel = "counter" | "table" | "talabat";

export type PaymentMethod = "cash" | "visa" | "vodafone" | "instapay";

export type OrderFlowStatus = "open" | "paid" | "cancelled";

export const CHANNELS: { id: Channel; label: string; short: string }[] = [
  { id: "counter", label: "كاشير / تيك أواي", short: "كاشير" },
  { id: "table", label: "ترابيزات", short: "ترابيزة" },
  { id: "talabat", label: "طلبات", short: "طلبات" },
];

export const CHANNEL_LABEL: Record<Channel, string> = {
  counter: "كاشير",
  table: "ترابيزة",
  talabat: "طلبات",
};

/** سطر داخل الفاتورة كما هو محفوظ على السيرفر */
export interface OrderLineDTO {
  id: string;
  itemId: string;
  name: string;
  /** سعر المحل قبل زيادة طلبات */
  basePrice: number;
  /** السعر المطبق فعليًا */
  unitPrice: number;
  qty: number;
  lineTotal: number;
  kind: "item" | "modifier";
  parentLineId: string | null;
  modifierNames: string[];
  note: string | null;
  voided: boolean;
}

export interface OrderDTO {
  id: string;
  channel: Channel;
  orderNo: number;
  status: OrderFlowStatus;
  subtotal: number;
  discount: number;
  serviceRate: number;
  service: number;
  taxRate: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod | null;
  paidAt: string | null;
  shiftId: string | null;
  userName: string | null;
  createdAt: string;
  updatedAt: string;
  tableId: string | null;
  tableName: string | null;
  guests: number | null;
  openedAt: string | null;
  closedAt: string | null;
  externalRef: string | null;
  idempotencyKey: string | null;
  lines: OrderLineDTO[];
}

export interface SettingsDTO {
  tablesServicePct: number;
  talabatMarkupPct: number;
  taxPct: number;
}

/** سطر داخل السلة في الواجهة (قبل الحفظ) */
export interface CartLineInput {
  lineId: string;
  itemId: string;
  name: string;
  /** سعر الصنف الأساسي (بدون الإضافات) */
  unitPrice: number;
  qty: number;
  modifiers: { id: string; name: string; price: number }[];
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** سعر السطر بعد الزيادة (بدون تقريب غير تنظيف الفلوت) */
export function priceLine(
  base: number,
  modifiersTotal: number,
  markupPct: number,
): { basePrice: number; unitPrice: number } {
  const basePrice = round2(base + modifiersTotal);
  const unitPrice = round2(basePrice * (1 + markupPct / 100));
  return { basePrice, unitPrice };
}
