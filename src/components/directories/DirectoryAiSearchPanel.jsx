import React, { useEffect, useId, useState } from "react";
import { updateDirectory } from "../../lib/directories.js";
import { useAiFeature } from "../../hooks/useAiFeature.js";
import AiUnavailableNotice from "../../components/ai/AiUnavailableNotice.jsx";
import { Button, Callout, Checkbox, Field, Section, Textarea } from "../ui/index.js";
import "../../styles/wave-a/batch-1.css";

/**
 * Directory-level Help me choose — visitor-facing AI dialogue on the
 * published site (directory_ai_search Edge Function). One admin prompt per
 * directory, mirroring DirectoryAiContentPanel's convention (blank = off).
 * The published search box stays on plain keyword matching regardless.
 */
export default function DirectoryAiSearchPanel({ directory, directoryId, canManage, recordEvent, onSaved }) {
  const ai = useAiFeature("intent_search");
  const formId = useId();
  const [prompt, setPrompt] = useState(directory?.ai_search_prompt ?? "");
  const [webEnabled, setWebEnabled] = useState(!!directory?.ai_search_web_enabled);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setPrompt(directory?.ai_search_prompt ?? "");
    setWebEnabled(!!directory?.ai_search_web_enabled);
  }, [directory?.ai_search_prompt, directory?.ai_search_web_enabled]);

  async function savePrompt(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      setSaving(true);
      const next = prompt.trim() || null;
      const webChanged = webEnabled !== !!directory?.ai_search_web_enabled;
      await updateDirectory(directoryId, { ai_search_prompt: next, ai_search_web_enabled: webEnabled });
      recordEvent?.("directory_ai_search_prompt_updated", { directory_id: directoryId, prompt_set: !!next });
      if (webChanged) {
        recordEvent?.("directory_ai_search_web_toggled", { directory_id: directoryId, enabled: webEnabled });
      }
      setMsg("Saved.");
      onSaved?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return <Callout tone="info">Only an Owner or Manager can change Help me choose settings.</Callout>;
  }

  return (
    <Section
      title="Help me choose"
      description={<>Describe how Help me choose should interpret a visitor&apos;s circumstances and pick relevant entries — e.g. how to weigh location, which categories matter most, or when to ask a follow-up. Leave blank to hide Help me choose on the published site; the search box always stays on fast keyword matching.</>}
      footer={<Button type="submit" form={formId} variant="primary" loading={saving} loadingLabel="Saving…">Save Help me choose settings</Button>}
    >
      {!ai.available && (
        <AiUnavailableNotice
          message={`${ai.message} Until one is connected, Help me choose stays hidden on the published site and keyword search carries on as normal.`}
          href={ai.integrationsHref}
        />
      )}
      {ai.available && webEnabled && ai.plan?.provider && ai.plan.provider !== "anthropic" && (
        <AiUnavailableNotice
          message="Web search for Help me choose is only available on Anthropic. With your current provider, Help me choose will be unavailable to visitors while web search is on."
          href={ai.integrationsHref}
        />
      )}

      <form id={formId} onSubmit={savePrompt} className="b1-form">
        <Field label="Help me choose instructions">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={8}
            placeholder="e.g. Prioritise entries with a matching accreditation, and treat mentions of a UK town or postcode as a location filter."
          />
        </Field>

        <Checkbox
          label="Let the AI search the web for extra context (e.g. to interpret a place, term, or accreditation it doesn't recognise)"
          hint={!prompt.trim() ? "Save instructions above first." : undefined}
          checked={webEnabled}
          disabled={!prompt.trim()}
          onChange={(e) => setWebEnabled(e.target.checked)}
        />

        <Callout tone="info">
          Turning on Help me choose sends a visitor&apos;s conversation (and, with web search enabled, related lookups) to
          your connected AI provider. Only entries already in this directory can ever be shown as results — web results
          can inform the AI&apos;s reasoning but can never add a new entry that isn&apos;t already here. The main search
          box does not send queries to an AI provider.
        </Callout>

        {err ? <Callout tone="danger">{err}</Callout> : null}
        {msg ? <Callout tone="ok">{msg}</Callout> : null}
      </form>
    </Section>
  );
}
