import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import {
  Ban,
  ChefHat,
  CheckCircle2,
  Clock,
  Minus,
  Pencil,
  Plus,
  Printer,

  RefreshCw,
  UploadCloud,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { PosHeader } from "@/components/pos/PosHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePos } from "@/lib/pos-store";
import { useMenuPublisher } from "@/lib/use-online-orders";
import { posListOrders, posMarkPaid, posProposeEdit, posSetStatus } from "@/lib/online.functions";
import { PUBLIC_MENU_URL } from "@/lib/public-url";
import {
  ONLINE_PAYMENT_LABEL,
  ONLINE_STATUS_LABEL,
  sumLines,
  type OnlinePaymentMethod,
  type OnlineLine,
  type OnlineOrderRow,
} from "@/lib/online-schemas";
import { printReceipt } from "@/lib/print-receipt";
import { EGP, PAYMENT_METHODS, type CartLine, type Order, type PaymentMethod } from "@/lib/pos-types";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/online")({
  head: () => ({
    meta: [
      { title: "طلبات المنيو الأونلاين | Bulk Bun POS" },
      {
        name: "description",
        content: "استقبال طلبات العملاء من منيو الـQR، تعديلها، الموافقة عليها وتجهيزها.",
      },
      { property: "og:title", content: "طلبات المنيو الأونلاين | Bulk Bun POS" },
      {
        property: "og:description",
        content: "لوحة الكاشير لطلبات المنيو الأونلاين مع كود QR للمنيو.",
      },
    ],
  }),
  component: OnlineScreen,
});

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

const fmt = (t: string) =>
  new Date(t).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });

function OnlineScreen() {
  const { state, saveOrder } = usePos();
  const list = useServerFn(posListOrders);
  const setStatus = useServerFn(posSetStatus);
  const markPaid = useServerFn(posMarkPaid);
  const propose = useServerFn(posProposeEdit);
  const { publish, publishing, lastPublished } = useMenuPublisher();

  const [orders, setOrders] = useState<OnlineOrderRow[]>([]);
  const [qr, setQr] = useState("");
  const menuUrl = PUBLIC_MENU_URL;
  const [editing, setEditing] = useState<OnlineOrderRow | null>(null);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      setOrders(await list({}));
    } catch {
      /* تجاهل أخطاء الشبكة المؤقتة */
    }
  }, [list]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      void refresh();
      setNow(Date.now());
    }, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    void QRCode.toDataURL(PUBLIC_MENU_URL, {
      width: 420,
      margin: 1,
      color: { dark: "#0b1a12", light: "#ffffff" },
    }).then(setQr);
  }, []);

  // الطلب يفضل في القائمة النشطة لحد ما يتدفع فعلاً (حتى لو اتسلّم)
  const active = orders.filter(
    (o) => o.status !== "rejected" && !(o.status === "ready" && o.paid_at),
  );
  const archived = orders.filter(
    (o) => o.status === "rejected" || (o.status === "ready" && o.paid_at),
  );


  /** يحوّل الطلب لفاتورة POS ويخصم الاستهلاك من المخزن */
  const prepare = async (o: OnlineOrderRow, useProposed = false) => {
    const lines = useProposed ? (o.proposed_items ?? o.items) : o.items;
    const cartLines: CartLine[] = lines.map((l, i) => ({
      lineId: `${o.id}-${i}`,
      itemId: l.itemId,
      name: l.name,
      unitPrice: l.unitPrice,
      qty: l.qty,
      modifiers: [],
    }));
    const subtotal = sumLines(lines);
    const service = Math.round(subtotal * state.serviceRate * 100) / 100;
    const tax = Math.round((subtotal + service) * state.taxRate * 100) / 100;
    const total = Math.round((subtotal + service + tax) * 100) / 100;
    saveOrder({
      id: `online-${o.id}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "paid",
      lines: cartLines,
      discount: 0,
      subtotal,
      service,
      tax,
      total,
      payments: [],
      note: `طلب أونلاين #${o.order_no} — ${o.customer_name} — ${o.customer_phone}`,
    });
    await setStatus({ data: { id: o.id, status: "preparing", applyProposed: useProposed } });
    toast.success(`جاري تجهيز الطلب #${o.order_no} — اتخصم من المخزن`);
    void refresh();
  };

  /** إجمالي الفاتورة النهائي (بعد الخدمة والضريبة) للطلب الأونلاين */
  const invoiceTotal = (o: OnlineOrderRow) => {
    const subtotal = sumLines(o.items);
    const service = Math.round(subtotal * state.serviceRate * 100) / 100;
    const tax = Math.round((subtotal + service) * state.taxRate * 100) / 100;
    return {
      subtotal,
      service,
      tax,
      total: Math.round((subtotal + service + tax) * 100) / 100,
    };
  };

  /** تأكيد الدفع: يسجّل الدفع على الطلب الأونلاين وعلى فاتورة الـPOS */
  const confirmPayment = async (o: OnlineOrderRow, method: PaymentMethod) => {
    const t = invoiceTotal(o);
    await markPaid({ data: { id: o.id, method: method as OnlinePaymentMethod, amount: t.total } });
    const invoiceId = `online-${o.id}`;
    const existing = state.orders.find((x) => x.id === invoiceId);
    const lines: CartLine[] =
      existing?.lines ??
      o.items.map((l, i) => ({
        lineId: `${o.id}-${i}`,
        itemId: l.itemId,
        name: l.name,
        unitPrice: l.unitPrice,
        qty: l.qty,
        modifiers: [],
      }));
    const saved = saveOrder({
      ...(existing ?? {
        id: invoiceId,
        createdAt: Date.now(),
        discount: 0,
        note: `طلب أونلاين #${o.order_no} — ${o.customer_name} — ${o.customer_phone}`,
      }),
      id: invoiceId,
      updatedAt: Date.now(),
      status: "paid",
      lines,
      discount: existing?.discount ?? 0,
      subtotal: t.subtotal,
      service: t.service,
      tax: t.tax,
      total: t.total,
      payments: [{ method, amount: t.total, at: Date.now() }],
      note:
        existing?.note ??
        `طلب أونلاين #${o.order_no} — ${o.customer_name} — ${o.customer_phone}`,
      ...(existing?.orderNo ? { orderNo: existing.orderNo } : {}),
    } as Parameters<typeof saveOrder>[0]);
    toast.success(`تم تأكيد الدفع (${ONLINE_PAYMENT_LABEL[method as OnlinePaymentMethod]}) — ${EGP(t.total)}`);
    printReceipt(saved, {
      title: `طلب أونلاين #${o.order_no}`,
      customer: o.customer_name,
      phone: o.customer_phone,
    });
    void refresh();
  };

  /** طباعة فاتورة الطلب الأونلاين (تبني الفاتورة لو لسه متسجلتش) */
  const printOnline = (o: OnlineOrderRow) => {
    const t = invoiceTotal(o);
    const existing = state.orders.find((x) => x.id === `online-${o.id}`);
    const order =
      existing ??
      ({
        id: `online-${o.id}`,
        orderNo: o.order_no,
        createdAt: new Date(o.created_at).getTime(),
        updatedAt: Date.now(),
        status: "paid" as const,
        lines: o.items.map((l, i) => ({
          lineId: `${o.id}-${i}`,
          itemId: l.itemId,
          name: l.name,
          unitPrice: l.unitPrice,
          qty: l.qty,
          modifiers: [],
        })),
        discount: 0,
        subtotal: t.subtotal,
        service: t.service,
        tax: t.tax,
        total: t.total,
        payments: o.paid_at
          ? [
              {
                method: (o.payment_method ?? "cash") as PaymentMethod,
                amount: Number(o.paid_amount ?? t.total),
                at: new Date(o.paid_at).getTime(),
              },
            ]
          : [],
      } as Order);
    if (!printReceipt(order, {
      title: `طلب أونلاين #${o.order_no}`,
      customer: o.customer_name,
      phone: o.customer_phone,
    }))
      toast.error("اسمح بالنوافذ المنبثقة للطباعة");
  };


  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <PosHeader />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:flex-row">
        <main className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-extrabold">طلبات المنيو الأونلاين</h1>
            <span className="rounded-lg bg-primary/15 px-2 py-1 text-xs font-extrabold text-primary">
              {active.length} طلب نشط
            </span>
            <Button variant="secondary" size="sm" className="ms-auto" onClick={() => void refresh()}>
              <RefreshCw className="h-4 w-4" /> تحديث
            </Button>
          </div>

          {active.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              مفيش طلبات جديدة من المنيو دلوقتي.
            </p>
          )}

          {active.map((o) => {
            const waiting = o.status === "awaiting_customer";
            const since = o.proposed_at ? now - new Date(o.proposed_at).getTime() : 0;
            const remaining = Math.max(0, APPROVAL_TIMEOUT_MS - since);
            const canForce = waiting && remaining === 0;
            const lines = waiting ? (o.proposed_items ?? o.items) : o.items;
            return (
              <article key={o.id} className="rounded-2xl border-2 border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-black text-primary">#{o.order_no}</span>
                  <span className="text-sm font-bold">{o.customer_name}</span>
                  <a
                    href={`tel:${o.customer_phone}`}
                    className="text-sm font-bold text-muted-foreground underline"
                  >
                    {o.customer_phone}
                  </a>
                  <span className="text-[11px] text-muted-foreground">{fmt(o.created_at)}</span>
                  <span
                    className={cn(
                      "ms-auto rounded-lg px-2 py-1 text-[11px] font-extrabold",
                      o.status === "new"
                        ? "bg-primary text-primary-foreground"
                        : o.status === "approved"
                          ? "bg-primary/20 text-primary"
                          : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {ONLINE_STATUS_LABEL[o.status]}
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-sm">
                  {lines.map((l, i) => (
                    <div key={`${l.itemId}-${i}`} className="flex justify-between gap-2">
                      <span className="truncate">
                        {l.qty} × {l.name}
                      </span>
                      <span className="shrink-0 font-bold">{EGP(l.unitPrice * l.qty)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-border pt-1 font-extrabold">
                    <span>الإجمالي (قبل الخدمة والضريبة)</span>
                    <span className="text-primary">{EGP(sumLines(lines))}</span>
                  </div>
                </div>

                {waiting && (
                  <p className="mt-2 rounded-xl bg-secondary/60 p-2 text-xs">
                    <Clock className="me-1 inline h-3.5 w-3.5" />
                    في انتظار موافقة العميل
                    {remaining > 0
                      ? ` — متبقي ${Math.ceil(remaining / 1000)} ثانية قبل ما تقدر تجهّز بدون موافقة`
                      : " — عدّى 5 دقايق، تقدر تجهّز بدون موافقة أو تكلّم العميل"}
                    {o.proposed_note ? ` — ملاحظة: ${o.proposed_note}` : ""}
                  </p>
                )}

                <div className="mt-3 rounded-xl border border-border bg-secondary/40 p-3">
                  {o.paid_at ? (
                    <p className="text-xs font-extrabold text-primary">
                      مدفوع — {ONLINE_PAYMENT_LABEL[o.payment_method ?? "cash"]} ·{" "}
                      {EGP(Number(o.paid_amount ?? 0))} · {fmt(o.paid_at)}
                    </p>
                  ) : (
                    <>
                      <p className="mb-2 flex items-center justify-between gap-2 text-xs font-bold text-muted-foreground">
                        <span>
                          <Wallet className="me-1 inline h-3.5 w-3.5" /> تأكيد الدفع
                        </span>
                        <span className="font-extrabold text-foreground">
                          المطلوب: {EGP(invoiceTotal(o).total)}
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {PAYMENT_METHODS.map((m) => (
                          <Button
                            key={m.id}
                            variant="secondary"
                            className="h-9 text-xs font-extrabold"
                            onClick={() => void confirmPayment(o, m.id)}
                          >
                            {m.label}
                          </Button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(o.status === "new" || o.status === "approved") && (
                    <Button className="h-11 font-extrabold" onClick={() => void prepare(o)}>
                      <ChefHat className="h-4 w-4" /> تجهيز
                    </Button>
                  )}
                  {waiting && (
                    <Button
                      className="h-11 font-extrabold"
                      disabled={!canForce}
                      onClick={() => void prepare(o, true)}
                    >
                      <ChefHat className="h-4 w-4" /> تجهيز بالتعديل بدون موافقة
                    </Button>
                  )}
                  {o.status === "preparing" && (
                    <Button
                      className="h-11 font-extrabold"
                      onClick={async () => {
                        await setStatus({ data: { id: o.id, status: "ready" } });
                        void refresh();
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" /> جاهز للاستلام
                    </Button>
                  )}
                  {o.status !== "preparing" && o.status !== "ready" && (
                    <Button variant="secondary" className="h-11" onClick={() => setEditing(o)}>
                      <Pencil className="h-4 w-4" /> تعديل الطلب
                    </Button>
                  )}
                  <Button variant="secondary" className="h-11" onClick={() => printOnline(o)}>
                    <Printer className="h-4 w-4" /> طباعة الفاتورة
                  </Button>
                  {o.status !== "ready" && (
                    <Button
                      variant="destructive"
                      className="h-11"
                      onClick={async () => {
                        await setStatus({ data: { id: o.id, status: "rejected" } });
                        toast.success(`تم رفض الطلب #${o.order_no}`);
                        void refresh();
                      }}
                    >
                      <Ban className="h-4 w-4" /> رفض
                    </Button>
                  )}

                </div>
              </article>
            );
          })}

          {archived.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-extrabold text-muted-foreground">
                طلبات منتهية اليوم
              </h2>
              <div className="space-y-1 text-sm">
                {archived.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      #{o.order_no} — {o.customer_name}
                    </span>
                    <span
                      className={cn(
                        "ms-auto shrink-0 text-xs font-bold",
                        o.status === "ready" ? "text-primary" : "text-destructive",
                      )}
                    >
                      {o.paid_at
                        ? `مدفوع — ${ONLINE_PAYMENT_LABEL[o.payment_method ?? "cash"]}`
                        : ONLINE_STATUS_LABEL[o.status]}
                    </span>
                    {o.paid_at && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2"
                        onClick={() => printOnline(o)}
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                ))}
              </div>
            </section>
          )}
        </main>

        <aside className="w-full shrink-0 space-y-3 lg:w-[20rem]">
          <div className="rounded-2xl border border-border bg-card p-4 text-center">
            <h2 className="text-sm font-extrabold">كود QR للمنيو</h2>
            <p className="mb-3 text-[11px] text-muted-foreground">
              اطبعه وحطه على الطاولات — العميل يمسحه ويطلب من موبايله
            </p>
            {qr && (
              <img
                src={qr}
                alt="كود QR لمنيو Bulk Bun"
                width={420}
                height={420}
                className="mx-auto h-auto w-full max-w-[15rem] rounded-xl bg-white p-2"
              />
            )}
            <p className="mt-2 break-all text-[10px] text-muted-foreground">{menuUrl}</p>
            <div className="mt-3 flex flex-col gap-2">
              <Button
                className="h-11 font-extrabold"
                disabled={publishing}
                onClick={() => void publish(true)}
              >
                <UploadCloud className="h-4 w-4" />
                {publishing ? "جاري النشر…" : "نشر المنيو الحالي"}
              </Button>
              <Button variant="secondary" className="h-10" onClick={() => window.print()}>
                طباعة الكود
              </Button>
            </div>
            {lastPublished && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                آخر نشر: {new Date(lastPublished).toLocaleTimeString("ar-EG")}
              </p>
            )}
          </div>
        </aside>
      </div>

      <EditOrderDialog
        order={editing}
        onClose={() => setEditing(null)}
        onSave={async (lines, note) => {
          if (!editing) return;
          await propose({ data: { id: editing.id, lines, ...(note ? { note } : {}) } });
          toast.success("تم إرسال التعديل للعميل وننتظر موافقته");
          setEditing(null);
          void refresh();
        }}
      />
    </div>
  );
}

function EditOrderDialog({
  order,
  onClose,
  onSave,
}: {
  order: OnlineOrderRow | null;
  onClose: () => void;
  onSave: (lines: OnlineLine[], note: string) => Promise<void>;
}) {
  const { state } = usePos();
  const [lines, setLines] = useState<OnlineLine[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    setLines(order ? (order.proposed_items ?? order.items) : []);
    setNote(order?.proposed_note ?? "");
  }, [order]);

  const available = useMemo(
    () => state.items.filter((i) => i.available).sort((a, b) => a.order - b.order),
    [state.items],
  );

  const bump = (itemId: string, delta: number) =>
    setLines((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0),
    );

  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>تعديل طلب #{order?.order_no}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.itemId} className="flex items-center gap-2 rounded-xl bg-secondary/50 p-2">
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{l.name}</span>
              <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => bump(l.itemId, -1)}>
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-6 text-center font-extrabold">{l.qty}</span>
              <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => bump(l.itemId, 1)}>
                <Plus className="h-4 w-4" />
              </Button>
              <span className="w-20 text-end text-sm font-bold text-primary">
                {EGP(l.unitPrice * l.qty)}
              </span>
            </div>
          ))}
          {!lines.length && (
            <p className="text-center text-sm text-muted-foreground">الطلب فاضي — أضف صنف</p>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-bold text-muted-foreground">إضافة صنف للطلب</p>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {available.map((i) => (
              <button
                key={i.id}
                onClick={() =>
                  setLines((prev) =>
                    prev.some((l) => l.itemId === i.id)
                      ? prev.map((l) => (l.itemId === i.id ? { ...l, qty: l.qty + 1 } : l))
                      : [...prev, { itemId: i.id, name: i.name, unitPrice: i.price, qty: 1 }],
                  )
                }
                className="rounded-lg bg-secondary/60 px-2.5 py-1.5 text-xs font-bold hover:bg-secondary"
              >
                {i.name}
              </button>
            ))}
          </div>
        </div>

        <Input
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ملاحظة للعميل (سبب التعديل)"
          className="bg-background"
        />

        <div className="flex items-center justify-between rounded-xl bg-primary/15 px-3 py-2">
          <span className="font-extrabold">إجمالي بعد التعديل</span>
          <span className="text-lg font-black text-primary">{EGP(sumLines(lines))}</span>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            className="font-extrabold"
            disabled={!lines.length}
            onClick={() => void onSave(lines, note.trim())}
          >
            إرسال التعديل للعميل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
