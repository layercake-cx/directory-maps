import React from "react";
import { Link } from "react-router-dom";
import BrandLogo from "./BrandLogo.jsx";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <BrandLogo to="/" className="site-header__brand" />

        <nav className="site-header__nav">
          <Link to="/login" className="site-header__navLink">
            Log in
          </Link>
          <Link to="/signup" className="site-header__navLink site-header__navLink--primary">
            Sign up
          </Link>
        </nav>
      </div>
    </header>
  );
}

