import { appUrl } from "./url.js";

/**
 * URL Supabase should redirect to after OAuth (must be allowed in Supabase Auth URL list).
 */
export function getOAuthRedirectUrl() {
  return appUrl("client");
}

/**
 * Email verification after password signup redirects here so the session lands on the client portal route.
 * Add this exact URL (and localhost dev) to Supabase Auth → URL configuration → Redirect URLs.
 */
export function getEmailAuthRedirectUrl() {
  return appUrl("client?verified=1");
}

export function getPasswordResetRedirectUrl() {
  return appUrl("reset-password");
}

/**
 * Sign-up OTP can fail with duplicate-user style errors; retry with sign-in OTP (same email, no new user).
 * Does not apply to email_address_invalid — that is format/policy rejection, not "already registered".
 */
export function shouldRetrySignUpOtpAsSignIn(error) {
  if (!error) return false;
  const code = String(error.code || "").toLowerCase();
  if (["email_exists", "user_already_exists", "conflict"].includes(code)) return true;
  const m = String(error.message || "").toLowerCase();
  return /\b(already registered|already exists|email exists)\b/.test(m);
}

/** Max wait for slug RPC during signup before continuing without it (ms). */
export const SLUG_RPC_WAIT_MS = 10000;

/**
 * Magic-link requests can take a long time when Supabase uses custom SMTP (SendGrid handshake).
 * If this is shorter than the server response, the UI shows a timeout even after the email is sent.
 */
export const OTP_REQUEST_TIMEOUT_MS = 180000;

/**
 * Best-effort slug availability via RPC. If the request does not finish within SLUG_RPC_WAIT_MS
 * (slow network, stalled HTTP, etc.), returns status "skipped" so signup can continue—duplicates
 * are still caught when provisioning the client after email verification (unique slug + provision).
 *
 * @returns {Promise<{ status: 'available' | 'taken' | 'error' | 'skipped', error?: object }>}
 */
export async function checkClientSlugAvailable(supabase, slug) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve({ __timeout: true }), SLUG_RPC_WAIT_MS);
  });
  const rpcPromise = supabase.rpc("is_client_slug_available", { p_slug: slug }).then((res) => {
    clearTimeout(timeoutId);
    return { __timeout: false, data: res.data, error: res.error };
  });

  const w = await Promise.race([rpcPromise, timeoutPromise]);
  if (w.__timeout) {
    return { status: "skipped" };
  }
  if (w.error) return { status: "error", error: w.error };
  if (w.data === false) return { status: "taken" };
  return { status: "available" };
}

const DEFAULT_OTP_TIMEOUT_HINT =
  "Magic links use Supabase Auth; with custom SMTP, check Authentication → Emails (e.g. smtp.sendgrid.net:587, user apikey, SendGrid API key with Mail Send).";

const DEFAULT_DB_TIMEOUT_HINT =
  "This step only calls your Supabase database (not email). Check the project is not paused, your network/VPN is stable, and the is_client_slug_available migration is applied.";

/**
 * Bound how long we wait on Supabase (slow DB or SMTP handshakes otherwise leave the UI stuck).
 * @param {string} [timeoutHint] - Shown after timeout; omit to use a hint based on `label` (OTP vs DB).
 */
export function withTimeout(promise, ms, label = "Request", timeoutHint) {
  const hint =
    timeoutHint ??
    (String(label).toLowerCase().includes("sign-up") || String(label).toLowerCase().includes("sign-in")
      ? DEFAULT_OTP_TIMEOUT_HINT
      : DEFAULT_DB_TIMEOUT_HINT);
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. ${hint}`));
      }, ms);
    }),
  ]);
}

/** Extra context for common Supabase Auth OTP errors (user-facing). */
export function authOtpErrorHint(error) {
  if (!error) return "";
  if (error.code === "email_address_invalid") {
    return " This means the auth service rejected the email (format, hook, or domain rules). It is not the same as “this email is already registered.”";
  }
  if (error.code === "over_email_send_rate_limit") {
    return " Supabase limits how many auth emails can be sent per hour (stricter on the free tier). Wait a bit, avoid repeated tests, or use custom SMTP / a higher plan for more capacity.";
  }
  return "";
}
