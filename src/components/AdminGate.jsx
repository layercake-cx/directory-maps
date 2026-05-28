import React, { useState } from "react";
import { Link } from "react-router-dom";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { signOut } from "../lib/auth";
import { useAuth } from "../hooks/useAuth.js";
import { getPasswordResetRedirectUrl, withTimeout } from "../lib/authHelpers";

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
  const { initializing, user, role, roleLoading, error } = useAuth();

  async function doSignOut() {
    try {
      await signOut();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }
  if (initializing || roleLoading) return <div style={{ padding: 24 }}>Loading…</div>;

  if (!user) {
    const authError = error;
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
        {authError ? (
          <div style={{ marginTop: 12, padding: 12, background: "rgba(185, 28, 28, 0.08)", borderRadius: 8, border: "1px solid #b91c1c" }}>
            <p style={{ margin: 0 }}>{authError}</p>
            {isNetworkError({ message: authError }) ? <p style={{ margin: "8px 0 0", fontSize: 13 }}>{networkErrorHelp()}</p> : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <div style={{ padding: 24, maxWidth: 560 }}>
        <h2 style={{ marginTop: 0 }}>Admin access required</h2>
        <p>You are signed in, but your account is not an admin.</p>
        <button onClick={doSignOut} style={{ padding: "10px 14px" }}>
          Sign out
        </button>
        {error ? <p style={{ marginTop: 12 }}>{error}</p> : null}
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
  const [sendingReset, setSendingReset] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

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

  async function sendResetLink() {
    setResetMsg("");
    setMsg("");
    setIsNetworkErr(false);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setResetMsg("Enter your admin email first, then click Forgot password.");
      return;
    }

    setSendingReset(true);
    try {
      const redirectTo = getPasswordResetRedirectUrl();
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(trimmedEmail, { redirectTo }),
        30000,
        "Admin password reset"
      );
      if (error) {
        setResetMsg(error.message);
        return;
      }
      setResetMsg(`If an account exists for ${trimmedEmail}, a password reset link has been sent.`);
    } catch (e) {
      setResetMsg(e?.message ?? String(e));
    } finally {
      setSendingReset(false);
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
      <button
        type="button"
        onClick={sendResetLink}
        style={{ padding: "10px 14px", marginLeft: 8 }}
        disabled={sendingReset}
      >
        {sendingReset ? "Sending..." : "Forgot password?"}
      </button>
      <p style={{ marginTop: 10, marginBottom: 0, fontSize: 13 }}>
        You can also use the full reset page: <Link to="/forgot-password">Forgot password</Link>.
      </p>

      {msg ? (
        <div style={{ marginTop: 12, padding: 12, background: "rgba(185, 28, 28, 0.08)", borderRadius: 8, border: "1px solid #b91c1c" }}>
          <p style={{ margin: 0 }}>{msg}</p>
          {isNetworkErr && onNetworkErrorHelp ? <p style={{ margin: "8px 0 0", fontSize: 13 }}>{onNetworkErrorHelp()}</p> : null}
        </div>
      ) : null}
      {resetMsg ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "rgba(59, 130, 246, 0.12)",
            borderRadius: 8,
            border: "1px solid rgba(59, 130, 246, 0.35)",
          }}
        >
          <p style={{ margin: 0 }}>{resetMsg}</p>
        </div>
      ) : null}
    </form>
  );
}