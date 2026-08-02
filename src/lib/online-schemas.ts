import { z } from "zod";

export const lineSchema = z.object({
  itemId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  unitPrice: z.number().min(0).max(100000),
  qty: z.number().int().min(1).max(99),
});

export type OnlineLine = z.infer<typeof lineSchema>;

export const menuItemSchema = z.object({
  id: z.string().max(64),
  groupId: z.string().max(64),
  name: z.string().max(120),
  price: z.number().min(0).max(100000),
  available: z.boolean(),
  color: z.string().max(24),
  order: z.number(),
  image: z.string().max(2000).optional(),
  desc: z.string().max(400).optional(),
  ingredients: z.array(z.string().max(80)).max(40).optional(),
});

export const menuSchema = z.object({
  groups: z
    .array(
      z.object({
        id: z.string().max(64),
        name: z.string().max(80),
        color: z.string().max(24),
        order: z.number(),
      }),
    )
    .max(60),
  items: z.array(menuItemSchema).max(500),
});

export type PublicMenu = z.infer<typeof menuSchema>;
export type PublicMenuItem = z.infer<typeof menuItemSchema>;

export const statusSchema = z.enum([
  "new",
  "awaiting_customer",
  "approved",
  "preparing",
  "ready",
  "rejected",
]);

export type OnlineStatus = z.infer<typeof statusSchema>;

export const ONLINE_STATUS_LABEL: Record<OnlineStatus, string> = {
  new: "طلب جديد",
  awaiting_customer: "بانتظار موافقة العميل",
  approved: "العميل وافق على التعديل",
  preparing: "جاري التجهيز",
  ready: "جاهز للاستلام",
  rejected: "ملغي",
};

const CONTACT_MSG = "من فضلك اكتب اسمك ورقم تليفونك لتأكيد الطلب";

export const placeOrderSchema = z.object({
  name: z.string().trim().min(2, CONTACT_MSG).max(60, "الاسم طويل جدًا"),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s-]{8,20}$/, CONTACT_MSG),
  lines: z.array(lineSchema).min(1, "اختر صنف واحد على الأقل").max(40),
});

export const orderKeySchema = z.object({
  id: z.string().uuid(),
  token: z.string().uuid(),
});

export const respondSchema = orderKeySchema.extend({ accept: z.boolean() });

export const proposeSchema = z.object({
  id: z.string().uuid(),
  lines: z.array(lineSchema).min(1).max(40),
  note: z.string().trim().max(300).optional(),
});

export const paymentMethodSchema = z.enum(["cash", "vodafone", "instapay", "visa"]);
export type OnlinePaymentMethod = z.infer<typeof paymentMethodSchema>;

export const ONLINE_PAYMENT_LABEL: Record<OnlinePaymentMethod, string> = {
  cash: "كاش",
  vodafone: "فودافون كاش",
  instapay: "انستا باي",
  visa: "فيزا / كارت",
};

export const markPaidSchema = z.object({
  id: z.string().uuid(),
  method: paymentMethodSchema,
  amount: z.number().min(0).max(1000000),
});

export const setStatusSchema = z.object({
  id: z.string().uuid(),
  status: statusSchema,
  applyProposed: z.boolean().optional(),
});

export interface OnlineOrderRow {
  id: string;
  order_no: number;
  customer_name: string;
  customer_phone: string;
  items: OnlineLine[];
  total: number;
  status: OnlineStatus;
  proposed_items: OnlineLine[] | null;
  proposed_total: number | null;
  proposed_note: string | null;
  proposed_at: string | null;
  payment_method: OnlinePaymentMethod | null;
  paid_amount: number | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerOrderView {
  id: string;
  orderNo: number;
  status: OnlineStatus;
  items: OnlineLine[];
  total: number;
  proposedItems: OnlineLine[] | null;
  proposedTotal: number | null;
  proposedNote: string | null;
  proposedAt: string | null;
  paymentMethod: OnlinePaymentMethod | null;
  paidAmount: number | null;
  paidAt: string | null;
  createdAt: string;
}

export const sumLines = (lines: { unitPrice: number; qty: number }[]) =>
  Math.round(lines.reduce((s, l) => s + l.unitPrice * l.qty, 0) * 100) / 100;

export const toCustomerView = (row: Record<string, unknown>): CustomerOrderView => ({
  id: row["id"] as string,
  orderNo: row["order_no"] as number,
  status: row["status"] as OnlineStatus,
  items: (row["items"] ?? []) as OnlineLine[],
  total: Number(row["total"] ?? 0),
  proposedItems: (row["proposed_items"] ?? null) as OnlineLine[] | null,
  proposedTotal: row["proposed_total"] == null ? null : Number(row["proposed_total"]),
  proposedNote: (row["proposed_note"] ?? null) as string | null,
  proposedAt: (row["proposed_at"] ?? null) as string | null,
  paymentMethod: (row["payment_method"] ?? null) as OnlinePaymentMethod | null,
  paidAmount: row["paid_amount"] == null ? null : Number(row["paid_amount"]),
  paidAt: (row["paid_at"] ?? null) as string | null,
  createdAt: row["created_at"] as string,
});
