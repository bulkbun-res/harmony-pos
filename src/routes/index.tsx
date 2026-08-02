import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Minus, Plus, Printer, Trash2, X } from "lucide-react";
import { toast } from "sonner";

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
      { name: "description", content: "شاشة البيع السريعة: اختر الأصناف وأنشئ الفاتورة وحصّل الدفع." },
      { property: "og:title", content: "شاشة الكاشير | Bulk Bun POS" },
      { property: "og:description", content: "شاشة البيع السريعة لمطعم Bulk Bun." },
    ],
  }),
  component: PosScreen,
});

function PosScreen() {
  const { state, saveOrder } = usePos();
  const navigate = useNavigate();
  const { order: editId } = Route.useSearch();
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
    const key = mods.map((m) => m.id).sort().join("|");
    setLines((prev) => {
      const existing = prev.find(
        (l) => l.itemId === item.id && (l.modifiers || []).map((m) => m.id).sort().join("|") === key,
      );
      if (existing) {
        return prev.map((l) =>
          l.lineId === existing.lineId ? { ...l, qty: l.qty + 1 } : l,
        );
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
    setLines([]);
    setDiscount(0);
    setPayOpen(false);
    setEditing(null);
    if (editId) void navigate({ to: "/", search: {} });
  };

  const cancelEditing = () => {
    setLines([]);
    setDiscount(0);
    setEditing(null);
    void navigate({ to: "/", search: {} });
  };

  const gridRef = useRef<HTMLDivElement>(null);
  const fit = useAutoFitGrid(gridRef, items);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <PosHeader />

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
            className="grid min-h-0 flex-1 gap-[10px] overflow-hidden"
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
                onClick={() => window.print()}
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
      if (cellH < 44) continue;
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
        rowHeight: Math.max(40, Math.floor((box.h - gap * (rows - 1)) / rows)),
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
