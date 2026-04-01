import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import { getMyRole } from "../lib/auth";
import { provisionClientFromPendingMetadata } from "../lib/provisionClientSignup";

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
    signupProvisionError: null,
  });

  const runSignupProvision = useCallback(async (user) => {
    if (!user) {
      setState((s) => ({ ...s, signupProvisionError: null }));
      return;
    }
    try {
      const result = await provisionClientFromPendingMetadata(user);
      if (result?.ok === false && result?.message) {
        setState((s) => ({ ...s, signupProvisionError: result.message }));
      } else {
        setState((s) => ({ ...s, signupProvisionError: null }));
      }
    } catch (e) {
      const raw = e?.message ?? String(e);
      setState((s) => ({ ...s, signupProvisionError: raw }));
    }
  }, []);

  const loadRole = useCallback(async (user) => {
    if (!user) {
      setState((s) => ({ ...s, role: null, roleLoading: false, error: null, signupProvisionError: null }));
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
        setState((s) => ({
          ...s,
          initializing: false,
          user: null,
          session: null,
          role: null,
          signupProvisionError: null,
        }));
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session ?? null;
        const user = session?.user ?? null;
        if (!mounted) return;
        await runSignupProvision(user);
        await loadRole(user);
        if (!mounted) return;
        setState((s) => ({ ...s, initializing: false, session, user }));
      } catch (e) {
        if (!mounted) return;
        const raw = e?.message ?? String(e);
        setState((s) => ({ ...s, initializing: false, user: null, session: null, role: null, error: raw }));
      }
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // NOTE: Provision org/contact before exposing user to routes so /client never loads without a contact.
      const user = session?.user ?? null;
      await runSignupProvision(user);
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
  }, [loadRole, runSignupProvision]);

  const clearSignupProvisionError = useCallback(() => {
    setState((s) => ({ ...s, signupProvisionError: null }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      isAuthed: !!state.user,
      isAdmin: state.role === "admin",
      reloadRole: () => loadRole(state.user),
      clearSignupProvisionError,
    }),
    [clearSignupProvisionError, loadRole, state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

