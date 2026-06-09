/**
 * Plain-text email body for asking a DNS provider to add messaging domain records.
 */

/** @param {import("@supabase/supabase-js").User | null | undefined} user */
export function resolveSenderFirstName(user) {
  if (!user) return "";
  const meta = user.user_metadata ?? {};
  const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  if (first) return first;
  const full = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (full) return full.split(/\s+/)[0];
  const email = user.email ?? "";
  const local = email.split("@")[0] ?? "";
  if (local) {
    const word = local.replace(/[._-]+/g, " ").trim().split(/\s+/)[0];
    if (word) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  return "";
}

function formatRecordBlock(index, { label, type, name, value, priority }) {
  const lines = [
    `${index}. ${label}`,
    `   Type: ${type || "—"}`,
    `   Host / Name: ${name || "—"}`,
    `   Value: ${value || "—"}`,
  ];
  if (priority != null && priority !== "") {
    lines.push(`   Priority: ${priority}`);
  }
  return lines.join("\n");
}

function recordLabel(row) {
  if (row.record) return row.record;
  if (row.type) return `${row.type} record`;
  return "DNS record";
}

/**
 * @param {{
 *   fromAddress?: string,
 *   emailDomain?: string,
 *   dnsRecords?: Array<{ type?: string, name?: string, value?: string, priority?: number|string, record?: string }>,
 *   senderFirstName?: string,
 * }} params
 */
export function buildDnsSetupEmailText({
  fromAddress = "",
  emailDomain = "",
  dnsRecords = [],
  senderFirstName = "",
}) {
  const domain = emailDomain.trim() || "your domain";
  const from = fromAddress.trim() || `hello@${domain}`;
  const signOffName = senderFirstName.trim() || "Team";
  const subject = `DNS records required for ${domain} email setup`;

  const recordBlocks = dnsRecords
    .filter((row) => row?.value || row?.name)
    .map((row, i) =>
      formatRecordBlock(i + 1, {
        label: recordLabel(row),
        type: row.type,
        name: row.name,
        value: row.value,
        priority: row.priority,
      })
    );

  if (emailDomain) {
    const dmarcValue = `v=DMARC1; p=none; rua=mailto:dmarc@${emailDomain}`;
    recordBlocks.push(
      formatRecordBlock(recordBlocks.length + 1, {
        label: "DMARC (recommended)",
        type: "TXT",
        name: `_dmarc.${emailDomain}`,
        value: dmarcValue,
      })
    );
  }

  const recordsSection =
    recordBlocks.length > 0
      ? recordBlocks.join("\n\n")
      : "(No DNS records are available yet — set up the domain in Layercake Maps first, then open Setup instructions again.)";

  return `Subject: ${subject}

Hi,

We are setting up email for our Layercake Maps directory (contact form messages on our online map). Please add the following DNS records for ${domain} exactly as shown.

Purpose: These records allow our email provider to send mail from ${from} on our behalf.

Records to add:

${recordsSection}

Notes:
- Please enter each record exactly as shown to avoid typos.
- DNS changes can take up to 48 hours to propagate worldwide, though they often complete within an hour.
- Please reply once the records are in place so we can run verification from our side.

Many thanks,
${signOffName}`;
}
