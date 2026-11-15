import React, { useCallback, useEffect, useState } from "react";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import { Button, Callout, DataTable, EmptyState, PageLayout, Section, Select } from "../../components/ui/index.js";
import "../../styles/wave-b/map-pages.css";
import "../../styles/wave-c/maps-users.css";

const PAGE_SIZE = 200;

const STATUS_OPTIONS = ["To be actioned", "In progress", "Successful", "Lost"];

function leadName(r) {
  return [r.first_name, r.last_name].filter(Boolean).join(" ") || "—";
}

function formatDate(iso) {
  if (!iso) return "—";
  return iso.replace("T", " ").replace(/\.\d{3}Z?$/, "Z");
}

export default function AdminLeads() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("beta_signups")
        .select("id,submitted_at,first_name,last_name,organisation,work_email,status")
        .order("submitted_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (error) throw error;
      setRows(data ?? []);
    } catch (e) {
      setErr(e?.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(lead, nextStatus) {
    const previousStatus = lead.status;
    if (nextStatus === previousStatus) return;

    setSavingId(lead.id);
    setRows((prev) => prev.map((r) => (r.id === lead.id ? { ...r, status: nextStatus } : r)));

    const { error } = await supabase
      .from("beta_signups")
      .update({ status: nextStatus })
      .eq("id", lead.id);

    setSavingId(null);

    if (error) {
      setRows((prev) => prev.map((r) => (r.id === lead.id ? { ...r, status: previousStatus } : r)));
      setErr(error.message ?? String(error));
      return;
    }

    recordAdminEvent(supabase, {
      eventType: "leads_status_changed",
      source: "admin_leads",
      meta: { lead_id: lead.id, from_status: previousStatus, to_status: nextStatus },
    });
  }

  const columns = [
    { key: "date", label: "Date", className: "mu-nowrap", render: (r) => formatDate(r.submitted_at) },
    { key: "name", label: "Name", render: (r) => leadName(r) },
    { key: "email", label: "Email", render: (r) => r.work_email || "—" },
    { key: "organisation", label: "Organisation", render: (r) => r.organisation || "—" },
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <Select
          className="mu-status-select"
          value={r.status || "To be actioned"}
          disabled={savingId === r.id}
          onChange={(e) => updateStatus(r, e.target.value)}
          aria-label={`Status for ${leadName(r)}`}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      ),
    },
  ];

  return (
    <AdminLayout>
      <PageLayout
        head={{
          title: "Leads",
          subtitle: (
            <>
              Founding-partner enquiries submitted via the public landing page (newest first, up to {PAGE_SIZE} rows).
              Apply the <code>beta_signups_status</code> migration if this list is empty or errors.
            </>
          ),
          actions: <Button onClick={load} loading={loading} loadingLabel="Loading…">Refresh</Button>,
        }}
      >
        <div className="mp-stack">
          <Callout tone="warn" title="Deprecated">
            The public signup form now submits to HubSpot instead of this table. This page only shows leads captured
            before that change, so new enquiries won&apos;t appear here. Check HubSpot for current leads.
          </Callout>

          {err ? <Callout tone="danger">{err}</Callout> : null}

          <Section flush>
            <DataTable
              columns={columns}
              rows={rows}
              getRowId={(r) => r.id}
              getRowLabel={leadName}
              loading={loading && !rows.length}
              caption="Leads"
              empty={<EmptyState art="searching" title="No leads submitted yet" />}
            />
          </Section>
        </div>
      </PageLayout>
    </AdminLayout>
  );
}
