import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Pill, useToast, ArrowRightIcon } from "../ui/index.js";
import { JobCard } from "../jobs/index.js";
import { resolveLink } from "./mockResponses.js";

const FAKE_JOB_MS = 6000;

/**
 * Action card for a canned suggestion. In the preview nothing is changed:
 * - Apply shows a Toast "Preview: this would ... Nothing was changed."; for job actions it also shows a compact,
 *   clearly fake JobCard that runs 0 to 100% locally over about 6 seconds.
 * - Show me where navigates to the real route and closes the drawer.
 */
export default function SuggestedAction({ action, params, base, onNavigate }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [fake, setFake] = useState(null); // { progress, startedAt }
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);

  const lower = action.title.charAt(0).toLowerCase() + action.title.slice(1);
  const target = action.to ? resolveLink(action.to, params, base) : null;

  function apply() {
    toast(`Preview: this would ${lower}. Nothing was changed.`);
    if (action.type === "job" && !fake) {
      const startedAt = new Date().toISOString();
      setFake({ progress: 0, startedAt });
      const t0 = Date.now();
      timer.current = setInterval(() => {
        const p = Math.min(100, Math.round(((Date.now() - t0) / FAKE_JOB_MS) * 100));
        setFake({ progress: p, startedAt });
        if (p >= 100) clearInterval(timer.current);
      }, 250);
    }
  }

  const job = fake ? {
    id: "preview-job", kind: "preview", status: fake.progress >= 100 ? "done" : "running", seenRunning: true,
    title: fake.progress >= 100 ? `${action.title}: preview finished` : action.title,
    detail: "Preview: nothing is being run.", processed: fake.progress, total: 100, hideCounts: true,
    startedAt: fake.startedAt, isAi: action.jobKind?.startsWith("ai"),
  } : null;

  return (
    <div className="pip-action-card">
      <div>
        <strong className="setting-row-label">{action.title}</strong>
        {action.detail ? <p className="setting-row-desc" style={{ margin: "2px 0 0" }}>{action.detail}</p> : null}
      </div>
      {job ? (
        <div>
          <Pill tone="ai">Preview</Pill>
          <JobCard job={job} compact />
        </div>
      ) : null}
      <div className="pip-action-buttons">
        {action.type !== "navigate" ? <Button size="sm" variant="primary" onClick={apply} disabled={!!fake}>Apply</Button> : null}
        {target ? (
          <Button size="sm" icon={<ArrowRightIcon />} onClick={() => { navigate(target); onNavigate?.(); }}>Show me where</Button>
        ) : null}
      </div>
    </div>
  );
}
