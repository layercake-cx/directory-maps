import React, { useEffect } from "react";
import martinBoylePhoto from "../assets/martin-boyle.png";
import styles from "./PublicMap.module.css";

const SAMPLE_MAP_URL = "https://maps.layercake-cx.biz/layercake/uk-associations-sample-map";
const HUBSPOT_FORM_SCRIPT_SRC = "https://js-eu1.hsforms.net/forms/embed/148819421.js";

const PROBLEMS = [
  "Large member directories that are difficult to navigate",
  "Low engagement with directory content",
  "Hidden expertise within your organisation",
  "Information spread across multiple systems",
  "Difficulty discovering suppliers, partners or services",
];

const WHO_ITS_FOR = [
  "Membership organisations",
  "Professional institutes",
  "Trade associations",
  "Convention bureaux",
  "DMOs",
  "Event organisers",
  "Supplier networks",
];

const USE_CASES = [
  { title: "Discover members by expertise", desc: "Let visitors filter and find members by sector, skill or specialism." },
  { title: "Explore suppliers by category", desc: "Turn a static supplier list into a searchable, browsable map." },
  { title: "Showcase destinations and venues", desc: "Give conference and event destinations a visual home online." },
  { title: "Connect partners by region", desc: "Show partner coverage and relationships at a glance, by geography." },
  { title: "Visualise exhibitor directories", desc: "Help attendees navigate exhibitors before and during an event." },
  { title: "Highlight products and services", desc: "Surface what your members and suppliers actually offer, visually." },
];

const INTEGRATIONS = [
  { badge: "Manual entry", title: "Add records directly", desc: "Good for a handful of listings, or getting a feel for the platform before importing everything." },
  { badge: "CSV upload", title: "Import your existing dataset", desc: "Upload your full directory in one go — a one-time import, or a periodic re-upload as things change." },
  { badge: "Google Drive sync", title: "Keep it live, automatically", desc: "Connect a Google Sheet and your map stays in sync — no exports, no re-uploading." },
];

const BETA_BENEFITS = [
  "Early access to Layercake Maps",
  "Dedicated onboarding and support",
  "Direct collaboration with the team",
  "30% off in year one",
];

const TIMELINE_STEPS = [
  { num: "1", title: "Discovery call", desc: "We learn your data, your members, and what \"good\" looks like for you." },
  { num: "2", title: "Set-up", desc: "You build your first map, with our team on hand for guidance whenever you need it." },
  { num: "3", title: "Publish", desc: "Live and embedded with one line of code." },
];

const TESTIMONIAL = {
  quote:
    "We wanted a better way to highlight our members, something more engaging than a standard directory and more reflective of our global community. Layercake delivered a simple, elegant solution that’s been really well received. It looks great, works seamlessly, and gives our members the visibility they deserve.",
  name: "Martin Boyle",
  title: "CEO, IAPCO",
  photo: martinBoylePhoto,
};

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eafaf3" strokeWidth="2" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Pin({ variant, top, left }) {
  return (
    <div
      className={`${styles.pin} ${variant === "coral" ? styles.pinCoral : styles.pinTeal}`}
      style={{ top, left }}
    >
      <svg viewBox="0 0 24 30">
        <path d="M12 0C5.4 0 0 5.4 0 12c0 8.5 12 18 12 18s12-9.5 12-18C24 5.4 18.6 0 12 0Z" />
        <circle cx="12" cy="12" r="4.3" fill="#faf7f1" />
      </svg>
    </div>
  );
}

const MAP_PINS = [
  { variant: "teal", top: "44px", left: "120px" },
  { variant: "coral", top: "80px", left: "250px" },
  { variant: "teal", top: "130px", left: "390px" },
  { variant: "teal", top: "60px", left: "500px" },
  { variant: "coral", top: "150px", left: "600px" },
  { variant: "teal", top: "100px", left: "700px" },
];

function MapIllustration() {
  return (
    <div className={styles.mapVisual} id="product">
      <div className={styles.mapVisualBar}>
        <span className={styles.mapVisualDot} />
        <span className={styles.mapVisualDot} />
        <span className={styles.mapVisualDot} />
        <div className={styles.mapVisualSearch} />
      </div>
      <div className={styles.mapCanvas}>
        <svg className={styles.mapBg} viewBox="0 0 800 300" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 100 Q200 50 400 95 T800 80 V300 H0 Z" fill="#dbe6da" opacity="0.6" />
          <path d="M0 170 Q220 130 440 165 T800 150 V300 H0 Z" fill="#cfe0da" opacity="0.5" />
        </svg>
        {MAP_PINS.map((pin, i) => (
          <Pin key={i} {...pin} />
        ))}
        <div className={styles.mapCount}>247 listings mapped</div>
        <div className={styles.mapLegend}>
          <span>
            <span className={styles.legendDot} style={{ background: "var(--teal-dark)" }} />
            Members
          </span>
          <span>
            <span className={styles.legendDot} style={{ background: "var(--coral)" }} />
            Suppliers
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PublicMap() {
  useEffect(() => {
    if (document.querySelector(`script[src="${HUBSPOT_FORM_SCRIPT_SRC}"]`)) return;
    const script = document.createElement("script");
    script.src = HUBSPOT_FORM_SCRIPT_SRC;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.wrap}>
          <span className={styles.badgeLine}>
            <span className={styles.badgeDot} />
            Beta — 4 of 5 founding partner spots remaining
          </span>
          <h1 className={styles.heroTitle}>Turn your member and supplier directory into a map people actually use</h1>
          <p className={styles.heroLede}>
            Searchable, filterable, and embeddable on your site in one line of code. No developer required.
          </p>
          <div className={styles.heroActions}>
            <a href="#signup" className={`${styles.btn} ${styles.btnTeal}`}>
              Become a founding partner
            </a>
            <a
              href={SAMPLE_MAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.btn} ${styles.btnSecondary}`}
            >
              See a live example map ↗
            </a>
          </div>

          <MapIllustration />
        </div>
      </header>

      <section className={styles.problemStrip}>
        <div className={styles.wrap}>
          <div className={styles.problemStripGrid}>
            <div>
              <h2>The problems we solve</h2>
              <p className={styles.problemStripIntro}>
                Not another feature list — the day-to-day friction Layercake Maps is built to remove.
              </p>
            </div>
            <ul className={styles.problemBullets}>
              {PROBLEMS.map((item) => (
                <li className={styles.problemBulletItem} key={item}>
                  <span className={styles.problemBulletDot} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.wrap}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTag}>Who it&apos;s for</span>
            <h2>Built for the membership sector</h2>
          </div>
          <div className={styles.chipRow}>
            {WHO_ITS_FOR.map((chip) => (
              <span className={styles.chip} key={chip}>
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.wrap}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTag}>Use cases</span>
            <h2>What organisations are mapping</h2>
          </div>
          <div className={styles.usecaseGrid}>
            {USE_CASES.map((u) => (
              <div className={styles.usecaseCard} key={u.title}>
                <h3>{u.title}</h3>
                <p>{u.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} id="data">
        <div className={styles.wrap}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTag}>Getting started</span>
            <h2>Get your data in, your way</h2>
            <p>
              You don&apos;t need sophisticated infrastructure to get started — pick whichever fits how your data
              lives today.
            </p>
          </div>
          <div className={styles.integrationGrid}>
            {INTEGRATIONS.map((i) => (
              <div className={styles.integrationCard} key={i.title}>
                <span className={styles.stepBadge}>{i.badge}</span>
                <h3>{i.title}</h3>
                <p>{i.desc}</p>
              </div>
            ))}
          </div>
          <p className={styles.dataNote}>
            <strong>Got something more complex?</strong> — a CRM, a database, or a legacy system — we can scope a
            custom pipeline to keep your map in sync automatically. This is a separate project alongside your
            subscription, not part of it.
          </p>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`} id="beta">
        <div className={styles.wrap}>
          <div className={styles.betaPanel}>
            <span className={styles.betaSpots}>Only 4 founding partner spots remaining</span>
            <h2>We&apos;re inviting five associations to shape Layercake Maps before launch</h2>
            <p className={styles.betaLede}>
              In return for early feedback, founding partners get preferential terms and a direct line to the team
              building the product.
            </p>
            <ul className={styles.betaGrid}>
              {BETA_BENEFITS.map((b) => (
                <li key={b}>
                  <CheckIcon />
                  {b}
                </li>
              ))}
            </ul>
            <a href="#signup" className={`${styles.btn} ${styles.btnCoral}`}>
              Apply for a founding partner spot
            </a>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.wrap}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTag}>Onboarding journey</span>
            <h2>What happens after you apply</h2>
          </div>
          <div className={styles.timeline}>
            {TIMELINE_STEPS.map((step) => (
              <div className={styles.timelineStep} key={step.title}>
                <div className={`${styles.dotnum} ${step.last ? styles.dotnumLast : ""}`}>{step.num}</div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.wrap}>
          <div className={styles.testimonialRow}>
            <div className={styles.testimonialBlock}>
              <blockquote className={styles.testimonialQuote}>&quot;{TESTIMONIAL.quote}&quot;</blockquote>
              <div className={styles.testimonialName}>{TESTIMONIAL.name}</div>
              <div className={styles.testimonialTitle}>{TESTIMONIAL.title}</div>
            </div>
            <img
              src={TESTIMONIAL.photo}
              alt={TESTIMONIAL.name}
              className={styles.testimonialPhoto}
              width="220"
              height="220"
            />
          </div>
        </div>
      </section>

      <section className={styles.section} id="signup">
        <div className={styles.wrap}>
          <div className={styles.signupPanel}>
            <h2>Apply for a founding partner spot</h2>
            <p className={styles.signupLede}>
              Tell us about your directory. We&apos;ll come back to you within two working days.
            </p>

            <div
              className="hs-form-frame"
              data-region="eu1"
              data-form-id="9ab8dd2b-9c9d-4b98-af17-cadbc978a3a7"
              data-portal-id="148819421"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
