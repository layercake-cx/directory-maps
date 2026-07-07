import React, { useCallback, useEffect, useState } from "react";
import { signOut } from "../../lib/auth";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";

const PAGE_SIZE = 200;

const STATUS_OPTIONS = ["To be actioned", "In progress", "Successful", "Lost"];

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

  return (
    <AdminLayout
      breadcrumbs={[{ label: "Leads" }]}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Leads</h2>
          <button type="button" className="btn" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        <p style={{ color: "var(--lc-muted)", marginBottom: 16 }}>
          Founding-partner enquiries submitted via the public landing page (newest first, up to {PAGE_SIZE} rows).
          Apply the <code>beta_signups_status</code> migration if this list is empty or errors.
        </p>

        <p
          style={{
            background: "#fdf3e6",
            border: "1px solid #f0d9b5",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          <strong>Deprecated:</strong> the public signup form now submits to HubSpot instead of this table. This
          page only shows leads captured before that change — new enquiries won&apos;t appear here. Check HubSpot
          for current leads.
        </p>

        {err ? <p style={{ color: "#b91c1c" }}>{err}</p> : null}

        {loading && !rows.length ? (
          <p>Loading…</p>
        ) : !rows.length ? (
          <p style={{ color: "var(--lc-muted)" }}>No leads submitted yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table" style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Organisation</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "—";
                  return (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatDate(r.submitted_at)}</td>
                      <td>{name}</td>
                      <td>{r.work_email || "—"}</td>
                      <td>{r.organisation || "—"}</td>
                      <td>
                        <select
                          value={r.status || "To be actioned"}
                          disabled={savingId === r.id}
                          onChange={(e) => updateStatus(r, e.target.value)}
                          aria-label={`Status for ${name}`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
