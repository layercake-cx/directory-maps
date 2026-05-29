import React, { useState } from "react";
import { supabase, invokeFunction } from "../lib/supabase";
import { invokeEdgeFunction } from "../lib/edgeFunctionFetch.js";

const PLANS = [
  {
    id: "standard",
    name: "Standard",
    description: "For small teams with 1–2 maps.",
    mapsLabel: "1–2 maps",
    yearlyPrice: 250,
  },
  {
    id: "premium",
    name: "Premium",
    description: "For growing programmes with multiple maps.",
    mapsLabel: "3–5 maps",
    yearlyPrice: 350,
  },
  {
    id: "unlimited",
    name: "Unlimited",
    description: "For organisations running maps at scale.",
    mapsLabel: "Unlimited maps",
    yearlyPrice: 650,
  },
];

function formatPrice(yearly, billing) {
  if (billing === "yearly") return `£${yearly.toLocaleString()}/year`;
  const monthly = Math.round(((yearly / 12) * 1.2) * 10) / 10;
  return `£${monthly.toLocaleString()}/month`;
}

export default function PricingPlans({ originSection }) {
  const [billing, setBilling] = useState("yearly"); // "monthly" | "yearly"
  const [loadingPlanId, setLoadingPlanId] = useState("");
  const [err, setErr] = useState("");
  const [poaForm, setPoaForm] = useState({
    name: "",
    email: "",
    organisation: "",
    message: "",
  });
  const [poaSubmitting, setPoaSubmitting] = useState(false);
  const [poaSent, setPoaSent] = useState(false);

  async function startCheckout(planId) {
    setErr("");
    setLoadingPlanId(planId);
    try {
      const baseUrl = window.location.origin;
      const success_url = `${baseUrl}/#/client`;
      const cancel_url = `${baseUrl}/#/client`;
      const { data, error } = await invokeFunction("create_checkout_session", {
        body: {
          plan: planId,
          billing,
          success_url,
          cancel_url,
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No checkout URL returned from server.");
      window.location.assign(data.url);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoadingPlanId("");
    }
  }

  async function submitPoa(e) {
    e?.preventDefault?.();
    setErr("");
    setPoaSent(false);
    const name = poaForm.name.trim();
    const email = poaForm.email.trim();
    const organisation = poaForm.organisation.trim();
    const message = poaForm.message.trim();
    if (!email || !message) {
      setErr("Email and message are required for a PoA enquiry.");
      return;
    }
    setPoaSubmitting(true);
    try {
      const composed = [
        originSection ? `Section: ${originSection}` : "",
        organisation ? `Organisation: ${organisation}` : "",
        name ? `Name: ${name}` : "",
        "",
        message,
      ]
        .filter(Boolean)
        .join("\n");

      await invokeEdgeFunction("send_contact_message", {
        toEmail: "info@example.com",
        listingName: "Directory Maps – PoA enquiry",
        senderName: name || organisation || email,
        senderEmail: email,
        senderPhone: "",
        message: composed,
      });
      setPoaSent(true);
      setPoaForm({
        name: "",
        email,
        organisation,
        message: "",
      });
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setPoaSubmitting(false);
    }
  }

  return (
    <div className="pricing-section">
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 4px 0", fontSize: 18 }}>Choose a plan</h3>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
          Publish your maps and enable embeds with a subscription. You can test everything in Stripe&apos;s test mode.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 13, opacity: 0.85 }}>Billing</div>
        <div
          style={{
            display: "inline-flex",
            padding: 4,
            borderRadius: 999,
            background: "var(--lc-card, #f3f4f6)",
            border: "1px solid var(--lc-border, #e5e7eb)",
          }}
        >
          {["yearly", "monthly"].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setBilling(mode)}
              className={billing === mode ? "btn btn-primary" : "btn"}
              style={{
                borderRadius: 999,
                padding: "4px 12px",
                fontSize: 12,
                border: "none",
                background: billing === mode ? "var(--lc-brand)" : "transparent",
                color: billing === mode ? "#fff" : "inherit",
              }}
            >
              {mode === "yearly" ? "Yearly (best value)" : "Monthly"}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className="admin-card"
            style={{
              padding: 16,
              borderRadius: 16,
              border: "1px solid var(--lc-border)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <h4 style={{ margin: 0, fontSize: 16 }}>{plan.name}</h4>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.06, opacity: 0.8 }}>
              {plan.mapsLabel}
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}>
              {formatPrice(plan.yearlyPrice, billing)}
            </div>
            <p style={{ margin: "4px 0 8px 0", fontSize: 13, opacity: 0.85 }}>{plan.description}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => startCheckout(plan.id)}
              disabled={!!loadingPlanId}
            >
              {loadingPlanId === plan.id ? "Redirecting…" : "Continue with Stripe"}
            </button>
          </div>
        ))}
      </div>

      <div
        className="admin-card"
        style={{
          padding: 16,
          borderRadius: 16,
          border: "1px solid var(--lc-border)",
          marginTop: 4,
        }}
      >
        <h4 style={{ margin: "0 0 6px 0", fontSize: 15 }}>Need a custom integration (PoA)?</h4>
        <p style={{ margin: "0 0 10px 0", fontSize: 13, opacity: 0.85 }}>
          For integrating data directly from your internal systems or CRMs, contact us for a price-on-application engagement.
        </p>

        {poaSent ? (
          <p style={{ margin: "0 0 8px 0", fontSize: 13, color: "var(--lc-brand, #047857)" }}>
            Thanks — your enquiry has been sent. We&apos;ll be in touch.
          </p>
        ) : null}

        <form
          onSubmit={submitPoa}
          style={{ display: "grid", gap: 8, maxWidth: 520 }}
        >
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", maxWidth: 520 }}>
            <label style={{ fontSize: 12, opacity: 0.85 }}>
              Name
              <input
                type="text"
                value={poaForm.name}
                onChange={(e) => setPoaForm((f) => ({ ...f, name: e.target.value }))}
                style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--lc-border)" }}
              />
            </label>
            <label style={{ fontSize: 12, opacity: 0.85 }}>
              Organisation
              <input
                type="text"
                value={poaForm.organisation}
                onChange={(e) => setPoaForm((f) => ({ ...f, organisation: e.target.value }))}
                style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--lc-border)" }}
              />
            </label>
          </div>
          <label style={{ fontSize: 12, opacity: 0.85 }}>
            Email (required)
            <input
              type="email"
              value={poaForm.email}
              onChange={(e) => setPoaForm((f) => ({ ...f, email: e.target.value }))}
              required
              style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--lc-border)" }}
            />
          </label>
          <label style={{ fontSize: 12, opacity: 0.85 }}>
            Tell us briefly about your systems and what you&apos;d like to integrate (required)
            <textarea
              value={poaForm.message}
              onChange={(e) => setPoaForm((f) => ({ ...f, message: e.target.value }))}
              required
              rows={3}
              style={{
                width: "100%",
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid var(--lc-border)",
                resize: "vertical",
              }}
            />
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <button
              type="submit"
              className="btn"
              disabled={poaSubmitting}
            >
              {poaSubmitting ? "Sending…" : "Send PoA enquiry"}
            </button>
            {err ? (
              <span style={{ fontSize: 12, color: "#b91c1c" }}>{err}</span>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

