import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { getOAuthRedirectUrl } from "../lib/authHelpers";

function slugify(input) {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function AuthForm({ mode, onSuccess }) {
  const isSignUp = mode === "signup";
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleOAuth(provider) {
    setMsg("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: getOAuthRedirectUrl() },
      });
      if (error) setMsg(error.message);
    } catch (e) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");

    try {
      if (isSignUp) {
        const cleanOrg = orgName.trim();
        if (!cleanOrg) {
          setMsg("Organisation name is required.");
          return;
        }
        const slug = slugify(cleanOrg);
        if (!slug) {
          setMsg("Could not generate a slug from that organisation name.");
          return;
        }
        const { data: existing, error: slugError } = await supabase
          .from("clients")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (slugError) throw slugError;
        if (existing) {
          setMsg("That organisation name is already in use. Please choose a different name.");
          return;
        }

        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setMsg(error.message);
          return;
        }
        if (data?.user) {
          const clientId = crypto.randomUUID();
          const { error: clientError } = await supabase.from("clients").insert({
            id: clientId,
            name: cleanOrg,
            slug,
          });
          if (clientError) {
            setMsg(clientError.message ?? "Account created but there was a problem saving organisation details.");
            return;
          }
          const { error: contactError } = await supabase.from("contacts").insert({
            client_id: clientId,
            user_id: data.user.id,
            email: email.trim(),
            is_primary: true,
          });
          if (contactError) {
            setMsg(contactError.message ?? "Organisation created but there was a problem linking your contact.");
            return;
          }
          setMsg("Account created. Check your email for confirmation if required, then sign in.");
          onSuccess?.();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setMsg(error.message);
          return;
        }
        onSuccess?.();
      }
    } catch (e) {
      setMsg(e?.message ?? String(e));
    }
  }

  return (
    <div className="auth-form">
      <div className="auth-form__sso">
        <button
          type="button"
          className="auth-form__ssoBtn"
          onClick={() => handleOAuth("google")}
          disabled={loading}
        >
          Continue with Google
        </button>
        <button
          type="button"
          className="auth-form__ssoBtn"
          onClick={() => handleOAuth("linkedin_oidc")}
          disabled={loading}
        >
          Continue with LinkedIn
        </button>
      </div>

      <div className="auth-form__divider">
        <span>or</span>
      </div>

      <form onSubmit={handleSubmit} className="auth-form__form">
        {isSignUp && (
          <>
            <label className="auth-form__label">Organisation name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required={isSignUp}
              className="auth-form__input"
              placeholder="Your company or organisation"
            />
          </>
        )}
        <label className="auth-form__label">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="auth-form__input"
          placeholder="you@example.com"
        />
        <label className="auth-form__label">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="auth-form__input"
          placeholder={isSignUp ? "Min 6 characters" : ""}
        />
        <button type="submit" className="btn btn-primary auth-form__submit" disabled={loading}>
          {isSignUp ? "Create account" : "Log in"}
        </button>
      </form>

      {msg ? <p className="auth-form__msg">{msg}</p> : null}
    </div>
  );
}
