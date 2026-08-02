import { cn } from "@/lib/utils";
import { EGP, TILE_COLORS, type Item } from "@/lib/pos-types";

interface Props {
  item: Item;
  selected?: boolean;
  dimmed?: boolean;
  badge?: number | undefined;
  onClick?: () => void;
  className?: string;
  interactive?: boolean;
}

export function ItemTile({
  item,
  selected,
  dimmed,
  badge,
  onClick,
  className,
  interactive = true,
}: Props) {
  const color = TILE_COLORS[item.color].css;
  const disabled = !item.available;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && interactive}
      style={{
        gridColumn: `span ${item.w}`,
        gridRow: `span ${item.h}`,
        backgroundImage: disabled
          ? undefined
          : `linear-gradient(150deg, color-mix(in oklab, ${color} 88%, transparent), color-mix(in oklab, ${color} 45%, var(--card)))`,
        borderColor: selected ? "var(--primary)" : `color-mix(in oklab, ${color} 45%, transparent)`,
      }}
      className={cn(
        "tile-surface group relative flex select-none flex-col items-center justify-center gap-1 overflow-hidden border-2 p-1.5 text-center transition-all duration-200",
        item.shape === "circle" ? "rounded-full" : "rounded-2xl",
        disabled && "bg-muted/40 opacity-45 grayscale",
        selected && "ring-4 ring-primary/60 ring-offset-2 ring-offset-background",
        dimmed && "opacity-30",
        interactive && !disabled && "active:scale-[0.97] hover:brightness-110",
        className,
      )}
    >
      {badge ? (
        <span className="absolute top-2 start-2 grid h-7 min-w-7 place-items-center rounded-full bg-background/85 px-1.5 text-xs font-bold text-primary">
          {badge}
        </span>
      ) : null}

      <span
        className={cn(
          "line-clamp-2 w-full shrink-0 px-1 font-bold leading-tight text-primary-foreground drop-shadow-sm",
          item.w > 1 || item.h > 1
            ? "text-[clamp(0.8rem,1.4vw,1.15rem)]"
            : "text-[clamp(0.65rem,1vw,0.95rem)]",
        )}
      >
        {item.name}
      </span>
      <span className="shrink-0 rounded-full bg-background/70 px-2 py-0.5 text-[clamp(0.6rem,0.85vw,0.8rem)] font-extrabold text-foreground">
        {EGP(item.price)}
      </span>
      {disabled && (
        <span className="absolute inset-x-0 bottom-0 bg-destructive/85 py-0.5 text-[11px] font-bold text-destructive-foreground">
          غير متاح
        </span>
      )}
    </button>
  );
}
