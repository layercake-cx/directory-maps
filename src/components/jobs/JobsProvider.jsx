import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useToast } from "../ui/index.js";

const JobsContext = createContext(null);
const POLL_MS = 3000;

/**
 * Holds active and recently finished jobs for the whole shell, so the top bar can show them from any page.
 * Server status is the source of truth: `track(id, poll)` keeps polling a job from here (every 3 s while it
 * runs) even after the page that started it unmounts. Browser-bound jobs (geocode, import, sheet sync) call
 * `upsert` themselves.
 */
export function JobsProvider({ children }) {
  const [jobs, setJobs] = useState({});
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const pollers = useRef(new Map());
  const { toast } = useToast();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const [flash, setFlash] = useState(null); // {id, status, at}: drives the indicator's 8 s "Done" and unacknowledged failures
  const [ackFailed, setAckFailed] = useState(0);

  const upsert = useCallback((incoming) => {
    if (!incoming?.id) return;
    const prev = jobsRef.current[incoming.id];
    const wasRunning = prev?.status === "running";
    const job = { ...prev, ...incoming };
    job.seenRunning = !!(prev?.seenRunning || incoming.status === "running");
    // A new run un-hides a dismissed job; a re-poll of the same finished job keeps it hidden.
    job.hidden = incoming.status === "running" ? false : prev && prev.startedAt === incoming.startedAt && prev.status === incoming.status ? !!prev.hidden : false;
    if (wasRunning && incoming.status !== "running") {
      job.finishedAt = incoming.finishedAt || new Date().toISOString();
      const here = incoming.href && pathRef.current.startsWith(incoming.href);
      if (!here) toast(incoming.status === "done" ? incoming.title : `${incoming.title}`, undefined);
      setFlash({ id: incoming.id, status: incoming.status, at: Date.now() });
    }
    jobsRef.current = { ...jobsRef.current, [job.id]: job };
    setJobs(jobsRef.current);
  }, [toast]);

  const dismiss = useCallback((id) => {
    const job = jobsRef.current[id];
    if (!job) return;
    jobsRef.current = { ...jobsRef.current, [id]: { ...job, hidden: true } };
    setJobs(jobsRef.current);
  }, []);

  const track = useCallback((id, poll) => { pollers.current.set(id, poll); }, []);

  useEffect(() => {
    const timer = setInterval(async () => {
      for (const [id, poll] of [...pollers.current.entries()]) {
        try {
          const next = await poll();
          if (next) upsert(next);
          if (!next || next.status !== "running") pollers.current.delete(id);
        } catch {
          /* non-fatal: keep polling; the next tick may succeed */
        }
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [upsert]);

  const acknowledgeFailures = useCallback(() => setAckFailed((n) => n + 1), []);
  const value = useMemo(
    () => ({ jobs, upsert, dismiss, track, flash, ackFailed, acknowledgeFailures, getJob: (id) => jobsRef.current[id] }),
    [jobs, upsert, dismiss, track, flash, ackFailed, acknowledgeFailures],
  );
  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

const EMPTY = { jobs: {}, upsert() {}, dismiss() {}, track() {}, flash: null, ackFailed: 0, acknowledgeFailures() {}, getJob: () => undefined };

/** Safe outside a provider (returns an inert store), so components render in isolation. */
export function useJobs() {
  return useContext(JobsContext) || EMPTY;
}
