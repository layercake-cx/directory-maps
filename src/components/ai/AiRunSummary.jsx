import React, { useEffect, useState } from "react";
import { costTierLabel, costTierSymbol } from "../../lib/clientIntegrations.js";
import "../../styles/wave-a/batch-4.css";
import { estimateRunCost, fetchAverageTokens, formatMoney, formatTokens, usageBand } from "../../lib/aiUsage.js";

/**
 * "What will this bulk run use?" block for confirm dialogs: provider, model, how many records,
 * and a rough usage band + estimated cost -- only when this organisation has usage history for the
 * feature (and the model has known prices). Never claims an exact cost.
 */
export default function AiRunSummary({ plan, count, clientId, directoryId, featureKey, catalogue }) {
  const [avg, setAvg] = useState(undefined); // undefined = loading, null = no history

  useEffect(() => {
    let cancelled = false;
    if (!clientId || !featureKey) return undefined;
    fetchAverageTokens(clientId, directoryId, featureKey).then((v) => {
      if (!cancelled) setAvg(v);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, directoryId, featureKey]);

  if (!plan?.available) return null;
  const model = (catalogue ?? []).find((m) => m.provider === plan.provider && m.model_id === plan.model);
  const totalTokens = avg && count != null ? Math.round((avg.input + avg.output) * count) : null;
  const cost = avg && count != null ? estimateRunCost(plan, avg, count) : null;

  return (
    <div className="b4-ai-summary">
      <div>
        <strong>{count == null ? "Every" : count} {count === 1 ? "record" : "records"}</strong> will be processed by{" "}
        <strong>{model?.label ?? plan.model}</strong> ({plan.provider}
        {plan.source === "platform" ? ", Layercake's account" : ", your account"})
        {model ? ` · ${costTierSymbol(model.cost_tier)} ${costTierLabel(model.cost_tier)}` : ""}.
      </div>
      {avg === undefined ? null : avg === null ? (
        <div className="b4-ai-report-muted">No usage history for this feature yet, so there is no estimate.</div>
      ) : (
        <div>
          Estimated usage: <strong>{usageBand(totalTokens)}</strong> (about {formatTokens(totalTokens)} tokens
          {cost ? <>, estimated provider cost about <strong>{formatMoney(cost.amount, cost.currency)}</strong></> : null})
          <div className="b4-ai-summary-fine">
            Based on your last {avg.sample} requests. Estimates are informational; your AI provider account is the
            authoritative source for billing.
          </div>
        </div>
      )}
    </div>
  );
}
