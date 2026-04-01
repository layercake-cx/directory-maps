import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import { getMyRole } from "../lib/auth";

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    initializing: true,
    user: null,
    session: null,
    role: null,
    roleLoading: false,
    error: null,
  });

  const loadRole = useCallback(async (user) => {
    if (!user) {
      setState((s) => ({ ...s, role: null, roleLoading: false, error: null }));
      return;
    }

    setState((s) => ({ ...s, roleLoading: true, error: null }));
    try {
      const role = await getMyRole();
      setState((s) => ({ ...s, role, roleLoading: false, error: null }));
    } catch (e) {
      const raw = e?.message ?? String(e);
      setState((s) => ({ ...s, role: null, roleLoading: false, error: raw }));
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!hasSupabaseConfig) {
        setState((s) => ({ ...s, initializing: false, user: null, session: null, role: null }));
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session ?? null;
        const user = session?.user ?? null;
        if (!mounted) return;
        setState((s) => ({ ...s, initializing: false, session, user }));
        await loadRole(user);
      } catch (e) {
        if (!mounted) return;
        const raw = e?.message ?? String(e);
        setState((s) => ({ ...s, initializing: false, user: null, session: null, role: null, error: raw }));
      }
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // NOTE: We rely on session.user for "is user signed in" decisions to avoid extra auth round-trips.
      // Also clear role immediately to avoid brief "previous user role" flicker.
      const user = session?.user ?? null;
      setState((s) => ({
        ...s,
        session,
        user,
        role: null,
        roleLoading: !!user,
        error: null,
      }));
      await loadRole(user);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [loadRole]);

  const value = useMemo(
    () => ({
      ...state,
      isAuthed: !!state.user,
      isAdmin: state.role === "admin",
      reloadRole: () => loadRole(state.user),
    }),
    [loadRole, state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

