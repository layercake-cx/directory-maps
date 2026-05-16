import { invokeEdgeFunction } from "./edgeFunctionFetch.js";

const EDGE_FUNCTION_DEPLOY_HINT =
  "The contact email service could not be reached. Deploy send_contact_message with --no-verify-jwt to the Supabase project in VITE_SUPABASE_URL. See docs/RESEND_EMAIL.md.";

export function formatContactMessageError(err) {
  const msg = err?.message ?? String(err ?? "Failed to send message.");
  if (msg.includes(EDGE_FUNCTION_DEPLOY_HINT)) return msg;
  if (
    /failed to send a request to the edge function/i.test(msg) ||
    /failed to fetch/i.test(msg) ||
    /network error/i.test(msg) ||
    /could not reach the edge function/i.test(msg) ||
    err?.name === "EdgeFunctionNetworkError"
  ) {
    return `${msg}\n\n${EDGE_FUNCTION_DEPLOY_HINT}`;
  }
  return msg;
}

/**
 * Persist a directory contact form submission for client reporting.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} row
 */
export async function logContactSubmission(supabase, row) {
  const { error } = await supabase.from("map_contact_submissions").insert(row);
  if (error) {
    console.warn("map_contact_submissions:", error.message ?? error);
  }
  return { error };
}

/**
 * Log submission, send email via Edge Function, then record delivery outcome on failure.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} opts
 */
export async function submitContactMessage(supabase, opts) {
  const {
    mapId,
    listingId,
    listingName,
    toEmail,
    senderName,
    senderEmail,
    senderPhone,
    message,
    surface,
  } = opts;

  const baseRow = {
    map_id: mapId,
    listing_id: listingId ?? null,
    listing_name: listingName || null,
    to_email: toEmail,
    sender_name: senderName || null,
    sender_email: senderEmail,
    sender_phone: senderPhone || null,
    message,
    surface: surface || "embed",
  };

  await logContactSubmission(supabase, baseRow);

  try {
    return await invokeEdgeFunction("send_contact_message", {
      mapId,
      toEmail,
      listingName: listingName || "",
      senderName: senderName || "",
      senderEmail,
      senderPhone: senderPhone || "",
      message,
    });
  } catch (err) {
    const formatted = formatContactMessageError(err);
    await logContactSubmission(supabase, {
      ...baseRow,
      email_sent: false,
      email_error: formatted,
    });
    throw new Error(formatted);
  }
}
