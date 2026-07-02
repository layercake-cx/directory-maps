import React from "react";
import { Link } from "react-router-dom";

/** Top-left brand: pin mark + "Maps" (bold) + " by Layercake" (normal, italic). Use in header (main site, admin, client). */
export default function BrandLogo({ to = "/", className = "" }) {
  const content = (
    <>
      <svg className="brand-logo__mark" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2C7.6 2 4 5.4 4 9.6 4 15 12 22 12 22S20 15 20 9.6C20 5.4 16.4 2 12 2Z"
          fill="var(--brand-teal, #0f9da8)"
        />
        <circle cx="12" cy="9.4" r="3.4" fill="#ffffff" />
      </svg>
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
