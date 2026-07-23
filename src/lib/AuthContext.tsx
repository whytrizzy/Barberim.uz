'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Role, UserType } from '@/types';
import { getTelegramUser, initTelegramWebApp } from '@/lib/telegramWebApp';

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
  isAuthenticated: boolean;
  refreshAuth: () => Promise<void>;
  setAuthUser: (user: AuthUser) => void;
  clearNewUserFlag: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isNewUser: false,
  isAuthenticated: false,
  refreshAuth: async () => {},
  setAuthUser: () => {},
  clearNewUserFlag: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);

  const syncAuth = useCallback(async () => {
    setLoading(true);
    try {
      initTelegramWebApp();

      const tgUser = getTelegramUser();
      const telegramId = tgUser?.id || null;
      const fullName = tgUser?.first_name
        ? `${tgUser.first_name} ${tgUser.last_name || ''}`.trim()
        : null;
      const username = tgUser?.username || null;

      if (!telegramId) {
        // Development fallback — no Telegram context available
        // Check localStorage for dev user state
        const savedDevUser = typeof window !== 'undefined'
          ? localStorage.getItem('barberim_dev_user')
          : null;

        if (savedDevUser) {
          try {
            const parsed = JSON.parse(savedDevUser);
            setUser(parsed);
            setIsNewUser(false);
          } catch {
            setIsNewUser(true);
          }
        } else {
          setIsNewUser(true);
        }
        setLoading(false);
        return;
      }

      // Call /api/auth/sync with Telegram user data
      const res = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId, fullName, username }),
      });

      const data = await res.json();

      if (data.success && !data.isNewUser && data.user) {
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

        // Save to localStorage as dev backup
        if (typeof window !== 'undefined') {
          localStorage.setItem('barberim_dev_user', JSON.stringify(authUser));
        }
      } else {
        // New user — needs onboarding
        setIsNewUser(true);
        setUser(null);
      }
    } catch (err) {
      console.error('Auth sync failed:', err);
      // On error, check localStorage dev fallback
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
    } finally {
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
    if (typeof window !== 'undefined') {
      localStorage.setItem('barberim_dev_user', JSON.stringify(newUser));
    }
  }, []);

  const clearNewUserFlag = useCallback(() => {
    setIsNewUser(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isNewUser,
        isAuthenticated: !!user,
        refreshAuth,
        setAuthUser,
        clearNewUserFlag,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
