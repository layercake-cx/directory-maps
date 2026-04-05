import { supabase, hasSupabaseConfig } from "./supabase";

let loggingDepth = 0;

function baseContext(extra) {
  const ctx = { ...(extra && typeof extra === "object" ? extra : {}) };
  if (typeof window !== "undefined") {
    ctx.href = window.location?.href ?? "";
    ctx.hash_route = window.location?.hash ?? "";
  }
  ctx.mode = import.meta.env.MODE;
  return ctx;
}

/**
 * Persist a client-side error for admins to review. Safe to call from anywhere;
 * failures only go to console (never throws). user_id is set server-side from the session.
 *
 * @param {object} payload
 * @param {string} payload.type - e.g. window.error, unhandledrejection, react, manual
 * @param {string} payload.message
 * @param {string} [payload.stack]
 * @param {string} [payload.componentStack]
 * @param {string} [payload.severity] - error | warning
 * @param {object} [payload.context] - merged into JSON context
 */
export async function logClientError(payload) {
  const type = String(payload?.type ?? "unknown");
  const message = String(payload?.message ?? "").slice(0, 12000);
  if (!message && !payload?.stack) return;

  if (loggingDepth > 2) {
    if (typeof console !== "undefined" && console.error) {
      console.error("[errorLogger] skipped (recursion guard)", { type, message });
    }
    return;
  }
  loggingDepth += 1;

  try {
    const row = {
      type,
      severity: payload?.severity === "warning" ? "warning" : "error",
      message: message || "(no message)",
      stack: payload?.stack ? String(payload.stack).slice(0, 24000) : null,
      component_stack: payload?.componentStack ? String(payload.componentStack).slice(0, 24000) : null,
      context: baseContext(payload?.context),
      environment: import.meta.env.PROD ? "production" : "development",
      route: typeof window !== "undefined" ? window.location?.hash?.replace(/^#/, "") || "/" : null,
      user_agent: typeof navigator !== "undefined" ? String(navigator.userAgent || "").slice(0, 2000) : null,
    };

    if (!hasSupabaseConfig) {
      if (typeof console !== "undefined" && console.error) {
        console.error("[errorLogger] (no Supabase)", row);
      }
      return;
    }

    const { error } = await supabase.from("error_logs").insert(row);
    if (error && typeof console !== "undefined" && console.error) {
      console.error("[errorLogger] insert failed", error.message, row);
    }
  } catch (e) {
    if (typeof console !== "undefined" && console.error) {
      console.error("[errorLogger] exception", e);
    }
  } finally {
    loggingDepth -= 1;
  }
}

export function installGlobalErrorHandlers() {
  if (typeof window === "undefined") return;

  window.addEventListener(
    "error",
    (event) => {
      logClientError({
        type: "window.error",
        message: event.message || "window.error",
        stack: event.error?.stack,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    },
    true
  );

  window.addEventListener("unhandledrejection", (event) => {
    const r = event.reason;
    const msg = r?.message ?? (typeof r === "string" ? r : String(r));
    logClientError({
      type: "unhandledrejection",
      message: msg || "unhandledrejection",
      stack: r?.stack,
      context: { reason_type: r?.name ?? typeof r },
    });
  });
}
