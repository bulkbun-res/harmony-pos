/**
 * أدوات التاريخ حسب توقيت المحل (Africa/Cairo).
 *
 * ليه؟ لإن `date(created_at)` في SQLite بيرجع تاريخ UTC، والمحل بيقفل
 * بعد منتصف الليل — فكانت فواتير 12 ص إلى 2 ص بتتحسب على اليوم اللي فات.
 * الحل: عمود business_date بيتحسب بالتوقيت المحلي وقت إنشاء الفاتورة.
 */

const FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** تاريخ اليوم بتوقيت القاهرة بصيغة YYYY-MM-DD */
export function cairoDateStr(d: Date = new Date()): string {
  return FMT.format(d);
}

/** بداية يوم القاهرة كـ UTC ISO — للفلترة على created_at لو احتجت */
export function cairoDayStartUtc(dateStr: string): string {
  // القاهرة UTC+2 شتاءً و+3 صيفًا. نجرّب +3 ولو الناتج مش مطابق نرجع +2.
  for (const off of [3, 2]) {
    const d = new Date(`${dateStr}T00:00:00${off >= 0 ? "+" : "-"}0${off}:00`);
    if (cairoDateStr(d) === dateStr) return d.toISOString();
  }
  return `${dateStr}T00:00:00.000Z`;
}
