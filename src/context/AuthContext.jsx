import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import { getMyRole, getSession } from "../lib/auth";
import { provisionClientFromPendingMetadata } from "../lib/provisionClientSignup";
import { acceptPendingInvitation } from "../lib/inviteHelpers";
import { AuthContext } from "./authContext.js";

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
  /** Bumps after signup provisioning runs so ClientLayout can refetch contact. */
  const [provisionVersion, setProvisionVersion] = useState(0);
  /** User id we last ran provision + loadRole for (avoids iframe/tab duplicate auth events). */
  const lastProvisionedUserIdRef = useRef(null);

  const runInvitationAccept = useCallback(async (user) => {
    if (!user?.id) return;
    try {
      await acceptPendingInvitation();
    } catch (e) {
      const raw = e?.message ?? String(e);
      setState((s) => ({ ...s, signupProvisionError: raw }));
    }
  }, []);

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
        const session = await getSession();
        const user = session?.user ?? null;
        if (!mounted) return;
        // Mark auth ready before provisioning so magic-link landings never spin forever if DB/RPC is slow.
        setState((s) => ({ ...s, initializing: false, session, user }));
        await runInvitationAccept(user);
        await runSignupProvision(user);
        await loadRole(user);
        lastProvisionedUserIdRef.current = user?.id ?? null;
        setProvisionVersion((n) => n + 1);
      } catch (e) {
        if (!mounted) return;
        const raw = e?.message ?? String(e);
        setState((s) => ({ ...s, initializing: false, user: null, session: null, role: null, error: raw }));
      }
    }

    init();

    // Sync handler only — async work must not run inside this callback (Supabase holds an auth lock here;
    // awaiting getSession/loadRole deadlocks or breaks SIGNED_OUT). See GoTrueClient.onAuthStateChange docs.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Tab refocus / background refresh emits TOKEN_REFRESHED with a new access token but same user.
      // Running the full path cleared role, set roleLoading, and bumped provisionVersion → ClientLayout
      // showed "Loading…" and refetched client for several seconds. Identity did not change.
      if (event === "TOKEN_REFRESHED") {
        setState((s) => ({
          ...s,
          session,
          initializing: false,
          user: session?.user ?? s.user,
          error: null,
        }));
        return;
      }

      if (event === "PASSWORD_RECOVERY") {
        const user = session?.user ?? null;
        setState((s) => ({ ...s, initializing: false, session, user, error: null }));
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/reset-password")) {
          window.location.replace("/reset-password");
        }
        return;
      }

      const user = session?.user ?? null;
      const userId = user?.id ?? null;

      if (!userId) {
        lastProvisionedUserIdRef.current = null;
        setState((s) => ({
          ...s,
          initializing: false,
          session,
          user: null,
          role: null,
          roleLoading: false,
          error: null,
        }));
        queueMicrotask(() => {
          void (async () => {
            await runInvitationAccept(null);
            await runSignupProvision(null);
            await loadRole(null);
            setProvisionVersion((n) => n + 1);
          })();
        });
        return;
      }

      // Same user as last provision (e.g. INITIAL_SESSION from publish-preview iframe) — update session only.
      if (userId === lastProvisionedUserIdRef.current) {
        setState((s) => ({
          ...s,
          initializing: false,
          session,
          user,
          error: null,
        }));
        return;
      }

      lastProvisionedUserIdRef.current = userId;
      setState((s) => ({
        ...s,
        initializing: false,
        session,
        user,
        role: null,
        roleLoading: true,
        error: null,
      }));
      queueMicrotask(() => {
        void (async () => {
          await runInvitationAccept(user);
          await runSignupProvision(user);
          await loadRole(user);
          setProvisionVersion((n) => n + 1);
        })();
      });
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [loadRole, runInvitationAccept, runSignupProvision]);

  const clearSignupProvisionError = useCallback(() => {
    setState((s) => ({ ...s, signupProvisionError: null }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      provisionVersion,
      isAuthed: !!state.user,
      isAdmin: state.role === "admin",
      reloadRole: () => loadRole(state.user),
      clearSignupProvisionError,
    }),
    [clearSignupProvisionError, loadRole, provisionVersion, state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
