import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Lock, User } from "lucide-react";
import { toast } from "sonner";

import logo from "@/assets/bulk-bun-logo.jpeg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "تسجيل دخول لوحة المدير | Bulk Bun POS" },
      { name: "description", content: "سجل الدخول كمدير للوصول للوحة المتابعة والتقارير المالية." },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const { user, loading, login, logout } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if (user.role === "admin") {
        void navigate({ to: "/admin" });
      } else {
        toast.error("غير مصرح لك بدخول لوحة الإدارة");
        void logout();
      }
    }
  }, [user, loading, navigate, logout]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error("برجاء إدخال اسم المستخدم وكلمة المرور");
      return;
    }

    setSubmitting(true);
    try {
      const u = await login(username, password);
      if (u.role === "admin") {
        toast.success(`أهلاً بك يا ${u.name}`);
        void navigate({ to: "/admin" });
      } else {
        toast.error("هذا الحساب ليس له صلاحيات الإدارة");
        await logout();
      }
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "فشل تسجيل الدخول");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto"></div>
          <p className="text-sm text-muted-foreground font-bold">جاري التحقق من الجلسة...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050b09] px-4 relative overflow-hidden">
      {/* خلفية جمالية بلون أخضر زمردي عميق للإدارة */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[130px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[130px] pointer-events-none"></div>

      <div className="w-full max-w-md space-y-6 rounded-3xl border border-white/5 bg-[#0b1411]/55 p-6 sm:p-8 backdrop-blur-xl shadow-2xl relative z-10">
        <div className="text-center space-y-3">
          <img
            src={logo}
            alt="Bulk Bun Logo"
            className="h-20 w-20 rounded-2xl object-cover ring-4 ring-primary/45 mx-auto shadow-lg"
          />
          <div>
            <h1 className="text-2xl font-black tracking-tight brand-gradient-text">لوحة المدير</h1>
            <p className="text-xs text-muted-foreground mt-1">سجل الدخول للتحليلات وإدارة الحسابات</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5 relative">
            <label className="text-xs font-bold text-muted-foreground mr-1">اسم مستخدم المدير</label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="اسم المستخدم"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-12 pr-10 bg-background/50 border-white/10 focus:border-primary/50 rounded-xl text-sm"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-1.5 relative">
            <label className="text-xs font-bold text-muted-foreground mr-1">كلمة المرور</label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="كلمة المرور"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 pr-10 bg-background/50 border-white/10 focus:border-primary/50 rounded-xl text-sm"
                disabled={submitting}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-base font-extrabold mt-6 bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg shadow-primary/20 rounded-xl transition-all"
            disabled={submitting}
          >
            {submitting ? "جاري الدخول لوحة المدير..." : "دخول لوحة المدير"}
          </Button>
        </form>

        <div className="text-center pt-2">
          <button
            onClick={() => void navigate({ to: "/login" })}
            className="text-xs text-muted-foreground hover:text-primary transition-colors font-bold"
          >
            الذهاب لشاشة كاشير نقطة البيع
          </button>
        </div>
      </div>
    </div>
  );
}
