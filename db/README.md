# منظومة القنوات الثلاث — تصميم قاعدة البيانات

## الفكرة في سطر
**جدول فلوس واحد (`orders`) + جدول تفاصيل لكل قناة.** كل الفواتير بتصب في مكان
واحد فالتقارير وتقفيل الوردية بيقروا من استعلام واحد، وكل قناة ليها حقولها الخاصة
في جدولها.

## القنوات
| channel | الجدول | الملاحظات |
|---|---|---|
| `counter` | `counter_orders` | تيك أواي / كاشير |
| `table` | `table_orders` + `tables` | فاتورة تفتح وتتقفل، خدمة % |
| `talabat` | `talabat_orders` | زيادة 20% مدفونة في سعر السطر |

## قواعد التسعير
```
زيادة طلبات :  unit_price = round2(base_price × (1 + talabat_markup_pct/100))
خدمة الترابيزة: service = round2((subtotal − discount) × service_rate/100)
ضريبة        : tax     = round2((subtotal − discount + service) × tax_rate/100)
الإجمالي     : total   = subtotal − discount + service + tax
```

- **مفيش تقريب** غير تنظيف الفلوت لمنزلتين عشريتين.
- الزيادة بتتطبق على **كل سطر** (صنف + إضافة)، بتُحسب وقت الإضافة مش على الإجمالي.
- الخدمة على الترابيزات بس — قيمتها الحالية `0%` وبتتغير من `settings`.
- النسبة بتتُحفظ Snapshot على الفاتورة، فتغيير الإعدادات مابيأثرش على فواتير قديمة.

## تقفيل الوردية
```
نقد متوقع = افتتاحي + Σ(total) WHERE payment_method='cash' AND channel IN ('counter','table')
مستحق طلبات = Σ(total) × (1 − commission) WHERE channel='talabat' AND settlement_id IS NULL
```
**ممنوع تقفيل الوردية لو فيه أي صف في `table_orders` فيه `closed_at IS NULL`.**

## أرقام الفواتير
عدّاد ذري في `order_counters`:
```sql
UPDATE order_counters SET next_no = next_no + 1 WHERE id = 1 RETURNING next_no - 1 AS allocated;
```
الفواتير القديمة (`is_legacy=1`) بتتكسر عليها قيود الفريد لأن عندها 259 تكرار تاريخي.
القيد `orders_no_new_uq` شغال على الجديد بس.

## الملفات
| ملف | وظيفته |
|---|---|
| `migrations/0001_channels.sql` | الجداول والإعدادات والفيو |
| `migrations/0001_backfill.sql` | ترحيل `sales_orders` → `orders` |
| `migrations/0001_seed_tables.sql` | ترابيزات أولية (عدّلها قبل التشغيل) |
| `verify_migration.py` | اختبار كامل على دمب حقيقي |

## التشغيل
```bash
export CLOUDFLARE_API_TOKEN=<من SECRETS-bulkbun.txt>
export CLOUDFLARE_ACCOUNT_ID=6500f52866c461377c9add33f958418c

npx wrangler d1 execute bulkbun-staging-db --remote --file=db/migrations/0001_channels.sql
npx wrangler d1 execute bulkbun-staging-db --remote --file=db/migrations/0001_backfill.sql
npx wrangler d1 execute bulkbun-staging-db --remote --file=db/migrations/0001_seed_tables.sql
```

## اختبار محلي على دمب الإنتاج
```bash
python3 db/verify_migration.py \
  <backup>/d1/production/full-dump.sql \
  db/migrations/0001_channels.sql \
  db/migrations/0001_backfill.sql
```

## ⚠️ على الإنتاج
الميجريشن **إضافي بالكامل** — مابيمسحش `sales_orders` ولا بيغيّرها. بس **متشغّلهوش
على الإنتاج لوحده**: الكود الحالي لسه بيكتب في `sales_orders`، فالجدول الجديد هيفضل
ناقص كل فاتورة جديدة. شغّله في نفس لحظة نشر الكود الجديد (المرحلة 2).
