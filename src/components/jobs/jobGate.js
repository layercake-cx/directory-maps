/**
 * Stale-status gate for server jobs a page starts itself.
 *
 * Starting a publish (or bulk AI run) shows the job as running at once, then polls the directory's status row. The
 * Edge Function only flips that row to "running" a moment later, so an early poll can read the PREVIOUS run's
 * "succeeded" row and the card would announce "live, took 0 s" while the real build had barely begun.
 *
 * The gate remembers when the run was started from this browser. Until the server row shows a run that began at or
 * after that moment (or is running), a finished-looking row is treated as stale and the card stays "running".
 * An explicit `final` refresh (the Edge Function's own reply) or a timeout releases it, so a run that never starts
 * cannot leave the card spinning forever.
 */

export const GATE_SKEW_MS = 5000; // browser and server clocks may differ a little
export const GATE_MAX_MS = 3 * 60 * 1000;

/**
 * @param {{at: number} | undefined} gate  when the run was started here (ms since epoch)
 * @param {{status?: string|null, startedAt?: string|null} | null | undefined} row  server status for the job
 * @param {number} now
 * @returns {"none" | "hold" | "release"} none: no gate; hold: keep showing running; release: show the server row, gate done
 */
export function evaluateGate(gate, row, now = Date.now()) {
  if (!gate) return "none";
  if (now - gate.at > GATE_MAX_MS) return "release";
  if (row?.status === "running") return "release";
  const startedMs = Date.parse(row?.startedAt || "");
  if (Number.isFinite(startedMs) && startedMs >= gate.at - GATE_SKEW_MS) return "release";
  return "hold";
}
