import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BrandLogo from "./BrandLogo.jsx";
import { signOut } from "../lib/auth";
import { useAuth } from "../hooks/useAuth.js";

export default function SiteHeader() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { user } = useAuth();

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      setMenuOpen(false);
      navigate("/");
    } catch {
      navigate("/");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <BrandLogo to="/" className="site-header__brand" />

        <nav className="site-header__nav">
          <Link to="/pricing" className="site-header__navLink">
            Pricing
          </Link>

          {!user && (
            <>
              <Link to="/login" className="site-header__navLink">
                Log in
              </Link>
              <Link to="/signup" className="site-header__navLink site-header__navLink--primary">
                Sign up
              </Link>
            </>
          )}

          {user && (
            <div className="site-header__account">
              <button
                type="button"
                className="site-header__navLink site-header__navLink--account"
                onClick={() => !signingOut && setMenuOpen((open) => !open)}
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-busy={signingOut}
                disabled={signingOut}
              >
                {signingOut ? "Signing out…" : "My account"}
              </button>
              {menuOpen && (
                <div className="site-header__accountMenu" role="menu">
                  <button
                    type="button"
                    className="site-header__accountItem"
                    disabled={signingOut}
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/client");
                    }}
                  >
                    My details
                  </button>
                  <button
                    type="button"
                    className="site-header__accountItem"
                    disabled={signingOut}
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/client");
                    }}
                  >
                    My subscription
                  </button>
                  <button
                    type="button"
                    className="site-header__accountItem"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    aria-busy={signingOut}
                  >
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
