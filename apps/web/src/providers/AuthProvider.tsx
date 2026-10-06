"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@/lib/api";
import { getStoredToken, setStoredToken } from "@/lib/auth-storage";
import type { HubInfo, User } from "@/lib/types";

type AuthContextValue = {
  token: string | null;
  user: User | null;
  hub: HubInfo | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [hub, setHub] = useState<HubInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const tkn = getStoredToken();
    if (!tkn) {
      setToken(null);
      setUser(null);
      return;
    }
    setToken(tkn);
    const me = await api.me(tkn);
    setUser(me);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const info = await api.hub();
        setHub(info);
        await refreshUser();
      } catch {
        setHub(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshUser]);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await api.login(username, password);
      setStoredToken(res.access_token);
      setToken(res.access_token);
      const me = await api.me(res.access_token);
      setUser(me);
      // Full navigation so auth shell re-initializes reliably (incl. mobile WebViews / e2e).
      window.location.assign("/");
    },
    [],
  );

  const logout = useCallback(async () => {
    const tkn = getStoredToken();
    if (tkn) {
      try {
        await api.logout(tkn);
      } catch {
        /* ignore */
      }
    }
    setStoredToken(null);
    setToken(null);
    setUser(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({ token, user, hub, loading, login, logout, refreshUser }),
    [token, user, hub, loading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
