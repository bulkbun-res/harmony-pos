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

  // 3.5. الأصناف المباعة اليوم بالتفصيل لمعرفة حركة اليوم
  const itemsSoldToday = await db
    .prepare(
      `SELECT name, SUM(qty) as qty 
       FROM sales_order_items i
       JOIN sales_orders o ON i.order_id = o.id
       WHERE o.status = 'paid' AND date(o.created_at) = ?
       GROUP BY name
       ORDER BY qty DESC`,
    )
    .bind(todayStr)
    .all<{ name: string; qty: number }>();

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
      itemsSold: (itemsSoldToday.results ?? []) as Array<{ name: string; qty: number }>,
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

export const getDetailedReportsFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      days: z.number().default(30),
    }),
  )
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();

    // 1. المنتجات الأكثر مبيعاً
    const topItemsResult = await db
      .prepare(
        `SELECT name, SUM(qty) as total_qty, SUM(qty * unit_price) as total_sales
         FROM sales_order_items i
         JOIN sales_orders o ON i.order_id = o.id
         WHERE o.status = 'paid' AND o.created_at >= date('now', ?)
         GROUP BY name
         ORDER BY total_qty DESC
         LIMIT 6`,
      )
      .bind(`-${data.days} days`)
      .all();

    // 2. توزيع المبيعات حسب الفئات
    const salesItemsResult = await db
      .prepare(
        `SELECT name, SUM(qty * unit_price) as total_sales
         FROM sales_order_items i
         JOIN sales_orders o ON i.order_id = o.id
         WHERE o.status = 'paid' AND o.created_at >= date('now', ?)
         GROUP BY name`,
      )
      .bind(`-${data.days} days`)
      .all();

    const categoryMap: Record<string, number> = {};
    const classifyItem = (name: string) => {
      if (name.includes("برجر") || name.includes("ميني") || name.includes("سندوتش")) return "سندوتشات";
      if (name.includes("مكرونة") || name.includes("باستا")) return "مكرونات";
      if (name.includes("عصير") || name.includes("كانز") || name.includes("مياه") || name.includes("مشروب")) return "مشروبات";
      if (name.includes("بطاطس") || name.includes("سلطة") || name.includes("ثومية")) return "أطباق جانبية";
      if (name.includes("شوكولاتة") || name.includes("كيك") || name.includes("وافل") || name.includes("حلو")) return "حلويات";
      return "أخرى";
    };

    const itemsList = (salesItemsResult.results ?? []) as Array<{ name: string; total_sales: number }>;
    for (const item of itemsList) {
      const cat = classifyItem(item.name);
      categoryMap[cat] = (categoryMap[cat] || 0) + item.total_sales;
    }

    const categorySales = Object.entries(categoryMap).map(([category, value]) => ({
      category,
      value,
    }));

    // 3. التقرير المالي الشامل
    const revenueResult = await db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) as total FROM sales_orders 
         WHERE status = 'paid' AND created_at >= date('now', ?)`
      )
      .bind(`-${data.days} days`)
      .first<{ total: number }>();

    const expensesResult = await db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM expenses 
         WHERE category != 'salaries' AND date >= date('now', ?)`
      )
      .bind(`-${data.days} days`)
      .first<{ total: number }>();

    const salariesResult = await db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM expenses 
         WHERE category = 'salaries' AND date >= date('now', ?)`
      )
      .bind(`-${data.days} days`)
      .first<{ total: number }>();

    const revenue = revenueResult?.total ?? 0;
    const cogs = revenue * 0.35; // 35% تكلفة المواد الخام
    const salaries = salariesResult?.total ?? 0;
    const operational = expensesResult?.total ?? 0;
    const netProfit = revenue - cogs - salaries - operational;

    // 4. تقرير الهالك
    const wasteResult = await db
      .prepare(
        `SELECT ingredient_id, SUM(ABS(qty)) as total_qty
         FROM inventory_logs
         WHERE reason = 'waste' AND created_at >= date('now', ?)
         GROUP BY ingredient_id
         ORDER BY total_qty DESC`
      )
      .bind(`-${data.days} days`)
      .all();

    const INGREDIENT_NAMES: Record<string, { name: string; unit: string }> = {
      "ing-bread": { name: "عيش سندوتش", unit: "قطعة" },
      "ing-chicken": { name: "صدور دجاج", unit: "جرام" },
      "ing-beef": { name: "لحم بيف", unit: "جرام" },
      "ing-tuna": { name: "تونة", unit: "جرام" },
      "ing-onion": { name: "بصل", unit: "جرام" },
      "ing-garlic": { name: "ثوم", unit: "جرام" },
      "ing-tomato": { name: "طماطم", unit: "جرام" },
      "ing-lettuce": { name: "خس", unit: "جرام" },
      "ing-cheese": { name: "جبنة", unit: "جرام" },
      "ing-sauce": { name: "صوص", unit: "مللي" },
      "ing-potato": { name: "بطاطس", unit: "جرام" },
    };

    const wasteLogs = (wasteResult.results ?? []) as Array<{ ingredient_id: string; total_qty: number }>;
    const wasteSummary = wasteLogs.map((log) => {
      const meta = INGREDIENT_NAMES[log.ingredient_id] || { name: log.ingredient_id, unit: "وحدة" };
      return {
        id: log.ingredient_id,
        name: meta.name,
        qty: log.total_qty,
        unit: meta.unit,
      };
    });

    return {
      topItems: (topItemsResult.results ?? []) as Array<{ name: string; total_qty: number; total_sales: number }>,
      categorySales,
      financialSummary: {
        revenue,
        cogs,
        salaries,
        operational,
        netProfit,
      },
      wasteSummary,
    };
  });

// ─── النسخ الاحتياطي والاستعادة ──────────────────────────────────────────────────
export const backupDatabaseFn = createServerFn({ method: "POST" }).handler(async () => {
  await assertAdmin();
  const db = await getD1();

  const tables = [
    "users",
    "employees",
    "attendance",
    "salary_transactions",
    "expenses",
    "sales_orders",
    "sales_order_items",
    "inventory_logs",
    "shifts",
    "menu_snapshot",
    "online_orders",
    "order_seq"
  ];

  const backup: Record<string, any[]> = {};
  for (const table of tables) {
    const res = await db.prepare(`SELECT * FROM ${table}`).all();
    backup[table] = res.results ?? [];
  }

  return backup;
});

export const restoreDatabaseFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.record(z.string(), z.array(z.any())).parse(d))
  .handler(async ({ data }) => {
    const adminUser = await getCurrentUser();
    if (!adminUser || adminUser.role !== "admin") {
      throw new Error("غير مصرح لك بالدخول");
    }
    const db = await getD1();

    const tablesDeleteOrder = [
      "sales_order_items",
      "sales_orders",
      "attendance",
      "salary_transactions",
      "shifts",
      "employees",
      "users",
      "expenses",
      "inventory_logs",
      "menu_snapshot",
      "online_orders",
      "order_seq"
    ];

    const tablesInsertOrder = [
      "users",
      "employees",
      "attendance",
      "salary_transactions",
      "shifts",
      "sales_orders",
      "sales_order_items",
      "expenses",
      "inventory_logs",
      "menu_snapshot",
      "online_orders",
      "order_seq"
    ];

    // Check if backup contains valid schema tables
    const receivedTables = Object.keys(data);
    const hasValidTable = receivedTables.some(t => tablesInsertOrder.includes(t));
    if (!hasValidTable) {
      throw new Error("ملف النسخة الاحتياطية غير صالح أو فارغ");
    }

    // Clear tables
    for (const table of tablesDeleteOrder) {
      await db.prepare(`DELETE FROM ${table}`).run();
    }

    // Insert rows in batch
    for (const table of tablesInsertOrder) {
      const rows = data[table];
      if (!rows || rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => "?").join(", ");
      const query = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;

      const stmt = db.prepare(query);
      for (const row of rows) {
        const values = columns.map(col => row[col]);
        await stmt.bind(...values).run();
      }
    }

    return { ok: true };
  });

export const wipeDatabaseFn = createServerFn({ method: "POST" }).handler(async () => {
  const adminUser = await getCurrentUser();
  if (!adminUser || adminUser.role !== "admin") {
    throw new Error("غير مصرح لك بالدخول");
  }
  const db = await getD1();

  const tablesToClear = [
    "sales_order_items",
    "sales_orders",
    "inventory_logs",
    "shifts",
    "attendance",
    "salary_transactions",
    "expenses",
    "employees",
    "online_orders"
  ];

  for (const table of tablesToClear) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }

  // Keep current logged-in admin user, delete others
  await db.prepare("DELETE FROM users WHERE id != ?").bind(adminUser.id).run();

  // Reset sequence
  await db.prepare("UPDATE order_seq SET next_no = 5001 WHERE id = 1").run();

  return { ok: true };
});

export const getRecentShiftsWithDetailsFn = createServerFn({ method: "GET" }).handler(async () => {
  await assertAdmin();
  const db = await getD1();

  // جلب الورديات لآخر يومين من تاريخ اللحظة الحالية
  const shiftsResult = await db
    .prepare(
      `SELECT * FROM shifts 
       WHERE opened_at >= datetime('now', '-2 days') 
       ORDER BY opened_at DESC`
    )
    .all();

  const shifts = (shiftsResult.results ?? []) as any[];
  const shiftsWithDetails = [];

  for (const s of shifts) {
    // 1. حساب مبيعات الوردية
    const salesRow = await db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) as total_sales 
         FROM sales_orders 
         WHERE status = 'paid' AND shift_id = ?`
      )
      .bind(s.id)
      .first<{ total_sales: number }>();

    const totalSales = salesRow?.total_sales ?? 0;
    const profit = totalSales * 0.65; // خصم 35% تكلفة مواد خام (الربح الصافي التقديري 65%)

    // 2. حساب تفاصيل السندوتشات والأصناف المباعة في هذه الوردية
    const itemsResult = await db
      .prepare(
        `SELECT name, SUM(qty) as qty 
         FROM sales_order_items i
         JOIN sales_orders o ON i.order_id = o.id
         WHERE o.status = 'paid' AND o.shift_id = ?
         GROUP BY name
         ORDER BY qty DESC`
      )
      .bind(s.id)
      .all<{ name: string; qty: number }>();

    shiftsWithDetails.push({
      id: s.id,
      userName: s.user_name,
      openedAt: s.opened_at,
      closedAt: s.closed_at,
      status: s.status,
      openingCash: s.opening_cash,
      expectedCash: s.expected_cash,
      actualCash: s.actual_cash,
      difference: s.difference,
      notes: s.notes,
      totalSales,
      profit,
      itemsSold: itemsResult.results ?? [],
    });
  }

  return shiftsWithDetails;
});
