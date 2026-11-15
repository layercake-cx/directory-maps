import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SpinnerIcon, CheckIcon, AlertIcon } from "../ui/index.js";
import { useJobs } from "./JobsProvider.jsx";

const DONE_FLASH_MS = 8000;

/**
 * Top-bar task indicator: hidden until a job exists this session. "N running" with a spinner; green "Done"
 * for 8 s after a finish; red "N failed" until opened. Click opens a popover listing jobs with mini progress
 * bars, each linking to the page that owns it.
 */
export default function TaskIndicator() {
  const { jobs, flash } = useJobs();
  const [open, setOpen] = useState(false);
  const [doneVisible, setDoneVisible] = useState(false);
  const [, setAckTick] = useState(0);
  const wrap = useRef(null);
  const btn = useRef(null);

  const list = Object.values(jobs).filter((j) => !j.hidden && (j.status !== "done" || j.seenRunning));
  const running = list.filter((j) => j.status === "running");
  const failed = list.filter((j) => j.status === "failed");

  useEffect(() => {
    if (flash?.status === "done") {
      setDoneVisible(true);
      const t = setTimeout(() => setDoneVisible(false), DONE_FLASH_MS);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [flash]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // Failures stay red until the user has opened the popover over them (a new run has a new startedAt).
  const showFailed = failed.length > 0 && !failed.every((j) => ackedFailedIds.has(j.id + j.startedAt));

  if (list.length === 0) return null;

  let state = "running";
  let label;
  if (running.length) label = `${running.length} running`;
  else if (showFailed) { state = "failed"; label = `${failed.length} failed`; }
  else if (doneVisible) { state = "done"; label = "Done"; }
  else label = `${list.length} ${list.length === 1 ? "task" : "tasks"}`;

  function toggle() {
    setOpen((v) => !v);
    failed.forEach((j) => ackedFailedIds.add(j.id + j.startedAt));
    setAckTick((n) => n + 1);
  }

  const cls = ["task-indicator", state === "failed" && "task-indicator--failed", state === "done" && "task-indicator--done"].filter(Boolean).join(" ");
  return (
    <div className="task-wrap" ref={wrap}>
      <button ref={btn} type="button" className={cls} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
        {running.length ? <SpinnerIcon className="btn-spinner" /> : state === "failed" ? <AlertIcon size={14} /> : state === "done" ? <CheckIcon size={14} /> : null}
        <span>{label}</span>
      </button>
      {open ? (
        <div className="task-popover" role="dialog" aria-label="Background tasks">
          <div className="task-popover-head">Tasks</div>
          {list.map((j) => {
            const pct = j.total ? Math.min(100, Math.round(((j.processed ?? 0) / j.total) * 100)) : null;
            const inner = (
              <>
                <span className="task-item-title">{j.title}</span>
                <span className="task-item-sub">{j.status === "running" ? (pct != null ? `${pct}% · ${j.processed ?? 0} of ${j.total}` : "Working…") : j.status === "done" ? "Finished" : "Failed"}</span>
                {j.status === "running" ? (
                  <span className={`progress progress--sm ${pct != null ? "" : "progress--indeterminate"}`} aria-hidden="true">
                    <span className="progress-fill" style={pct != null ? { width: `${pct}%` } : undefined /* dynamic: progress width */} />
                  </span>
                ) : null}
              </>
            );
            return j.href ? <Link key={j.id} to={j.href} className="task-item" onClick={() => setOpen(false)}>{inner}</Link> : <div key={j.id} className="task-item">{inner}</div>;
          })}
        </div>
      ) : null}
    </div>
  );
}

// Failures the user has opened the popover over (kept for the session; a new run has a new startedAt).
const ackedFailedIds = new Set();
