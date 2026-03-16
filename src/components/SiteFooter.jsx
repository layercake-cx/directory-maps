import React from "react";
import { Link } from "react-router-dom";
import logo from "../assets/layercake-logo.png";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__logo-wrap">
          <img src={logo} alt="Layercake" className="site-footer__logo" />
        </div>
        <p className="site-footer__legal">
          © 2025 Layercake CX Ltd
          {" | "}
          <Link to="/privacy" className="site-footer__link">Privacy Notice</Link>
          {" | "}
          <Link to="/cookies" className="site-footer__link">Cookies Policy</Link>
          {" | "}
          Registered in England | Company number: 14529453 | Registered office address: 71-75 Shelton Street, Covent Garden, London, United Kingdom, WC2H 9JQ
        </p>
      </div>
    </footer>
  );
}
