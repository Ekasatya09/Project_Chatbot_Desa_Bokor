import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { api, ApiError, AdminData } from '@/api/client';

interface AuthContextValue {
  admin: AdminData | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((res) => setAdmin(res.admin))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setAdmin(null);
        } else {
          console.warn('Gagal memuat sesi:', err);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password);
    setAdmin(res.admin);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setAdmin(null);
    }
  }, []);

  const value = useMemo(
    () => ({ admin, loading, login, logout }),
    [admin, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  }
  return ctx;
}
