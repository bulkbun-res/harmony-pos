/**
 * رابط ديناميكي للمنيو العام — يكتشف نطاق الموقع الحالي تلقائيًا
 * لضمان عدم توجيه العملاء إلى خادم Lovable القديم والمعزول عن قاعدة بياناتك.
 */
export const PUBLIC_SITE_URL = typeof window !== "undefined"
  ? window.location.origin
  : "https://vibe-cashier-pos.lovable.app"; // افتراضي أثناء الـ SSR فقط

export const PUBLIC_MENU_URL = `${PUBLIC_SITE_URL}/menu`;

