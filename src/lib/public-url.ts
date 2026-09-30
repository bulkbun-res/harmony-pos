/**
 * رابط ديناميكي للمنيو العام — يكتشف نطاق الموقع الحالي تلقائيًا
 * لضمان عدم توجيه العملاء إلى خادم Lovable القديم والمعزول عن قاعدة بياناتك.
 */
export const PUBLIC_SITE_URL = typeof window !== "undefined"
  ? window.location.origin
  : "https://bulkbun.bulkbun-res.workers.dev"; // النطاق الحي لـ Bulk Bun

export const PUBLIC_MENU_URL = `${PUBLIC_SITE_URL}/menu`;

