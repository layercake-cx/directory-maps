import React from "react";
import { Link } from "react-router-dom";

const PILLARS = [
  {
    icon: "🎨",
    title: "Highly customisable",
    desc: "Pin styles, colours, shadows, cluster settings, panel design — all yours to control.",
  },
  {
    icon: "🔗",
    title: "Connect your data",
    desc: "Upload a CSV or connect a Google Sheet and keep your map in sync automatically.",
  },
  {
    icon: "🌐",
    title: "Publish anywhere",
    desc: "One line of embed code. Drop it into any website, CMS, or landing page.",
  },
];

const FEATURES = [
  {
    title: "Interactive Google Maps directories",
    desc: "Visitors search, filter by category, and click pins for full listing details.",
  },
  {
    title: "Groups & per-group branding",
    desc: "Organise listings into categories, with distinct pin colours and styles per group.",
  },
  {
    title: "CSV import & Google Sheets sync",
    desc: "Import your data in seconds, or keep it live-synced from a spreadsheet on a schedule.",
  },
  {
    title: "Full design control",
    desc: "Pin shape, size, border, shadow, cluster style, panel colours, and corner radius — all adjustable.",
  },
  {
    title: "Listing contact forms",
    desc: "Visitors can message listings directly from the map. Messages go straight to the listing's inbox.",
  },
  {
    title: "Embed anywhere in one line",
    desc: "Works on any website or CMS. Responsive out of the box. Thumbnail and lightbox variants included.",
  },
  {
    title: "Engagement analytics",
    desc: "See which listings get the most clicks, searches, and contact requests.",
  },
];

export default function PublicMap() {
  return (
    <div className="landing">

      {/* Hero */}
      <section className="landing__hero">
        <div className="beta-badge">
          <span className="beta-badge__dot" />
          Now in BETA
        </div>
        <h1 className="landing__heroTitle">
          Beautiful map directories,<br />
          <em>built for your business</em>
        </h1>
        <p className="landing__heroSub">
          Layercake Maps is a platform for creating, branding, and embedding
          interactive location directories — without writing a line of code.
          We're in early access and onboarding selected clients now.
        </p>
        <div className="landing__ctas">
          <a
            href="mailto:info@layercake-cx.biz?subject=I%27d%20like%20to%20know%20more%20about%20Layercake%20Maps"
            className="landing__cta"
          >
            Enquire now
          </a>
          <a
            href="mailto:info@layercake-cx.biz?subject=I%27m%20interested%20in%20becoming%20a%20BETA%20user%20of%20Layercake%20Maps"
            className="landing__ctaSecondary"
          >
            Become a BETA user
          </a>
        </div>
      </section>

      {/* Three pillars */}
      <div className="landing__pillars">
        {PILLARS.map((p) => (
          <div className="pillar" key={p.title}>
            <span className="pillar__icon">{p.icon}</span>
            <p className="pillar__title">{p.title}</p>
            <p className="pillar__desc">{p.desc}</p>
          </div>
        ))}
      </div>

      {/* Feature checklist */}
      <section className="landing__features">
        <p className="landing__featuresLabel">What's included</p>
        <ul className="feature-list">
          {FEATURES.map((f) => (
            <li className="feature-list__item" key={f.title}>
              <span className="feature-list__check">✓</span>
              <span className="feature-list__text">
                <strong>{f.title}</strong>
                <span>{f.desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Footer */}
      <footer className="landing__footer">
        <p className="landing__footerText">
          Already have an account?&ensp;
          <Link to="/login" className="landing__footerLink">Log in</Link>
        </p>
        <p className="landing__footerMuted">
          <Link to="/terms">Terms</Link>
          {" · "}
          <a href="/admin/clients">Admin</a>
        </p>
      </footer>

    </div>
  );
}
