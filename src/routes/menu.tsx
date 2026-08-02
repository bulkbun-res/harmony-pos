import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  ChefHat,
  Clock,
  CreditCard,
  Minus,
  Plus,
  Printer,
  ShoppingCart,
  X,
} from "lucide-react";
import { toast } from "sonner";

import logo from "@/assets/bulk-bun-logo.jpeg";
import { resolveItemImage } from "@/lib/menu-images";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getOrderStatus,
  getPublicMenu,
  placeOrder,
  respondToProposal,
} from "@/lib/online.functions";
import {
  ONLINE_PAYMENT_LABEL,
  ONLINE_STATUS_LABEL,
  placeOrderSchema,
  sumLines,
  type CustomerOrderView,
  type OnlineLine,
  type PublicMenu,
  type PublicMenuItem,
} from "@/lib/online-schemas";
import { EGP } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "منيو Bulk Bun | اطلب أونلاين" },
      {
        name: "description",
        content:
          "تصفّح منيو Bulk Bun التفاعلي: ساندويتشات ووجبات صحية بمكوّناتها وأسعارها، واطلب مباشرة من موبايلك.",
      },
      { property: "og:title", content: "منيو Bulk Bun | اطلب أونلاين" },
      {
        property: "og:description",
        content: "منيو تفاعلي بالصور والمكوّنات مع طلب مباشر ومتابعة حالة التجهيز.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MenuScreen,
});

const STORAGE_KEY = "bulkbun-online-order";


function MenuScreen() {
  const loadMenu = useServerFn(getPublicMenu);
  const submitOrder = useServerFn(placeOrder);
  const loadStatus = useServerFn(getOrderStatus);
  const respond = useServerFn(respondToProposal);

  const [menu, setMenu] = useState<PublicMenu>({ groups: [], items: [] });
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState("all");
  const [cart, setCart] = useState<OnlineLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [ticket, setTicket] = useState<{ id: string; token: string } | null>(null);
  const [order, setOrder] = useState<CustomerOrderView | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const r = await loadMenu({});
      if (!alive) return;
      setMenu(r.menu);
      setLoading(false);
    };
    void refresh();
    const t = setInterval(() => void refresh(), 15000);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTicket(JSON.parse(raw) as { id: string; token: string });
    } catch {
      /* ignore */
    }
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [loadMenu]);


  // متابعة حالة الطلب لحظة بلحظة
  useEffect(() => {
    if (!ticket) return;
    let alive = true;
    const tick = async () => {
      const r = await loadStatus({ data: ticket });
      if (!alive) return;
      if (!r) {
        localStorage.removeItem(STORAGE_KEY);
        setTicket(null);
        return;
      }
      setOrder(r);
    };
    void tick();
    const t = setInterval(() => void tick(), 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [ticket, loadStatus]);

  const groups = useMemo(
    () => [...menu.groups].sort((a, b) => a.order - b.order),
    [menu.groups],
  );
  const items = useMemo(
    () =>
      [...menu.items]
        .filter((i) => i.available)
        .filter((i) => (group === "all" ? true : i.groupId === group))
        .sort((a, b) => a.order - b.order),
    [menu.items, group],
  );

  // لو صنف بقى غير متاح بعد ما العميل ضافه، يتشال من السلة تلقائيًا
  useEffect(() => {
    if (!menu.items.length) return;
    setCart((prev) => {
      const next = prev.filter(
        (l) => menu.items.find((i) => i.id === l.itemId)?.available,
      );
      if (next.length !== prev.length) toast.error("في صنف بقى غير متاح واتشال من طلبك");
      return next.length === prev.length ? prev : next;
    });
  }, [menu.items]);


  const add = (item: PublicMenuItem) => {
    setCart((prev) => {
      const found = prev.find((l) => l.itemId === item.id);
      if (found)
        return prev.map((l) => (l.itemId === item.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { itemId: item.id, name: item.name, unitPrice: item.price, qty: 1 }];
    });
    toast.success(`تمت إضافة ${item.name}`);
  };

  const setQty = (itemId: string, delta: number) =>
    setCart((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0),
    );

  const total = sumLines(cart);
  const count = cart.reduce((s, l) => s + l.qty, 0);

  const checkout = async () => {
    const parsed = placeOrderSchema.safeParse({ name, phone, lines: cart });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "برجاء مراجعة البيانات");
      return;
    }
    setSending(true);
    try {
      const r = await submitOrder({ data: parsed.data });
      const t = { id: r.id, token: r.token };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
      setTicket(t);
      setCart([]);
      setCartOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إرسال الطلب");
    } finally {
      setSending(false);
    }
  };

  if (order && order.status !== "rejected") {
    return (
      <OrderTracker
        order={order}
        onRespond={async (accept) => {
          if (!ticket) return;
          try {
            const r = await respond({ data: { ...ticket, accept } });
            setOrder(r);
            toast.success(accept ? "تم إرسال موافقتك للكاشير" : "تم إلغاء الطلب");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "حدث خطأ");
          }
        }}
        onNew={() => {
          localStorage.removeItem(STORAGE_KEY);
          setTicket(null);
          setOrder(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-sidebar/95 px-4 py-3 backdrop-blur">
        <img
          src={logo}
          alt="شعار Bulk Bun"
          width={44}
          height={44}
          className="h-11 w-11 rounded-xl object-cover ring-2 ring-primary/40"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold brand-gradient-text">BULK BUN</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            ساندويتشات صحية — اطلب من موبايلك
          </p>
        </div>
        {order?.status === "rejected" && (
          <span className="rounded-lg bg-destructive/20 px-2 py-1 text-[11px] font-bold text-destructive">
            طلبك السابق اتلغى
          </span>
        )}
      </header>

      <div className="sticky top-[68px] z-10 flex gap-2 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        {[{ id: "all", name: "الكل" }, ...groups].map((g) => (
          <button
            key={g.id}
            onClick={() => setGroup(g.id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
              group === g.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/60 text-muted-foreground",
            )}
          >
            {g.name}
          </button>
        ))}
      </div>

      <main className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading && (
          <p className="col-span-full py-20 text-center text-sm text-muted-foreground">
            جاري تحميل المنيو…
          </p>
        )}
        {!loading && items.length === 0 && (
          <p className="col-span-full py-20 text-center text-sm text-muted-foreground">
            المنيو مش متاح دلوقتي، برجاء المحاولة بعد قليل.
          </p>
        )}
        {items.map((item) => (
          <article
            key={item.id}
            className={cn(
              "overflow-hidden rounded-2xl border border-border bg-card",
              !item.available && "opacity-60",
            )}
          >
            <img
              src={resolveItemImage(item)}
              alt={item.name}
              loading="lazy"
              width={768}
              height={576}
              className="h-36 w-full object-cover"
            />
            <div className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-extrabold">{item.name}</h2>
                <span className="shrink-0 text-base font-black text-primary">
                  {EGP(item.price)}
                </span>
              </div>
              {item.desc && <p className="text-xs text-muted-foreground">{item.desc}</p>}
              {!!item.ingredients?.length && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-bold text-foreground">المكونات: </span>
                  {item.ingredients.join(" • ")}
                </p>
              )}
              <Button
                className="h-10 w-full font-extrabold"
                disabled={!item.available}
                onClick={() => add(item)}
              >
                {item.available ? (
                  <>
                    <Plus className="h-4 w-4" /> أضف للطلب
                  </>
                ) : (
                  "غير متاح حاليًا"
                )}
              </Button>
            </div>
          </article>
        ))}
      </main>

      {count > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-4 bottom-4 z-30 flex items-center justify-between rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-lg"
        >
          <span className="flex items-center gap-2 font-extrabold">
            <ShoppingCart className="h-5 w-5" /> {count} صنف
          </span>
          <span className="text-lg font-black">{EGP(total)}</span>
        </button>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60">
          <div className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">طلبك</h2>
              <Button variant="ghost" size="icon" onClick={() => setCartOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="space-y-2">
              {cart.map((l) => (
                <div
                  key={l.itemId}
                  className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{l.name}</p>
                    <p className="text-[11px] text-muted-foreground">{EGP(l.unitPrice)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => setQty(l.itemId, -1)}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-6 text-center font-extrabold">{l.qty}</span>
                    <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => setQty(l.itemId, 1)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <span className="w-20 shrink-0 text-end text-sm font-extrabold text-primary">
                    {EGP(l.unitPrice * l.qty)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <Input
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسمك"
                className="h-12 bg-background"
              />
              <Input
                value={phone}
                maxLength={20}
                inputMode="tel"
                onChange={(e) => setPhone(e.target.value)}
                placeholder="رقم التليفون"
                className="h-12 bg-background"
              />
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl bg-primary/15 px-4 py-3">
              <span className="font-extrabold">الإجمالي</span>
              <span className="text-xl font-black text-primary">{EGP(total)}</span>
            </div>

            <Button
              className="mt-3 h-14 w-full text-base font-extrabold"
              disabled={sending || !cart.length}
              onClick={() => void checkout()}
            >
              {sending ? "جاري الإرسال…" : "إرسال الطلب للكاشير"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderTracker({
  order,
  onRespond,
  onNew,
}: {
  order: CustomerOrderView;
  onRespond: (accept: boolean) => Promise<void>;
  onNew: () => void;
}) {
  const waiting = order.status === "awaiting_customer";
  const lines = waiting ? (order.proposedItems ?? order.items) : order.items;
  const total = waiting ? (order.proposedTotal ?? order.total) : order.total;

  return (
    <div className="min-h-[100dvh] bg-background p-4">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-border bg-card p-6 text-center">
          <img
            src={logo}
            alt="شعار Bulk Bun"
            width={64}
            height={64}
            className="h-16 w-16 rounded-2xl object-cover ring-2 ring-primary/40"
          />
          <p className="text-xs text-muted-foreground">رقم طلبك</p>
          <p className="text-5xl font-black text-primary">#{order.orderNo}</p>
          <div
            className={cn(
              "mt-1 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold",
              order.status === "preparing"
                ? "bg-primary/20 text-primary"
                : order.status === "ready"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground",
            )}
          >
            {order.status === "preparing" ? (
              <ChefHat className="h-4 w-4" />
            ) : order.status === "ready" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Clock className="h-4 w-4" />
            )}
            {order.status === "preparing"
              ? "جاري تجهيز طلبك"
              : ONLINE_STATUS_LABEL[order.status]}
          </div>
          <p className="text-[11px] text-muted-foreground">
            استلم طلبك من الكاشير برقم الفاتورة ده
          </p>
        </div>

        {waiting && (
          <div className="space-y-3 rounded-2xl border-2 border-primary bg-card p-4">
            <p className="text-sm font-extrabold text-primary">
              الكاشير عدّل على طلبك ومحتاج موافقتك
            </p>
            {order.proposedNote && (
              <p className="rounded-xl bg-secondary/60 p-3 text-sm">{order.proposedNote}</p>
            )}
            <div className="flex gap-2">
              <Button className="h-12 flex-1 font-extrabold" onClick={() => void onRespond(true)}>
                موافق على التعديل
              </Button>
              <Button
                variant="destructive"
                className="h-12 flex-1 font-extrabold"
                onClick={() => void onRespond(false)}
              >
                رفض وإلغاء
              </Button>
            </div>
          </div>
        )}

        <div
          className={cn(
            "rounded-2xl border p-4 text-center",
            order.paidAt ? "border-primary bg-primary/10" : "border-dashed border-border bg-card",
          )}
        >
          {order.paidAt ? (
            <>
              <p className="flex items-center justify-center gap-2 text-sm font-extrabold text-primary">
                <CreditCard className="h-4 w-4" /> تم الدفع —{" "}
                {ONLINE_PAYMENT_LABEL[order.paymentMethod ?? "cash"]}
              </p>
              <p className="mt-1 text-2xl font-black text-primary">
                {EGP(order.paidAmount ?? order.total)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(order.paidAt).toLocaleString("ar-EG")}
              </p>
            </>
          ) : (
            <>
              <p className="flex items-center justify-center gap-2 text-sm font-extrabold">
                <CreditCard className="h-4 w-4" /> الدفع عند الاستلام
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                ادفع للكاشير كاش أو فودافون كاش أو انستا باي أو فيزا، وهيأكد الدفع وتظهرلك فاتورتك
                هنا فورًا.
              </p>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-2 text-sm font-extrabold">
            {order.paidAt ? `فاتورة رقم #${order.orderNo}` : "تفاصيل الطلب"}
          </p>
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.itemId} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {l.qty} × {l.name}
                </span>
                <span className="shrink-0 font-bold text-primary">
                  {EGP(l.unitPrice * l.qty)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-primary/15 px-3 py-2">
            <span className="font-extrabold">الإجمالي</span>
            <span className="text-lg font-black text-primary">{EGP(total)}</span>
          </div>
        </div>

        {order.paidAt && (
          <Button
            variant="secondary"
            className="h-12 w-full font-extrabold"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" /> طباعة / حفظ الفاتورة
          </Button>
        )}

        <Button variant="secondary" className="h-12 w-full font-extrabold" onClick={onNew}>
          طلب جديد
        </Button>
      </div>
    </div>
  );
}
