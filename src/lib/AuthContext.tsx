'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Role } from '@/types';
import { getInitData, initTelegramWebApp } from '@/lib/telegramWebApp';

interface AuthUser {
  id: string;
  telegramId: string;
  username?: string | null;
  role: Role;
  fullName: string;
  phone?: string | null;
  barberProfileId?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isNewUser: boolean;
  error: string | null;
  isAuthenticated: boolean;
  refreshAuth: () => Promise<void>;
  setAuthUser: (user: AuthUser) => void;
  clearNewUserFlag: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isNewUser: false,
  error: null,
  isAuthenticated: false,
  refreshAuth: async () => {},
  setAuthUser: () => {},
  clearNewUserFlag: () => {},
  clearError: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncAuth = useCallback(async () => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 4000); // 4-second safety timeout limit

    try {
      // 1. Mandatory Telegram WebApp Ready & Expand call
      initTelegramWebApp();

      // 2. Get the signed initData string. Identity is verified server-side.
      const initData = getInitData();

      // Opened outside Telegram (no signed initData).
      // Allowed only in development for local testing; blocked in production.
      if (!initData) {
        clearTimeout(timeoutId);
        if (process.env.NODE_ENV !== 'production') {
          const savedDevUser = typeof window !== 'undefined'
            ? localStorage.getItem('barberim_dev_user')
            : null;
          if (savedDevUser) {
            try {
              setUser(JSON.parse(savedDevUser));
              setIsNewUser(false);
            } catch {
              setIsNewUser(true);
            }
          } else {
            setIsNewUser(true);
          }
        } else {
          setError('Iltimos, ilovani Telegram orqali oching.');
        }
        return;
      }

      // 3. Verify identity server-side using the signed initData.
      const res = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Auth sync failed on server');
      }

      if (data.isNewUser) {
        setIsNewUser(true);
        setUser(null);
      } else if (data.user) {
        const authUser: AuthUser = {
          id: data.user.id,
          telegramId: data.user.telegramId,
          username: data.user.username,
          role: data.user.role,
          fullName: data.user.fullName,
          phone: data.user.phone,
          barberProfileId: data.user.barberProfileId || null,
        };
        setUser(authUser);
        setIsNewUser(false);

        if (typeof window !== 'undefined') {
          localStorage.setItem('barberim_dev_user', JSON.stringify(authUser));
        }
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('⚡ Auth sync error/timeout:', err);

      if (err.name === 'AbortError') {
        setError('Request timeout (4s exceeded)');
      } else {
        setError(err.message || 'Network or database error');
      }

      // Dev fallback backup check
      const savedDevUser = typeof window !== 'undefined'
        ? localStorage.getItem('barberim_dev_user')
        : null;

      if (savedDevUser && !user) {
        try {
          setUser(JSON.parse(savedDevUser));
          setIsNewUser(false);
          setError(null); // recovered using cached dev user
        } catch {
          // Keep error state for retry UI
        }
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    syncAuth();
  }, [syncAuth]);

  const refreshAuth = useCallback(async () => {
    await syncAuth();
  }, [syncAuth]);

  const setAuthUser = useCallback((newUser: AuthUser) => {
    setUser(newUser);
    setIsNewUser(false);
    setError(null);
    if (typeof window !== 'undefined') {
      localStorage.setItem('barberim_dev_user', JSON.stringify(newUser));
    }
  }, []);

  const clearNewUserFlag = useCallback(() => {
    setIsNewUser(false);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isNewUser,
        error,
        isAuthenticated: !!user,
        refreshAuth,
        setAuthUser,
        clearNewUserFlag,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
