import React, { useState } from "react";
import { Link } from "react-router-dom";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { signOut } from "../lib/auth";
import { useAuth } from "../hooks/useAuth.js";
import { getPasswordResetRedirectUrl, withTimeout } from "../lib/authHelpers";
import { Button, Callout, Field, Section, Skeleton, TextInput } from "./ui/index.js";
import "../styles/admin-shell-tokens.css";
import "../styles/admin-shell.css";
import "../styles/discover-ui.css";
import "../styles/wave-c/ops.css";

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
  if (initializing || roleLoading) {
    return (
      <GateFrame>
        <Skeleton variant="form" rows={2} label="Loading" />
      </GateFrame>
    );
  }

  if (!user) {
    const authError = error;
    return (
      <GateFrame>
        <Section as="h1" title="Admin sign-in" description="Use your email + password (local/dev).">
          {!hasSupabaseConfig && (
            <Callout tone="warn">
              Supabase is not configured. Set <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> in
              .env (or Vercel environment variables) and restart the dev server.
            </Callout>
          )}
          <PasswordForm onNetworkErrorHelp={networkErrorHelp} />
          {authError ? (
            <Callout tone="danger">
              {authError}
              {isNetworkError({ message: authError }) ? <p className="ops-gate-help">{networkErrorHelp()}</p> : null}
            </Callout>
          ) : null}
        </Section>
      </GateFrame>
    );
  }

  if (role !== "admin") {
    return (
      <GateFrame>
        <Section as="h1" title="Admin access required" description="You are signed in, but your account is not an admin.">
          <div className="ops-gate-actions">
            <Button onClick={doSignOut}>Sign out</Button>
          </div>
          {error ? <Callout tone="danger">{error}</Callout> : null}
        </Section>
      </GateFrame>
    );
  }

  return children;
}

/** Staff sign-in screens render outside AppShell, so they carry their own `.shell` scope for the kit styles. */
function GateFrame({ children }) {
  return (
    <div className="shell ops-gate">
      <div className="ops-gate-card">{children}</div>
    </div>
  );
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
    <form onSubmit={signIn} className="ops-gate-form">
      <Field label="Email">
        <TextInput value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required />
      </Field>

      <Field label="Password">
        <TextInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <div className="ops-gate-actions">
        <Button type="submit" variant="primary">
          Sign in
        </Button>
        <Button onClick={sendResetLink} loading={sendingReset} loadingLabel="Sending…">
          Forgot password?
        </Button>
      </div>
      <p className="ops-gate-note">
        You can also use the full reset page: <Link to="/forgot-password">Forgot password</Link>.
      </p>

      {msg ? (
        <Callout tone="danger">
          {msg}
          {isNetworkErr && onNetworkErrorHelp ? <p className="ops-gate-help">{onNetworkErrorHelp()}</p> : null}
        </Callout>
      ) : null}
      {resetMsg ? <Callout tone="info">{resetMsg}</Callout> : null}
    </form>
  );
}
