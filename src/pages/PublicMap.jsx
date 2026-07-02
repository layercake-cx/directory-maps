import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import martinBoylePhoto from "../assets/martin-boyle.png";
import styles from "./PublicMap.module.css";

const SAMPLE_MAP_URL = "https://maps.layercake-cx.biz/layercake/uk-associations-sample-map";

const PROBLEMS = [
  {
    title: "Too big to browse",
    desc: "Long lists nobody scrolls through.",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 4v16" />
      </svg>
    ),
  },
  {
    title: "Low engagement",
    desc: "Visited once, rarely returned to.",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v18M3 12h18" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  {
    title: "Hidden expertise",
    desc: "Value inside the org stays invisible.",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.5 1 2.5h6c0-1 .4-1.9 1-2.5A6 6 0 0 0 12 3Z" />
      </svg>
    ),
  },
  {
    title: "Data everywhere",
    desc: "Spreadsheets, CRM and web disagree.",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
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
  { title: "Discover members by expertise", desc: "Find people by skill or sector, not just name." },
  { title: "Explore suppliers by category", desc: "Filter approved suppliers by service and location." },
  { title: "Showcase destinations and venues", desc: "A visual way to browse places worth visiting." },
  { title: "Connect partners by region", desc: "See who operates where, at a glance." },
  { title: "Visualise exhibitor directories", desc: "Turn a static list into something attendees explore." },
  { title: "Highlight products and services", desc: "Group offerings so the right ones get found." },
];

const INTEGRATIONS = [
  { badge: "Preferred", title: "API integration", desc: "Direct, near real-time sync with your CRM or directory." },
  { badge: "Scheduled", title: "Scheduled imports", desc: "Regular CSV or Excel exports, transformed automatically." },
  { badge: "Manual", title: "Manual management", desc: "Upload and edit directly in the app. No infrastructure needed." },
];

const BETA_BENEFITS = [
  "Early access to Layercake Maps",
  "Dedicated onboarding and support",
  "Direct collaboration with the team",
  "30% off in year one",
];

const TIMELINE_STEPS = [
  { num: "1", title: "Discovery call", desc: "A short conversation about your directory." },
  { num: "2", title: "Technical discovery", desc: "We find the best integration route." },
  { num: "3", title: "Data assessment", desc: "We review your data and flag cleanup." },
  { num: "4", title: "Map configuration", desc: "Your map is styled and structured." },
  { num: "5", title: "Review session", desc: "We walk through it before launch." },
  { num: "6", title: "Launch", desc: "Embed with one line of code." },
  { num: "✓", title: "Feedback", desc: "Ongoing input shapes what's next.", last: true },
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

const initialForm = { firstName: "", lastName: "", organisation: "", workEmail: "", message: "" };

export default function PublicMap() {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [error, setError] = useState("");

  function handleChange(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setError("");
    try {
      const { error: insertError } = await supabase.from("beta_signups").insert({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        organisation: form.organisation.trim(),
        work_email: form.workEmail.trim(),
        message: form.message.trim() || null,
      });
      if (insertError) throw insertError;
      setStatus("success");
      setForm(initialForm);
    } catch (err) {
      setStatus("error");
      setError(err?.message || "Something went wrong. Please try again.");
    }
  }

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

      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.wrap}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTag}>The problem</span>
            <h2>The challenge behind almost every association directory</h2>
          </div>
          <div className={styles.problemGrid}>
            {PROBLEMS.map((p) => (
              <div className={styles.problemCard} key={p.title}>
                <div className={styles.problemIcon} style={{ color: "var(--teal-dark)" }}>
                  {p.icon}
                </div>
                <h3>{p.title}</h3>
                <p>{p.desc}</p>
              </div>
            ))}
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
            <h2>Works with your existing data</h2>
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

            {status === "success" ? (
              <div className={styles.formSuccess}>
                <p>Thanks — we&apos;ve got your application and will be in touch within two working days.</p>
              </div>
            ) : (
              <form className={styles.form} onSubmit={handleSubmit}>
                <div className={styles.formRow}>
                  <div>
                    <label htmlFor="fname" className={styles.label}>
                      First name
                    </label>
                    <input
                      id="fname"
                      type="text"
                      placeholder="Jane"
                      className={styles.input}
                      value={form.firstName}
                      onChange={handleChange("firstName")}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="lname" className={styles.label}>
                      Last name
                    </label>
                    <input
                      id="lname"
                      type="text"
                      placeholder="Smith"
                      className={styles.input}
                      value={form.lastName}
                      onChange={handleChange("lastName")}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="org" className={styles.label}>
                    Organisation
                  </label>
                  <input
                    id="org"
                    type="text"
                    placeholder="Your association or institute"
                    className={styles.input}
                    value={form.organisation}
                    onChange={handleChange("organisation")}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="email" className={styles.label}>
                    Work email
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="jane@yourassociation.org"
                    className={styles.input}
                    value={form.workEmail}
                    onChange={handleChange("workEmail")}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="message" className={styles.label}>
                    Tell us about your directory
                  </label>
                  <textarea
                    id="message"
                    placeholder="How many members or suppliers, and what you're hoping to achieve."
                    className={styles.textarea}
                    value={form.message}
                    onChange={handleChange("message")}
                  />
                </div>

                {status === "error" && <p className={styles.formError}>{error}</p>}

                <button
                  type="submit"
                  className={`${styles.btn} ${styles.btnTeal} ${styles.btnBlock} ${styles.formSubmit}`}
                  disabled={status === "submitting"}
                >
                  {status === "submitting" ? "Submitting…" : "Apply for a founding partner spot"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
