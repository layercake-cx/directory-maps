// Editable branded system emails for a directory. Defaults mirror
// supabase/functions/_shared/systemEmail.ts (DEFAULTS) -- keep the two in sync.
import { supabase } from "./supabase";
import { invokeEdgeFunction } from "./edgeFunctionFetch.js";

export const SYSTEM_EMAILS = [
  {
    key: "claim_sign_in",
    label: "Claim sign-in link",
    when: "Sent when someone who manages a claimed listing asks for a sign-in link on the claim login page.",
    placeholders: ["directory_name", "listing_name"],
    hasButton: true,
    defaults: {
      subject: "Your sign-in link for {{directory_name}}",
      heading: "Sign in to manage your listing",
      body:
        "Use the button below to sign in to {{directory_name}} and manage your listing. No password is needed.\n\nThis link can only be used once and expires soon. If you didn't ask to sign in, you can ignore this email.",
      buttonLabel: "Sign in",
    },
  },
  {
    key: "claim_invite",
    label: "Claim invitation",
    when: "Sent when a listing owner or editor is invited, or ownership is transferred.",
    placeholders: ["directory_name", "listing_name"],
    hasButton: true,
    defaults: {
      subject: "You've been invited to manage {{listing_name}} on {{directory_name}}",
      heading: "You're invited to manage {{listing_name}}",
      body:
        "{{directory_name}} has set you up to manage the listing for {{listing_name}}. Use the button below to sign in and update its details, description and logo.\n\nNo password is needed. If you weren't expecting this, you can ignore this email.",
      buttonLabel: "Manage your listing",
    },
  },
  {
    key: "claim_request_notification",
    label: "Claim request notification",
    when: "Sent to your claim notification address when a visitor requests to claim a listing (manual claim mode).",
    placeholders: ["directory_name", "listing_name", "requester_name", "requester_email", "message"],
    hasButton: false,
    defaults: {
      subject: "Claim request for {{listing_name}}",
      heading: "New claim request",
      body:
        "{{requester_name}} ({{requester_email}}) has asked to claim {{listing_name}}.\n\nTheir message:\n{{message}}\n\nThe request is in the directory's Claims tab, waiting for review. Reply to this email to contact them.",
      buttonLabel: "",
    },
  },
];

export async function loadDirectoryEmailTemplates(directoryId) {
  const { data, error } = await supabase
    .from("directory_email_templates")
    .select("template_key, subject, heading, body, button_label")
    .eq("directory_id", directoryId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.template_key, r]));
}

/** Saves the given text. A field equal to its default (or blank) is stored as null so later default improvements still apply. */
export async function saveDirectoryEmailTemplate(directoryId, def, text) {
  const orNull = (v, d) => (v.trim() && v !== d ? v : null);
  const row = {
    directory_id: directoryId,
    template_key: def.key,
    subject: orNull(text.subject, def.defaults.subject),
    heading: orNull(text.heading, def.defaults.heading),
    body: orNull(text.body, def.defaults.body),
    button_label: def.hasButton ? orNull(text.buttonLabel, def.defaults.buttonLabel) : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("directory_email_templates").upsert(row, { onConflict: "directory_id,template_key" });
  if (error) throw error;
  return ["subject", "heading", "body", "button_label"].filter((f) => row[f] !== null);
}

export async function resetDirectoryEmailTemplate(directoryId, key) {
  const { error } = await supabase.from("directory_email_templates").delete().eq("directory_id", directoryId).eq("template_key", key);
  if (error) throw error;
}

export function previewDirectoryEmail(directoryId, key, text) {
  return invokeEdgeFunction("directory_email_preview", { directoryId, key, action: "preview", text }, { supabase, requireAuth: true });
}

export function sendTestDirectoryEmail(directoryId, key, text) {
  return invokeEdgeFunction("directory_email_preview", { directoryId, key, action: "test", text }, { supabase, requireAuth: true });
}
