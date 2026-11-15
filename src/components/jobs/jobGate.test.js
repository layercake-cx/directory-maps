// Run: node --test src/components/jobs/jobGate.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGate, GATE_MAX_MS } from "./jobGate.js";

const T = Date.parse("2026-11-15T21:22:00.000Z");
const iso = (ms) => new Date(ms).toISOString();

test("no gate means the server row is used as is", () => {
  assert.equal(evaluateGate(undefined, { status: "succeeded", startedAt: iso(T) }, T), "none");
});

test("holds while the row is the previous run's finished status (the 'took 0 s' case)", () => {
  const gate = { at: T };
  assert.equal(evaluateGate(gate, { status: "succeeded", startedAt: iso(T - 10 * 60_000) }, T + 1000), "hold");
  assert.equal(evaluateGate(gate, { status: "failed", startedAt: iso(T - 60_000) }, T + 1000), "hold");
  assert.equal(evaluateGate(gate, { status: "succeeded", startedAt: null }, T + 1000), "hold");
  assert.equal(evaluateGate(gate, null, T + 1000), "hold");
});

test("releases once the server shows the new run running", () => {
  assert.equal(evaluateGate({ at: T }, { status: "running", startedAt: iso(T - 10 * 60_000) }, T + 1000), "release");
});

test("releases when a finished row started at or after the click, allowing for small clock skew", () => {
  assert.equal(evaluateGate({ at: T }, { status: "succeeded", startedAt: iso(T + 500) }, T + 3000), "release");
  assert.equal(evaluateGate({ at: T }, { status: "succeeded", startedAt: iso(T - 4000) }, T + 3000), "release");
  assert.equal(evaluateGate({ at: T }, { status: "succeeded", startedAt: iso(T - 6000) }, T + 3000), "hold");
});

test("releases after the timeout so a run that never starts cannot spin forever", () => {
  assert.equal(evaluateGate({ at: T }, { status: "succeeded", startedAt: iso(T - 60_000) }, T + GATE_MAX_MS + 1), "release");
});
