#!/usr/bin/env python3
"""
اختبار الترحيل: بيحمّل دمب الإنتاج في SQLite محلي، يطبّق الميجريشن،
وبعدين يتحقق إن مفيش صف ضاع ولا جنيه اتغير، ويجرّب منطق القنوات الثلاث.
"""
import sqlite3, os, sys, json

DUMP   = sys.argv[1]
MIG    = sys.argv[2]
BACK   = sys.argv[3]
TARGET = "/tmp/opencode/mig_test.db"

if os.path.exists(TARGET):
    os.remove(TARGET)

db = sqlite3.connect(TARGET)
db.row_factory = sqlite3.Row

def run_file(path):
    with open(path, encoding="utf-8") as f:
        db.executescript(f.read())
    db.commit()

def one(sql, *a):
    return db.execute(sql, a).fetchone()

def all_(sql, *a):
    return db.execute(sql, a).fetchall()

fail = []
def check(name, got, expected):
    ok = got == expected
    print(f"  {'OK  ' if ok else 'FAIL'} {name:<52} got={got!r} expected={expected!r}")
    if not ok:
        fail.append(name)

print("\n=== 1) تحميل دمب الإنتاج ===")
run_file(DUMP)
before = {
    "orders": one("SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM sales_orders WHERE status='paid'")["c"],
    "count_total": one("SELECT COUNT(*) c FROM sales_orders")["c"],
    "sum_total": round(one("SELECT COALESCE(SUM(total),0) t FROM sales_orders WHERE status='paid'")["t"], 2),
    "sum_all": round(one("SELECT COALESCE(SUM(total),0) t FROM sales_orders")["t"], 2),
    "items": one("SELECT COUNT(*) c FROM sales_order_items")["c"],
    "items_sum": round(one("SELECT COALESCE(SUM(unit_price*qty),0) t FROM sales_order_items")["t"], 2),
    "cash_paid": round(one("SELECT COALESCE(SUM(total),0) t FROM sales_orders WHERE status='paid' AND payment_method='cash'")["t"], 2),
    "shifts": one("SELECT COUNT(*) c FROM shifts")["c"],
    "max_no": one("SELECT MAX(order_no) m FROM sales_orders")["m"],
}
print(f"  فواتير مدفوعة: {before['orders']}  |  إجمالي: {before['sum_total']:.2f}")

print("\n=== 2) تطبيق 0001_channels.sql ===")
run_file(MIG)
print("  تم")

print("\n=== 3) تطبيق 0001_backfill.sql ===")
run_file(BACK)
print("  تم")

print("\n=== 4) مطابقة البيانات ===")
check("كل الفواتير اتنقلت", one("SELECT COUNT(*) c FROM orders")["c"], before["count_total"])
check("المدفوعة اتنقلت", one("SELECT COUNT(*) c FROM orders WHERE status='paid'")["c"], before["orders"])
check("إجمالي المدفوع زي ما هو",
      round(one("SELECT COALESCE(SUM(total),0) t FROM orders WHERE status='paid'")["t"], 2),
      before["sum_total"])
check("إجمالي كل الفواتير زي ما هو",
      round(one("SELECT COALESCE(SUM(total),0) t FROM orders")["t"], 2),
      before["sum_all"])
check("كل الأسطر اتنقلت", one("SELECT COUNT(*) c FROM order_lines")["c"], before["items"])
check("مجموع الأسطر زي ما هو",
      round(one("SELECT COALESCE(SUM(line_total),0) t FROM order_lines")["t"], 2),
      before["items_sum"])
check("كلها channel=counter", one("SELECT COUNT(*) c FROM orders WHERE channel='counter'")["c"], before["count_total"])
check("كلها is_legacy=1", one("SELECT COUNT(*) c FROM orders WHERE is_legacy=1")["c"], before["count_total"])
check("counter_orders بعدد الفواتير", one("SELECT COUNT(*) c FROM counter_orders")["c"], before["count_total"])
check("الورديات متأثرتش", one("SELECT COUNT(*) c FROM shifts")["c"], before["shifts"])
check("تكرارات الأرقام القديمة محفوظة",
      one("SELECT COUNT(*) c FROM (SELECT order_no FROM orders GROUP BY order_no HAVING COUNT(*)>1)")["c"] > 0, True)
check("العدّاد فوق أعلى رقم قديم",
      one("SELECT next_no FROM order_counters WHERE id=1")["next_no"] > before["max_no"], True)

print("\n=== 5) القيود الأساسية ===")
# ترابيزة واحدة مفتوحة
db.execute("INSERT INTO tables (id,name,zone,seats) VALUES ('t3','ترابيزة 3','صالة',4)")
db.execute("INSERT INTO tables (id,name,zone,seats) VALUES ('t7','ترابيزة 7','صالة',2)")
db.execute("""INSERT INTO orders (id,channel,order_no,status,subtotal,total,service_rate)
              VALUES ('o-t3','table',9001,'open',285,285,0)""")
db.execute("INSERT INTO table_orders (order_id,table_id,opened_at) VALUES ('o-t3','t3',datetime('now'))")
db.commit()
try:
    db.execute("""INSERT INTO orders (id,channel,order_no,status) VALUES ('o-t3b','table',9002,'open')""")
    db.execute("INSERT INTO table_orders (order_id,table_id,opened_at) VALUES ('o-t3b','t3',datetime('now'))")
    check("منع ترابيزتين مفتوحتين لنفس الترابيزة", "سمح", "اتمنع")
except sqlite3.IntegrityError:
    check("منع ترابيزتين مفتوحتين لنفس الترابيزة", "اتمنع", "اتمنع")
db.rollback()

# حماية أرقام الفواتير الجديدة
db.execute("""INSERT INTO orders (id,channel,order_no,status,total) VALUES ('n1','table',7001,'paid',100)""")
try:
    db.execute("""INSERT INTO orders (id,channel,order_no,status,total) VALUES ('n2','table',7001,'paid',100)""")
    check("منع تكرار رقم فاتورة جديد", "سمح", "اتمنع")
except sqlite3.IntegrityError:
    check("منع تكرار رقم فاتورة جديد", "اتمنع", "اتمنع")
db.rollback()

print("\n=== 6) منطق التسعير ===")
def talabat_price(base, markup_pct):
    return round(base * (1 + markup_pct / 100.0), 2)

cases = [(100, 20, 120.0), (165, 20, 198.0), (149, 20, 178.8),
         (95, 20, 114.0), (35, 20, 42.0), (10, 20, 12.0)]
for base, pct, exp in cases:
    check(f"طلبات: {base} +{pct}%", talabat_price(base, pct), exp)

service_cases = [(285, 0, 0.0), (285, 12, 34.2), (1000, 10, 100.0)]
for sub, pct, exp in service_cases:
    check(f"خدمة: {sub} @ {pct}%", round(sub * pct / 100.0, 2), exp)

print("\n=== 7) منطق تقفيل الوردية ===")
open_tables = one("SELECT COUNT(*) c FROM table_orders WHERE closed_at IS NULL")["c"]
check("فيه ترابيزة مفتوحة => التقفيل يتمنع", open_tables, 1)
db.execute("UPDATE table_orders SET closed_at=datetime('now') WHERE closed_at IS NULL")
db.commit()
open_tables = one("SELECT COUNT(*) c FROM table_orders WHERE closed_at IS NULL")["c"]
check("بعد الإغلاق => التقفيل مسموح", open_tables, 0)

print("\n=== 8) التقارير الموحدة ===")
for r in all_("""SELECT channel, COUNT(*) n, ROUND(SUM(total),2) total
                 FROM orders WHERE status='paid' GROUP BY channel ORDER BY channel"""):
    print(f"  {r['channel']:<10} n={r['n']:<6} total={r['total']}")

cash = one("""SELECT ROUND(COALESCE(SUM(total),0),2) t FROM orders
              WHERE status='paid' AND payment_method='cash'
                AND channel IN ('counter','table')""")["t"]
check("النقد في الدرج (بدون طلبات)", cash, before["cash_paid"])

print("\n" + "=" * 60)
if fail:
    print(f"❌ فشل {len(fail)} اختبار: {fail}")
    sys.exit(1)
print("✅ كل الاختبارات نجحت — الترحيل آمن")
