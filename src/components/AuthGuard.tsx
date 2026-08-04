import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/use-auth";

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: Array<"admin" | "cashier">;
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        const isAdminPath = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
        void navigate({ to: isAdminPath ? "/admin/login" : "/login" });
      } else if (allowedRoles && !allowedRoles.includes(user.role)) {
        if (user.role === "admin") {
          void navigate({ to: "/admin" });
        } else {
          void navigate({ to: "/" });
        }
      }
    }
  }, [user, loading, navigate, allowedRoles]);

  if (loading || !user || (allowedRoles && !allowedRoles.includes(user.role))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto"></div>
          <p className="text-sm text-muted-foreground font-bold">جاري التحقق من الصلاحيات...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
