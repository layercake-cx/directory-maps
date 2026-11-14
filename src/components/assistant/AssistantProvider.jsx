import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { FeatureFlagsContext } from "../../context/featureFlagsContext.js";
import { ASSISTANT_PREVIEW_FLAG } from "../../lib/featureFlags.js";
import { AskPipContext } from "../ui/index.js";
import { conversationKey, NOTICE_SEEN_KEY, TEST_COMMANDS } from "./constants.js";
import { MOCK, findPromptByText, randomThinkingLabel, thinkingDelayMs } from "./mockResponses.js";
import useAssistantContext from "./useAssistantContext.js";
import AssistantDrawer from "./AssistantDrawer.jsx";

const AssistantContext = createContext(null);
export function useAssistant() {
  return useContext(AssistantContext);
}

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc: the conversation just won't persist */ }
}

/**
 * Ask Pip: UI preview only. Mocked, local, canned replies: no network calls, no LLM, nothing is changed by Apply.
 * Owns open/close state, the conversation (sessionStorage per workspace), the Cmd/Ctrl+J shortcut (the only global
 * keydown handler for the assistant) and the two admin events. Renders the drawer inside .shell.
 * Gate: staff get it unless the registry turns the flag off; customers only if the registry turns it on.
 */
export default function AssistantProvider({ context, isStaff, orgName, activeClientId, contact, userId, firstName, children }) {
  const flags = useContext(FeatureFlagsContext)?.flags;
  const flagValue = flags?.[ASSISTANT_PREVIEW_FLAG];
  const enabled = isStaff ? flagValue !== false : flagValue === true;

  const key = conversationKey(activeClientId);
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState("");
  const [sectionContext, setSectionContext] = useState(null);
  const [messages, setMessages] = useState(() => readJson(sessionStorage, key, []));
  const [thinking, setThinking] = useState(null); // { label } while a canned reply is "being written"
  const [announce, setAnnounce] = useState("");
  const returnFocus = useRef(null);
  const timer = useRef(null);
  const nextId = useRef(1);
  const lastUser = useRef("");

  const page = useAssistantContext({ orgName, context });
  const pageRef = useRef(page);
  pageRef.current = page;

  // A different workspace has its own conversation.
  useEffect(() => { setMessages(readJson(sessionStorage, key, [])); setThinking(null); }, [key]);
  useEffect(() => { writeJson(sessionStorage, key, messages); }, [key, messages]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const record = useCallback((eventType, extra) => {
    const role = contact?.role;
    const scope = isStaff ? "platform_admin" : role === "owner" ? "client_owner" : role === "manager" ? "client_manager" : "client_member";
    recordAdminEvent(supabase, {
      eventType,
      clientId: activeClientId ?? null,
      source: context === "platform" ? "admin_dashboard" : "client_portal",
      meta: {
        actor_user_id: userId ?? null,
        actor_contact_id: contact?.id ?? null,
        actor_role: isStaff ? "admin" : role ?? "member",
        actor_admin_scope: scope,
        client_id: activeClientId ?? null,
        route_group: pageRef.current.group.id,
        ...extra,
      },
    });
  }, [activeClientId, context, contact, isStaff, userId]);

  const openAssistant = useCallback(({ trigger = "topbar", question = "", context: ctxLabel = null } = {}) => {
    if (!open) returnFocus.current = document.activeElement;
    setPrefill(question);
    setSectionContext(ctxLabel);
    setOpen(true);
    record("admin_assistant_opened", { trigger });
  }, [open, record]);

  const closeAssistant = useCallback(() => {
    setOpen(false);
    try { sessionStorage.setItem(NOTICE_SEEN_KEY, "1"); } catch { /* ignore */ }
    const el = returnFocus.current;
    returnFocus.current = null;
    if (el && typeof el.focus === "function") setTimeout(() => el.focus(), 0);
  }, []);

  // Cmd/Ctrl+J toggles. Not while typing in a text field inside a Dialog.
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "j") return;
      const el = document.activeElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing && el.closest(".dialog")) return;
      e.preventDefault();
      if (open) closeAssistant();
      else openAssistant({ trigger: "shortcut" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled, open, openAssistant, closeAssistant]);

  const push = useCallback((m) => {
    const msg = { id: nextId.current++ + Date.now(), ...m };
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  const reply = useCallback((text) => {
    const { group, params, base } = pageRef.current;
    const trimmed = text.trim();
    let result;
    if (isStaff && trimmed === TEST_COMMANDS.error) result = { kind: "error" };
    else if (isStaff && trimmed === TEST_COMMANDS.unavailable) result = { kind: "unavailable" };
    else {
      const prompt = findPromptByText(group, trimmed);
      result = prompt
        ? { kind: "reply", paragraphs: prompt.reply, sources: prompt.sources || [], action: prompt.action || null, params, base }
        : { kind: "fallback", paragraphs: [MOCK.fallbackReply], sources: [], action: null };
    }
    setThinking({ label: randomThinkingLabel() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setThinking(null);
      const m = push({ role: "pip", ...result });
      setAnnounce(result.kind === "error" ? "Something went wrong." : result.kind === "unavailable" ? "Pip is unavailable." : (m.paragraphs || []).join(" "));
    }, thinkingDelayMs());
  }, [isStaff, push]);

  const send = useCallback((text) => {
    const t = text.trim();
    if (!t || thinking) return;
    lastUser.current = t;
    push({ role: "user", text: t });
    reply(t);
  }, [push, reply, thinking]);

  const selectPrompt = useCallback((prompt) => {
    record("admin_assistant_prompt_selected", { prompt_id: prompt.id });
    send(prompt.text);
  }, [record, send]);

  const stop = useCallback(() => { clearTimeout(timer.current); setThinking(null); }, []);
  const retry = useCallback(() => { if (lastUser.current) reply(lastUser.current); }, [reply]);
  const newConversation = useCallback(() => {
    clearTimeout(timer.current);
    setThinking(null);
    setMessages([]);
    setAnnounce("");
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  }, [key]);

  const noticeSeen = useMemo(() => { try { return sessionStorage.getItem(NOTICE_SEEN_KEY) === "1"; } catch { return true; } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({
    enabled, open, openAssistant, closeAssistant, toggle: () => (open ? closeAssistant() : openAssistant({ trigger: "topbar" })),
    prefill, sectionContext, messages, thinking, announce, page, firstName, noticeSeen,
    send, selectPrompt, stop, retry, newConversation,
  }), [enabled, open, openAssistant, closeAssistant, prefill, sectionContext, messages, thinking, announce, page, firstName, noticeSeen, send, selectPrompt, stop, retry, newConversation]);

  // Contextual links (Section, EmptyState, ErrorState) read AskPipContext; null when the assistant is off.
  const linkValue = useMemo(() => (enabled ? { open: openAssistant } : null), [enabled, openAssistant]);

  return (
    <AssistantContext.Provider value={enabled ? value : null}>
      <AskPipContext.Provider value={linkValue}>
        {children}
        {enabled && open ? <AssistantDrawer /> : null}
      </AskPipContext.Provider>
    </AssistantContext.Provider>
  );
}
