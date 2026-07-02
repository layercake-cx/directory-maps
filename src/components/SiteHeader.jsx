import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BrandLogo from "./BrandLogo.jsx";
import { signOut } from "../lib/auth";
import { useAuth } from "../hooks/useAuth.js";

const LANDING_NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#data", label: "How it works" },
  { href: "#beta", label: "Founding partners" },
];

export default function SiteHeader({ landingNav = false }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { user } = useAuth();
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

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

  const initial = user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <BrandLogo to="/" className="site-header__brand" />

        {landingNav && (
          <nav className="site-header__landingNav" aria-label="Page sections">
            {LANDING_NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
        )}

        <nav className="site-header__nav">
          {landingNav && (
            <a href="#signup" className="site-header__navLink site-header__navLink--primary">
              Become a founding partner
            </a>
          )}

          {!user && (
            <Link to="/login" className="site-header__navLink">
              Log in
            </Link>
          )}

          {user && (
            <div className="site-header__account" ref={menuRef}>
              <button
                type="button"
                className="site-header__accountTrigger"
                onClick={() => !signingOut && setMenuOpen((open) => !open)}
                aria-haspopup="true"
                aria-expanded={menuOpen}
                disabled={signingOut}
              >
                <span className="site-header__accountAvatar">{initial}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden style={{ opacity: 0.7 }}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {menuOpen && (
                <div className="site-header__accountMenu" role="menu">
                  <div className="site-header__accountEmail">{user.email}</div>
                  <div className="site-header__accountDivider" />
                  <button
                    type="button"
                    className="site-header__accountItem"
                    onClick={() => { setMenuOpen(false); navigate("/client"); }}
                  >
                    Dashboard
                  </button>
                  <div className="site-header__accountDivider" />
                  <button
                    type="button"
                    className="site-header__accountItem site-header__accountItem--danger"
                    onClick={handleSignOut}
                    disabled={signingOut}
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
