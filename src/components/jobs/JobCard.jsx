import React, { useEffect, useRef, useState } from "react";
import { Button, SparkIcon, SpinnerIcon, CheckIcon, AlertIcon } from "../ui/index.js";
import { formatElapsed, timeLeftLabel } from "./jobCopy.js";

/** Ticks once a second while `active`, so elapsed time updates without re-polling. */
export function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function percentOf(job) {
  if (!job.total) return null;
  return Math.min(100, Math.round(((job.processed ?? 0) / job.total) * 100));
}

/**
 * JobCard: the progress surface for long work. Place it first after PageHead on the owning page.
 * Running (determinate or indeterminate), done (green, outcome and next step) and failed (red, says what is
 * still live, technical error in <details>, Try again). Announces start, each 25% boundary and the end, never every poll.
 * @param {{ job: object, onRetry?: () => void, onDismiss?: () => void, primaryAction?: React.ReactNode, compact?: boolean }} props
 */
export default function JobCard({ job, onRetry, onDismiss, primaryAction, compact = false }) {
  const running = job?.status === "running";
  const now = useNow(running);
  const [announce, setAnnounce] = useState("");
  const last = useRef({ status: null, bucket: -1 });

  const percent = job ? percentOf(job) : null;
  useEffect(() => {
    if (!job) return;
    const bucket = percent == null ? -1 : Math.floor(percent / 25);
    if (last.current.status !== job.status) {
      setAnnounce(job.status === "running" ? `${job.title} started.` : job.status === "done" ? `${job.title}.` : `${job.title}. ${job.detail || ""}`);
    } else if (running && bucket > last.current.bucket && bucket > 0) {
      setAnnounce(`${bucket * 25} percent done.`);
    }
    last.current = { status: job.status, bucket };
  }, [job, percent, running]);

  if (!job) return null;
  const done = job.status === "done";
  const failed = job.status === "failed";
  const started = job.startedAt ? new Date(job.startedAt).getTime() : null;
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : now;
  const elapsed = started ? formatElapsed(end - started) : null;
  const left = running ? timeLeftLabel({ processed: job.processed, total: job.total, startedAt: job.startedAt, now }) : null;
  const activeIdx = job.steps ? job.steps.findIndex((s) => s.state === "active") : -1;

  const cls = ["job-card", done && "job-card--done", failed && "job-card--failed", compact && "job-card--compact"].filter(Boolean).join(" ");
  const iconCls = ["job-card-icon", job.isAi && "job-card-icon--ai"].filter(Boolean).join(" ");

  let valueText;
  if (percent != null) valueText = `${job.processed ?? 0} of ${job.total} done`;
  else if (activeIdx >= 0) valueText = `Step ${activeIdx + 1} of ${job.steps.length}, ${job.steps[activeIdx].label.toLowerCase()}`;
  else valueText = "In progress";

  return (
    <div className={cls} data-status={job.status} role={failed ? "alert" : "status"} aria-live={failed ? "assertive" : "polite"}>
      <div className="job-card-main">
        <div className={iconCls} aria-hidden="true">
          {running ? (job.isAi ? <SparkIcon size={24} className="spark--spin" /> : <SpinnerIcon className="spinner" />)
            : done ? <CheckIcon size={24} /> : <AlertIcon size={24} />}
        </div>
        <div className="job-card-text">
          <h2 className="job-card-title">{job.title}</h2>
          {job.detail ? <p className="job-card-detail">{job.detail}</p> : null}
          {failed && job.error ? (
            <details className="job-card-error">
              <summary>Technical details</summary>
              <code>{job.error}</code>
            </details>
          ) : null}
          {elapsed ? <span className="job-card-meta">{done ? `Took ${elapsed}` : failed ? `Ran for ${elapsed}` : `Running for ${elapsed}${left ? ` · ${left}` : ""}`}</span> : null}
        </div>
        {running && percent != null ? <span className="job-card-percent">{percent}%</span> : null}
      </div>

      {running ? (
        <div className="job-card-progress">
          <div
            className={`progress progress--sm ${percent != null ? "progress--striped" : "progress--indeterminate"}`}
            role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={valueText}
          >
            <div className="progress-fill" style={percent != null ? { width: `${percent}%` } : undefined /* dynamic: progress width */} />
          </div>
        </div>
      ) : null}
      {running && percent != null ? (
        <div className="job-card-counts"><span>{job.processed ?? 0} of {job.total} entries done</span></div>
      ) : null}

      {job.steps ? (
        <ol className="job-steps">
          {job.steps.map((s) => (
            <li key={s.label} className="job-step" data-state={s.state}>
              <span className="job-step-dot" aria-hidden="true">{s.state === "done" ? <CheckIcon size={12} /> : null}</span>
              <span>{s.label}</span>
              <span className="sr-only">{s.state === "done" ? " (done)" : s.state === "active" ? " (in progress)" : " (to do)"}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {(done || failed) && (primaryAction || onRetry || onDismiss) ? (
        <div className="job-card-actions">
          {done ? primaryAction : null}
          {failed && onRetry ? <Button variant="primary" onClick={onRetry}>Try again</Button> : null}
          {failed ? primaryAction : null}
          {onDismiss ? <Button variant="ghost" onClick={onDismiss}>Dismiss</Button> : null}
        </div>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">{announce}</span>
    </div>
  );
}
