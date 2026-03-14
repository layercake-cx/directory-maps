import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function slugify(input) {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function ClientAuthForm() {
  const [mode, setMode] = useState("sign-in"); // "sign-in" | "sign-up"
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");

    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) setMsg(error.message);
      } else {
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

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) {
          setMsg(error.message);
        } else if (data?.user) {
          const userId = data.user.id;
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
            user_id: userId,
            email: email.trim(),
            is_primary: true,
          });

          if (contactError) {
            setMsg(contactError.message ?? "Organisation created but there was a problem linking your contact.");
          } else {
            setMsg("Account created. Check your email for confirmation if required, then sign in.");
          }
        }
      }
    } catch (e) {
      setMsg(e?.message ?? String(e));
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setMode("sign-in")}
          className="btn"
          style={mode === "sign-in" ? { fontWeight: 600 } : undefined}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("sign-up")}
          className="btn"
          style={mode === "sign-up" ? { fontWeight: 600 } : undefined}
        >
          Sign up
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {mode === "sign-up" ? (
          <>
            <label style={{ display: "block", marginBottom: 8 }}>Organisation name</label>
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              type="text"
              required={mode === "sign-up"}
              style={{ padding: 10, width: "100%", marginBottom: 12 }}
            />

            <label style={{ display: "block", marginBottom: 8 }}>Client slug</label>
            <input
              value={slugify(orgName)}
              type="text"
              readOnly
              style={{ padding: 10, width: "100%", marginBottom: 12, background: "#f3f4f6" }}
            />
          </>
        ) : null}

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

        <button type="submit" className="btn btn-primary">
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </button>

        {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
      </form>
    </div>
  );
}

export default function ClientGate({ children }) {
  const [state, setState] = useState({
    loading: true,
    authed: false,
    error: "",
  });

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        setState((s) => ({ ...s, loading: true, error: "" }));

        const { data } = await supabase.auth.getUser();
        const user = data?.user;

        if (!mounted) return;

        if (!user) {
          setState({ loading: false, authed: false, error: "" });
        } else {
          setState({ loading: false, authed: true, error: "" });
        }
      } catch (e) {
        if (mounted) {
          setState({
            loading: false,
            authed: false,
            error: e?.message ?? String(e),
          });
        }
      }
    }

    run();
    const { data: sub } = supabase.auth.onAuthStateChange(() => run());

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  if (state.loading) return <div className="page-main">Loading…</div>;

  if (!state.authed) {
    return (
      <div className="page-main">
        <div className="admin-card" style={{ maxWidth: 560 }}>
          <h2 style={{ marginTop: 0 }}>Client access</h2>
          <p>Create an account or sign in to manage your maps.</p>
          <ClientAuthForm />
          {state.error ? <p style={{ marginTop: 12 }}>{state.error}</p> : null}
        </div>
      </div>
    );
  }

  return children;
}

