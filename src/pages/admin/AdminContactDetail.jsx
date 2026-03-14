import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";

export default function AdminContactDetail() {
  const { clientId, contactId } = useParams();
  const [contact, setContact] = useState(null);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setErr("");

        const { data: c, error: ce } = await supabase
          .from("contacts")
          .select("id, client_id, user_id, email, name, is_primary, created_at, updated_at")
          .eq("id", contactId)
          .eq("client_id", clientId)
          .maybeSingle();

        if (!mounted) return;
        if (ce) throw ce;
        if (!c) {
          setErr("Contact not found.");
          setLoading(false);
          return;
        }

        setContact(c);

        const { data: clientData, error: clientError } = await supabase
          .from("clients")
          .select("id, name, slug")
          .eq("id", clientId)
          .single();

        if (!mounted) return;
        if (clientError) throw clientError;
        setClient(clientData ?? null);
      } catch (e) {
        if (mounted) setErr(e?.message ?? String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [clientId, contactId]);

  return (
    <AdminLayout
      title="Admin · Contact"
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        <div style={{ marginBottom: 12 }}>
          <Link to={`/admin/clients/${encodeURIComponent(clientId)}`}>← Back to client</Link>
        </div>

        {loading ? <p>Loading…</p> : null}
        {err ? <p>{err}</p> : null}

        {contact && client && !loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 style={{ margin: "0 0 8px 0" }}>Contact details</h2>
            <div style={{ fontSize: 13 }}>
              <div style={{ marginBottom: 8 }}>
                <strong>Client:</strong>{" "}
                <Link to={`/admin/clients/${encodeURIComponent(clientId)}`}>{client.name}</Link>
                {client.slug ? ` (${client.slug})` : ""}
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong>Email:</strong> {contact.email}
              </div>
              {contact.name ? (
                <div style={{ marginBottom: 8 }}>
                  <strong>Name:</strong> {contact.name}
                </div>
              ) : null}
              <div style={{ marginBottom: 8 }}>
                <strong>Has login:</strong> {contact.user_id ? "Yes" : "No (dummy/placeholder)"}
              </div>
              {contact.user_id ? (
                <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.8 }}>
                  <strong>User ID:</strong> {contact.user_id}
                </div>
              ) : null}
              <div style={{ marginBottom: 8 }}>
                <strong>Primary contact:</strong> {contact.is_primary ? "Yes" : "No"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Contact ID: {contact.id}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
