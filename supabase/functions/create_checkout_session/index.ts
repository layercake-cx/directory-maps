// Creates a Stripe Checkout Session for subscriptions.
// Expects env vars:
// - STRIPE_SECRET_KEY
// - STRIPE_PRICE_STANDARD_MONTHLY, STRIPE_PRICE_STANDARD_YEARLY
// - STRIPE_PRICE_PREMIUM_MONTHLY, STRIPE_PRICE_PREMIUM_YEARLY
// - STRIPE_PRICE_UNLIMITED_MONTHLY, STRIPE_PRICE_UNLIMITED_YEARLY
//
// Request body:
// { plan: "standard"|"premium"|"unlimited", billing: "monthly"|"yearly", success_url?: string, cancel_url?: string }
//
// Response:
// { url: "https://checkout.stripe.com/..." } or { error: "..." }

import Stripe from "https://esm.sh/stripe@12?target=deno";
import { createAnonClient, createServiceClient, requireUser } from "../_shared/supabase.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

type PlanId = "standard" | "premium" | "unlimited";
type BillingInterval = "monthly" | "yearly";

function getPriceId(plan: PlanId, billing: BillingInterval): string {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${billing === "monthly" ? "MONTHLY" : "YEARLY"}`;
  const val = Deno.env.get(key);
  if (!val) {
    throw new Error(`Price not configured for ${plan}/${billing}. Set ${key} in Edge Function secrets.`);
  }
  return val;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let stripe: Stripe;
  try {
    const secret = getEnv("STRIPE_SECRET_KEY");
    stripe = new Stripe(secret, { apiVersion: "2023-10-16" });
  } catch (e) {
    return jsonResponse(
      {
        error:
          e instanceof Error
            ? e.message
            : "Stripe not configured. Set STRIPE_SECRET_KEY in Edge Function secrets.",
      },
      503,
    );
  }

  try {
    const user = await requireUser(req);
    const anon = createAnonClient(req);
    const service = createServiceClient();

    const { data: contactRow, error: contactErr } = await anon
      .from("contacts")
      .select("id, client_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (contactErr) throw contactErr;
    const clientId = contactRow?.client_id ?? null;

    const body = await req.json().catch(() => ({}));
    const planRaw = String(body?.plan || "").toLowerCase();
    const billingRaw = String(body?.billing || "").toLowerCase();
    const plan = (["standard", "premium", "unlimited"] as PlanId[]).includes(planRaw as PlanId)
      ? (planRaw as PlanId)
      : null;
    const billing = (["monthly", "yearly"] as BillingInterval[]).includes(billingRaw as BillingInterval)
      ? (billingRaw as BillingInterval)
      : null;

    if (!plan || !billing) {
      return jsonResponse({ error: "Invalid plan or billing interval." }, 400);
    }

    const successUrl =
      typeof body?.success_url === "string" && body.success_url
        ? body.success_url
        : `${new URL(req.url).origin}/#/client`;
    const cancelUrl =
      typeof body?.cancel_url === "string" && body.cancel_url
        ? body.cancel_url
        : `${new URL(req.url).origin}/#/client`;

    const priceId = getPriceId(plan, billing);

    // Look up or create Stripe customer keyed by Supabase user ID
    let stripeCustomerId: string | null = null;
    try {
      const { data: profileRow, error: profileErr } = await service
        .from("profiles")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profileErr) throw profileErr;
      stripeCustomerId = profileRow?.stripe_customer_id ?? null;
    } catch {
      stripeCustomerId = null;
    }

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: {
          supabase_user_id: user.id,
          client_id: clientId ?? "",
        },
      });
      stripeCustomerId = customer.id;
      try {
        await service
          .from("profiles")
          .upsert({ user_id: user.id, stripe_customer_id: customer.id }, { onConflict: "user_id" });
      } catch {
        // Non-fatal if this fails; checkout session will still work.
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        supabase_user_id: user.id,
        client_id: clientId ?? "",
        plan,
        billing,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          client_id: clientId ?? "",
          plan,
          billing,
        },
      },
    });

    if (!session.url) {
      return jsonResponse({ error: "Failed to create checkout session." }, 500);
    }

    return jsonResponse({ url: session.url });
  } catch (e) {
    console.error("create_checkout_session error", e);
    return jsonResponse(
      {
        error: e instanceof Error ? e.message : "Unexpected error creating checkout session.",
      },
      500,
    );
  }
});

