import { Link, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  History,
  LayoutGrid,
  QrCode,
  Settings,
  ShoppingBag,
  ShieldAlert,
} from "lucide-react";
import logo from "@/assets/bulk-bun-logo.jpeg";
import { useOnlineAlerts } from "@/lib/use-online-orders";
import { useAuth } from "@/lib/use-auth";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/admin", label: "لوحة المدير", icon: ShieldAlert, adminOnly: true },
  { to: "/", label: "الكاشير", icon: ShoppingBag, adminOnly: false },
  { to: "/online", label: "طلبات المنيو", icon: QrCode, adminOnly: false },
  { to: "/orders", label: "الفواتير", icon: History, adminOnly: false },
  { to: "/inventory", label: "المخزن", icon: Boxes, adminOnly: true },
  { to: "/layout", label: "تصميم الشاشة", icon: LayoutGrid, adminOnly: true },
  { to: "/settings", label: "الإعدادات", icon: Settings, adminOnly: true },
] as const;

export function PosHeader({ right }: { right?: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pendingOnline = useOnlineAlerts();
  const { user } = useAuth();

  const filteredNav = NAV.filter((item) => {
    if (item.adminOnly && user?.role !== "admin") return false;
    return true;
  });

  return (
    <header className="sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/5 bg-sidebar/95 px-3 py-2 backdrop-blur sm:flex sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <img
          src={logo}
          alt="شعار Bulk Bun"
          className="h-11 w-11 shrink-0 rounded-xl object-cover ring-2 ring-primary/40"
        />
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold leading-tight brand-gradient-text">
            BULK BUN
          </p>
          <p className="truncate text-[11px] text-muted-foreground">نظام نقاط البيع</p>
        </div>
      </div>

      <nav className="flex items-center gap-1.5">
        {filteredNav.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
              {to === "/online" && pendingOnline > 0 && (
                <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-black text-destructive-foreground">
                  {pendingOnline}
                </span>
              )}
            </Link>
          );
        })}
        {right}
      </nav>
    </header>
  );
}
