import React from "react";
import { Link } from "react-router-dom";
import logo from "../assets/layercake-logo.png";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-header__brand">
          <img src={logo} alt="Layercake" className="site-header__logoImg" />
          <div className="site-header__text">
            <div className="site-header__title">Directory Maps</div>
            <div className="site-header__subtitle">by Layercake</div>
          </div>
        </Link>

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

