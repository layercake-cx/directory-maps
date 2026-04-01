import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { getEmailAuthRedirectUrl } from "../lib/authHelpers";

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
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        setMsg("Email is required.");
        return;
      }

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
        const { data: slugOk, error: rpcErr } = await supabase.rpc("is_client_slug_available", { p_slug: slug });
        if (rpcErr) throw rpcErr;
        if (slugOk === false) {
          setMsg("That organisation name is already in use. Please choose a different name.");
          return;
        }

        const { error } = await supabase.auth.signInWithOtp({
          email: trimmedEmail,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: getEmailAuthRedirectUrl(),
            data: {
              signup_org_name: cleanOrg,
              signup_org_slug: slug,
            },
          },
        });
        if (error) {
          setMsg(error.message);
          return;
        }
        setMsg("Check your email for the sign-up link. You must verify your email before your account is active.");
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: getEmailAuthRedirectUrl(),
        },
      });
      if (error) {
        setMsg(error.message);
        return;
      }
      setMsg("If an account exists for this email, we sent a sign-in link. Check your inbox.");
    } catch (e) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-form">
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
          autoComplete="email"
        />
        <button type="submit" className="btn btn-primary auth-form__submit" disabled={loading}>
          {loading ? "Sending..." : isSignUp ? "Email me a sign-up link" : "Email me a sign-in link"}
        </button>
      </form>

      {msg ? <p className="auth-form__msg">{msg}</p> : null}
    </div>
  );
}
