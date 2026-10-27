import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { User } from '../types';
import { getSupabaseClient } from './supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configurationError: string | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
};

const AuthContext = createContext<AuthState | null>(null);

function toUser(profile: Record<string, unknown>, email: string): User {
  return {
    id: String(profile.id),
    name: String(profile.full_name || 'Usuario Nave.Plan'),
    email,
    role: profile.role as User['role'],
    team_id: profile.team_id ? String(profile.team_id) : undefined,
    staff_member_id: profile.staff_member_id ? String(profile.staff_member_id) : undefined,
    branch: String(profile.branch || 'Nave.Plan'),
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState<string | null>(null);

  const hydrateProfile = async (activeSession: Session | null) => {
    if (!activeSession) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/session', {
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
      });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.profile) {
        setUser(null);
        setConfigurationError(payload.message || 'Tu cuenta todavía no tiene un perfil operativo asignado.');
        return;
      }
      setConfigurationError(null);
      setUser(toUser(payload.profile, activeSession.user.email || ''));
    } catch {
      setUser(null);
      setConfigurationError('No se pudo validar el perfil de acceso. Intentá nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    void getSupabaseClient().then(supabase => {
      if (!supabase) {
      setConfigurationError('Falta configurar la conexión pública de Supabase en Vercel.');
      setLoading(false);
      return;
      }

      supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void hydrateProfile(data.session);
      });

      const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(true);
      void hydrateProfile(nextSession);
      });
      subscription = listener.subscription;
    });
    return () => subscription?.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(() => ({
    session,
    user,
    loading,
    configurationError,
    signIn: async (email, password) => {
      const supabase = await getSupabaseClient();
      if (!supabase) return { error: 'La conexión de acceso no está configurada.' };
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return error ? { error: error.message } : {};
    },
    signOut: async () => { await (await getSupabaseClient())?.auth.signOut(); },
    resetPassword: async email => {
      const supabase = await getSupabaseClient();
      if (!supabase) return { error: 'La conexión de acceso no está configurada.' };
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/`,
      });
      return error ? { error: error.message } : {};
    },
  }), [session, user, loading, configurationError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe utilizarse dentro de AuthProvider.');
  return context;
}
