import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getD1 } from "@/integrations/d1/client.server";
import { getCurrentUser } from "./auth.server";

// دالة التحقق من أن المستخدم الحالي هو مدير
async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    throw new Error("غير مصرح لك بالدخول");
  }
}

// ─── الإحصائيات والتقارير المالية ──────────────────────────────────────────────
export const getAdminMetricsFn = createServerFn({ method: "GET" }).handler(async () => {
  await assertAdmin();
  const db = await getD1();

  const todayStr = new Date().toISOString().split("T")[0]!;

  // 1. المبيعات اليومية
  const salesToday = await db
    .prepare(
      "SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count FROM sales_orders WHERE status = 'paid' AND date(created_at) = ?",
    )
    .bind(todayStr)
    .first<{ total: number; count: number }>();

  // 2. المصاريف اليومية
  const expensesToday = await db
    .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date(date) = ?")
    .bind(todayStr)
    .first<{ total: number }>();

  // 3. الهالك اليومي (عدد الحركات)
  const wasteToday = await db
    .prepare(
      "SELECT COUNT(*) as count FROM inventory_logs WHERE reason = 'waste' AND date(created_at) = ?",
    )
    .bind(todayStr)
    .first<{ count: number }>();

  // 4. المبيعات حسب طريقة الدفع
  const paymentMethods = await db
    .prepare(
      "SELECT payment_method, SUM(total) as value FROM sales_orders WHERE status = 'paid' GROUP BY payment_method",
    )
    .all();

  // 5. منحنى المبيعات لآخر 30 يوم
  const salesTrend = await db
    .prepare(
      `SELECT date(created_at) as date, SUM(total) as sales, SUM(subtotal * 0.4) as cost
       FROM sales_orders 
       WHERE status = 'paid' AND created_at >= date('now', '-30 days')
       GROUP BY date(created_at)
       ORDER BY date(created_at) ASC`,
    )
    .all();

  // 6. أوقات الذروة (حسب الساعة لآخر 7 أيام)
  const peakHours = await db
    .prepare(
      `SELECT strftime('%H:00', created_at) as hour, SUM(total) as value
       FROM sales_orders
       WHERE status = 'paid' AND created_at >= date('now', '-7 days')
       GROUP BY strftime('%H', created_at)
       ORDER BY strftime('%H', created_at) ASC`,
    )
    .all();

  return {
    today: {
      sales: salesToday?.total ?? 0,
      ordersCount: salesToday?.count ?? 0,
      expenses: expensesToday?.total ?? 0,
      wasteCount: wasteToday?.count ?? 0,
      netProfit:
        (salesToday?.total ?? 0) - (expensesToday?.total ?? 0) - (salesToday?.total ?? 0) * 0.35, // 35% estimated food cost
    },
    paymentMethods: (paymentMethods.results ?? []) as Array<{
      payment_method: string;
      value: number;
    }>,
    salesTrend: (salesTrend.results ?? []) as Array<{ date: string; sales: number; cost: number }>,
    peakHours: (peakHours.results ?? []) as Array<{ hour: string; value: number }>,
  };
});

// ─── إدارة الموظفين ────────────────────────────────────────────────────────
export const listEmployeesFn = createServerFn({ method: "GET" }).handler(async () => {
  await assertAdmin();
  const db = await getD1();
  const res = await db.prepare("SELECT * FROM employees ORDER BY created_at DESC").all();
  return (res.results ?? []) as Array<{
    id: string;
    name: string;
    role: string;
    salary_type: "monthly" | "daily" | "hourly";
    base_salary: number;
    active: number;
    created_at: string;
  }>;
});

export const createEmployeeFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().min(2, "الاسم يجب ألا يقل عن حرفين"),
      role: z.string().min(2, "المسمى الوظيفي مطلوب"),
      salaryType: z.enum(["monthly", "daily", "hourly"]),
      baseSalary: z.number().min(0, "الراتب يجب أن يكون موجباً"),
    }),
  )
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();
    await db
      .prepare(
        "INSERT INTO employees (id, name, role, salary_type, base_salary) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), data.name, data.role, data.salaryType, data.baseSalary)
      .run();
    return { ok: true };
  });

export const deleteEmployeeFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();
    await db.prepare("DELETE FROM employees WHERE id = ?").bind(data.id).run();
    return { ok: true };
  });

// ─── الحضور والانصراف ───────────────────────────────────────────────────────
export const logAttendanceFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      employeeId: z.string(),
      date: z.string(), // YYYY-MM-DD
      status: z.enum(["present", "absent", "excused"]),
      hours: z.number().default(0),
    }),
  )
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();
    await db
      .prepare(
        `INSERT INTO attendance (id, employee_id, date, status, hours)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(employee_id, date) DO UPDATE SET status = excluded.status, hours = excluded.hours`,
      )
      .bind(crypto.randomUUID(), data.employeeId, data.date, data.status, data.hours)
      .run();
    return { ok: true };
  });

export const getAttendanceFn = createServerFn({ method: "GET" })
  .validator(z.object({ date: z.string() })) // YYYY-MM-DD
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();
    const res = await db.prepare("SELECT * FROM attendance WHERE date = ?").bind(data.date).all();
    return (res.results ?? []) as Array<{
      id: string;
      employee_id: string;
      date: string;
      status: "present" | "absent" | "excused";
      hours: number;
    }>;
  });

// ─── سلفيات ورواتب الموظفين ──────────────────────────────────────────────────
export const logSalaryTransactionFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      employeeId: z.string(),
      amount: z.number().min(1, "المبلغ يجب أن يكون أكبر من الصفر"),
      type: z.enum(["advance", "bonus", "deduction", "payout"]),
      notes: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();
    const id = crypto.randomUUID();

    // 1. تسجيل الحركة المالية للرواتب
    await db
      .prepare(
        "INSERT INTO salary_transactions (id, employee_id, amount, type, notes) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(id, data.employeeId, data.amount, data.type, data.notes ?? null)
      .run();

    // 2. إذا كانت دفعة راتب أو سلفة أو مكافأة، تضاف تلقائياً للمصاريف العامة للتشغيل
    if (data.type === "payout" || data.type === "advance" || data.type === "bonus") {
      const emp = await db
        .prepare("SELECT name FROM employees WHERE id = ?")
        .bind(data.employeeId)
        .first<{ name: string }>();

      const label =
        data.type === "payout" ? "صرف مرتب" : data.type === "advance" ? "سلفة عامل" : "مكافأة عامل";
      await db
        .prepare(
          "INSERT INTO expenses (id, category, amount, description) VALUES (?, 'salaries', ?, ?)",
        )
        .bind(
          crypto.randomUUID(),
          data.amount,
          `${label} — ${emp?.name || ""} ${data.notes ? `(${data.notes})` : ""}`,
        )
        .run();
    }

    return { ok: true };
  });

export const getSalaryTransactionsFn = createServerFn({ method: "GET" }).handler(async () => {
  await assertAdmin();
  const db = await getD1();
  const res = await db
    .prepare(
      `SELECT t.*, e.name as employee_name 
       FROM salary_transactions t
       JOIN employees e ON t.employee_id = e.id
       ORDER BY t.date DESC`,
    )
    .all();
  return (res.results ?? []) as Array<{
    id: string;
    employee_id: string;
    employee_name: string;
    amount: number;
    type: "advance" | "bonus" | "deduction" | "payout";
    date: string;
    notes: string | null;
  }>;
});

// ─── إدارة المصاريف النثرية ──────────────────────────────────────────────────
export const listExpensesFn = createServerFn({ method: "GET" }).handler(async () => {
  await assertAdmin();
  const db = await getD1();
  const res = await db.prepare("SELECT * FROM expenses ORDER BY date DESC LIMIT 500").all();
  return (res.results ?? []) as Array<{
    id: string;
    category:
      "rent" | "utilities" | "raw_materials" | "marketing" | "maintenance" | "salaries" | "misc";
    amount: number;
    description: string | null;
    date: string;
  }>;
});

export const createExpenseFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      category: z.enum([
        "rent",
        "utilities",
        "raw_materials",
        "marketing",
        "maintenance",
        "salaries",
        "misc",
      ]),
      amount: z.number().min(1, "المبلغ يجب أن يكون أكبر من الصفر"),
      description: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();
    await db
      .prepare("INSERT INTO expenses (id, category, amount, description) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), data.category, data.amount, data.description ?? null)
      .run();
    return { ok: true };
  });

export const deleteExpenseFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();
    await db.prepare("DELETE FROM expenses WHERE id = ?").bind(data.id).run();
    return { ok: true };
  });
