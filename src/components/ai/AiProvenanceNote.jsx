import React, { useState } from "react";
import DraftingPromptModal from "./DraftingPromptModal.jsx";
import "./ai.css";

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" />
    </svg>
  );
}

/**
 * The short "how this AI works" line that sits next to every AI button, with an optional
 * "View drafting prompt" link that opens the read-only prompt. Use the same component and
 * wording everywhere; only `entityName` and (where the AI uses a built-in prompt rather than an
 * admin-configured one) `loadPrompt` differ. Without `loadPrompt` the note has no link.
 *
 * Wording is deliberately literal about what the AI does: the generators draft from the
 * entry's stored details (including its web address); they do not browse the site.
 */
export default function AiProvenanceNote({
  loadPrompt,
  entityName = "listing",
  children,
  compact = false,
  id,
  onGenerateFromModal,
  canGenerate = true,
  onViewPrompt,
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={`ai-note${compact ? " ai-note--compact" : ""}`} id={id}>
        <InfoIcon />
        <p style={{ margin: 0 }}>
          {children ?? (
            <>
              AI drafts this from the details we hold for this {entityName}, including its web address, following a drafting prompt set by
              the directory&rsquo;s administrators. Nothing is saved or published until you choose to.
            </>
          )}
          {(loadPrompt || onViewPrompt) && (
            <>
              {" "}
              <button type="button" className="ai-note__link" onClick={() => (onViewPrompt ? onViewPrompt() : setOpen(true))}>View drafting prompt</button>
            </>
          )}
        </p>
      </div>
      {loadPrompt && !onViewPrompt && (
        <DraftingPromptModal
          opened={open}
          onClose={() => setOpen(false)}
          loadPrompt={loadPrompt}
          entityName={entityName}
          onGenerate={onGenerateFromModal}
          canGenerate={canGenerate}
        />
      )}
    </>
  );
}
