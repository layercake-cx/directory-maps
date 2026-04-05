import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import BrandLogo from "../components/BrandLogo.jsx";
import "./pricing.css";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    description: "Perfect for getting started with one map",
    featured: false,
    features: ["1 map", "Manual entry of data points", "Shareable map link", "Email support"],
    baseMonthly: 9.99,
  },
  {
    id: "pro",
    name: "Professional",
    description: "For teams connecting live data",
    featured: true,
    badge: "Most popular",
    features: ["Up to 3 maps", "Manual entry + data source connections", "Shareable map links", "Priority email support"],
    baseMonthly: 19.99,
  },
  {
    id: "agency",
    name: "Agency",
    description: "Unlimited maps for client work",
    featured: false,
    features: [
      "Unlimited maps",
      "Manual entry + data source connections",
      "White-label ready",
      "Dedicated account support",
      "Custom pricing available",
    ],
    baseMonthly: 59.99,
  },
];

function formatGbp(n) {
  return `£${n.toFixed(2)}`;
}

function CheckIcon() {
  return (
    <svg className="pricing-check" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <circle className="pricing-check__ring" cx="7.5" cy="7.5" r="7" />
      <path
        className="pricing-check__tick"
        d="M4.5 7.5l2 2 4-4"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Pricing() {
  const [billing, setBilling] = useState("annual"); // "annual" | "monthly"
  const isMonthly = billing === "monthly";

  const computedPlans = useMemo(() => {
    return PLANS.map((p) => {
      const displayPrice = isMonthly ? p.baseMonthly * 1.15 : p.baseMonthly;
      const sub = isMonthly
        ? `${formatGbp(p.baseMonthly)}/mo equivalent on annual plan`
        : `Billed ${formatGbp(p.baseMonthly * 12)} annually`;
      return { ...p, displayPrice, sub };
    });
  }, [isMonthly]);

  return (
    <main className="pricing-page">
      <div className="pricing-logo">
        <BrandLogo to="/" />
      </div>

      <h1 className="pricing-title">Simple, transparent pricing</h1>
      <p className="pricing-subtitle">Start with any plan. Scale when you&apos;re ready.</p>

      <div className="pricing-trial">
        <span className="pricing-trial__dot" aria-hidden="true" />
        All plans free for 30 days — no card required
      </div>

      <div className="pricing-toggle" role="group" aria-label="Billing period">
        <button
          type="button"
          className={`pricing-toggle__label ${!isMonthly ? "active" : ""}`}
          onClick={() => setBilling("annual")}
        >
          Annual
        </button>

        <label className="pricing-toggle__switch" aria-label="Toggle monthly billing">
          <input
            type="checkbox"
            checked={isMonthly}
            onChange={(e) => setBilling(e.target.checked ? "monthly" : "annual")}
          />
          <span className="pricing-toggle__slider" />
        </label>

        <button
          type="button"
          className={`pricing-toggle__label ${isMonthly ? "active" : ""}`}
          onClick={() => setBilling("monthly")}
        >
          Monthly
        </button>

        {!isMonthly && <span className="pricing-toggle__save">Save 15%</span>}
      </div>

      <div className="pricing-cards">
        {computedPlans.map((plan) => (
          <section key={plan.id} className={`pricing-card ${plan.featured ? "featured" : ""}`}>
            {plan.badge ? <div className="pricing-card__badge">{plan.badge}</div> : null}
            <p className="pricing-card__name">{plan.name}</p>
            <p className="pricing-card__desc">{plan.description}</p>

            <div className="pricing-card__priceRow">
              <span className="pricing-card__price">{formatGbp(plan.displayPrice)}</span>
              <span className="pricing-card__per">/ month</span>
            </div>

            <p className="pricing-card__sub">{plan.sub}</p>

            <hr className="pricing-card__divider" />

            <ul className="pricing-card__features">
              {plan.features.map((f) => (
                <li key={f}>
                  <CheckIcon />
                  {f}
                </li>
              ))}
            </ul>

            <Link to="/signup" className={`pricing-card__cta ${plan.featured ? "primary" : ""}`}>
              Start free trial
            </Link>
          </section>
        ))}
      </div>

      <p className="pricing-note">Cancel anytime. VAT may apply.</p>
    </main>
  );
}

