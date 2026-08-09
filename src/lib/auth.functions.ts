import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentUser, loginUser, logoutUser, hashPassword } from "./auth.server";
import { getD1 } from "@/integrations/d1/client.server";

export const loginFn = createServerFn({ method: "POST" })
  .validator(z.object({ username: z.string(), password: z.string() }))
  .handler(async ({ data }) => {
    const user = await loginUser(data.username, data.password);
    if (!user) throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
    return user;
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  await logoutUser();
  return { ok: true };
});

export const getSessionUserFn = createServerFn({ method: "GET" }).handler(async () => {
  return await getCurrentUser();
});

// دالة التحقق من أن المستخدم الحالي هو مدير
async function assertAdmin() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "admin") {
    throw new Error("غير مصرح لك بالدخول لهذه الصفحة");
  }
}

export const createUserFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      username: z.string().min(3, "اسم المستخدم يجب ألا يقل عن 3 أحرف"),
      password: z.string().min(6, "كلمة المرور يجب ألا تقل عن 6 أحرف"),
      role: z.enum(["admin", "cashier"]),
      name: z.string().min(2, "الاسم يجب ألا يقل عن حرفين"),
    }),
  )
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();
    const hash = await hashPassword(data.password, data.username);

    try {
      await db
        .prepare(
          "INSERT INTO users (id, username, password_hash, role, name) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(crypto.randomUUID(), data.username.toLowerCase(), hash, data.role, data.name)
        .run();
      return { ok: true };
    } catch (e: unknown) {
      const err = e as Error;
      if (err.message && err.message.includes("UNIQUE")) {
        throw new Error("اسم المستخدم هذا مسجل بالفعل");
      }
      throw new Error("فشل إنشاء الحساب: " + err.message);
    }
  });

export const listUsersFn = createServerFn({ method: "GET" }).handler(async () => {
  await assertAdmin();
  const db = await getD1();
  const res = await db
    .prepare(
      "SELECT id, username, role, name, active, created_at FROM users ORDER BY created_at DESC",
    )
    .all();
  return (res.results ?? []) as Array<{
    id: string;
    username: string;
    role: "admin" | "cashier";
    name: string;
    active: number;
    created_at: string;
  }>;
});

export const toggleUserFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), active: z.boolean() }))
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();
    await db
      .prepare("UPDATE users SET active = ? WHERE id = ?")
      .bind(data.active ? 1 : 0, data.id)
      .run();
    return { ok: true };
  });

export const deleteUserFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();
    
    const user = await db
      .prepare("SELECT username FROM users WHERE id = ?")
      .bind(data.id)
      .first<{ username: string }>();
      
    if (user?.username === "admin") {
      throw new Error("لا يمكن حذف حساب المدير الرئيسي");
    }
    
    // التحقق من وجود ورديات مرتبطة لمنع أخطاء القيود الصلبة وقاعدة البيانات
    const hasShifts = await db
      .prepare("SELECT id FROM shifts WHERE user_id = ? LIMIT 1")
      .bind(data.id)
      .first();
    if (hasShifts) {
      throw new Error("لا يمكن حذف هذا المستخدم لوجود سجل ورديات أو تقارير مبيعات مرتبطة به. يرجى تجميد (إلغاء تفعيل) الحساب بدلاً من الحذف.");
    }
    
    try {
      await db.prepare("DELETE FROM users WHERE id = ?").bind(data.id).run();
    } catch (e: any) {
      if (e?.message?.includes("FOREIGN KEY") || e?.message?.includes("constraint")) {
        throw new Error("لا يمكن حذف هذا المستخدم لوجود عمليات تاريخية مسجلة باسمه في قاعدة البيانات. يمكنك تجميد الحساب بدلاً من ذلك.");
      }
      throw e;
    }
    return { ok: true };
  });

export const updateUserPasswordFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string(),
      password: z.string().min(6, "كلمة المرور يجب ألا تقل عن 6 أحرف"),
    }),
  )
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();
    
    const user = await db
      .prepare("SELECT username FROM users WHERE id = ?")
      .bind(data.id)
      .first<{ username: string }>();
      
    if (!user) throw new Error("المستخدم غير موجود");
    
    const hash = await hashPassword(data.password, user.username);
    await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hash, data.id).run();
    return { ok: true };
  });

export const deleteUserShiftsFn = createServerFn({ method: "POST" })
  .validator(z.object({ userId: z.string() }))
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();
    await db.prepare("DELETE FROM shifts WHERE user_id = ?").bind(data.userId).run();
    return { ok: true };
  });
