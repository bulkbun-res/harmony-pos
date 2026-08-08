import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Minus, Plus, Printer, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { AuthGuard } from "@/components/AuthGuard";
import { PosHeader } from "@/components/pos/PosHeader";
import { ItemTile } from "@/components/pos/ItemTile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { openShiftFn, closeShiftFn, getCurrentShiftFn } from "@/lib/shift.functions";
import { printReceipt } from "@/lib/print-receipt";
import {
  EGP,
  PAYMENT_METHODS,
  type CartLine,
  type Item,
  type Order,
  type PaymentMethod,
} from "@/lib/pos-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>) => ({
    order: typeof s["order"] === "string" ? (s["order"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "شاشة الكاشير | Bulk Bun POS" },
      {
        name: "description",
        content: "شاشة البيع السريعة: اختر الأصناف وأنشئ الفاتورة وحصّل الدفع.",
      },
      { property: "og:title", content: "شاشة الكاشير | Bulk Bun POS" },
      { property: "og:description", content: "شاشة البيع السريعة لمطعم Bulk Bun." },
    ],
  }),
  component: () => (
    <AuthGuard>
      <PosScreen />
    </AuthGuard>
  ),
});

function PosScreen() {
  const { state, saveOrder, setActiveShift } = usePos();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const { order: editId } = Route.useSearch();

  // دوال وخطافات الوردية
  const fetchCurrentShift = useServerFn(getCurrentShiftFn);
  const startShiftOnServer = useServerFn(openShiftFn);
  const closeShiftOnServer = useServerFn(closeShiftFn);

  const [shiftLoading, setShiftLoading] = useState(true);
  const [openingCashInput, setOpeningCashInput] = useState("");
  const [openShiftSubmitting, setOpenShiftSubmitting] = useState(false);

  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [actualCashInput, setActualCashInput] = useState("");
  const [closeNotesInput, setCloseNotesInput] = useState("");
  const [closeShiftSubmitting, setCloseShiftSubmitting] = useState(false);

  useEffect(() => {
    const checkShift = async () => {
      try {
        const active = await fetchCurrentShift({});
        setActiveShift(active);
      } catch (err) {
        console.error("Failed to check shift:", err);
      } finally {
        setShiftLoading(false);
      }
    };
    void checkShift();
  }, [fetchCurrentShift, setActiveShift]);

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const cash = parseFloat(openingCashInput);
    if (isNaN(cash) || cash < 0) {
      toast.error("يرجى إدخال مبلغ افتتاحي صحيح");
      return;
    }
    setOpenShiftSubmitting(true);
    try {
      await startShiftOnServer({ data: { openingCash: cash } });
      toast.success("تم بدء الوردية وتكلفة الدرج بنجاح!");
      const active = await fetchCurrentShift({});
      setActiveShift(active);
    } catch (err: any) {
      toast.error(err.message || "فشل فتح الوردية");
    } finally {
      setOpenShiftSubmitting(false);
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const actual = parseFloat(actualCashInput);
    if (isNaN(actual) || actual < 0) {
      toast.error("يرجى إدخال المبلغ الفعلي في الدرج");
      return;
    }
    setCloseShiftSubmitting(true);
    try {
      const res = await closeShiftOnServer({
        data: { actualCash: actual, notes: closeNotesInput },
      });
      toast.success(`تم تقفيل الوردية بنجاح! فارق العجز/الزيادة: ${EGP(res.difference)}`);
      setCloseShiftOpen(false);
      setActiveShift(null);
      await logout();
      navigate({ to: "/login" });
    } catch (err: any) {
      toast.error(err.message || "فشل تقفيل الوردية");
    } finally {
      setCloseShiftSubmitting(false);
    }
  };

  const groups = [...state.groups].sort((a, b) => a.order - b.order);
  const [activeGroup, setActiveGroup] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [modifierItem, setModifierItem] = useState<Item | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);

  // استرجاع فاتورة سابقة للتعديل / الزيادة عليها
  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editId) {
      loadedRef.current = null;
      setEditing(null);
      return;
    }
    if (loadedRef.current === editId) return;
    const o = state.orders.find((x) => x.id === editId);
    if (!o) return;
    loadedRef.current = editId;
    setEditing(o);
    setLines(o.lines);
    setDiscount(o.discount);
  }, [editId, state.orders]);

  const orderNo = editing?.orderNo ?? state.nextOrderNo;

  const items = useMemo(() => {
    const q = search.trim();
    return state.items
      .filter((i) => (activeGroup === "all" ? true : i.groupId === activeGroup))
      .filter((i) => (q ? i.name.includes(q) : true))
      .sort((a, b) => a.order - b.order);
  }, [state.items, activeGroup, search]);

  const addLine = (item: Item, mods: Item["modifiers"] = []) => {
    const key = mods
      .map((m) => m.id)
      .sort()
      .join("|");
    setLines((prev) => {
      const existing = prev.find(
        (l) =>
          l.itemId === item.id &&
          (l.modifiers || [])
            .map((m) => m.id)
            .sort()
            .join("|") === key,
      );
      if (existing) {
        return prev.map((l) => (l.lineId === existing.lineId ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          lineId: Math.random().toString(36).slice(2),
          itemId: item.id,
          name: item.name,
          unitPrice: item.price,
          qty: 1,
          modifiers: mods,
        },
      ];
    });
  };

  const onTileClick = (item: Item) => {
    if ((item.modifiers || []).length) setModifierItem(item);
    else addLine(item);
  };

  const setQty = (lineId: string, delta: number) =>
    setLines((prev) =>
      prev
        .map((l) => (l.lineId === lineId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    );

  const lineTotal = (l: CartLine) =>
    (l.unitPrice + l.modifiers.reduce((s, m) => s + m.price, 0)) * l.qty;

  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const afterDiscount = Math.max(0, subtotal - discount);
  const service = afterDiscount * state.serviceRate;
  const tax = (afterDiscount + service) * state.taxRate;
  const total = afterDiscount + service + tax;

  const counts = lines.reduce<Record<string, number>>((acc, l) => {
    acc[l.itemId] = (acc[l.itemId] ?? 0) + l.qty;
    return acc;
  }, {});

  const alreadyPaid = (editing?.payments ?? []).reduce((s, p) => s + p.amount, 0);
  const due = Math.max(0, total - alreadyPaid);

  const completeOrder = (method: PaymentMethod) => {
    const label = PAYMENT_METHODS.find((p) => p.id === method)?.label;
    const now = Date.now();
    const saved = saveOrder({
      id: editing?.id ?? Math.random().toString(36).slice(2, 10),
      orderNo: editing?.orderNo,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
      status: "paid",
      lines,
      discount,
      subtotal,
      service,
      tax,
      total,
      payments: [...(editing?.payments ?? []), { method, amount: due, at: now }],
    });
    toast.success(`تم تحصيل الفاتورة #${saved.orderNo} — ${label} — ${EGP(due)}`);
    
    // طباعة الفاتورة تلقائياً للـ XPrinter بعد الدفع
    printReceipt(saved, {
      title: "فاتورة كاشير",
    });

    setLines([]);
    setDiscount(0);
    setPayOpen(false);
    setEditing(null);
    if (editId) void navigate({ to: "/", search: {} });
  };

  const handlePrintDraft = () => {
    if (!lines.length) return;
    const draftOrder: Order = {
      id: editing?.id ?? "draft",
      orderNo: orderNo,
      createdAt: editing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      status: editing?.status ?? "paid",
      lines,
      discount,
      subtotal,
      service,
      tax,
      total,
      payments: editing?.payments ?? [],
    };
    printReceipt(draftOrder, {
      title: editing ? "تعديل فاتورة" : "مسودة طلب كاشير",
    });
  };

  const cancelEditing = () => {
    setLines([]);
    setDiscount(0);
    setEditing(null);
    void navigate({ to: "/", search: {} });
  };

  const gridRef = useRef<HTMLDivElement>(null);
  const fit = useAutoFitGrid(gridRef, items);

  const shiftOrders = useMemo(() => {
    if (!state.activeShift) return [];
    return state.orders.filter(
      (o) => o.shiftId === state.activeShift?.id && o.status === "paid"
    );
  }, [state.orders, state.activeShift]);

  const shiftTotals = useMemo(() => {
    const opening = state.activeShift?.opening_cash ?? 0;
    const cash = shiftOrders
      .filter((o) => o.payments[0]?.method === "cash")
      .reduce((sum, o) => sum + o.total, 0);
    const visa = shiftOrders
      .filter((o) => o.payments[0]?.method === "visa")
      .reduce((sum, o) => sum + o.total, 0);
    const instapay = shiftOrders
      .filter((o) => o.payments[0]?.method === "instapay")
      .reduce((sum, o) => sum + o.total, 0);
    const vodafone = shiftOrders
      .filter((o) => o.payments[0]?.method === "vodafone")
      .reduce((sum, o) => sum + o.total, 0);

    return {
      opening,
      cash,
      visa,
      instapay,
      vodafone,
      expectedInDrawer: opening + cash,
      totalSales: cash + visa + instapay + vodafone,
    };
  }, [shiftOrders, state.activeShift]);

  if (shiftLoading) {
    return (
      <div className="flex h-[100dvh] w-full flex-col items-center justify-center bg-[#050908] text-white">
        <div className="h-10 w-10 border-4 border-primary border-t-transparent animate-spin rounded-full mb-4"></div>
        <p className="text-sm font-bold text-muted-foreground">جاري التحقق من الوردية والدرج...</p>
      </div>
    );
  }

  if (!state.activeShift) {
    return (
      <div className="flex h-[100dvh] w-full flex-col bg-[#050908] items-center justify-center px-4 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="w-full max-w-md bg-[#0b1411]/90 border border-white/5 p-6 sm:p-8 rounded-3xl backdrop-blur-xl shadow-2xl text-center space-y-6 relative z-10">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center text-3xl select-none">
            💼
          </div>
          
          <div className="space-y-1.5 border-b border-white/5 pb-4">
            <h1 className="text-xl font-black text-foreground">بدء وردية جديدة</h1>
            <p className="text-xs text-muted-foreground">
              أهلاً بك يا <span className="font-extrabold text-primary">{user?.name || "كاشير"}</span>. يرجى إدخال الرصيد الافتتاحي (مبلغ الدرج) لتتمكن من العمل والبيع.
            </p>
          </div>

          <form onSubmit={handleOpenShift} className="space-y-4">
            <div className="space-y-2 text-start">
              <label className="text-xs font-bold text-muted-foreground ps-1">المبلغ الافتتاحي لدرج النقدية (EGP)</label>
              <Input
                type="number"
                required
                value={openingCashInput}
                onChange={(e) => setOpeningCashInput(e.target.value)}
                placeholder="مثال: 500"
                className="bg-[#050908] border-white/5 rounded-2xl h-12 text-center text-lg font-black text-primary placeholder:text-muted-foreground/30 focus-visible:ring-primary/30"
                autoFocus
              />
            </div>

            <Button 
              type="submit" 
              disabled={openShiftSubmitting}
              className="w-full h-12 rounded-2xl font-black text-sm tracking-wide bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2"
            >
              {openShiftSubmitting ? (
                <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent animate-spin rounded-full"></div>
              ) : (
                "بدء الوردية والتشغيل 🚀"
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                await logout();
                navigate({ to: "/login" });
              }}
              className="w-full text-xs text-muted-foreground hover:text-foreground h-10 font-bold"
            >
              تسجيل الخروج والرجوع
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <PosHeader 
        right={
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col text-end text-[10px] leading-tight pe-3 border-e border-white/10">
              <span className="font-extrabold text-foreground">{user?.name}</span>
              <span className="text-muted-foreground text-[9px] mt-0.5">
                الوردية مفتوحة منذ {new Date(state.activeShift.opened_at).toLocaleTimeString("ar-EG", { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setCloseShiftOpen(true)}
              className="h-9 px-3.5 text-xs font-black rounded-xl border border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all duration-300"
            >
              🔒 إقفال الوردية
            </Button>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 flex-row gap-2 p-2 sm:gap-3 sm:p-3 lg:p-4">
        {/* Items area */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن صنف…"
              className="h-10 max-w-[14rem] rounded-xl bg-card text-sm"
            />
            <div className="flex flex-1 flex-wrap gap-2">
              <GroupChip
                label="الكل"
                active={activeGroup === "all"}
                onClick={() => setActiveGroup("all")}
              />
              {groups.map((g) => (
                <GroupChip
                  key={g.id}
                  label={g.name}
                  active={activeGroup === g.id}
                  onClick={() => setActiveGroup(g.id)}
                />
              ))}
            </div>
          </div>

          <div
            ref={gridRef}
            className="grid min-h-0 flex-1 gap-[10px] overflow-y-auto pr-1"
            style={{
              gridTemplateColumns: `repeat(${fit.cols}, minmax(0, 1fr))`,
              gridAutoRows: `${fit.rowHeight}px`,
              alignContent: "start",
            }}
          >
            {items.map((item) => (
              <ItemTile
                key={item.id}
                item={item}
                badge={counts[item.id]}
                onClick={() => onTileClick(item)}
              />
            ))}
            {items.length === 0 && (
              <p className="col-span-full py-16 text-center text-muted-foreground">
                لا توجد أصناف في هذه المجموعة.
              </p>
            )}
          </div>
        </main>

        {/* Invoice */}
        <aside className="flex h-full min-h-0 w-[38%] min-w-[11rem] max-w-[24rem] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card sm:w-[34%] lg:w-[22rem] xl:w-[24rem]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-foreground">
                فاتورة #{orderNo}
                {editing && (
                  <span className="ms-2 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                    تعديل فاتورة سابقة
                  </span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground">{lines.length} صنف</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (editing ? cancelEditing() : setLines([]))}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> {editing ? "إلغاء التعديل" : "تفريغ"}
            </Button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {lines.length === 0 && (
              <p className="py-14 text-center text-sm text-muted-foreground">
                ابدأ باختيار الأصناف من الشاشة
              </p>
            )}
            {lines.map((l) => (
              <div key={l.lineId} className="rounded-xl bg-secondary/50 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{l.name}</p>
                    {(l.modifiers || []).map((m) => (
                      <p key={m.id} className="text-[11px] text-muted-foreground">
                        + {m.name} ({EGP(m.price)})
                      </p>
                    ))}
                  </div>
                  <p className="shrink-0 text-sm font-extrabold text-primary">
                    {EGP(lineTotal(l))}
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => setQty(l.lineId, -1)}
                    className="grid h-8 w-8 place-items-center rounded-lg bg-background text-foreground"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-sm font-extrabold">{l.qty}</span>
                  <button
                    onClick={() => setQty(l.lineId, 1)}
                    className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setLines((p) => p.filter((x) => x.lineId !== l.lineId))}
                    className="ms-auto grid h-8 w-8 place-items-center rounded-lg bg-destructive/15 text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 border-t border-border p-3 text-sm">
            <Row label="الإجمالي الفرعي" value={EGP(subtotal)} />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">خصم</span>
              <Input
                type="number"
                min={0}
                value={discount || ""}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                className="h-8 w-24 bg-background text-end"
              />
            </div>
            <Row label={`خدمة ${Math.round(state.serviceRate * 100)}%`} value={EGP(service)} />
            <Row label={`ضريبة ${Math.round(state.taxRate * 100)}%`} value={EGP(tax)} />
            <div className="mt-2 flex items-center justify-between rounded-xl bg-primary/15 px-3 py-2">
              <span className="font-extrabold">الإجمالي</span>
              <span className="text-xl font-black text-primary">{EGP(total)}</span>
            </div>
            {editing && alreadyPaid > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-1.5 text-xs">
                <span className="text-muted-foreground">مدفوع سابقًا {EGP(alreadyPaid)}</span>
                <span className="font-extrabold text-primary">المتبقي {EGP(due)}</span>
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <Button
                className="h-12 flex-1 text-base font-extrabold"
                disabled={!lines.length}
                onClick={() => setPayOpen(true)}
              >
                {editing ? `تحصيل الفرق ${EGP(due)}` : "الدفع"}
              </Button>
              <Button
                variant="secondary"
                className="h-12"
                disabled={!lines.length}
                onClick={handlePrintDraft}
              >
                <Printer className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </aside>
      </div>

      <ModifiersDialog
        item={modifierItem}
        onClose={() => setModifierItem(null)}
        onConfirm={(item, mods) => {
          addLine(item, mods);
          setModifierItem(null);
        }}
      />

      <PaymentDialog
        open={payOpen}
        total={due}
        onOpenChange={setPayOpen}
        onConfirm={completeOrder}
      />

      {/* نافذة تقفيل الوردية وجرد الدرج */}
      <Dialog open={closeShiftOpen} onOpenChange={setCloseShiftOpen}>
        <DialogContent className="max-w-md bg-[#0b1411] border-white/5 rounded-3xl text-right p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-destructive flex items-center gap-2 justify-end">
              تقفيل الوردية وجرد النقدية 🔒
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 my-3 text-xs leading-relaxed">
            {/* ملخص المبيعات للوردية */}
            <div className="bg-[#050908]/60 border border-white/5 rounded-2xl p-4 space-y-2.5">
              <div className="flex justify-between items-center text-muted-foreground">
                <span className="font-bold">{EGP(shiftTotals.opening)}</span>
                <span>المبلغ الافتتاحي للدرج:</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground border-b border-white/5 pb-2">
                <span className="font-bold text-emerald-500">+{EGP(shiftTotals.cash)}</span>
                <span>مبيعات النقدية (الكاش):</span>
              </div>
              <div className="flex justify-between items-center text-foreground font-black text-sm pt-1">
                <span className="text-primary">{EGP(shiftTotals.expectedInDrawer)}</span>
                <span>المبلغ المتوقع في الدرج:</span>
              </div>
            </div>

            {/* تفاصيل المبيعات الإلكترونية */}
            <div className="bg-[#050908]/30 border border-white/5 rounded-2xl p-4 space-y-2 text-muted-foreground">
              <p className="text-[10px] font-bold text-primary mb-1 border-b border-white/5 pb-1">مبيعات الدفع الإلكتروني (فيزا/محافظ)</p>
              <div className="flex justify-between items-center text-[10px]">
                <span className="font-bold">{EGP(shiftTotals.visa)}</span>
                <span>فيزا / كارت:</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="font-bold">{EGP(shiftTotals.instapay)}</span>
                <span>انستا باي:</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="font-bold">{EGP(shiftTotals.vodafone)}</span>
                <span>فودافون كاش:</span>
              </div>
              <div className="flex justify-between items-center font-bold text-xs border-t border-white/5 pt-1.5 mt-1 text-foreground">
                <span>{EGP(shiftTotals.totalSales)}</span>
                <span>إجمالي مبيعات الوردية:</span>
              </div>
            </div>

            {/* مدخلات الكاشير */}
            <form onSubmit={handleCloseShift} className="space-y-4">
              <div className="space-y-2 text-start">
                <label className="text-[10px] font-bold text-muted-foreground pr-1 block text-right">
                  المبلغ الفعلي الموجود بالدرج حالياً (EGP)
                </label>
                <Input
                  type="number"
                  required
                  value={actualCashInput}
                  onChange={(e) => setActualCashInput(e.target.value)}
                  placeholder="أدخل المبلغ بعد عدّ النقدية"
                  className="bg-[#050908] border-white/5 rounded-2xl h-11 text-center font-black text-sm text-primary placeholder:text-muted-foreground/30 focus-visible:ring-primary/30"
                />
              </div>

              <div className="space-y-2 text-start">
                <label className="text-[10px] font-bold text-muted-foreground pr-1 block text-right">
                  ملاحظات التقفيل (اختياري)
                </label>
                <Input
                  value={closeNotesInput}
                  onChange={(e) => setCloseNotesInput(e.target.value)}
                  placeholder="عجز بسيط، فئات نقدية تالفة، إلخ"
                  className="bg-[#050908] border-white/5 rounded-2xl h-11 text-right text-xs"
                />
              </div>

              <DialogFooter className="mt-6 flex flex-row gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCloseShiftOpen(false)}
                  className="h-11 rounded-2xl font-bold text-xs"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={closeShiftSubmitting}
                  className="h-11 rounded-2xl font-black text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 flex-1"
                >
                  {closeShiftSubmitting ? (
                    <div className="h-4 w-4 border-2 border-destructive-foreground border-t-transparent animate-spin rounded-full mx-auto"></div>
                  ) : (
                    "تأكيد تقفيل الوردية وتسجيل الخروج"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * يحسب عدد الأعمدة وارتفاع الصف بحيث تظهر كل الأصناف داخل المساحة المتاحة
 * بدون أي سكرول، مهما كان حجم الشاشة.
 */
function packedRows(spans: { w: number; h: number }[], cols: number) {
  const occupied: boolean[][] = [];
  const cell = (r: number, c: number) => {
    while (occupied.length <= r) occupied.push(new Array(cols).fill(false));
    return occupied[r]![c]!;
  };
  let cursorRow = 0;
  let cursorCol = 0;
  let maxRow = 0;
  for (const s of spans) {
    const w = Math.min(cols, Math.max(1, s.w));
    const h = Math.max(1, s.h);
    let placed = false;
    let r = cursorRow;
    let c = cursorCol;
    while (!placed) {
      if (c + w > cols) {
        c = 0;
        r++;
        continue;
      }
      let free = true;
      for (let dr = 0; dr < h && free; dr++)
        for (let dc = 0; dc < w; dc++)
          if (cell(r + dr, c + dc)) {
            free = false;
            break;
          }
      if (free) {
        for (let dr = 0; dr < h; dr++)
          for (let dc = 0; dc < w; dc++) {
            cell(r + dr, c + dc);
            occupied[r + dr]![c + dc] = true;
          }
        maxRow = Math.max(maxRow, r + h);
        cursorRow = r;
        cursorCol = c + w;
        placed = true;
      } else {
        c++;
      }
    }
  }
  return Math.max(1, maxRow);
}

function useAutoFitGrid(ref: React.RefObject<HTMLDivElement | null>, items: Item[]) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const spans = items.map((i) => ({ w: Math.max(1, i.w), h: Math.max(1, i.h) }));
  const key = spans.map((s) => `${s.w}x${s.h}`).join(",");
  const maxW = spans.reduce((m, s) => Math.max(m, s.w), 1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry?.contentRect;
      if (r) setBox({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (el) setBox({ w: el.clientWidth, h: el.clientHeight });
  }, [ref, key]);

  return useMemo(() => {
    const gap = 10;
    const fallback = { cols: 4, rowHeight: 96 };
    if (!box.w || !box.h || !spans.length) return fallback;

    let best: { cols: number; rowHeight: number } | null = null;
    let bestScore = -1;

    for (let cols = maxW; cols <= 14; cols++) {
      const cellW = (box.w - gap * (cols - 1)) / cols;
      if (cellW < 56) break;
      const rows = packedRows(spans, cols);
      const cellH = (box.h - gap * (rows - 1)) / rows;
      if (cellH < 80) continue;
      const ratio = Math.min(cellW, cellH) / Math.max(cellW, cellH);
      const score = Math.min(cellW, cellH * 1.7) * (0.6 + 0.4 * ratio);
      if (score > bestScore) {
        bestScore = score;
        best = { cols, rowHeight: Math.floor(cellH) };
      }
    }

    if (!best) {
      // مساحة ضيقة جدًا: نختار أكبر عدد أعمدة ممكن ونصغّر الارتفاع لأقصى حد
      const cols = Math.max(maxW, Math.min(14, Math.floor((box.w + gap) / (56 + gap))) || maxW);
      const rows = packedRows(spans, cols);
      best = {
        cols,
        rowHeight: Math.max(80, Math.floor((box.h - gap * (rows - 1)) / rows)),
      };
    }
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.w, box.h, key, maxW]);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function GroupChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-bold transition-colors sm:px-4 sm:py-2.5 sm:text-sm",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function ModifiersDialog({
  item,
  onClose,
  onConfirm,
}: {
  item: Item | null;
  onClose: () => void;
  onConfirm: (item: Item, mods: Item["modifiers"]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <Dialog
      open={!!item}
      onOpenChange={(o) => {
        if (!o) {
          setSelected([]);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إضافات — {item?.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {item?.modifiers.map((m) => {
            const on = selected.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() =>
                  setSelected((p) => (on ? p.filter((x) => x !== m.id) : [...p, m.id]))
                }
                className={cn(
                  "flex items-center justify-between rounded-xl border-2 px-4 py-3 text-sm font-bold transition-colors",
                  on ? "border-primary bg-primary/15" : "border-border bg-secondary/40",
                )}
              >
                <span>{m.name}</span>
                <span className="text-primary">+ {EGP(m.price)}</span>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button
            className="w-full h-12 text-base font-extrabold"
            onClick={() => {
              if (!item) return;
              onConfirm(
                item,
                item.modifiers.filter((m) => selected.includes(m.id)),
              );
              setSelected([]);
            }}
          >
            إضافة للفاتورة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({
  open,
  total,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  total: number;
  onOpenChange: (o: boolean) => void;
  onConfirm: (m: PaymentMethod) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState("");
  const change = Math.max(0, (Number(received) || 0) - total);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تحصيل الفاتورة</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl bg-primary/15 px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">المطلوب</p>
          <p className="text-3xl font-black text-primary">{EGP(total)}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {PAYMENT_METHODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setMethod(p.id)}
              className={cn(
                "rounded-xl border-2 px-3 py-4 text-sm font-extrabold transition-colors",
                method === p.id
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border bg-secondary/40 text-muted-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {method === "cash" && (
          <div className="space-y-2">
            <Input
              type="number"
              inputMode="numeric"
              placeholder="المبلغ المدفوع"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              className="h-12 text-lg"
            />
            <div className="flex flex-wrap gap-2">
              {[50, 100, 200, 500].map((v) => (
                <Button
                  key={v}
                  variant="secondary"
                  size="sm"
                  onClick={() => setReceived(String((Number(received) || 0) + v))}
                >
                  +{v}
                </Button>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setReceived(total.toFixed(2))}>
                مبلغ مضبوط
              </Button>
            </div>
            <p className="text-sm font-bold">
              الباقي: <span className="text-primary">{EGP(change)}</span>
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            className="h-12 w-full text-base font-extrabold"
            onClick={() => {
              onConfirm(method);
              setReceived("");
            }}
          >
            تأكيد الدفع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
