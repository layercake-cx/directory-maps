import React, { useEffect, useState } from "react";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import { getMyRole, signOut } from "../lib/auth";

function isNetworkError(e) {
  const msg = (e?.message ?? String(e)).toLowerCase();
  return msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch") || msg.includes("networkerror");
}

function networkErrorHelp() {
  return (
    <>
      Check: (1) <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> are set in your .env (or
      Vercel env for this environment) and point to your Supabase project. (2) The Supabase project is not paused. (3)
      If you’re on a preview URL, add the same env vars to the Preview environment in Vercel.
    </>
  );
}

export default function AdminGate({ children }) {
  const [state, setState] = useState({
    loading: true,
    authed: false,
    isAdmin: false,
    error: "",
    errorDetail: null,
  });

  useEffect(() => {
    let mounted = true;
    const timeoutMs = 15000;

    async function run(isInitial) {
      try {
        if (isInitial) {
          setState((s) => ({ ...s, loading: true, error: "", errorDetail: null }));
        }

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Session check timed out. Check network and Supabase configuration.")), timeoutMs)
        );
        const work = (async () => {
          const { data } = await supabase.auth.getUser();
          const user = data?.user;
          if (!user) return { user: null, role: null };
          const role = await getMyRole();
          return { user, role };
        })();
        const { user, role } = await Promise.race([work, timeoutPromise]);

        if (!mounted) return;
        if (!user) {
          setState({ loading: false, authed: false, isAdmin: false, error: "", errorDetail: null });
          return;
        }
        setState({
          loading: false,
          authed: true,
          isAdmin: role === "admin",
          error: "",
          errorDetail: null,
        });
      } catch (e) {
        if (mounted) {
          const raw = e?.message ?? String(e);
          setState({
            loading: false,
            authed: false,
            isAdmin: false,
            error: isNetworkError(e) ? "Network error connecting to Supabase." : raw,
            errorDetail: isNetworkError(e) ? raw : null,
          });
        }
      }
    }

    run(true);
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      run(false);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  async function doSignOut() {
    try {
      await signOut();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }

  if (state.loading) return <div style={{ padding: 24 }}>Loading…</div>;

  if (!state.authed) {
    return (
      <div style={{ padding: 24, maxWidth: 560 }}>
        <h2 style={{ marginTop: 0 }}>Admin sign-in</h2>
        <p>Use your email + password (local/dev).</p>
        {!hasSupabaseConfig && (
          <p style={{ padding: 12, background: "#fef3c7", borderRadius: 8, marginBottom: 16 }}>
            Supabase is not configured. Set <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> in
            .env (or Vercel environment variables) and restart the dev server.
          </p>
        )}
        <PasswordForm onNetworkErrorHelp={networkErrorHelp} />
        {state.error ? (
          <div style={{ marginTop: 12, padding: 12, background: "rgba(185, 28, 28, 0.08)", borderRadius: 8, border: "1px solid #b91c1c" }}>
            <p style={{ margin: 0 }}>{state.error}</p>
            {state.errorDetail ? <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.9 }}>{state.errorDetail}</p> : null}
            {isNetworkError({ message: state.error }) ? <p style={{ margin: "8px 0 0", fontSize: 13 }}>{networkErrorHelp()}</p> : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (!state.isAdmin) {
    return (
      <div style={{ padding: 24, maxWidth: 560 }}>
        <h2 style={{ marginTop: 0 }}>Admin access required</h2>
        <p>You are signed in, but your account is not an admin.</p>
        <button onClick={doSignOut} style={{ padding: "10px 14px" }}>
          Sign out
        </button>
        {state.error ? <p style={{ marginTop: 12 }}>{state.error}</p> : null}
      </div>
    );
  }

  return children;
}

function PasswordForm({ onNetworkErrorHelp }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [isNetworkErr, setIsNetworkErr] = useState(false);

  async function signIn(e) {
    e.preventDefault();
    setMsg("");
    setIsNetworkErr(false);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMsg(error.message);
        return;
      }
    } catch (e) {
      const raw = e?.message ?? String(e);
      if (raw.toLowerCase().includes("fetch") || raw.toLowerCase().includes("network")) {
        setMsg("Network error connecting to Supabase. Check your connection and Supabase configuration.");
        setIsNetworkErr(true);
      } else {
        setMsg(raw);
      }
    }
  }

  return (
    <form onSubmit={signIn}>
      <label style={{ display: "block", marginBottom: 8 }}>Email</label>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        required
        style={{ padding: 10, width: "100%", marginBottom: 12 }}
      />

      <label style={{ display: "block", marginBottom: 8 }}>Password</label>
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        required
        style={{ padding: 10, width: "100%", marginBottom: 12 }}
      />

      <button type="submit" style={{ padding: "10px 14px" }}>
        Sign in
      </button>

      {msg ? (
        <div style={{ marginTop: 12, padding: 12, background: "rgba(185, 28, 28, 0.08)", borderRadius: 8, border: "1px solid #b91c1c" }}>
          <p style={{ margin: 0 }}>{msg}</p>
          {isNetworkErr && onNetworkErrorHelp ? <p style={{ margin: "8px 0 0", fontSize: 13 }}>{onNetworkErrorHelp()}</p> : null}
        </div>
      ) : null}
    </form>
  );
}