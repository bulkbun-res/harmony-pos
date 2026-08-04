import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentUser } from "./auth.server";
import { getD1 } from "@/integrations/d1/client.server";

export const openShiftFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      openingCash: z.number().min(0, "المبلغ الافتتاحي لا يمكن أن يكون سالباً"),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    if (!user) throw new Error("يجب تسجيل الدخول أولاً");
    const db = await getD1();

    // التحقق من وجود وردية مفتوحة بالفعل
    const active = await db
      .prepare("SELECT id FROM shifts WHERE user_id = ? AND status = 'open'")
      .bind(user.id)
      .first();
    if (active) throw new Error("لديك وردية مفتوحة بالفعل");

    const shiftId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO shifts (id, user_id, user_name, opened_at, opening_cash, expected_cash, status)
         VALUES (?, ?, ?, ?, ?, ?, 'open')`,
      )
      .bind(shiftId, user.id, user.name, now, data.openingCash, data.openingCash)
      .run();

    // تسجيل الحضور التلقائي في حال مطابقة اسم الموظف
    try {
      const emp = await db
        .prepare("SELECT id FROM employees WHERE name = ? AND active = 1")
        .bind(user.name)
        .first<{ id: string }>();
      if (emp) {
        const today = now.split("T")[0]!;
        await db
          .prepare(
            "INSERT OR IGNORE INTO attendance (id, employee_id, date, status) VALUES (?, ?, ?, 'present')",
          )
          .bind(crypto.randomUUID(), emp.id, today)
          .run();
      }
    } catch (e) {
      console.error("Attendance logging failed:", e);
    }

    return { shiftId };
  });

export const closeShiftFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      actualCash: z.number().min(0, "المبلغ الفعلي لا يمكن أن يكون سالباً"),
      notes: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    if (!user) throw new Error("يجب تسجيل الدخول أولاً");
    const db = await getD1();

    const activeShift = await db
      .prepare("SELECT * FROM shifts WHERE user_id = ? AND status = 'open'")
      .bind(user.id)
      .first<{ id: string; opened_at: string; opening_cash: number }>();
      
    if (!activeShift) throw new Error("لا توجد وردية مفتوحة حالياً");

    // حساب مبيعات الكاش للفاتورة النشطة بالوردية
    const cashSales = await db
      .prepare(
        "SELECT COALESCE(SUM(total), 0) as total FROM sales_orders WHERE shift_id = ? AND payment_method = 'cash' AND status = 'paid'",
      )
      .bind(activeShift.id)
      .first<{ total: number }>();

    const totalCashSales = cashSales?.total ?? 0;
    const expectedCash = activeShift.opening_cash + totalCashSales;
    const difference = data.actualCash - expectedCash;
    const now = new Date().toISOString();

    await db
      .prepare(
        `UPDATE shifts 
         SET closed_at = ?, expected_cash = ?, actual_cash = ?, difference = ?, status = 'closed', notes = ?
         WHERE id = ?`,
      )
      .bind(now, expectedCash, data.actualCash, difference, data.notes ?? "", activeShift.id)
      .run();

    // تسجيل الانصراف وحساب الساعات
    try {
      const emp = await db
        .prepare("SELECT id FROM employees WHERE name = ? AND active = 1")
        .bind(user.name)
        .first<{ id: string }>();
      if (emp) {
        const today = now.split("T")[0]!;
        const start = new Date(activeShift.opened_at);
        const end = new Date(now);
        const hours = Math.max(0.1, Number(((end.getTime() - start.getTime()) / (1000 * 60 * 60)).toFixed(2)));
        await db
          .prepare("UPDATE attendance SET hours = ? WHERE employee_id = ? AND date = ?")
          .bind(hours, emp.id, today)
          .run();
      }
    } catch (e) {
      console.error("Attendance checkout logging failed:", e);
    }

    return { ok: true, difference };
  });

export const getCurrentShiftFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = await getD1();
  const activeShift = await db
    .prepare("SELECT * FROM shifts WHERE user_id = ? AND status = 'open'")
    .bind(user.id)
    .first();
  return activeShift || null;
});

export const listShiftsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("غير مصرح بالدخول");
  const db = await getD1();
  const res = await db.prepare("SELECT * FROM shifts ORDER BY opened_at DESC LIMIT 100").all();
  return (res.results ?? []) as any[];
});

export const deleteShiftFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") throw new Error("غير مصرح بالدخول");
    const db = await getD1();
    await db.prepare("DELETE FROM shifts WHERE id = ?").bind(data.id).run();
    return { ok: true };
  });
