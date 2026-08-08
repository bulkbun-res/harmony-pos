import { getD1 } from "@/integrations/d1/client.server";
import { getCookie, setCookie, deleteCookie, getRequest } from "@tanstack/react-start/server";

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: "admin" | "cashier";
  name: string;
}

const SESSION_COOKIE_NAME = "bulkbun_session";

/** يولّد كلمة مرور مشفرة باستخدام خوارزمية SHA-256 */
export async function hashPassword(password: string, username: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = "bulkbunsalt_" + username.toLowerCase();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** يجلب المستخدم الحالي المسجل دخوله بناءً على الكوكي */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  let token = getCookie(SESSION_COOKIE_NAME);
  
  // Fallback: parse from headers manually if getCookie fails (common in server POST functions)
  if (!token) {
    try {
      const request = getRequest();
      const cookieHeader = request?.headers?.get("cookie");
      if (cookieHeader) {
        const match = cookieHeader.match(new RegExp('(^|;\\s*)' + SESSION_COOKIE_NAME + '=([^;]*)'));
        if (match && match[2]) {
          token = decodeURIComponent(match[2]);
        }
      }
    } catch (e) {
      console.error("Error parsing cookie manually in getCurrentUser:", e);
    }
  }

  if (!token) return null;

  try {
    const db = await getD1();
    const user = await db
      .prepare(
        `SELECT id, username, role, name, active FROM users WHERE session_token = ? AND active = 1`,
      )
      .bind(token)
      .first<{
        id: string;
        username: string;
        role: "admin" | "cashier";
        name: string;
        active: number;
      }>();

    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
    };
  } catch (error) {
    console.error("Error verifying session:", error);
    return null;
  }
}

/** يقوم بمصادقة حساب المستخدم وإنشاء جلسة جديدة له */
export async function loginUser(
  username: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const db = await getD1();
  const lowerUsername = username.trim().toLowerCase();

  // التحقق من وجود حسابات أولاً
  const countRes = await db
    .prepare("SELECT COUNT(*) as count FROM users")
    .first<{ count: number }>();

  // إذا كانت قاعدة البيانات فارغة تماماً، نقوم بإنشاء حساب مدير افتراضي تلقائياً للتجربة الأولى
  if (countRes && countRes.count === 0) {
    const defaultAdminHash = await hashPassword("admin123", "admin");
    await db
      .prepare(
        "INSERT INTO users (id, username, password_hash, role, name) VALUES (?, 'admin', ?, 'admin', 'المدير العام')",
      )
      .bind(crypto.randomUUID(), defaultAdminHash)
      .run();
  }

  const user = await db
    .prepare("SELECT * FROM users WHERE LOWER(username) = ? AND active = 1")
    .bind(lowerUsername)
    .first<Record<string, unknown>>();

  if (!user) return null;

  const inputHash = await hashPassword(password, user.username as string);
  if (inputHash !== user.password_hash) return null;

  // إنشاء رمز جلسة فريد
  const sessionToken = crypto.randomUUID();

  // تحديث الجلسة في قاعدة البيانات
  await db
    .prepare("UPDATE users SET session_token = ? WHERE id = ?")
    .bind(sessionToken, user.id as string)
    .run();

  // تعيين الكوكي (لمدة 7 أيام)
  setCookie(SESSION_COOKIE_NAME, sessionToken, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "lax",
  });

  return {
    id: user.id as string,
    username: user.username as string,
    role: user.role as "admin" | "cashier",
    name: user.name as string,
  };
}

/** تسجيل الخروج وحذف الكوكي وإنهاء الجلسة */
export async function logoutUser(): Promise<void> {
  let token = getCookie(SESSION_COOKIE_NAME);
  if (!token) {
    try {
      const request = getRequest();
      const cookieHeader = request?.headers?.get("cookie");
      if (cookieHeader) {
        const match = cookieHeader.match(new RegExp('(^|;\\s*)' + SESSION_COOKIE_NAME + '=([^;]*)'));
        if (match && match[2]) {
          token = decodeURIComponent(match[2]);
        }
      }
    } catch (e) {
      console.error("Error parsing cookie manually in logoutUser:", e);
    }
  }

  if (token) {
    try {
      const db = await getD1();
      await db
        .prepare("UPDATE users SET session_token = NULL WHERE session_token = ?")
        .bind(token)
        .run();
    } catch (e) {
      console.error(e);
    }
  }
  deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
}
