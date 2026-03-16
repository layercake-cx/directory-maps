import React from "react";
import { Link } from "react-router-dom";

/** Top-left brand: "Maps" (bold) + " by Layercake" (normal, italic). Use in header (main site, admin, client). */
export default function BrandLogo({ to = "/", className = "" }) {
  const content = (
    <>
      <span className="brand-logo__word">Maps</span>
      <span className="brand-logo__by"> by Layercake</span>
    </>
  );
  const wrapClass = `brand-logo ${className}`.trim();
  if (to) {
    return (
      <Link to={to} className={wrapClass}>
        {content}
      </Link>
    );
  }
  return <div className={wrapClass}>{content}</div>;
}
