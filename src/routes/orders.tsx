import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Ban, Printer, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AuthGuard } from "@/components/AuthGuard";
import { PosHeader } from "@/components/pos/PosHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { printReceipt } from "@/lib/print-receipt";
import { usePos } from "@/lib/pos-store";

import { EGP, PAYMENT_METHODS, type Order } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "الفواتير السابقة | Bulk Bun POS" },
      {
        name: "description",
        content: "استرجاع الفواتير السابقة، الزيادة عليها، إعادة الطباعة أو إلغاؤها.",
      },
      { property: "og:title", content: "الفواتير السابقة | Bulk Bun POS" },
      {
        property: "og:description",
        content: "سجل فواتير Bulk Bun مع الاسترجاع والتعديل والإلغاء.",
      },
    ],
  }),
  component: () => (
    <AuthGuard>
      <OrdersScreen />
    </AuthGuard>
  ),
});

const fmtTime = (t: number) =>
  new Date(t).toLocaleString("ar-EG", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const isPaid = (o: Order) => o.payments.length > 0;
const isOnline = (o: Order) => o.id.startsWith("online-");

function OrdersScreen() {
  const { state, cancelOrder, deleteOrder, saveOrder } = usePos();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "paid" | "unpaid" | "cancelled">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const orders = useMemo(() => {
    const term = q.trim();
    return [...state.orders]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((o) =>
        filter === "all"
          ? true
          : filter === "cancelled"
            ? o.status === "cancelled"
            : filter === "paid"
              ? o.status !== "cancelled" && isPaid(o)
              : o.status !== "cancelled" && !isPaid(o),
      )
      .filter((o) =>
        term
          ? String(o.orderNo).includes(term) || o.lines.some((l) => l.name.includes(term))
          : true,
      );
  }, [state.orders, q, filter]);

  const selected: Order | null = orders.find((o) => o.id === selectedId) ?? orders[0] ?? null;

  const today = state.orders.filter(
    (o) =>
      o.status !== "cancelled" &&
      new Date(o.createdAt).toDateString() === new Date().toDateString(),
  );
  const todayTotal = today.filter(isPaid).reduce((s, o) => s + o.total, 0);
  const todayUnpaid = today.filter((o) => !isPaid(o)).reduce((s, o) => s + o.total, 0);

  const recordPayment = (o: Order, method: (typeof PAYMENT_METHODS)[number]["id"]) => {
    saveOrder({
      ...o,
      status: "paid",
      updatedAt: Date.now(),
      payments: [{ method, amount: o.total, at: Date.now() }],
    });
    toast.success(
      `تم تسجيل الدفع للفاتورة #${o.orderNo} — ${PAYMENT_METHODS.find((m) => m.id === method)?.label}`,
    );
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <PosHeader />

      <div className="flex min-h-0 flex-1 flex-row gap-3 p-3">
        {/* list */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث برقم الفاتورة أو الصنف…"
                className="h-10 w-[15rem] rounded-xl bg-card pe-9 text-sm"
              />
            </div>
            {(
              [
                ["all", "الكل"],
                ["paid", "مدفوعة"],
                ["unpaid", "غير مدفوعة"],
                ["cancelled", "ملغاة"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-bold transition-colors",
                  filter === id
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <div className="rounded-xl bg-primary/15 px-3 py-2 text-sm font-extrabold text-primary">
                مبيعات اليوم: {EGP(todayTotal)}
              </div>
              {todayUnpaid > 0 && (
                <div className="rounded-xl bg-destructive/15 px-3 py-2 text-sm font-extrabold text-destructive">
                  غير محصّل: {EGP(todayUnpaid)}
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pe-1">
            {orders.length === 0 && (
              <p className="py-20 text-center text-sm text-muted-foreground">
                لا توجد فواتير محفوظة بعد.
              </p>
            )}
            {orders.map((o) => (
              <button
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border-2 bg-card px-4 py-3 text-start transition-colors",
                  selected?.id === o.id
                    ? "border-primary"
                    : "border-border hover:border-primary/40",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold">
                    فاتورة #{o.orderNo}
                    {isOnline(o) && (
                      <span className="ms-2 rounded-md bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        أونلاين
                      </span>
                    )}
                    {o.status === "cancelled" && (
                      <span className="ms-2 rounded-md bg-destructive/20 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                        ملغاة
                      </span>
                    )}
                    {o.status !== "cancelled" && !isPaid(o) && (
                      <span className="ms-2 rounded-md bg-destructive/20 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                        غير مدفوعة
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {fmtTime(o.createdAt)} — {o.lines.length} صنف —{" "}
                    {isPaid(o)
                      ? o.payments
                          .map((p) => PAYMENT_METHODS.find((m) => m.id === p.method)?.label)
                          .join(" + ")
                      : "بانتظار التحصيل"}
                  </p>
                </div>

                <span
                  className={cn(
                    "shrink-0 text-base font-black",
                    o.status === "cancelled"
                      ? "text-muted-foreground line-through"
                      : "text-primary",
                  )}
                >
                  {EGP(o.total)}
                </span>
              </button>
            ))}
          </div>
        </main>

        {/* details */}
        <aside className="flex h-full min-h-0 w-[38%] min-w-[13rem] max-w-[26rem] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card lg:w-[24rem]">
          {!selected && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              اختر فاتورة لعرض تفاصيلها
            </p>
          )}
          {selected && (
            <>
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-extrabold">فاتورة #{selected.orderNo}</p>
                <p className="text-[11px] text-muted-foreground">
                  {fmtTime(selected.createdAt)}
                  {selected.updatedAt !== selected.createdAt &&
                    ` — آخر تعديل ${fmtTime(selected.updatedAt)}`}
                </p>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {selected.lines.map((l) => (
                  <div key={l.lineId} className="rounded-xl bg-secondary/50 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {l.qty} × {l.name}
                        </p>
                        {l.modifiers.map((m) => (
                          <p key={m.id} className="text-[11px] text-muted-foreground">
                            + {m.name}
                          </p>
                        ))}
                      </div>
                      <p className="shrink-0 text-sm font-extrabold text-primary">
                        {EGP((l.unitPrice + l.modifiers.reduce((s, m) => s + m.price, 0)) * l.qty)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 border-t border-border p-3 text-sm">
                <Row label="الإجمالي الفرعي" value={EGP(selected.subtotal)} />
                {selected.discount > 0 && <Row label="خصم" value={`- ${EGP(selected.discount)}`} />}
                <Row label="خدمة" value={EGP(selected.service)} />
                <Row label="ضريبة" value={EGP(selected.tax)} />
                <div className="mt-1 flex items-center justify-between rounded-xl bg-primary/15 px-3 py-2">
                  <span className="font-extrabold">الإجمالي</span>
                  <span className="text-xl font-black text-primary">{EGP(selected.total)}</span>
                </div>
                {selected.payments.map((p, i) => (
                  <Row
                    key={i}
                    label={`${PAYMENT_METHODS.find((m) => m.id === p.method)?.label} — ${fmtTime(p.at)}`}
                    value={EGP(p.amount)}
                  />
                ))}

                {selected.status !== "cancelled" && !isPaid(selected) && (
                  <div className="mt-2 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5">
                    <p className="mb-2 text-xs font-extrabold text-destructive">
                      فاتورة غير محصّلة — سجّل طريقة الدفع
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {PAYMENT_METHODS.map((m) => (
                        <Button
                          key={m.id}
                          variant="secondary"
                          className="h-9 text-xs font-extrabold"
                          onClick={() => recordPayment(selected, m.id)}
                        >
                          {m.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button
                    className="col-span-2 h-12 text-base font-extrabold"
                    disabled={selected.status === "cancelled"}
                    onClick={() => void navigate({ to: "/", search: { order: selected.id } })}
                  >
                    <RotateCcw className="h-5 w-5" /> استرجاع وزيادة أصناف
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-11"
                    onClick={() => {
                      if (!printReceipt(selected)) toast.error("اسمح بالنوافذ المنبثقة للطباعة");
                    }}
                  >
                    <Printer className="h-4 w-4" /> طباعة الفاتورة
                  </Button>

                  {selected.status === "paid" ? (
                    <Button
                      variant="destructive"
                      className="h-11"
                      onClick={() => {
                        cancelOrder(selected.id);
                        toast.success(`تم إلغاء الفاتورة #${selected.orderNo}`);
                      }}
                    >
                      <Ban className="h-4 w-4" /> إلغاء الفاتورة
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      className="h-11"
                      onClick={() => {
                        deleteOrder(selected.id);
                        setSelectedId(null);
                        toast.success("تم حذف الفاتورة من السجل");
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> حذف نهائي
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 font-bold">{value}</span>
    </div>
  );
}
