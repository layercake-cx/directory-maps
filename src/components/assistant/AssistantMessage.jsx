import React from "react";
import { Link } from "react-router-dom";
import { Button, Callout, useToast } from "../ui/index.js";
import pipFace from "../../assets/pip/pip-badge-face.svg";
import SuggestedAction from "./SuggestedAction.jsx";
import { resolveLink } from "./mockResponses.js";
import { ASSISTANT_NAME } from "./constants.js";

/**
 * One conversation message. User bubbles sit right (ink); Pip replies sit left with the 24px face avatar,
 * sources as links to real routes, an optional action card, and Helpful / Not helpful / Copy (they only toast in the preview).
 */
export default function AssistantMessage({ message, params, base, onRetry, onNavigate }) {
  const { toast } = useToast();
  if (message.role === "user") return <div className="pip-msg-user">{message.text}</div>;

  let body;
  if (message.kind === "error") {
    body = (
      <Callout tone="danger" title="Something went wrong" action={<Button size="sm" onClick={onRetry}>Try again</Button>}>
        Nothing has been changed. Try again in a moment.
      </Callout>
    );
  } else if (message.kind === "unavailable") {
    body = (
      <Callout tone="info" title={`${ASSISTANT_NAME} isn't available right now`}>
        You can keep working as normal. The guides and the rest of the app are not affected.
      </Callout>
    );
  } else {
    body = (
      <>
        {(message.paragraphs || []).map((p, i) => <p key={i}>{p}</p>)}
        {message.sources?.length ? (
          <div className="pip-sources">
            <span className="setting-row-desc">Sources:</span>
            {message.sources.map((s) => (
              <Link key={s.to + s.label} to={resolveLink(s.to, message.params || params, message.base || base)} onClick={onNavigate}>{s.label}</Link>
            ))}
          </div>
        ) : null}
        {message.action ? <SuggestedAction action={message.action} params={message.params || params} base={message.base || base} onNavigate={onNavigate} /> : null}
        {message.kind === "reply" ? (
          <div className="pip-feedback" role="group" aria-label="Was this helpful?">
            <Button size="sm" variant="ghost" onClick={() => toast("Thanks")}>Helpful</Button>
            <Button size="sm" variant="ghost" onClick={() => toast("Thanks")}>Not helpful</Button>
            <Button size="sm" variant="ghost" onClick={() => toast("Thanks")}>Copy</Button>
          </div>
        ) : null}
      </>
    );
  }
  return (
    <div className="pip-msg-pip">
      <img className="pip-avatar pip-avatar--sm" src={pipFace} alt="" />
      <div className="pip-msg-body">{body}</div>
    </div>
  );
}
