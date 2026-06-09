import { createServiceClient } from "./supabase.ts";

/**
 * Write an error to error_logs from inside an Edge Function.
 * The DB trigger on error_logs will forward production errors to Teams automatically.
 * Never throws — logging must not break the calling function.
 */
export async function logEdgeFunctionError(params: {
  fn: string;
  message: string;
  context?: Record<string, unknown>;
}) {
  try {
    const service = createServiceClient();
    await service.from("error_logs").insert({
      type: "edge_function",
      severity: "error",
      message: String(params.message).slice(0, 12000),
      environment: Deno.env.get("ENVIRONMENT") ?? "production",
      context: { source: "edge_function", fn: params.fn, ...(params.context ?? {}) },
    });
  } catch {
    // Swallow — never let logging break the caller
  }
}
