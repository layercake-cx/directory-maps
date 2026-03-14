import React from "react";
import { Link } from "react-router-dom";

const FEATURES = [
  {
    title: "Interactive maps",
    description: "Embed Google Maps–based directories on your site. Visitors search, filter by group, and click pins for details.",
  },
  {
    title: "Your data, your brand",
    description: "Upload your own listings via CSV or connect a Google Sheet. Geocode addresses, add logos and links.",
  },
  {
    title: "Groups & styling",
    description: "Organise listings into groups, customise pin colours and styles per group, and control clustering.",
  },
  {
    title: "Client portal",
    description: "Let clients create and manage their own maps, listings, and data—with optional Google Sheet sync.",
  },
  {
    title: "Embed anywhere",
    description: "One link or iframe to drop into any website. Works on desktop and mobile.",
  },
];

export default function PublicMap() {
  return (
    <div className="landing">
      <section className="landing__hero">
        <h1 className="landing__heroTitle">Directory Maps</h1>
        <p className="landing__heroSub">
          Create and embed interactive map directories. Upload your data, organise by groups, and share one link.
        </p>
        <Link to="/signup" className="landing__cta">
          Register now
        </Link>
      </section>

      <section className="landing__features">
        <h2 className="landing__featuresTitle">What you get</h2>
        <ul className="landing__featuresList">
          {FEATURES.map((f, i) => (
            <li key={i} className="landing__feature">
              <h3 className="landing__featureTitle">{f.title}</h3>
              <p className="landing__featureDesc">{f.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing__footer">
        <p className="landing__footerText">
          Already have an account?{" "}
          <Link to="/login" className="landing__footerLink">
            Log in
          </Link>
        </p>
        <p className="landing__footerMuted">
          Admins: <a href="#/admin/clients">admin interface</a>
        </p>
      </section>
    </div>
  );
}
