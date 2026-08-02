import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Circle, Move, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";

import { PosHeader } from "@/components/pos/PosHeader";
import { ItemTile } from "@/components/pos/ItemTile";
import { Button } from "@/components/ui/button";
import { usePos } from "@/lib/pos-store";
import { TILE_COLORS, type TileColor } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/layout")({
  head: () => ({
    meta: [
      { title: "تصميم شاشة الكاشير | Bulk Bun POS" },
      {
        name: "description",
        content: "اسحب وكبّر وغيّر شكل ولون مربعات الأصناف بالماوس أو شاشة اللمس.",
      },
      { property: "og:title", content: "تصميم شاشة الكاشير | Bulk Bun POS" },
      { property: "og:description", content: "توزيع وتحجيم مربعات الأصناف بسهولة." },
    ],
  }),
  component: LayoutDesigner,
});

function LayoutDesigner() {
  const { state, updateItem, reorderItem, resetAll } = usePos();
  const groups = [...state.groups].sort((a, b) => a.order - b.order);
  const [activeGroup, setActiveGroup] = useState<string>(groups[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const items = useMemo(
    () =>
      state.items
        .filter((i) => i.groupId === (activeGroup || groups[0]?.id))
        .sort((a, b) => a.order - b.order),
    [state.items, activeGroup, groups],
  );

  const selected = state.items.find((i) => i.id === selectedId) ?? null;

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragId.current) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el?.closest<HTMLElement>("[data-tile-id]");
    const overId = target?.dataset["tileId"];
    if (overId && overId !== dragId.current) {
      reorderItem(activeGroup || groups[0]!.id, dragId.current, overId);
    }
  };

  const endDrag = () => {
    dragId.current = null;
    setDragging(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PosHeader />

      <div className="flex flex-1 flex-col gap-3 p-3 lg:flex-row lg:p-4">
        <main className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
            <p className="font-extrabold text-primary">وضع التصميم المباشر</p>
            <p className="text-muted-foreground">
              اضغط على أي مربع لتحديده، اسحبه بإصبعك أو بالماوس لتغيير مكانه، ثم غيّر حجمه أو شكله
              أو لونه من اللوحة الجانبية.
            </p>
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setActiveGroup(g.id)}
                className={cn(
                  "shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors",
                  (activeGroup || groups[0]?.id) === g.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {g.name}
              </button>
            ))}
          </div>

          <div
            className="grid auto-rows-[6.5rem] grid-cols-3 gap-3 rounded-2xl border border-dashed border-border p-3 sm:grid-cols-4 xl:grid-cols-5"
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
          >
            {items.map((item) => (
              <div
                key={item.id}
                data-tile-id={item.id}
                style={{ gridColumn: `span ${item.w}`, gridRow: `span ${item.h}` }}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  dragId.current = item.id;
                  setDragging(item.id);
                  setSelectedId(item.id);
                }}
                className={cn(
                  "relative cursor-grab touch-none transition-transform",
                  dragging === item.id && "z-10 scale-105 cursor-grabbing",
                )}
              >
                <ItemTile
                  item={item}
                  interactive={false}
                  selected={selectedId === item.id}
                  className="pointer-events-none h-full w-full"
                />
                {selectedId === item.id && (
                  <span className="pointer-events-none absolute top-1 end-1 grid h-6 w-6 place-items-center rounded-full bg-background/80 text-primary">
                    <Move className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
            ))}
            {items.length === 0 && (
              <p className="col-span-full py-16 text-center text-muted-foreground">
                لا توجد أصناف في هذه المجموعة.
              </p>
            )}
          </div>
        </main>

        <aside className="w-full shrink-0 space-y-4 rounded-2xl border border-border bg-card p-4 lg:sticky lg:top-20 lg:h-fit lg:w-[20rem]">
          <h2 className="text-base font-extrabold">خصائص المربع</h2>

          {!selected && (
            <p className="rounded-xl bg-secondary/50 p-4 text-sm text-muted-foreground">
              اختر مربع صنف من الشاشة لتعديل حجمه وشكله ولونه.
            </p>
          )}

          {selected && (
            <div className="space-y-4">
              <p className="rounded-xl bg-secondary/50 px-3 py-2 text-sm font-bold">
                {selected.name}
              </p>

              <Field label="العرض">
                <Stepper
                  value={selected.w}
                  min={1}
                  max={3}
                  onChange={(w) => updateItem(selected.id, { w })}
                />
              </Field>

              <Field label="الارتفاع">
                <Stepper
                  value={selected.h}
                  min={1}
                  max={3}
                  onChange={(h) => updateItem(selected.id, { h })}
                />
              </Field>

              <Field label="الشكل">
                <div className="grid grid-cols-2 gap-2">
                  <ShapeBtn
                    active={selected.shape === "square"}
                    onClick={() => updateItem(selected.id, { shape: "square" })}
                    icon={<Square className="h-4 w-4" />}
                    label="مربع"
                  />
                  <ShapeBtn
                    active={selected.shape === "circle"}
                    onClick={() => updateItem(selected.id, { shape: "circle" })}
                    icon={<Circle className="h-4 w-4" />}
                    label="دائرة"
                  />
                </div>
              </Field>

              <Field label="اللون">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(TILE_COLORS) as TileColor[]).map((c) => (
                    <button
                      key={c}
                      title={TILE_COLORS[c].label}
                      onClick={() => updateItem(selected.id, { color: c })}
                      style={{ background: TILE_COLORS[c].css }}
                      className={cn(
                        "h-9 w-9 rounded-full border-2 transition-transform",
                        selected.color === c
                          ? "scale-110 border-foreground"
                          : "border-transparent hover:scale-105",
                      )}
                    />
                  ))}
                </div>
              </Field>

              <Field label="أحجام سريعة">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "صغير", w: 1, h: 1 },
                    { label: "عريض", w: 2, h: 1 },
                    { label: "كبير", w: 2, h: 2 },
                  ].map((p) => (
                    <Button
                      key={p.label}
                      variant="secondary"
                      size="sm"
                      onClick={() => updateItem(selected.id, { w: p.w, h: p.h })}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </Field>
            </div>
          )}

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              resetAll();
              setSelectedId(null);
              toast.success("تمت استعادة التصميم الافتراضي");
            }}
          >
            <RotateCcw className="h-4 w-4" /> استعادة الافتراضي
          </Button>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
      >
        −
      </Button>
      <span className="w-10 text-center text-lg font-extrabold">{value}</span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
      >
        +
      </Button>
    </div>
  );
}

function ShapeBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-sm font-bold transition-colors",
        active ? "border-primary bg-primary/15" : "border-border bg-secondary/40",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
