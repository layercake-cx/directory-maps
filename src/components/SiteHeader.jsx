import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { signOut, getMyRole } from "../lib/auth";
import BrandLogo from "./BrandLogo.jsx";

export default function SiteHeader() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [dashTo, setDashTo] = useState("/client");

  useEffect(() => {
    let mounted = true;

    async function refresh() {
      const { data } = await supabase.auth.getUser();
      const u = data?.user ?? null;
      if (!mounted) return;
      if (!u) {
        setAuthed(false);
        return;
      }
      setAuthed(true);
      try {
        const role = await getMyRole();
        if (mounted) setDashTo(role === "admin" ? "/admin/clients" : "/client");
      } catch {
        if (mounted) setDashTo("/client");
      }
    }

    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  async function handleSignOut() {
    try {
      await signOut();
    } finally {
      navigate("/", { replace: true });
    }
  }

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <BrandLogo to="/" className="site-header__brand" />
        <nav className="site-header__nav">
          {authed ? (
            <>
              <Link to={dashTo} className="site-header__navLink">
                Dashboard
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="site-header__navBtn"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="site-header__navLink">
                Log in
              </Link>
              <Link to="/signup" className="site-header__navLink site-header__navLink--primary">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
