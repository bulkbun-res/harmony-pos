import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSessionUserFn, loginFn, logoutFn } from "./auth.functions";
import type { AuthenticatedUser } from "./auth.server";

interface AuthContextType {
  user: AuthenticatedUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<AuthenticatedUser>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const getSessionUser = useServerFn(getSessionUserFn);
  const loginServer = useServerFn(loginFn);
  const logoutServer = useServerFn(logoutFn);

  const checkSession = useCallback(async () => {
    try {
      const u = await getSessionUser({});
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [getSessionUser]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const login = async (username: string, password: string) => {
    const u = await loginServer({ data: { username, password } });
    setUser(u);
    return u;
  };

  const logout = async () => {
    await logoutServer({});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
