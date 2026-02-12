'use client';

import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;

  setAuth: (user: User, tenant: Tenant, tokens: { accessToken: string; refreshToken: string }) => void;
  clearAuth: () => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tenant: null,
  isAuthenticated: false,

  setAuth: (user, tenant, tokens) => {
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('tenant', JSON.stringify(tenant));
    set({ user, tenant, isAuthenticated: true });
  },

  clearAuth: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('tenant');
    set({ user: null, tenant: null, isAuthenticated: false });
  },

  loadFromStorage: () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      const tenant = JSON.parse(localStorage.getItem('tenant') || 'null');
      const token = localStorage.getItem('accessToken');
      if (user && tenant && token) {
        set({ user, tenant, isAuthenticated: true });
      }
    } catch {
      // Invalid stored data
    }
  },
}));
