import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getMyRole, signOut } from "../lib/auth";

export default function AdminGate({ children }) {
  const [state, setState] = useState({
    loading: true,
    authed: false,
    isAdmin: false,
    error: "",
  });

  useEffect(() => {
    let mounted = true;
    const timeoutMs = 15000;

    async function run(isInitial) {
      try {
        if (isInitial) {
          setState((s) => ({ ...s, loading: true, error: "" }));
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
          setState({ loading: false, authed: false, isAdmin: false, error: "" });
          return;
        }
        setState({
          loading: false,
          authed: true,
          isAdmin: role === "admin",
          error: "",
        });
      } catch (e) {
        if (mounted) {
          setState({
            loading: false,
            authed: false,
            isAdmin: false,
            error: e?.message ?? String(e),
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
        <PasswordForm />
        {state.error ? <p style={{ marginTop: 12 }}>{state.error}</p> : null}
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

function PasswordForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function signIn(e) {
    e.preventDefault();
    setMsg("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) setMsg(error.message);
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

      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
    </form>
  );
}